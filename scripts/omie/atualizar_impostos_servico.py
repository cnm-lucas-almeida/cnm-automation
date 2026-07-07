#!/usr/bin/env python3
"""
atualizar_impostos_servico.py
=============================
Atualiza em massa cClassTrib e cIndOper nos cadastros de serviço do Omie
que estão com esses campos ausentes ou vazios.

Estratégia de performance:
  - Fetch das páginas em paralelo (--fetch-workers, padrão 10)
  - Updates em paralelo (--update-workers, padrão 5)
  - Página grande (--page-size, padrão 500) para reduzir número de requests

Uso:
    python scripts/atualizar_impostos_servico.py [opções]

Opções:
    --class-trib     CODIGO   Valor para cClassTrib      (padrão: 000001)
    --ind-oper       CODIGO   Valor para cIndOper        (padrão: 100301)
    --fetch-workers  INT      Threads para buscar páginas (padrão: 3)
    --update-workers INT      Threads para atualizar      (padrão: 3)
    --page-size      INT      Registros por página        (padrão: 500)
    --limit          INT      Máximo de serviços a atualizar
    --dry-run                 Lista pendentes sem atualizar

Filtros de data (campos do bloco info):
    --data-inc-ini   DD/MM/YYYY  Data de inclusão mínima
    --data-inc-fim   DD/MM/YYYY  Data de inclusão máxima
    --data-alt-ini   DD/MM/YYYY  Data de alteração mínima
    --data-alt-fim   DD/MM/YYYY  Data de alteração máxima

Exemplo:
    python scripts/atualizar_impostos_servico.py --dry-run
    python scripts/atualizar_impostos_servico.py
    python scripts/atualizar_impostos_servico.py --data-inc-ini 01/06/2026 --data-inc-fim 16/06/2026
    python scripts/atualizar_impostos_servico.py --data-alt-ini 01/06/2026
"""

import argparse
import csv
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests
from dotenv import dotenv_values

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
_config = dotenv_values(_ENV_PATH)

OMIE_APP_KEY    = _config["OMIE_APP_KEY"]
OMIE_APP_SECRET = _config["OMIE_APP_SECRET"]
SERVICOS_URL    = "https://app.omie.com.br/api/v1/servicos/servico/"

_print_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Cores ANSI
# ---------------------------------------------------------------------------
class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    GREEN  = "\033[32m"
    YELLOW = "\033[33m"
    RED    = "\033[31m"
    CYAN   = "\033[36m"
    WHITE  = "\033[97m"


def _print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs)


# ---------------------------------------------------------------------------
# Omie API
# ---------------------------------------------------------------------------
def _omie_post(call: str, param: dict, tentativas: int = 4) -> dict:
    payload = {
        "call":       call,
        "app_key":    OMIE_APP_KEY,
        "app_secret": OMIE_APP_SECRET,
        "param":      [param],
    }
    for attempt in range(1, tentativas + 1):
        try:
            resp = requests.post(SERVICOS_URL, json=payload, timeout=30)
            data = resp.json()

            if isinstance(data, dict) and "faultcode" in data:
                code = str(data.get("faultcode", ""))
                msg  = data.get("faultstring", "")
                is_rate_limit = (
                    "REDUNDANTE" in code or "425" in code or "MISUSE" in code
                    or "Too many requests" in msg or "too many" in msg.lower()
                )
                if is_rate_limit:
                    wait = 15 * attempt
                    _print(f"  {C.YELLOW}⚠ Rate limit ({call}), aguardando {wait}s...{C.RESET}")
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"[{code}] {msg}")

            return data

        except RuntimeError:
            raise
        except requests.exceptions.Timeout:
            if attempt < tentativas:
                time.sleep(5 * attempt)
                continue
            raise RuntimeError(f"Timeout após {tentativas} tentativas")
        except Exception as e:
            if attempt < tentativas:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(str(e))

    raise RuntimeError(f"Falha após {tentativas} tentativas")


# ---------------------------------------------------------------------------
# Fetch de páginas em paralelo
# ---------------------------------------------------------------------------
_fetch_semaphore = threading.Semaphore(3)  # máximo de requests simultâneos ao Omie

def _fetch_page(pagina: int, page_size: int, filtros: dict = None) -> list[dict]:
    """Busca uma página de serviços com rate limiting global."""
    with _fetch_semaphore:
        param = {"nPagina": pagina, "nRegPorPagina": page_size}
        if filtros:
            param.update(filtros)
        data = _omie_post("ListarCadastroServico", param)
        time.sleep(0.4)  # ~2.5 req/s por worker para não sobrecarregar
        return data.get("cadastros", [])


