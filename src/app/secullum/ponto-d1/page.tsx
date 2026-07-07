'use client';

import { Fragment, useState } from 'react';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function PontoD1Page() {
  const [data, setData] = useState(dataD1Padrao());
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [resultados, setResultados] = useState<ResultadoColaborador[]>([]);
  const [progresso, setProgresso] = useState({ processed: 0, total: 0 });
  const [carregando, setCarregando] = useState(false);
  const [erroGlobal, setErroGlobal] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

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

  const listados = resultados
    .filter((r) => (verTodos ? true : r.status === 'violacao'))
    .filter(
      (r) =>
        r.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        r.cpf.includes(filtro.replace(/\D/g, ''))
    );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[96rem] mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Intervalo de Almoço — Ponto D-1</h1>
            <p className="text-sm text-slate-500 mt-1">
              Verifica se o maior intervalo entre batidas do dia atingiu o mínimo de 1h para jornadas acima de 6h.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              disabled={carregando}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
            />
            <button
              onClick={carregar}
              disabled={carregando || !data}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              {carregando ? 'Analisando...' : 'Analisar'}
            </button>
          </div>
        </div>

        {erroGlobal && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroGlobal}</p>
        )}

        {carregando && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
            <p className="text-sm text-slate-600">
              {progresso.total > 0
                ? `Analisando ${progresso.processed} de ${progresso.total} colaboradores...`
                : 'Buscando lista de colaboradores ativos...'}
            </p>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-indigo-600 rounded-full transition-all duration-200"
                style={{
                  width: progresso.total > 0 ? `${(progresso.processed / progresso.total) * 100}%` : '5%',
                }}
              />
            </div>
          </div>
        )}

        {resumo && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label={`Colaboradores · ${formatarData(data)}`} value={String(resumo.totalColaboradores)} />
              <StatCard label="Violações" value={String(resumo.totalViolacoes)} highlight={resumo.totalViolacoes > 0} />
              <StatCard label="Sem batida no dia" value={String(resumo.totalSemBatida)} />
              <StatCard label="Erros de consulta" value={String(resumo.totalErros)} />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <h2 className="font-semibold text-slate-700">
                  {verTodos ? 'Todos os colaboradores' : 'Colaboradores em violação'}
                </h2>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou CPF..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
                    <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
                    Ver todos
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Funcionário</th>
                      <th className="px-4 py-3 text-left">Departamento</th>
                      <th className="px-4 py-3 text-center">CPF</th>
                      <th className="px-4 py-3 text-center">Horas no dia</th>
                      <th className="px-4 py-3 text-center">Maior intervalo</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Ponto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {listados.map((r) => (
                      <Fragment key={r.cpf}>
                        <tr
                          className={`hover:bg-slate-50 transition-colors ${r.status === 'violacao' ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div>{r.nome}</div>
                            {r.cargo && <div className="text-xs text-slate-400 font-normal">{r.cargo}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{r.departamento || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs">{formatarCpf(r.cpf)}</td>
                          <td className="px-4 py-3 text-center text-slate-700">
                            {r.analise ? formatarHorasTrabalhadas(r.analise.totalHorasTrabalhadas) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700">
                            {r.analise?.maiorIntervaloMinutos != null ? formatarMin(r.analise.maiorIntervaloMinutos) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.status === 'violacao' && r.analise && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                {VIOLACAO_LABEL[r.analise.violacao!]} · faltam {formatarMin(r.analise.minutosFaltantes)}
                              </span>
                            )}
                            {r.status === 'ok' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                OK
                              </span>
                            )}
                            {r.status === 'sem_batida' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                                Sem batida
                              </span>
                            )}
                            {r.status === 'erro' && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
                                title={r.erro}
                              >
                                Erro na consulta
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.batida && (
                              <button
                                onClick={() => setExpandido(expandido === r.cpf ? null : r.cpf)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                {expandido === r.cpf ? 'Fechar' : 'Ver ponto'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {expandido === r.cpf && r.batida && (
                          <tr className="bg-slate-50">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {PERIODOS.map(([entradaKey, saidaKey], i) => {
                                  const entrada = r.batida![entradaKey];
                                  const saida = r.batida![saidaKey];
                                  if (!entrada && !saida) return null;
                                  return (
                                    <div
                                      key={i}
                                      className="px-3 py-1.5 rounded-lg text-xs border bg-white border-slate-200 text-slate-700"
                                    >
                                      <div className="font-medium text-slate-400">Período {i + 1}</div>
                                      <div>{entrada ?? '—'} → {saida ?? '—'}</div>
                                    </div>
                                  );
                                })}
                                {r.analise?.batidaIncompleta && (
                                  <div className="px-3 py-1.5 rounded-lg text-xs border bg-amber-50 border-amber-200 text-amber-700">
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

                {listados.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-400">
                    {verTodos ? 'Nenhum colaborador encontrado.' : 'Nenhuma violação encontrada para esse dia.'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${highlight ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-red-200' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
