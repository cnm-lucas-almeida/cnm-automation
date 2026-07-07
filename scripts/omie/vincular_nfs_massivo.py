#!/usr/bin/env python3
"""
vincular_nfs_massivo.py
=======================
Vincula NFS-e do Omie a pagamentos pendentes, processando 1 a 1
com delay configurável para evitar rate limit (erro 425/MISUSE_API).

Busca os pagamentos pendentes direto no banco (somente leitura) e delega
a vinculação ao endpoint PHP /admin/nfs_massivo/processar_direto, que já
tem permissão de escrita no banco.

Login automático via credenciais no .env (CNM_ADMIN_USER / CNM_ADMIN_PASS).

Uso:
    python scripts/vincular_nfs_massivo.py [opções]

Opções:
    --empresa   INT         Filtrar por ID de empresa
    --data-ini  DD/MM/YYYY  Data mínima de pagamento
    --data-fim  DD/MM/YYYY  Data máxima de pagamento
    --limit     INT         Máximo de pagamentos a processar (padrão: sem limite)
    --delay     FLOAT       Segundos entre cada chamada ao PHP (padrão: 2.0)
    --dry-run               Simula execução sem vincular

Exemplo:
    python scripts/vincular_nfs_massivo.py --data-ini 01/04/2026 --data-fim 30/04/2026 --delay 2
"""

import argparse
import csv
import os
import re
import sys
import time
from datetime import datetime

import mysql.connector
import requests
from dotenv import dotenv_values

# Mapeamento dos códigos de status de NFS-e retornados pelo Omie
OMIE_NFSE_STATUS = {
    "10": "Aguardando processamento",
    "20": "Autorizada",
    "30": "Rejeitada",
    "40": "Cancelada",
    "50": "Substituída",
}

def _traduzir_status_omie(msg: str) -> str:
    """Substitui códigos numéricos de status Omie pelo nome legível na mensagem."""
    return re.sub(
        r"status (\d+)",
        lambda m: f"status {OMIE_NFSE_STATUS.get(m.group(1), m.group(1))} ({m.group(1)})",
        msg,
    )


# Cores ANSI
class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    GREEN  = "\033[32m"
    YELLOW = "\033[33m"
    RED    = "\033[31m"
    CYAN   = "\033[36m"
    WHITE  = "\033[97m"


def _fmt_valor(valor) -> str:
    try:
        return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return str(valor)

# ---------------------------------------------------------------------------
# Configuração — lê .env da raiz do projeto
# ---------------------------------------------------------------------------
_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
_config = dotenv_values(_ENV_PATH)

DB_HOST = _config["DB_HOST"]
DB_PORT = int(_config.get("DB_PORT", 3306))
DB_USER = _config["DB_USER"]
DB_PASS = _config["DB_PASS"]
DB_NAME = _config["DB_NAME"]

# URL base do admin do chavesnamao
ADMIN_BASE_URL = "https://www.chavesnamao.com.br/"
CNM_ADMIN_USER = _config.get("CNM_ADMIN_USER")
CNM_ADMIN_PASS = _config.get("CNM_ADMIN_PASS")

# Espelha os valores de Nfse_model::STATUS_ENUM e EMISSOR do PHP
NFSE_STATUS_APPROVED = "APPROVED"
NFSE_EMISSOR_OMIE    = "Omie"


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------
def get_db():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
    )


