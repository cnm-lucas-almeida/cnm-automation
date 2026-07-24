import type { DailyMetric } from './types';
import { periodoAtual, periodoAnterior, periodoParaIso, type TipoPeriodo } from './periodo';

export type MetricaComparavel = 'cpa' | 'cpc' | 'leads' | 'custoDia' | 'faturamento' | 'investimentoTotal';
export type Direcao = 'positiva' | 'negativa' | 'neutra';

export interface PeriodMetrics {
  leads: number;
  cliques: number;
  investimentoTotal: number;
  faturamento: number;
  cpa: number;
  cpc: number;
  custoDia: number; // custo médio por dia na janela = investimentoTotal / nº de dias
}

export interface MetricDelta {
  atual: number;
  anterior: number;
  variacaoPct: number | null; // null quando o valor anterior é 0 (sem base de comparação)
  direcao: Direcao;
}

export interface ComparativoPeriodo {
  tipo: TipoPeriodo;
  janelaAtual: { inicio: string; fim: string };
  janelaAnterior: { inicio: string; fim: string };
  atual: PeriodMetrics;
  anterior: PeriodMetrics;
  deltas: Record<MetricaComparavel, MetricDelta>;
}

// true = cair é bom (verde na queda); false = subir é bom (verde na alta); null = neutro, sem "bom/ruim"
const MELHOR_SE_DIMINUIR: Record<MetricaComparavel, boolean | null> = {
  cpa: true,
  cpc: true,
  leads: false,
  faturamento: false,
  custoDia: null,
  investimentoTotal: null,
};

function somar(dias: DailyMetric[], campo: 'leads' | 'cliques' | 'investimentoTotal' | 'faturamento'): number {
  return dias.reduce((acc, d) => acc + d[campo], 0);
}

function toPeriodMetrics(dias: DailyMetric[]): PeriodMetrics {
  const leads = somar(dias, 'leads');
  const cliques = somar(dias, 'cliques');
  const investimentoTotal = somar(dias, 'investimentoTotal');
  const faturamento = somar(dias, 'faturamento');
  return {
    leads,
    cliques,
    investimentoTotal,
    faturamento,
    cpa: leads > 0 ? investimentoTotal / leads : 0,
    cpc: cliques > 0 ? investimentoTotal / cliques : 0,
    custoDia: dias.length > 0 ? investimentoTotal / dias.length : 0,
  };
}

function resolveDirecao(variacaoPct: number | null, melhorSeDiminuir: boolean | null): Direcao {
  if (melhorSeDiminuir === null || variacaoPct === null || variacaoPct === 0) return 'neutra';
  const aumentou = variacaoPct > 0;
  return (melhorSeDiminuir ? !aumentou : aumentou) ? 'positiva' : 'negativa';
}

function calcularDelta(atual: number, anterior: number, metrica: MetricaComparavel): MetricDelta {
  const variacaoPct = anterior !== 0 ? (atual - anterior) / anterior : null;
  return { atual, anterior, variacaoPct, direcao: resolveDirecao(variacaoPct, MELHOR_SE_DIMINUIR[metrica]) };
}

function deltasDe(atual: PeriodMetrics, anterior: PeriodMetrics): Record<MetricaComparavel, MetricDelta> {
  return {
    cpa: calcularDelta(atual.cpa, anterior.cpa, 'cpa'),
    cpc: calcularDelta(atual.cpc, anterior.cpc, 'cpc'),
    leads: calcularDelta(atual.leads, anterior.leads, 'leads'),
    custoDia: calcularDelta(atual.custoDia, anterior.custoDia, 'custoDia'),
    faturamento: calcularDelta(atual.faturamento, anterior.faturamento, 'faturamento'),
    investimentoTotal: calcularDelta(atual.investimentoTotal, anterior.investimentoTotal, 'investimentoTotal'),
  };
}

function diasEntre(inicioIso: string, fimIso: string): number {
  const ms = new Date(fimIso).getTime() - new Date(inicioIso).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Soma leads/cliques/investimento/faturamento de várias campanhas — usado para montar um KPI agregado. `dias` é o tamanho da janela (semana/quinzena/mês podem ter tamanhos diferentes), usado para recalcular custoDia sobre o total combinado. */
export function combinarPeriodMetrics(lista: PeriodMetrics[], dias: number): PeriodMetrics {
  const leads = lista.reduce((acc, m) => acc + m.leads, 0);
  const cliques = lista.reduce((acc, m) => acc + m.cliques, 0);
  const investimentoTotal = lista.reduce((acc, m) => acc + m.investimentoTotal, 0);
  const faturamento = lista.reduce((acc, m) => acc + m.faturamento, 0);
  return {
    leads,
    cliques,
    investimentoTotal,
    faturamento,
    cpa: leads > 0 ? investimentoTotal / leads : 0,
    cpc: cliques > 0 ? investimentoTotal / cliques : 0,
    custoDia: dias > 0 ? investimentoTotal / dias : 0,
  };
}

/** Combina vários comparativos de campanha num único comparativo agregado (mesmo tipo/janela). */
export function combinarComparativos(comparativos: ComparativoPeriodo[]): Omit<ComparativoPeriodo, 'janelaAtual' | 'janelaAnterior'> {
  const tipo = comparativos[0]?.tipo ?? 'semana';
  const diasAtual = comparativos[0] ? diasEntre(comparativos[0].janelaAtual.inicio, comparativos[0].janelaAtual.fim) : 0;
  const diasAnterior = comparativos[0] ? diasEntre(comparativos[0].janelaAnterior.inicio, comparativos[0].janelaAnterior.fim) : 0;
  const atual = combinarPeriodMetrics(comparativos.map((c) => c.atual), diasAtual);
  const anterior = combinarPeriodMetrics(comparativos.map((c) => c.anterior), diasAnterior);
  return {
    tipo,
    atual,
    anterior,
    deltas: deltasDe(atual, anterior),
  };
}

/**
 * Agrega a série na janela de calendário (semana seg-dom, quinzena ou mês) que contém `referencia`,
 * comparando com a janela de calendário imediatamente anterior, do mesmo tipo.
 */
export function aggregatePeriod(serie: DailyMetric[], tipo: TipoPeriodo, referencia: Date): ComparativoPeriodo {
  const janelaAtual = periodoAtual(tipo, referencia);
  const janelaAnt = periodoAnterior(tipo, janelaAtual);
  const inicioAtualIso = periodoParaIso(janelaAtual.inicio);
  const fimAtualIso = periodoParaIso(janelaAtual.fim);
  const inicioAntIso = periodoParaIso(janelaAnt.inicio);
  const fimAntIso = periodoParaIso(janelaAnt.fim);

  const atualDias = serie.filter((d) => d.data >= inicioAtualIso && d.data <= fimAtualIso);
  const anteriorDias = serie.filter((d) => d.data >= inicioAntIso && d.data <= fimAntIso);

  const atual = toPeriodMetrics(atualDias);
  const anterior = toPeriodMetrics(anteriorDias);
  const deltas = deltasDe(atual, anterior);

  return {
    tipo,
    janelaAtual: { inicio: inicioAtualIso, fim: fimAtualIso },
    janelaAnterior: { inicio: inicioAntIso, fim: fimAntIso },
    atual,
    anterior,
    deltas,
  };
}