def listar_servicos(page_size: int, workers: int, limite_pendentes: int = 0, filtros: dict = None) -> list[dict]:
    """
    Busca páginas de serviços e retorna todos os cadastros.
    Se limite_pendentes > 0, para assim que encontrar serviços suficientes
    com campos ausentes (evita buscar 800+ páginas para um teste).
    """
    _print(f"  Descobrindo total de páginas (page_size={page_size})...", flush=True)
    param1 = {"nPagina": 1, "nRegPorPagina": page_size}
    if filtros:
        param1.update(filtros)
    data1 = _omie_post("ListarCadastroServico", param1)
    total_pag = data1.get("nTotPaginas", 1)
    total_reg = data1.get("nTotRegistros", 0)
    todos = list(data1.get("cadastros", []))

    _print(f"  {total_reg} serviços em {total_pag} páginas.\n")

    if total_pag <= 1:
        return todos

    # Modo com limite: busca página a página e para cedo
    if limite_pendentes > 0:
        pendentes_encontrados = len(filtrar_sem_impostos(todos))
        _print(f"  Buscando até encontrar {limite_pendentes} pendente(s)...", flush=True)
        for pag in range(2, total_pag + 1):
            if pendentes_encontrados >= limite_pendentes:
                _print(f"  Parando na página {pag - 1} — {pendentes_encontrados} pendente(s) encontrado(s).")
                break
            cadastros = _fetch_page(pag, page_size, filtros)
            todos.extend(cadastros)
            pendentes_encontrados = len(filtrar_sem_impostos(todos))
            _print(f"  Página {pag}/{total_pag} — {pendentes_encontrados} pendente(s) até agora", flush=True)
        return todos

    # Modo completo: busca tudo em paralelo
    _print(f"  Buscando todas as páginas com {workers} workers em paralelo...\n")
    concluidas = 1
    erros = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_fetch_page, pag, page_size, filtros): pag
            for pag in range(2, total_pag + 1)
        }
        for fut in as_completed(futures):
            pag = futures[fut]
            try:
                todos.extend(fut.result())
                concluidas += 1
                if concluidas % 50 == 0 or concluidas == total_pag:
                    pct = concluidas / total_pag * 100
                    _print(
                        f"  Fetch: {concluidas}/{total_pag} páginas ({pct:.0f}%)"
                        f" — {len(todos)} serviços carregados",
                        flush=True,
                    )
            except Exception as e:
                erros += 1
                _print(f"  {C.RED}✗ Erro página {pag}: {e}{C.RESET}")

    if erros:
        _print(f"\n  {C.YELLOW}⚠ {erros} página(s) falharam — resultado pode estar incompleto.{C.RESET}")

    return todos


# ---------------------------------------------------------------------------
# Filtro e update
# ---------------------------------------------------------------------------
def _campo_vazio(valor) -> bool:
    return valor is None or str(valor).strip() == ""


def filtrar_sem_impostos(servicos: list[dict]) -> list[dict]:
    pendentes = []
    for s in servicos:
        cab = s.get("cabecalho", {})
        imp = s.get("impostos",  {})
        # Pula serviços sem nIdNBS — o Omie rejeita o upsert sem ele
        n_id_nbs = cab.get("nIdNBS")
        if _campo_vazio(n_id_nbs) or str(n_id_nbs).strip() == "0":
            continue
        if _campo_vazio(imp.get("cClassTrib")) or _campo_vazio(imp.get("cIndOper")):
            pendentes.append(s)
    return pendentes


def upsert_servico(servico: dict, class_trib: str, ind_oper: str) -> dict:
    imp_orig = servico.get("impostos", {})
    param = {
        "intEditar": servico.get("intListar", {}),
        "cabecalho": servico.get("cabecalho", {}),
        "descricao": servico.get("descricao", {}),
        "impostos": {
            **imp_orig,
            "cClassTrib": class_trib,
            "cIndOper":   ind_oper,
        },
    }
    return _omie_post("UpsertCadastroServico", param)