def get_pending_payments(cursor, empresa=None, data_ini=None, data_fim=None, limit=None):
    """
    Retorna pagamentos aprovados no Omie mas sem número de NFS vinculado.
    Espelha a query de listar() do controller nfs_massivo.php.
    """
    sql = """
        SELECT
            p.id,
            p.id_cliente,
            p.id_empresa,
            p.id_nfs,
            p.valor,
            p.data_pagamento,
            p.forma_pagamento,
            c.nome,
            c.cpfcnpj,
            n.id  AS nfs_id,
            n.id_servico,
            n.numero_nfs,
            n.status AS nfs_status,
            n.emissor
        FROM tb_pagamento p
        JOIN tb_nfs    n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.status    = %s
          AND n.emissor   = %s
          AND n.numero_nfs IS NULL
          AND p.deleted   = 0
    """
    params = [NFSE_STATUS_APPROVED, NFSE_EMISSOR_OMIE]

    if empresa:
        sql += " AND p.id_empresa = %s"
        params.append(empresa)
    if data_ini:
        sql += " AND p.data_pagamento >= %s"
        params.append(data_ini)
    if data_fim:
        sql += " AND p.data_pagamento <= %s"
        params.append(data_fim)

    sql += " ORDER BY p.data_pagamento ASC"

    if limit:
        sql += f" LIMIT {int(limit)}"

    cursor.execute(sql, params)
    return cursor.fetchall()


# ---------------------------------------------------------------------------
# Sessão HTTP com auto-login
# ---------------------------------------------------------------------------
_session: requests.Session | None = None


def _get_session() -> requests.Session:
    """Retorna sessão HTTP autenticada. Faz login se necessário."""
    global _session
    if _session is None:
        _session = requests.Session()
        _do_login(_session)
    return _session


def _do_login(session: requests.Session) -> None:
    """Autentica no admin do Chaves na Mão."""
    if not CNM_ADMIN_USER or not CNM_ADMIN_PASS:
        print("  ✗ CNM_ADMIN_USER e CNM_ADMIN_PASS não configurados no .env")
        sys.exit(1)

    resp = session.post(
        ADMIN_BASE_URL + "auth/login/enter/",
        data={"username": CNM_ADMIN_USER, "password": CNM_ADMIN_PASS},
        timeout=15,
    )

    # Login bem-sucedido retorna redirect URL no body; falha retorna "error"
    if resp.status_code != 200 or "error" in resp.text.lower()[:50]:
        print(f"  ✗ Falha no login: HTTP {resp.status_code} — {resp.text[:100]}")
        sys.exit(1)


def verificar_sessao() -> bool:
    """Faz uma chamada leve ao admin para verificar se a sessão ainda é válida."""
    try:
        session = _get_session()
        resp = session.get(
            ADMIN_BASE_URL + "admin/nfs_massivo/empresas/",
            timeout=15,
        )
        try:
            resp.json()
            return True
        except Exception:
            return False
    except Exception:
        return False


def relogin() -> bool:
    """Força novo login quando a sessão expira."""
    global _session
    _session = requests.Session()
    try:
        _do_login(_session)
        return verificar_sessao()
    except Exception:
        return False


