'use client';

import { useEffect, useState } from 'react';
import { Users, Clock, CheckCircle2, CalendarX2, AlertCircle, Search, Copy, Check, RefreshCw, Info } from 'lucide-react';
import { loadSessionState, saveSessionState } from '@/lib/sessionCache';
import { DatePicker } from '@/components/ui/DatePicker';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BancoHorasCopa {
  devidoMin: number;
  extrasMin: number;
  atrasosMin: number;
  compensadoMin: number;
  faltaPagarMin: number;
  diaCopaEncontrado: boolean;
}

interface ResultadoColaborador {
  nome: string;
  cpf: string;
  cargo: string | null;
  departamento: string | null;
  status: 'pendente' | 'quitado' | 'sem_registro' | 'erro';
  banco?: BancoHorasCopa;
  erro?: string;
  rateLimited?: boolean;
}

interface Resumo {
  totalColaboradores: number;
  totalPendentes: number;
  totalQuitados: number;
  totalSemRegistro: number;
  totalErros: number;
  totalRateLimited: number;
}

type FiltroStatus = 'todos' | 'pendente' | 'quitado' | 'sem_registro' | 'erro';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatarCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatarMin(min: number): string {
  const negativo = min < 0;
  const abs = Math.round(Math.abs(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${negativo ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Usa D-1 por padrão: o dia corrente ainda está em aberto no Secullum (turno não
// fechado), o que faz o /Calcular contar as horas restantes do dia como "atraso".
function dataD1Padrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0];
}

function montarMensagem(nome: string, dataFim: string, banco: BancoHorasCopa): string {
  const sinalCompensado = banco.compensadoMin >= 0 ? '+' : '';
  const faltaPagar = Math.max(0, banco.faltaPagarMin);
  return (
    `Oi, ${primeiroNome(nome)}! Tudo bem?\n\n` +
    `Sobre o pagamento das horas da Copa (jogo do Brasil em 29/06):\n` +
    `• Valor devido: ${formatarMin(banco.devidoMin)}\n` +
    `• Extras desde 01/07: +${formatarMin(banco.extrasMin)}\n` +
    `• Atrasos desde 01/07: -${formatarMin(banco.atrasosMin)}\n` +
    `• Compensado até ${formatarData(dataFim)}: ${sinalCompensado}${formatarMin(banco.compensadoMin)}\n` +
    `• Falta pagar: ${formatarMin(faltaPagar)}`
  );
}

const CACHE_KEY = 'secullum-banco-horas-copa';

interface CacheState {
  dataFim: string;
  resumo: Resumo;
  resultados: ResultadoColaborador[];
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, color, borderColor, tooltip, active, onClick,
}: {
  title: string; value: string | number; sub?: string;
  icon: any; color: string; borderColor: string;
  tooltip?: string; active?: boolean; onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border p-5 text-left transition-colors ${
        active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border'
      } ${onClick ? 'hover:border-primary/50 cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <span title={tooltip} className={tooltip ? 'cursor-help' : undefined}>
          <Icon size={20} style={{ color: borderColor }} className="opacity-60 flex-shrink-0 mt-1" />
        </span>
      </div>
    </Wrapper>
  );
}

// ── Botão copiar mensagem ─────────────────────────────────────────────────────

// navigator.clipboard só existe em contexto seguro (HTTPS ou localhost) — quem
// acessa pelo IP da rede local em HTTP puro não tem essa API disponível. Nesse
// caso caímos pro document.execCommand('copy') via textarea escondido e, se nem
// isso funcionar, mostramos o texto pra copiar manualmente (Ctrl+C).
function copiarComExecCommand(texto: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = texto;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let sucesso = false;
  try {
    sucesso = document.execCommand('copy');
  } catch {
    sucesso = false;
  }
  document.body.removeChild(textarea);
  return sucesso;
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const [modoManual, setModoManual] = useState(false);

  async function copiar() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else if (!copiarComExecCommand(texto)) {
        throw new Error('Cópia automática indisponível');
      }
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setModoManual(true);
    }
  }

  if (modoManual) {
    return (
      <div className="flex flex-col items-center gap-1">
        <textarea
          readOnly
          value={texto}
          onFocus={(e) => e.currentTarget.select()}
          ref={(el) => el?.focus()}
          className="w-56 h-24 text-xs border border-border rounded-lg p-2 bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-[10px] text-muted-foreground">Selecione e copie (Ctrl+C)</span>
      </div>
    );
  }

  return (
    <button
      onClick={copiar}
      className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
      {copiado ? 'Copiado!' : 'Copiar mensagem'}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BancoHorasCopaPage() {
  // Estado inicial precisa ser igual no servidor e no cliente (sessionStorage não
  // existe durante o SSR) — o cache salvo só é restaurado depois de montar, no
  // useEffect abaixo, senão dá mismatch de hidratação quando já há relatório salvo.
  const [dataFim, setDataFim] = useState(dataD1Padrao());
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [resultados, setResultados] = useState<ResultadoColaborador[]>([]);
  const [progresso, setProgresso] = useState({ processed: 0, total: 0 });
  const [carregando, setCarregando] = useState(false);
  const [erroGlobal, setErroGlobal] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('pendente');
  const [filtro, setFiltro] = useState('');
  const [limiteHoras, setLimiteHoras] = useState('');
  const [limiteMinutos, setLimiteMinutos] = useState('');
  const [pagina, setPagina] = useState(1);
  const [retentando, setRetentando] = useState<string | null>(null);

  useEffect(() => {
    const cache = loadSessionState<CacheState>(CACHE_KEY);
    if (cache) {
      setDataFim(cache.dataFim);
      setResumo(cache.resumo);
      setResultados(cache.resultados);
    }
  }, []);

  async function carregar() {
    if (!dataFim) return;
    setCarregando(true);
    setErroGlobal('');
    setResultados([]);
    setResumo(null);
    setProgresso({ processed: 0, total: 0 });

    try {
      const res = await fetch(`/api/secullum/banco-horas-copa?dataFim=${dataFim}`);
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erro ao carregar relatório');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const acumulado: ResultadoColaborador[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const linhas = buffer.split('\n');
        buffer = linhas.pop() ?? '';

        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const evento = JSON.parse(linha);

          if (evento.type === 'total') {
            setProgresso({ processed: 0, total: evento.total });
          } else if (evento.type === 'item') {
            acumulado.push(evento.resultado);
            setProgresso({ processed: evento.processed, total: evento.total });
            setResultados([...acumulado]);
          } else if (evento.type === 'done') {
            setResumo(evento.resumo);
            saveSessionState<CacheState>(CACHE_KEY, { dataFim, resumo: evento.resumo, resultados: acumulado });
          } else if (evento.type === 'error') {
            throw new Error(evento.message);
          }
        }
      }
    } catch (err: any) {
      setErroGlobal(err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function tentarNovamente(cpf: string) {
    setRetentando(cpf);
    try {
      const res = await fetch(`/api/secullum/banco-horas-copa?dataFim=${dataFim}&cpf=${cpf}`);
      const atualizado: ResultadoColaborador = await res.json();
      if (!res.ok) throw new Error((atualizado as any).error || 'Erro ao tentar novamente');

      setResultados((prev) => {
        const proximos = prev.map((r) => (r.cpf === cpf ? atualizado : r));
        if (resumo) {
          const novoResumo: Resumo = {
            totalColaboradores: proximos.length,
            totalPendentes: proximos.filter((r) => r.status === 'pendente').length,
            totalQuitados: proximos.filter((r) => r.status === 'quitado').length,
            totalSemRegistro: proximos.filter((r) => r.status === 'sem_registro').length,
            totalErros: proximos.filter((r) => r.status === 'erro').length,
            totalRateLimited: proximos.filter((r) => r.rateLimited).length,
          };
          setResumo(novoResumo);
          saveSessionState<CacheState>(CACHE_KEY, { dataFim, resumo: novoResumo, resultados: proximos });
        }
        return proximos;
      });
    } catch (err: any) {
      setErroGlobal(err.message);
    } finally {
      setRetentando(null);
    }
  }

  function toggleFiltroStatus(status: FiltroStatus) {
    setFiltroStatus((prev) => (prev === status ? 'todos' : status));
    setPagina(1);
  }

  function handleFiltroChange(valor: string) {
    setFiltro(valor);
    setPagina(1);
  }

  function handleLimiteChange(setter: (v: string) => void, valor: string) {
    setter(valor.replace(/\D/g, ''));
    setPagina(1);
  }

  const buscaAtiva = filtro.trim() !== '';
  const limiteMin = (parseInt(limiteHoras || '0', 10) || 0) * 60 + (parseInt(limiteMinutos || '0', 10) || 0);
  const limiteAtivo = limiteHoras.trim() !== '' || limiteMinutos.trim() !== '';

  const listados = resultados.filter((r) => {
    if (buscaAtiva) {
      const termoLower = filtro.toLowerCase();
      const termoDigitos = filtro.replace(/\D/g, '');
      const bateNome = r.nome.toLowerCase().includes(termoLower);
      const bateCpf = termoDigitos.length > 0 && r.cpf.includes(termoDigitos);
      if (!bateNome && !bateCpf) return false;
    } else if (filtroStatus !== 'todos' && r.status !== filtroStatus) {
      return false;
    }

    if (limiteAtivo && (!r.banco || r.banco.faltaPagarMin <= limiteMin)) return false;

    return true;
  });

  const ITENS_POR_PAGINA = 20;
  const totalPaginas = Math.max(1, Math.ceil(listados.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const listadosPagina = listados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  const TITULO_TABELA: Record<FiltroStatus, string> = {
    todos: 'Todos os colaboradores',
    pendente: 'Colaboradores com saldo pendente da Copa',
    quitado: 'Colaboradores já quitados',
    sem_registro: 'Sem registro no dia 29/06',
    erro: 'Erros de consulta',
  };

  const VAZIO_TABELA: Record<FiltroStatus, string> = {
    todos: 'Nenhum colaborador encontrado.',
    pendente: 'Nenhum colaborador com saldo pendente.',
    quitado: 'Nenhum colaborador quitado ainda.',
    sem_registro: 'Todos os colaboradores têm registro no dia 29/06.',
    erro: 'Nenhum erro de consulta.',
  };

  const iniciado = resumo !== null;

  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-5">

      {!iniciado ? (
        <div className="min-h-[65vh] flex flex-col items-center justify-center text-center gap-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Banco de Horas — Copa (29/06)</h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-md mx-auto">
              Calcula quanto falta pagar de cada colaborador pelas horas liberadas no jogo do Brasil,
              descontando as horas extras e somando os atrasos registrados a partir de 01/07.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={dataFim} onChange={setDataFim} placeholder="Selecionar data de referência" />
            <button
              onClick={carregar}
              disabled={carregando || !dataFim}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              {carregando ? 'Calculando...' : 'Gerar relatório'}
            </button>
          </div>

          {erroGlobal && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{erroGlobal}</p>
          )}

          {carregando && (
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2 w-full max-w-md">
              <p className="text-sm text-muted-foreground">
                {progresso.total > 0
                  ? `Calculando ${progresso.processed} de ${progresso.total} colaboradores...`
                  : 'Buscando lista de colaboradores ativos...'}
              </p>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-2 bg-primary rounded-full transition-all duration-200"
                  style={{
                    width: progresso.total > 0 ? `${(progresso.processed / progresso.total) * 100}%` : '5%',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Banco de Horas — Copa (29/06)</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Saldo calculado a partir do ponto batido no Secullum, considerando extras e atrasos desde 01/07.
              </p>
            </div>
            <div className="flex items-center gap-2 sm:justify-self-center">
              <DatePicker value={dataFim} onChange={setDataFim} placeholder="Selecionar data de referência" />
              <button
                onClick={carregar}
                disabled={carregando || !dataFim}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                {carregando ? 'Calculando...' : 'Atualizar'}
              </button>
            </div>
          </div>

          {erroGlobal && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{erroGlobal}</p>
          )}

          {carregando && (
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground">
                Calculando {progresso.processed} de {progresso.total} colaboradores...
              </p>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-2 bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${(progresso.processed / Math.max(progresso.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {resumo && resumo.totalRateLimited > 0 && (
            <p className="text-sm text-warning bg-warning-bg border border-warning/20 rounded-lg px-3 py-2">
              {resumo.totalRateLimited} colaborador(es) esbarraram num limite de consultas do Secullum.
              Use &quot;Tentar novamente&quot; na tabela de erros daqui a alguns minutos.
            </p>
          )}

          {resumo && (
          <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard title="Colaboradores" value={resumo.totalColaboradores}
              icon={Users} color="#323131" borderColor="#6F686B"
              tooltip="Total de colaboradores ativos consultados."
              active={filtroStatus === 'todos'} onClick={() => setFiltroStatus('todos')} />
            <KpiCard title="Pendentes" value={resumo.totalPendentes}
              sub={resumo.totalPendentes > 0 ? 'ainda deve pagar' : undefined}
              icon={Clock} color={resumo.totalPendentes > 0 ? '#CA3500' : '#323131'} borderColor="#FF6900"
              tooltip="Colaboradores com saldo ainda a pagar referente à Copa."
              active={filtroStatus === 'pendente'} onClick={() => toggleFiltroStatus('pendente')} />
            <KpiCard title="Quitados" value={resumo.totalQuitados}
              icon={CheckCircle2} color="#227A4C" borderColor="#227A4C"
              tooltip="Já compensaram (via extras) o total devido pela Copa."
              active={filtroStatus === 'quitado'} onClick={() => toggleFiltroStatus('quitado')} />
            <KpiCard title="Sem registro 29/06" value={resumo.totalSemRegistro}
              icon={CalendarX2} color="#323131" borderColor="#6F686B"
              tooltip="Colaborador sem batida/cálculo no dia 29/06 (admitido depois, férias, etc)."
              active={filtroStatus === 'sem_registro'} onClick={() => toggleFiltroStatus('sem_registro')} />
            <KpiCard title="Erros" value={resumo.totalErros}
              icon={AlertCircle} color={resumo.totalErros > 0 ? '#A65F00' : '#323131'} borderColor="#D08700"
              tooltip="Falha ao consultar o Secullum (pode ser limite de 100 req/h)."
              active={filtroStatus === 'erro'} onClick={() => toggleFiltroStatus('erro')} />
          </div>

          <div className="rounded-lg border border-border">
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between flex-wrap">
              <h2 className="text-sm font-semibold">
                {buscaAtiva ? `Resultados da busca por "${filtro}"` : TITULO_TABELA[filtroStatus]}
              </h2>
              <div className="flex gap-3 items-center flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou CPF..."
                    value={filtro}
                    onChange={(e) => handleFiltroChange(e.target.value)}
                    className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Deve mais de</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="h"
                    value={limiteHoras}
                    onChange={(e) => handleLimiteChange(setLimiteHoras, e.target.value)}
                    className="w-12 border border-border rounded-lg px-2 py-1.5 text-sm bg-card text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">h</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="min"
                    value={limiteMinutos}
                    onChange={(e) => handleLimiteChange(setLimiteMinutos, e.target.value)}
                    className="w-12 border border-border rounded-lg px-2 py-1.5 text-sm bg-card text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
                {(filtroStatus !== 'todos' || buscaAtiva || limiteAtivo) && (
                  <button
                    onClick={() => {
                      setFiltroStatus('todos');
                      setFiltro('');
                      setLimiteHoras('');
                      setLimiteMinutos('');
                      setPagina(1);
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline whitespace-nowrap"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>

            {listados.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {buscaAtiva || limiteAtivo ? 'Nenhum colaborador encontrado com esses filtros.' : VAZIO_TABELA[filtroStatus]}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-5 py-3 font-semibold">Funcionário</th>
                      <th className="px-4 py-3 font-semibold">Departamento</th>
                      <th className="px-4 py-3 font-semibold text-center">CPF</th>
                      <th className="px-4 py-3 font-semibold text-center">Devido Copa</th>
                      <th className="px-4 py-3 font-semibold text-center">Extras (jul)</th>
                      <th className="px-4 py-3 font-semibold text-center">Atrasos (jul)</th>
                      <th className="px-4 py-3 font-semibold text-center">Compensado</th>
                      <th className="px-4 py-3 font-semibold text-center">Falta pagar</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-5 py-3 font-semibold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {listadosPagina.map((r) => (
                      <tr key={r.cpf} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium">{r.nome}</div>
                          {r.cargo && <div className="text-xs text-muted-foreground">{r.cargo}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.departamento || '—'}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground font-mono text-xs">{formatarCpf(r.cpf)}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{r.banco ? formatarMin(r.banco.devidoMin) : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{r.banco ? formatarMin(r.banco.extrasMin) : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{r.banco ? formatarMin(r.banco.atrasosMin) : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{r.banco ? formatarMin(r.banco.compensadoMin) : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums font-semibold">
                          {r.banco ? formatarMin(Math.max(0, r.banco.faltaPagarMin)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.status === 'pendente' && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                              Pendente
                            </span>
                          )}
                          {r.status === 'quitado' && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">
                              Quitado
                            </span>
                          )}
                          {r.status === 'sem_registro' && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              Sem registro
                            </span>
                          )}
                          {r.status === 'erro' && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning cursor-help"
                              title={r.erro || 'Erro desconhecido ao consultar o Secullum.'}
                            >
                              <Info size={11} />
                              {r.rateLimited ? 'Limite Secullum' : 'Erro na consulta'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {r.status === 'erro' ? (
                            <button
                              onClick={() => tentarNovamente(r.cpf)}
                              disabled={retentando === r.cpf}
                              className="inline-flex items-center gap-1 text-xs text-info hover:underline font-medium disabled:opacity-50"
                            >
                              <RefreshCw size={12} className={retentando === r.cpf ? 'animate-spin' : ''} />
                              Tentar novamente
                            </button>
                          ) : r.banco ? (
                            <BotaoCopiar texto={montarMensagem(r.nome, dataFim, r.banco)} />
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {listados.length > 0 && (
              <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {listados.length} colaborador(es) · página {paginaAtual} de {totalPaginas}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginaAtual <= 1}
                    className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaAtual >= totalPaginas}
                    className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