# ---------------------------------------------------------------------------
# Worker de update (thread-safe)
# ---------------------------------------------------------------------------
def _update_worker(servico: dict, class_trib: str, ind_oper: str) -> dict:
    """Atualiza um serviço e retorna dict com resultado."""
    cab        = servico.get("cabecalho", {})
    imp        = servico.get("impostos",  {})
    int_listar = servico.get("intListar", {})

    codigo       = cab.get("cCodigo", "?")
    n_cod_serv   = int_listar.get("nCodServ", "?")
    descricao    = cab.get("cDescricao", "?")
    class_antes  = imp.get("cClassTrib") or ""
    ind_op_antes = imp.get("cIndOper")   or ""

    try:
        result = upsert_servico(servico, class_trib, ind_oper)
        if result.get("nCodServ") or result.get("cCodIntServ") or result.get("codigo_status") == "0":
            return {
                "codigo": codigo, "nCodServ": n_cod_serv, "descricao": descricao,
                "class_antes": class_antes, "ind_op_antes": ind_op_antes,
                "status": "success", "msg": f"nCodServ={result.get('nCodServ', n_cod_serv)}",
            }
        return {
            "codigo": codigo, "nCodServ": n_cod_serv, "descricao": descricao,
            "class_antes": class_antes, "ind_op_antes": ind_op_antes,
            "status": "error", "msg": str(result)[:200],
        }
    except Exception as e:
        return {
            "codigo": codigo, "nCodServ": n_cod_serv, "descricao": descricao,
            "class_antes": class_antes, "ind_op_antes": ind_op_antes,
            "status": "error", "msg": str(e),
        }


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Atualiza cClassTrib e cIndOper nos serviços Omie em massa.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--class-trib",     default="000001", metavar="CODIGO")
    parser.add_argument("--ind-oper",       default="100301", metavar="CODIGO")
    parser.add_argument("--fetch-workers",  type=int, default=3, metavar="INT",
                        help="Threads para buscar páginas (padrão: 3)")
    parser.add_argument("--update-workers", type=int, default=3, metavar="INT",
                        help="Threads para atualizar serviços (padrão: 3)")
    parser.add_argument("--page-size",      type=int, default=500, metavar="INT",
                        help="Registros por página no fetch (padrão: 500)")
    parser.add_argument("--limit",  type=int, help="Máximo de serviços a atualizar")
    parser.add_argument("--dry-run", action="store_true", help="Lista sem atualizar")
    parser.add_argument("--data-inc-ini", metavar="DD/MM/YYYY", help="Data de inclusão mínima")
    parser.add_argument("--data-inc-fim", metavar="DD/MM/YYYY", help="Data de inclusão máxima")
    parser.add_argument("--data-alt-ini", metavar="DD/MM/YYYY", help="Data de alteração mínima")
    parser.add_argument("--data-alt-fim", metavar="DD/MM/YYYY", help="Data de alteração máxima")
    args = parser.parse_args()

    # Valida datas e monta filtros para a API
    def _parse_data(valor, nome):
        if not valor:
            return None
        try:
            datetime.strptime(valor, "%d/%m/%Y")
            return valor
        except ValueError:
            print(f"  Formato de data inválido para {nome}: '{valor}' (esperado DD/MM/YYYY)")
            sys.exit(1)

    filtros = {}
    if args.data_inc_ini: filtros["dInclusaoInicial"] = _parse_data(args.data_inc_ini, "--data-inc-ini")
    if args.data_inc_fim: filtros["dInclusaoFinal"]   = _parse_data(args.data_inc_fim, "--data-inc-fim")
    if args.data_alt_ini: filtros["dAlteracaoInicial"] = _parse_data(args.data_alt_ini, "--data-alt-ini")
    if args.data_alt_fim: filtros["dAlteracaoFinal"]   = _parse_data(args.data_alt_fim, "--data-alt-fim")

    print("=" * 65)
    print("  Omie — Atualização massiva de cClassTrib / cIndOper")
    print("=" * 65)
    if args.dry_run:
        print("  [DRY RUN — nenhuma atualização será executada]")
    print(f"  cClassTrib      : {args.class_trib}")
    print(f"  cIndOper        : {args.ind_oper}")
    print(f"  fetch workers   : {args.fetch_workers}")
    print(f"  update workers  : {args.update_workers}")
    print(f"  page size       : {args.page_size}")
    if args.limit:
        print(f"  limite          : {args.limit} serviços")
    if args.data_inc_ini: print(f"  data inc >=     : {args.data_inc_ini}")
    if args.data_inc_fim: print(f"  data inc <=     : {args.data_inc_fim}")
    if args.data_alt_ini: print(f"  data alt >=     : {args.data_alt_ini}")
    if args.data_alt_fim: print(f"  data alt <=     : {args.data_alt_fim}")
    print()

    t0 = time.time()

    # 1. Listar serviços (para cedo se --limit foi passado)
    print("  Listando serviços no Omie...")
    todos = listar_servicos(args.page_size, args.fetch_workers, limite_pendentes=args.limit or 0, filtros=filtros or None)
    elapsed = time.time() - t0
    print(f"\n  {len(todos)} serviço(s) carregados em {elapsed:.1f}s\n")

    # 2. Filtrar pendentes
    pendentes = filtrar_sem_impostos(todos)
    print(f"  {len(pendentes)} serviço(s) sem cClassTrib / cIndOper.\n")

    if not pendentes:
        print("  Tudo certo! Nenhum serviço precisa de atualização.")
        return

    if args.limit:
        pendentes = pendentes[:args.limit]
        print(f"  Limitando a {len(pendentes)} conforme --limit.\n")

    if args.dry_run:
        print("  Serviços que seriam atualizados (primeiros 30):")
        for s in pendentes[:30]:
            cab = s.get("cabecalho", {})
            imp = s.get("impostos", {})
            print(
                f"    {C.CYAN}{cab.get('cCodigo','?'):<15}{C.RESET} "
                f"cClassTrib={C.YELLOW}{imp.get('cClassTrib') or '(vazio)'}{C.RESET}  "
                f"cIndOper={C.YELLOW}{imp.get('cIndOper') or '(vazio)'}{C.RESET}  "
                f"{cab.get('cDescricao','')[:50]}"
            )
        if len(pendentes) > 30:
            print(f"    ... e mais {len(pendentes) - 30}")
        return

    # 3. Log CSV
    log_dir = os.path.join(os.path.dirname(__file__), "..", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_filename = os.path.join(
        log_dir, f"atualizar_impostos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    )
    log_file   = open(log_filename, "w", newline="", encoding="utf-8")
    log_writer = csv.writer(log_file)
    log_writer.writerow([
        "codigo", "nCodServ", "descricao",
        "cClassTrib_antes", "cIndOper_antes",
        "status", "mensagem", "timestamp",
    ])
    print(f"  Log: {log_filename}\n")

    # 4. Atualizar em paralelo
    total   = len(pendentes)
    stats   = {"success": 0, "error": 0}
    counter = {"n": 0}
    width   = len(str(total))
    t_update = time.time()

    print(f"  Atualizando {total} serviço(s) com {args.update_workers} workers...\n")

    with ThreadPoolExecutor(max_workers=args.update_workers) as pool:
        futures = {
            pool.submit(_update_worker, s, args.class_trib, args.ind_oper): s
            for s in pendentes
        }
        for fut in as_completed(futures):
            r = fut.result()
            counter["n"] += 1
            n = counter["n"]

            ts = datetime.now().isoformat()
            log_writer.writerow([
                r["codigo"], r["nCodServ"], r["descricao"],
                r["class_antes"], r["ind_op_antes"],
                r["status"], r["msg"], ts,
            ])
            log_file.flush()

            if r["status"] == "success":
                stats["success"] += 1
                color = C.GREEN
                mark  = "✓"
            else:
                stats["error"] += 1
                color = C.RED
                mark  = "✗"

            # Imprime progresso a cada 10 ou no fim
            if n % 10 == 0 or n == total:
                pct     = n / total * 100
                elapsed = time.time() - t_update
                rate    = n / elapsed if elapsed > 0 else 0
                eta     = (total - n) / rate if rate > 0 else 0
                _print(
                    f"  [{n:>{width}}/{total}] {pct:5.1f}%  "
                    f"{color}{mark} {r['codigo']}{C.RESET}  "
                    f"ok={stats['success']} err={stats['error']}  "
                    f"ETA {eta:.0f}s",
                    flush=True,
                )
            elif r["status"] == "error":
                _print(
                    f"  [{n:>{width}}/{total}] {C.RED}✗ {r['codigo']}{C.RESET}  {r['msg'][:80]}"
                )

    log_file.close()
    elapsed_total = time.time() - t0

    print()
    print("=" * 65)
    print(f"  Concluído em {elapsed_total:.1f}s")
    print(f"    ✓  Atualizados : {stats['success']}")
    print(f"    ✗  Erros       : {stats['error']}")
    print(f"    📄 Log         : {log_filename}")
    print("=" * 65)


if __name__ == "__main__":
    main()