def processar_via_php(payment_id: int) -> dict:
    """
    Chama POST /admin/nfs_massivo/processar_direto com um único payment_id.
    O PHP faz todo o trabalho: consulta Omie, persiste no banco, upload S3.
    Retorna o resultado individual (dict com 'status' e 'message').
    """
    url = ADMIN_BASE_URL + "admin/nfs_massivo/processar_direto/"

    for attempt in range(1, 4):
        session = _get_session()
        resp = session.post(
            url,
            data={"payment_ids[]": payment_id},
            timeout=60,
        )

        if resp.status_code in (403, 404):
            raise Exception(f"HTTP {resp.status_code} — sessão inválida ou sem permissão")

        body = resp.text.strip()

        # Resposta vazia = PHP crashou (provavelmente rate limit Omie interno)
        if not body:
            if attempt < 3:
                wait = 30 * attempt
                print(f"VAZIO (tentativa {attempt}/3, aguardando {wait}s)... ", end="", flush=True)
                time.sleep(wait)
                continue
            return {"status": "error", "message": "PHP retornou resposta vazia após 3 tentativas"}

        try:
            data = resp.json()
        except Exception:
            # Resposta não-JSON (HTML de login, erro do servidor, etc)
            snippet = body[:150].replace("\n", " ")
            if attempt < 3:
                wait = 30 * attempt
                print(f"NÃO-JSON (tentativa {attempt}/3, aguardando {wait}s)... ", end="", flush=True)
                time.sleep(wait)
                continue
            return {"status": "error", "message": f"Resposta não-JSON: {snippet}"}

        results = data.get("results", [])
        return results[0] if results else {"status": "error", "message": "Resposta sem resultados"}

    return {"status": "error", "message": "Falha após todas as tentativas"}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Vincula NFS-e Omie a pagamentos pendentes, 1 a 1 via endpoint PHP.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--empresa",  type=int,   help="ID da empresa")
    parser.add_argument("--data-ini", metavar="DD/MM/YYYY", help="Data mínima de pagamento")
    parser.add_argument("--data-fim", metavar="DD/MM/YYYY", help="Data máxima de pagamento")
    parser.add_argument("--limit",    type=int,   help="Número máximo de pagamentos a processar")
    parser.add_argument("--delay",    type=float, default=2.0,
                        help="Segundos de espera entre chamadas ao PHP (padrão: 2.0)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Lista pendentes sem vincular")
    args = parser.parse_args()

    # Converte datas para formato MySQL
    data_ini = data_fim = None
    try:
        if args.data_ini:
            data_ini = datetime.strptime(args.data_ini, "%d/%m/%Y").strftime("%Y-%m-%d")
        if args.data_fim:
            data_fim = datetime.strptime(args.data_fim, "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError as e:
        print(f"Formato de data inválido: {e}")
        sys.exit(1)

    print("=" * 60)
    print("  Omie NFS Massivo — Vinculação 1 a 1 (via PHP)")
    print("=" * 60)
    if args.dry_run:
        print("  [DRY RUN — nenhuma vinculação será executada]")
    print(f"  delay entre requests : {args.delay}s")
    if args.empresa:
        print(f"  empresa              : {args.empresa}")
    if data_ini:
        print(f"  período              : {args.data_ini} → {args.data_fim or 'hoje'}")
    if args.limit:
        print(f"  limite               : {args.limit} registros")
    print()

    db     = get_db()
    cursor = db.cursor(dictionary=True)

    pending = get_pending_payments(cursor, args.empresa, data_ini, data_fim, args.limit)
    total   = len(pending)
    print(f"  {total} pagamento(s) pendente(s) encontrado(s)\n")

    cursor.close()
    db.close()

    if total == 0 or args.dry_run:
        if args.dry_run and total > 0:
            print("  Primeiros registros:")
            for p in pending[:20]:
                print(f"    Pgto #{p['id']} | Cliente #{p['id_cliente']} {p['nome']} | Valor {p['valor']}")
            if total > 20:
                print(f"    ... e mais {total - 20} registros")
        return

    # Login automático
    print("  Fazendo login...", end=" ", flush=True)
    if not verificar_sessao():
        print("FALHOU — verifique CNM_ADMIN_USER e CNM_ADMIN_PASS no .env")
        sys.exit(1)
    print("OK\n")

    # Prepara log CSV
    log_dir = os.path.join(os.path.dirname(__file__), "..", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_filename = os.path.join(log_dir, f"nfs_massivo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
    log_file = open(log_filename, "w", newline="", encoding="utf-8")
    log_writer = csv.writer(log_file)
    log_writer.writerow(["payment_id", "cliente_id", "cliente_nome", "valor", "status", "message", "timestamp"])
    print(f"  Log: {log_filename}\n")

    stats = {"success": 0, "processing": 0, "error": 0, "rate_limit": 0}
    session_check_interval = 200  # verifica sessão a cada N registros
    consecutive_errors = 0
    max_consecutive_errors = 10

    width = len(str(total))
    indent = " " * (width * 2 + 4)  # alinha linha 2 com o conteúdo da linha 1

    for i, payment in enumerate(pending, 1):
        prefix = f"[{i:>{width}}/{total}]"
        data   = payment['data_pagamento'].strftime("%d/%m/%Y") if payment.get('data_pagamento') else "?"
        forma  = (payment.get('forma_pagamento') or "?").capitalize()
        valor  = _fmt_valor(payment.get('valor'))
        nome   = payment['nome'] or "?"

        linha1 = (
            f"{C.DIM}{prefix}{C.RESET} "
            f"{C.BOLD}#{payment['id']}{C.RESET} "
            f"{C.CYAN}{data}{C.RESET} "
            f"{C.WHITE}{forma}{C.RESET} "
            f"{C.BOLD}{valor}{C.RESET}  "
            f"{nome}"
        )
        print(linha1, flush=True)

        # Verifica sessão periodicamente e faz re-login se expirou
        if i > 1 and i % session_check_interval == 0:
            if not verificar_sessao():
                print(f"{indent}{C.YELLOW}sessão expirou, refazendo login...{C.RESET}", flush=True)
                if not relogin():
                    msg = "Re-login falhou. Verifique credenciais no .env."
                    print(f"{indent}{C.RED}✗ {msg}{C.RESET}")
                    log_writer.writerow([payment['id'], payment['id_cliente'], payment['nome'], payment['valor'], "aborted", msg, datetime.now().isoformat()])
                    break

        try:
            result = processar_via_php(payment["id"])
            status  = result.get("status", "error")
            message = result.get("message", "")
            display = _traduzir_status_omie(message)
            os_id   = payment.get('id_servico', '')

            if status == "success":
                print(f"{indent}{C.GREEN}✓ OK{C.RESET}  {display}")
                stats["success"] += 1
                consecutive_errors = 0
            elif status == "processing":
                print(f"{indent}{C.YELLOW}~ PENDENTE{C.RESET}  {display}  {C.DIM}OS {os_id}{C.RESET}")
                stats["processing"] += 1
                consecutive_errors = 0
            elif status == "rate_limit":
                print(f"{indent}{C.YELLOW}⚠ RATE LIMIT{C.RESET}  {display}")
                stats["rate_limit"] += 1
                consecutive_errors = 0
                print(f"{indent}{C.DIM}Aguardando 120s antes de continuar...{C.RESET}", flush=True)
                time.sleep(120)
            else:
                print(f"{indent}{C.RED}✗ ERRO{C.RESET}  {display}")
                stats["error"] += 1
                consecutive_errors += 1

            log_writer.writerow([payment['id'], payment['id_cliente'], payment['nome'], payment['valor'], status, message, datetime.now().isoformat()])

        except Exception as e:
            err_msg = str(e)
            print(f"{indent}{C.RED}✗ ERRO{C.RESET}  {err_msg}")
            stats["error"] += 1
            consecutive_errors += 1
            log_writer.writerow([payment['id'], payment['id_cliente'], payment['nome'], payment['valor'], "exception", err_msg, datetime.now().isoformat()])

        log_file.flush()

        # Para se muitos erros seguidos (indica problema sistêmico)
        if consecutive_errors >= max_consecutive_errors:
            print(f"\n  ✗ {max_consecutive_errors} erros consecutivos — parando para evitar danos. Verifique o log.")
            break

        # Delay apenas após vinculação com sucesso (chamou Omie)
        if i < total and status in ("success", "processing", "rate_limit"):
            time.sleep(args.delay)

    log_file.close()

    print()
    print("=" * 60)
    print(f"  Concluído:")
    print(f"    ✓  Vinculados     : {stats['success']}")
    print(f"    ~  Pendentes Omie : {stats['processing']}")
    print(f"    ⚠  Rate limit     : {stats['rate_limit']}")
    print(f"    ✗  Erros          : {stats['error']}")
    print(f"    📄 Log            : {log_filename}")
    print("=" * 60)


if __name__ == "__main__":
    main()
