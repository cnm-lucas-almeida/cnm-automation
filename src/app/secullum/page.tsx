'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Funcionario {
  nome: string;
  cpf: string;
}

interface DiaTrabalhado {
  data: string;
  horasTrabalhadas: number;
  elegivelVR: boolean;
}

interface ResultadoFuncionario {
  nome: string;
  cpf: string;
  diasTrabalhados: number;
  diasElegiveis: number;
  valorVR: number;
  detalhes: DiaTrabalhado[];
  erro?: string;
}

interface Resumo {
  totalFuncionarios: number;
  totalDiasElegiveis: number;
  totalVR: number;
  vrValor: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function formatarCpf(cpf: string): string {
  const d = normalizarCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatarHoras(h: number): string {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return `${horas}h${min.toString().padStart(2, '0')}`;
}

function getMesAno(offset = 0): { ano: number; mes: number } {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

function periodoDoMes(ano: number, mes: number): { dataInicio: string; dataFim: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ultimo = new Date(ano, mes, 0).getDate();
  return {
    dataInicio: `${ano}-${pad(mes)}-01`,
    dataFim: `${ano}-${pad(mes)}-${ultimo}`,
  };
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SecullumVRPage() {
  const { ano: anoAtual, mes: mesAtual } = getMesAno(-1); // default: mês anterior

  const [mes, setMes] = useState(mesAtual);
  const [ano, setAno] = useState(anoAtual);
  const [vrValor, setVrValor] = useState('');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [uploadErro, setUploadErro] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoFuncionario[] | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erroGlobal, setErroGlobal] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [manualNome, setManualNome] = useState('');
  const [manualCpf, setManualCpf] = useState('');
  const [manualErro, setManualErro] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Upload de planilha ──────────────────────────────────────────────────────

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadErro('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const parsed: Funcionario[] = [];
        for (const row of rows) {
          const nome = (row['nome'] ?? row['Nome'] ?? row['NOME'] ?? '').toString().trim();
          const cpf = normalizarCpf((row['cpf'] ?? row['CPF'] ?? row['Cpf'] ?? '').toString());
          if (!nome || cpf.length !== 11) continue;
          parsed.push({ nome, cpf });
        }

        if (!parsed.length) {
          setUploadErro('Nenhum funcionário encontrado. O arquivo deve ter colunas "nome" e "cpf".');
          return;
        }

        setFuncionarios(parsed);
      } catch {
        setUploadErro('Erro ao ler o arquivo. Use .xlsx ou .csv com colunas "nome" e "cpf".');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  // ── Adição manual ──────────────────────────────────────────────────────────

  function adicionarManual() {
    setManualErro('');
    const nome = manualNome.trim();
    const cpf = normalizarCpf(manualCpf);
    if (!nome) { setManualErro('Informe o nome.'); return; }
    if (cpf.length !== 11) { setManualErro('CPF inválido (deve ter 11 dígitos).'); return; }
    if (funcionarios.some((f) => normalizarCpf(f.cpf) === cpf)) {
      setManualErro('Este CPF já está na lista.'); return;
    }
    setFuncionarios((prev) => [...prev, { nome, cpf }]);
    setManualNome('');
    setManualCpf('');
  }

  function removerFuncionario(cpf: string) {
    setFuncionarios((prev) => prev.filter((f) => normalizarCpf(f.cpf) !== normalizarCpf(cpf)));
  }

  // ── Cálculo de VR ──────────────────────────────────────────────────────────

  async function calcular() {
    if (!funcionarios.length) return;
    const valor = parseFloat(vrValor.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      setErroGlobal('Informe um valor de VR por dia válido.');
      return;
    }

    setCalculando(true);
    setErroGlobal('');
    setResultados(null);
    setResumo(null);

    const { dataInicio, dataFim } = periodoDoMes(ano, mes);

    try {
      const res = await fetch('/api/secullum/vr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funcionarios, dataInicio, dataFim, vrValor: valor }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao calcular VR');

      setResultados(json.resultados);
      setResumo(json.resumo);
    } catch (err: any) {
      setErroGlobal(err.message);
    } finally {
      setCalculando(false);
    }
  }

  // ── Exportar Excel ─────────────────────────────────────────────────────────

  function exportarExcel() {
    if (!resultados) return;

    const linhas = resultados.map((r) => ({
      'Nome': r.nome,
      'CPF': formatarCpf(r.cpf),
      'Dias Trabalhados': r.diasTrabalhados,
      'Dias Elegíveis VR': r.diasElegiveis,
      'Valor VR (R$)': r.valorVR,
      'Erro': r.erro || '',
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VR');
    XLSX.writeFile(wb, `VR_${MESES[mes - 1]}_${ano}.xlsx`);
  }

  // ── Filtered results ───────────────────────────────────────────────────────

  const resultadosFiltrados = resultados?.filter((r) =>
    r.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    r.cpf.includes(filtro.replace(/\D/g, ''))
  );

  const anosDisponiveis = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i + 1).reverse();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cálculo de Vale Refeição</h1>
          <p className="text-sm text-slate-500 mt-1">Análise de batidas de ponto via Secullum · elegibilidade: ≥4h trabalhadas/dia</p>
        </div>

        {/* Configuração */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
          <h2 className="font-semibold text-slate-700">Configuração</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Mês */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Mês</label>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {MESES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Ano */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ano</label>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Valor VR */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Valor VR por dia (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 25,00"
                value={vrValor}
                onChange={(e) => setVrValor(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lista de Funcionários (.xlsx ou .csv)</label>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                Selecionar arquivo
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleUpload} />
              {funcionarios.length > 0 && (
                <span className="text-sm text-emerald-600 font-medium">
                  {funcionarios.length} funcionário{funcionarios.length > 1 ? 's' : ''} carregado{funcionarios.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {uploadErro && <p className="text-sm text-red-500">{uploadErro}</p>}
            <p className="text-xs text-slate-400">Colunas obrigatórias: <code className="bg-slate-100 px-1 rounded">nome</code> e <code className="bg-slate-100 px-1 rounded">cpf</code></p>
          </div>

          {/* Entrada manual */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ou adicionar manualmente</label>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Nome"
                value={manualNome}
                onChange={(e) => setManualNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarManual()}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-40"
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="CPF (só números)"
                value={manualCpf}
                onChange={(e) => setManualCpf(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarManual()}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              />
              <button
                onClick={adicionarManual}
                className="px-4 py-2 text-sm font-medium bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
              >
                + Adicionar
              </button>
            </div>
            {manualErro && <p className="text-sm text-red-500">{manualErro}</p>}
          </div>

          {/* Preview */}
          {funcionarios.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500">{funcionarios.length} funcionário{funcionarios.length > 1 ? 's' : ''} na lista</p>
                <button onClick={() => setFuncionarios([])} className="text-xs text-red-400 hover:text-red-600">Limpar tudo</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {funcionarios.map((f) => (
                  <span key={f.cpf} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 flex items-center gap-1.5">
                    {f.nome} · {formatarCpf(f.cpf)}
                    <button
                      onClick={() => removerFuncionario(f.cpf)}
                      className="text-slate-300 hover:text-red-400 transition-colors leading-none"
                      title="Remover"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {erroGlobal && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroGlobal}</p>
          )}

          {/* Botão calcular */}
          <button
            onClick={calcular}
            disabled={calculando || funcionarios.length === 0}
            className="self-start px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {calculando ? 'Calculando...' : `Calcular VR — ${MESES[mes - 1]} ${ano}`}
          </button>
        </div>

        {/* Resultados */}
        {resumo && resultados && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Funcionários" value={String(resumo.totalFuncionarios)} />
              <StatCard label="Total dias elegíveis" value={String(resumo.totalDiasElegiveis)} />
              <StatCard label="Total VR" value={formatarMoeda(resumo.totalVR)} highlight />
              <StatCard label="VR por dia" value={formatarMoeda(resumo.vrValor)} />
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <h2 className="font-semibold text-slate-700">Resultado por Funcionário</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou CPF..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={exportarExcel}
                    className="px-4 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    Exportar Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Funcionário</th>
                      <th className="px-4 py-3 text-center">CPF</th>
                      <th className="px-4 py-3 text-center">Dias trab.</th>
                      <th className="px-4 py-3 text-center">Dias VR</th>
                      <th className="px-4 py-3 text-right">Valor VR</th>
                      <th className="px-4 py-3 text-center">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(resultadosFiltrados ?? []).map((r) => (
                      <>
                        <tr
                          key={r.cpf}
                          className={`hover:bg-slate-50 transition-colors ${r.erro ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div>{r.nome}</div>
                            {r.erro && (
                              <div className="text-xs text-red-500 font-normal mt-0.5">{r.erro}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs">{formatarCpf(r.cpf)}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{r.diasTrabalhados}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                              {r.diasElegiveis}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatarMoeda(r.valorVR)}</td>
                          <td className="px-4 py-3 text-center">
                            {r.detalhes.length > 0 && (
                              <button
                                onClick={() => setExpandido(expandido === r.cpf ? null : r.cpf)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                {expandido === r.cpf ? 'Fechar' : 'Ver dias'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {expandido === r.cpf && (
                          <tr key={`${r.cpf}-detalhe`} className="bg-slate-50">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {r.detalhes.map((d) => (
                                  <div
                                    key={d.data}
                                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                                      d.elegivelVR
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : d.horasTrabalhadas > 0
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-slate-100 border-slate-200 text-slate-400'
                                    }`}
                                  >
                                    <div className="font-medium">{formatarData(d.data)}</div>
                                    <div>{d.horasTrabalhadas > 0 ? formatarHoras(d.horasTrabalhadas) : 'Sem batida'}</div>
                                    {d.elegivelVR && <div className="font-semibold">✓ VR</div>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>

                {resultadosFiltrados?.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-400">Nenhum resultado encontrado.</div>
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
    <div className={`rounded-2xl border p-5 shadow-sm ${highlight ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-indigo-200' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
