'use client';

import { Fragment, useEffect, useState } from 'react';
import { Users, AlertTriangle, CalendarX2, AlertCircle, Search, Info } from 'lucide-react';
import { loadSessionState, saveSessionState } from '@/lib/sessionCache';
import { DatePicker } from '@/components/ui/DatePicker';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnaliseAlmoco {
  data: string;
  totalHorasTrabalhadas: number;
  maiorIntervaloMinutos: number | null;
  batidaIncompleta: boolean;
  violacao: 'sem_intervalo' | 'intervalo_insuficiente' | null;
  minutosFaltantes: number;
}

interface BatidaResumo {
  entrada1: string | null; saida1: string | null;
  entrada2: string | null; saida2: string | null;
  entrada3: string | null; saida3: string | null;
  entrada4: string | null; saida4: string | null;
  entrada5: string | null; saida5: string | null;
}

interface ResultadoColaborador {
  nome: string;
  cpf: string;
  cargo: string | null;
  departamento: string | null;
  status: 'ok' | 'violacao' | 'sem_batida' | 'erro';
  analise?: AnaliseAlmoco;
  batida?: BatidaResumo;
  erro?: string;
}

interface Resumo {
  totalColaboradores: number;
  totalViolacoes: number;
  totalSemBatida: number;
  totalErros: number;
}

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
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

function formatarHorasTrabalhadas(horas: number): string {
  return formatarMin(Math.round(horas * 60));
}

function dataD1Padrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VIOLACAO_LABEL: Record<string, string> = {
  sem_intervalo: 'Sem intervalo registrado',
  intervalo_insuficiente: 'Intervalo insuficiente',
};

const PERIODOS: Array<[keyof BatidaResumo, keyof BatidaResumo]> = [
  ['entrada1', 'saida1'],
  ['entrada2', 'saida2'],
  ['entrada3', 'saida3'],
  ['entrada4', 'saida4'],
  ['entrada5', 'saida5'],
];

interface CacheState {
  data: string;
  resumo: Resumo;
  resultados: ResultadoColaborador[];
}

