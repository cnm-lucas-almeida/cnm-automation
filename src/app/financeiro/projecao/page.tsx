'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Settings2, X, TrendingUp } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PercentInput } from '@/components/ui/PercentInput';

type Metodo = 'run-rate' | '% receita' | 'fixo-folha' | 'var-propaganda';

type LinhaProjecao = {
  chave: string;
  label: string;
  grupo: 'RECEITAS' | 'CUSTOS' | 'DESPESAS';
  metodo: Metodo;
  valoresMensais: number[];
  anoProjetado: number;
  pctReceita: number;
};

type Premissas = {
  ano: number;
  folhaSalario: number;
  folhaFgts: number;
  folhaInss: number;
  folhaRat: number;
  folhaTerceiros: number;
  folhaVr: number;
  propagandaAumentoPct: number;
  receitaIncrementoMensal: number[];
};

type ProjecaoResponse = {
  ano: number;
  mesesRealizados: number;
  mesesRestantes: number;
  ultimaCompetencia: string | null;
  premissas: Premissas;
  linhas: LinhaProjecao[];
  fechamentos: {
    receitaLiquida: number[];
    totalCustos: number[];
    totalDespesas: number[];
    resultadoDoPeriodo: number[];
  };
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const METODO_LABEL: Record<Metodo, string> = {
  'run-rate': 'run-rate',
  '% receita': '% receita',
  'fixo-folha': 'premissa (folha)',
  'var-propaganda': 'run-rate + premissa',
};

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number) {
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function mesLabel(competencia: string) {
  const [, m] = competencia.split('-');
  return MESES[Number(m) - 1];
}

function PremissasModal({ premissas, mesesRealizados, onClose, onSalvo }: { premissas: Premissas; mesesRealizados: number; onClose: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({
    folhaSalario: premissas.folhaSalario,
    folhaFgts: premissas.folhaFgts,
    folhaInss: premissas.folhaInss,
    folhaRat: premissas.folhaRat,
    folhaTerceiros: premissas.folhaTerceiros,
    folhaVr: premissas.folhaVr,
    propagandaAumentoPct: premissas.propagandaAumentoPct,
  });
  const [incrementos, setIncrementos] = useState<number[]>(premissas.receitaIncrementoMensal);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function setIncremento(mesIndex: number, valor: number) {
    setIncrementos((prev) => prev.map((v, i) => (i === mesIndex ? valor : v)));
  }

  function campoMoeda(chave: keyof typeof form, label: string) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <CurrencyInput
          value={form[chave]}
          onChange={(v) => setForm((f) => ({ ...f, [chave]: v }))}
          className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
        />
      </div>
    );
  }

  function campoPercentual(chave: keyof typeof form, label: string) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <PercentInput
          value={form[chave]}
          onChange={(v) => setForm((f) => ({ ...f, [chave]: v }))}
          className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
        />
      </div>
    );
  }

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      await axios.post('/api/dre/projecao/premissas', { ano: premissas.ano, ...form, receitaIncrementoMensal: incrementos });
      onSalvo();
      onClose();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message);
    } finally {
      setEnviando(false);
    }
  }

  const folhaMensal = form.folhaSalario + form.folhaFgts + form.folhaInss + form.folhaRat + form.folhaTerceiros + form.folhaVr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 size={18} className="text-primary" /> Premissas da projeção — {premissas.ano}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Valores usados pra projetar os meses restantes do ano. A folha usa esses valores-alvo
          diretamente (não a média do realizado); as demais linhas usam run-rate ou % da receita.
        </p>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Folha consolidada — valor-alvo por mês</p>
          <div className="grid grid-cols-2 gap-3">
            {campoMoeda('folhaSalario', 'Salário')}
            {campoMoeda('folhaFgts', 'FGTS')}
            {campoMoeda('folhaInss', 'INSS/CP Patronal')}
            {campoMoeda('folhaRat', 'RAT')}
            {campoMoeda('folhaTerceiros', 'Terceiros/guias')}
            {campoMoeda('folhaVr', 'VR/Alimentação')}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Total mensal: <span className="font-semibold text-foreground">{fmtMoeda(folhaMensal)}</span></p>
        </div>

        {campoPercentual('propagandaAumentoPct', 'Aumento propaganda')}

        {mesesRealizados < 12 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Receita bruta — incremento em R$ sobre o mês anterior
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Encadeado a partir de {MESES[mesesRealizados - 1] ?? 'início do ano'}: cada mês soma esse valor sobre o mês anterior.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {MESES.slice(mesesRealizados).map((m, i) => (
                <div key={m} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{m}</label>
                  <CurrencyInput
                    value={incrementos[mesesRealizados + i]}
                    onChange={(v) => setIncremento(mesesRealizados + i, v)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={salvar} disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : null} Salvar e recalcular
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjecaoPage() {
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));
  const [dados, setDados] = useState<ProjecaoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async (anoAlvo: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/dre/projecao', { params: { ano: anoAlvo } });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    setReloading((prev) => prev || true);
    carregar(ano);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano]);

  const anosDisponiveis = useMemo(() => {
    const atual = new Date().getFullYear();
    return [atual - 1, atual, atual + 1].map(String);
  }, []);

  const grupos = useMemo(() => {
    if (!dados) return [];
    return [
      { titulo: 'RECEITAS', linhas: dados.linhas.filter((l) => l.grupo === 'RECEITAS'), fechamento: dados.fechamentos.receitaLiquida, labelFechamento: 'Receita Líquida' },
      { titulo: 'CUSTOS', linhas: dados.linhas.filter((l) => l.grupo === 'CUSTOS'), fechamento: dados.fechamentos.totalCustos, labelFechamento: 'Total Custos' },
      { titulo: 'DESPESAS OPERACIONAIS', linhas: dados.linhas.filter((l) => l.grupo === 'DESPESAS'), fechamento: dados.fechamentos.totalDespesas, labelFechamento: 'Total Despesas Operacionais' },
    ];
  }, [dados]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando projeção…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); carregar(ano); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const semRealizado = dados.mesesRealizados === 0;
  const jaCompleto = dados.mesesRestantes === 0;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp size={22} className="text-primary" /> Projeção de Resultado
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Realizado até {dados.ultimaCompetencia ? mesLabel(dados.ultimaCompetencia) : '—'} + projeção pros meses restantes do ano
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ano} onChange={setAno} className="min-w-[110px]"
            options={anosDisponiveis.map((a) => ({ value: a, label: a }))} />
          <button onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Settings2 size={14} /> Premissas
          </button>
          <button onClick={() => { setReloading(true); carregar(ano); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {semRealizado ? (
        <div className="rounded-lg border border-border p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Nenhum balancete importado para {ano}.</p>
          <p className="text-sm mt-1">Importe o balancete do ano em Financeiro &gt; DRE antes de projetar.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border px-5 py-3 flex items-center justify-between flex-wrap gap-2 text-sm">
            <span>
              <span className="font-semibold">{dados.mesesRealizados}</span> {dados.mesesRealizados === 1 ? 'mês realizado' : 'meses realizados'}
              {!jaCompleto && <> · <span className="font-semibold">{dados.mesesRestantes}</span> {dados.mesesRestantes === 1 ? 'mês projetado' : 'meses projetados'}</>}
              {jaCompleto && <> · ano completo, nada a projetar</>}
            </span>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground uppercase tracking-wider border-b border-border text-[11px]">
                  <th className="font-semibold px-5 py-2.5 sticky left-0 bg-card">Conta</th>
                  {MESES.map((m, i) => (
                    <th key={m} className="font-semibold text-right px-3 py-2.5 whitespace-nowrap">
                      {m}
                      {i >= dados.mesesRealizados && <span className="block normal-case font-normal text-[9px] text-muted-foreground/70">projetado</span>}
                    </th>
                  ))}
                  <th className="font-semibold text-right px-5 py-2.5 whitespace-nowrap">Ano</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grupos.map((grupo) => (
                  <Fragment key={grupo.titulo}>
                    <tr className="bg-muted/40">
                      <td colSpan={14} className="px-5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{grupo.titulo}</td>
                    </tr>
                    {grupo.linhas.map((l) => (
                      <tr key={l.chave} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-2 pl-8 sticky left-0 bg-card whitespace-nowrap">
                          {l.label}
                          <span className="block text-[10px] text-muted-foreground font-normal">{METODO_LABEL[l.metodo]} · {fmtPct(l.pctReceita)} rec.</span>
                        </td>
                        {l.valoresMensais.map((v, i) => (
                          <td key={i} className={`text-right tabular-nums px-3 py-2 ${v < 0 ? 'text-destructive' : ''} ${i >= dados.mesesRealizados ? 'italic text-muted-foreground' : ''}`}>
                            {fmtMoeda(v)}
                          </td>
                        ))}
                        <td className={`text-right tabular-nums px-5 py-2 font-medium ${l.anoProjetado < 0 ? 'text-destructive' : ''}`}>{fmtMoeda(l.anoProjetado)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-t border-border">
                      <td className="px-5 py-2 sticky left-0 bg-card">{grupo.labelFechamento}</td>
                      {grupo.fechamento.map((v, i) => (
                        <td key={i} className={`text-right tabular-nums px-3 py-2 ${v < 0 ? 'text-destructive' : ''} ${i >= dados.mesesRealizados ? 'italic text-muted-foreground' : ''}`}>
                          {fmtMoeda(v)}
                        </td>
                      ))}
                      <td className="text-right tabular-nums px-5 py-2">{fmtMoeda(grupo.fechamento.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border">
                <tr className="font-semibold bg-success/10 text-success">
                  <td className="px-5 py-2.5 sticky left-0 bg-card">Resultado do Período</td>
                  {dados.fechamentos.resultadoDoPeriodo.map((v, i) => (
                    <td key={i} className={`text-right tabular-nums px-3 py-2.5 ${v < 0 ? 'text-destructive' : ''} ${i >= dados.mesesRealizados ? 'italic' : ''}`}>
                      {fmtMoeda(v)}
                    </td>
                  ))}
                  <td className="text-right tabular-nums px-5 py-2.5">{fmtMoeda(dados.fechamentos.resultadoDoPeriodo.reduce((a, b) => a + b, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {modalAberto && (
        <PremissasModal
          premissas={dados.premissas}
          mesesRealizados={dados.mesesRealizados}
          onClose={() => setModalAberto(false)}
          onSalvo={() => { setReloading(true); carregar(ano); }}
        />
      )}
    </div>
  );
}