const CACHE_KEY = 'secullum-ponto-d1';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function PontoD1Page() {
  // Estado inicial precisa ser igual no servidor e no cliente (sessionStorage não
  // existe durante o SSR) — o cache salvo só é restaurado depois de montar, no
  // useEffect abaixo, senão dá mismatch de hidratação quando já há relatório salvo.
  const [data, setData] = useState(dataD1Padrao());
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [resultados, setResultados] = useState<ResultadoColaborador[]>([]);
  const [progresso, setProgresso] = useState({ processed: 0, total: 0 });
  const [carregando, setCarregando] = useState(false);
  const [erroGlobal, setErroGlobal] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'violacao' | 'sem_batida' | 'erro'>('violacao');
  const [filtro, setFiltro] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    const cache = loadSessionState<CacheState>(CACHE_KEY);
    if (cache) {
      setData(cache.data);
      setResumo(cache.resumo);
      setResultados(cache.resultados);
    }
  }, []);

  async function carregar() {
    if (!data) return;
    setCarregando(true);
    setErroGlobal('');
    setResultados([]);
    setResumo(null);
    setProgresso({ processed: 0, total: 0 });
    setExpandido(null);

    try {
      const res = await fetch(`/api/secullum/ponto-d1?data=${data}`);
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erro ao carregar análise');
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
            saveSessionState<CacheState>(CACHE_KEY, { data, resumo: evento.resumo, resultados: acumulado });
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

  function toggleFiltroStatus(status: 'violacao' | 'sem_batida' | 'erro') {
    setFiltroStatus((prev) => (prev === status ? 'todos' : status));
  }

  const listados = resultados
    .filter((r) => (filtroStatus === 'todos' ? true : r.status === filtroStatus))
    .filter(
      (r) =>
        r.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        r.cpf.includes(filtro.replace(/\D/g, ''))
    );

  const TITULO_TABELA: Record<typeof filtroStatus, string> = {
    todos: 'Todos os colaboradores',
    violacao: 'Colaboradores em violação',
    sem_batida: 'Colaboradores sem batida no dia',
    erro: 'Colaboradores com erro de consulta',
  };

  const VAZIO_TABELA: Record<typeof filtroStatus, string> = {
    todos: 'Nenhum colaborador encontrado.',
    violacao: 'Nenhuma violação encontrada para esse dia.',
    sem_batida: 'Nenhum colaborador sem batida nesse dia.',
    erro: 'Nenhum erro de consulta nesse dia.',
  };

  const iniciado = resumo !== null;

  return (
    <div className="space-y-5">

      {!iniciado ? (
        /* ── Estado inicial: título e busca centralizados ── */
        <div className="min-h-[65vh] flex flex-col items-center justify-center text-center gap-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Intervalo de Almoço — Ponto D-1</h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-md mx-auto">
              Verifica se o maior intervalo entre batidas do dia atingiu o mínimo de 1h para jornadas acima de 6h.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={data} onChange={setData} placeholder="Selecionar data" />
            <button
              onClick={carregar}
              disabled={carregando || !data}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              {carregando ? 'Analisando...' : 'Analisar'}
            </button>
          </div>

          {erroGlobal && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{erroGlobal}</p>
          )}

          {carregando && (
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2 w-full max-w-md">
              <p className="text-sm text-muted-foreground">
                {progresso.total > 0
                  ? `Analisando ${progresso.processed} de ${progresso.total} colaboradores...`
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
          {/* ── Header ── */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Intervalo de Almoço — Ponto D-1</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Verifica se o maior intervalo entre batidas do dia atingiu o mínimo de 1h para jornadas acima de 6h.
              </p>
            </div>
            <div className="flex items-center gap-2 sm:justify-self-center">
              <DatePicker value={data} onChange={setData} placeholder="Selecionar data" />
              <button
                onClick={carregar}
                disabled={carregando || !data}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                {carregando ? 'Analisando...' : 'Analisar'}
              </button>
            </div>
          </div>

          {erroGlobal && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{erroGlobal}</p>
          )}

          {carregando && (
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground">
                {progresso.total > 0
                  ? `Analisando ${progresso.processed} de ${progresso.total} colaboradores...`
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

          {/* ── Resultados ── */}
          {resumo && (
          <>
          {/* ── KPI Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard title={`Colaboradores · ${formatarData(data)}`} value={resumo.totalColaboradores}
              icon={Users} color="#323131" borderColor="#6F686B"
              tooltip="Total de colaboradores ativos consultados nesse dia."
              active={filtroStatus === 'todos'} onClick={() => setFiltroStatus('todos')} />
            <KpiCard title="Violações" value={resumo.totalViolacoes}
              sub={resumo.totalViolacoes > 0 ? 'exige atenção' : undefined}
              icon={AlertTriangle} color={resumo.totalViolacoes > 0 ? '#CA3500' : '#323131'} borderColor="#FF6900"
              tooltip="Maior intervalo entre batidas do dia ficou abaixo do mínimo de 1h exigido para jornadas acima de 6h."
              active={filtroStatus === 'violacao'} onClick={() => toggleFiltroStatus('violacao')} />
            <KpiCard title="Sem batida no dia" value={resumo.totalSemBatida}
              icon={CalendarX2} color="#323131" borderColor="#6F686B"
              tooltip="Colaborador ativo sem nenhuma batida registrada no Secullum nesse dia — pode ser falta, folga, férias ou batida ainda não lançada."
              active={filtroStatus === 'sem_batida'} onClick={() => toggleFiltroStatus('sem_batida')} />
            <KpiCard title="Erros de consulta" value={resumo.totalErros}
              icon={AlertCircle} color={resumo.totalErros > 0 ? '#A65F00' : '#323131'} borderColor="#D08700"
              tooltip="Falha ao consultar as batidas desse colaborador no Secullum. Veja a mensagem na tabela abaixo."
              active={filtroStatus === 'erro'} onClick={() => toggleFiltroStatus('erro')} />
          </div>

          {/* ── Tabela ── */}
          <div className="rounded-lg border border-border">
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <h2 className="text-sm font-semibold">
                {TITULO_TABELA[filtroStatus]}
              </h2>
              <div className="flex gap-3 items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou CPF..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {filtroStatus !== 'todos' && (
                  <button
                    onClick={() => setFiltroStatus('todos')}
                    className="text-xs text-muted-foreground hover:text-primary underline whitespace-nowrap"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>

            {listados.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {VAZIO_TABELA[filtroStatus]}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-5 py-3 font-semibold">Funcionário</th>
                      <th className="px-4 py-3 font-semibold">Departamento</th>
                      <th className="px-4 py-3 font-semibold text-center">CPF</th>
                      <th className="px-4 py-3 font-semibold text-center">Horas no dia</th>
                      <th className="px-4 py-3 font-semibold text-center">Maior intervalo</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-5 py-3 font-semibold text-center">Ponto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {listados.map((r) => (
                      <Fragment key={r.cpf}>
                        <tr className="hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium">{r.nome}</div>
                            {r.cargo && <div className="text-xs text-muted-foreground">{r.cargo}</div>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{r.departamento || '—'}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground font-mono text-xs">{formatarCpf(r.cpf)}</td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.analise ? formatarHorasTrabalhadas(r.analise.totalHorasTrabalhadas) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.analise?.maiorIntervaloMinutos != null ? formatarMin(r.analise.maiorIntervaloMinutos) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.status === 'violacao' && r.analise && (
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                                {VIOLACAO_LABEL[r.analise.violacao!]} · faltam {formatarMin(r.analise.minutosFaltantes)}
                              </span>
                            )}
                            {r.status === 'ok' && (
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">
                                OK
                              </span>
                            )}
                            {r.status === 'sem_batida' && (
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                Sem batida
                              </span>
                            )}
                            {r.status === 'erro' && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning cursor-help"
                                title={r.erro || 'Erro desconhecido ao consultar o Secullum.'}
                              >
                                <Info size={11} />
                                Erro na consulta
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {r.batida && (
                              <button
                                onClick={() => setExpandido(expandido === r.cpf ? null : r.cpf)}
                                className="text-xs text-info hover:underline font-medium"
                              >
                                {expandido === r.cpf ? 'Fechar' : 'Ver ponto'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {expandido === r.cpf && r.batida && (
                          <tr className="bg-muted/40">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {PERIODOS.map(([entradaKey, saidaKey], i) => {
                                  const entrada = r.batida![entradaKey];
                                  const saida = r.batida![saidaKey];
                                  if (!entrada && !saida) return null;
                                  return (
                                    <div
                                      key={i}
                                      className="px-3 py-1.5 rounded-lg text-xs border border-border bg-card"
                                    >
                                      <div className="font-medium text-muted-foreground">Período {i + 1}</div>
                                      <div className="tabular-nums">{entrada ?? '—'} → {saida ?? '—'}</div>
                                    </div>
                                  );
                                })}
                                {r.analise?.batidaIncompleta && (
                                  <div className="px-3 py-1.5 rounded-lg text-xs border border-warning/30 bg-warning-bg text-warning">
                                    Batida incompleta (entrada ou saída faltando em algum período)
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
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
