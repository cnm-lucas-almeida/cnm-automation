import { seededRandom } from './prng';
import { GOOGLE_NOMES, CRITEO_ROWS, BING_ROWS, TROVIT_NOMES } from './mockRaw';
import type { Campanha, CampanhaComSerie, DailyMetric, Plataforma, StatusCampanha, Transacao } from './types';

const DIAS_HISTORICO = 400; // ~13 meses, dá espaço pra navegar semana/quinzena/mês pra trás

function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HABITANTES_UF: Record<string, number> = {
  BR: 215_000_000,
  SP: 46_000_000,
  MG: 21_000_000,
  RJ: 17_000_000,
  BA: 14_900_000,
  PR: 11_600_000,
  RS: 11_100_000,
  SC: 7_800_000,
  PE: 9_600_000,
  CE: 9_200_000,
  PB: 4_100_000,
};

const HABITANTES_CIDADE: Record<string, number> = {
  'São Paulo': 12_300_000,
  'Rio de Janeiro': 6_800_000,
  'Belo Horizonte': 2_500_000,
  CWB: 1_960_000,
  Salvador: 2_900_000,
  POA: 1_490_000,
  Floripa: 520_000,
  'Praia Grande': 330_000,
  'São José dos Campos': 730_000,
  Campinas: 1_220_000,
  Santos: 435_000,
  'Ribeirão Preto': 720_000,
  Sorocaba: 700_000,
  Joinville: 610_000,
  Jundiaí: 425_000,
  Guarulhos: 1_400_000,
  Londrina: 580_000,
  Indaiatuba: 260_000,
  'São Bernardo do Campo': 850_000,
  'João Pessoa': 830_000,
};

function resolveHabitantes(uf: string | null, localidade: string): number | null {
  if (HABITANTES_CIDADE[localidade] != null) return HABITANTES_CIDADE[localidade];
  if (uf && HABITANTES_UF[uf] != null) return HABITANTES_UF[uf];
  return null;
}

// --- Google Ads: parser best-effort do nome pipe-delimitado (formato não 100% consistente) ---

const ESTRATEGIAS = ['tROAS', 'tCPA', 'MAX Cliques', 'IS'];
const TRANSACOES_CONHECIDAS: Transacao[] = ['Venda', 'Aluguel', 'Concorrentes'];
const TAGS_EXTRAS = ['PMAX', 'RBRAND'];

export function parseGoogleCampanhaNome(nome: string): {
  uf: string | null; localidade: string; transacao: Transacao | null; tipoCampanha: string;
} {
  const segmentos = nome.split('|').map((s) => s.trim()).filter(Boolean);
  const uf = segmentos[0] ?? null;
  const localidade = segmentos[1] ?? 'Estado';

  let transacao: Transacao | null = null;
  for (const seg of segmentos.slice(1)) {
    if ((TRANSACOES_CONHECIDAS as string[]).includes(seg)) { transacao = seg as Transacao; break; }
  }
  if (!transacao && segmentos.includes('Lançamentos')) transacao = 'Lançamentos';
  if (!transacao && segmentos.includes('PMAX')) transacao = 'PMAX';
  if (!transacao) transacao = 'Outro';

  const estrategia = [...segmentos].reverse().find((s) => ESTRATEGIAS.includes(s)) ?? segmentos[segmentos.length - 1] ?? 'Outro';
  const tagsExtras = segmentos.filter((s) => TAGS_EXTRAS.includes(s) && s !== transacao);
  const tipoCampanha = [estrategia, ...tagsExtras].join(' · ');

  return { uf, localidade, transacao, tipoCampanha };
}

function buildGoogleCampanhas(): Campanha[] {
  return GOOGLE_NOMES.map((nome, idx) => {
    const { uf, localidade, transacao, tipoCampanha } = parseGoogleCampanhaNome(nome);
    return {
      id: `google-${idx}`,
      plataforma: 'google',
      nomeCampanha: nome,
      tipoCampanha,
      uf,
      localidade,
      transacao,
      utm: slugify(`${uf ?? ''}_${localidade}_${transacao ?? ''}`),
      habitantes: resolveHabitantes(uf, localidade),
      status: 'ativa',
    };
  });
}

// --- Criteo ---

function extrairUf(nome: string): string | null {
  const ufs = 'SP|RJ|MG|RS|SC|PR|BA|PE|CE|PB';
  const meio = nome.match(new RegExp(`-\\s*(${ufs})\\s*-`, 'i'));
  if (meio) return meio[1].toUpperCase();
  const fim = nome.match(new RegExp(`-\\s*(${ufs})\\s*$`, 'i'));
  if (fim) return fim[1].toUpperCase();
  return null;
}

function buildCriteoCampanhas(): Campanha[] {
  return CRITEO_ROWS.map((row, idx) => {
    const status: StatusCampanha = row.status === 'Ativo' ? 'ativa' : row.status === 'Rascunho' ? 'rascunho' : 'pausada';
    const orcamentoDiaReal = row.periodoOrcamento === 'Mensal' ? row.orcamento / 30 : row.orcamento;
    const uf = extrairUf(row.nome);
    const transacao: Transacao | null = /venda/i.test(row.nome) ? 'Venda' : /aluguel/i.test(row.nome) ? 'Aluguel' : null;
    return {
      id: `criteo-${idx}`,
      plataforma: 'criteo',
      nomeCampanha: row.nome,
      tipoCampanha: row.objetivo,
      uf,
      localidade: uf ?? 'BR',
      transacao,
      utm: slugify(row.nome),
      habitantes: resolveHabitantes(uf, uf ? 'Estado' : 'BR'),
      status,
      extras: {
        idCampanha: row.idCampanha,
        objetivo: row.objetivo,
        status: row.status,
        orcamento: row.orcamento,
        periodoOrcamento: row.periodoOrcamento,
        ativado: row.ativado ? 'Sim' : 'Não',
        orcamentoDiaReal,
      },
    };
  });
}

// --- Bing ---

function buildBingCampanhas(): Campanha[] {
  return BING_ROWS.map((row, idx) => {
    const status: StatusCampanha = row.status === 'ativa' ? 'ativa' : 'pausada';
    const localidade = row.uf ? (row.uf === 'BR' ? 'Trafego' : 'Estado') : 'Geral';
    return {
      id: `bing-${idx}`,
      plataforma: 'bing',
      nomeCampanha: row.nome,
      tipoCampanha: 'Pesquisa',
      uf: row.uf,
      localidade,
      transacao: null,
      utm: slugify(row.nome),
      habitantes: resolveHabitantes(row.uf, localidade),
      status,
      extras: {
        impressoes: row.impressoes,
        cliques: row.cliques,
        ctr: row.ctr,
        cpcReal: row.cpc,
        custo: row.custo,
        conversoes: row.conversoes,
        orcamentoDiaReal: row.orcamentoDia,
        convRateReal: row.cliques > 0 ? row.conversoes / row.cliques : null,
      },
    };
  });
}

// --- Trovit (placeholder, sem dado real ainda) ---

function buildTrovitCampanhas(): Campanha[] {
  return TROVIT_NOMES.map((nome, idx) => {
    const [uf, transacaoRaw] = nome.split('|').map((s) => s.trim());
    const transacao: Transacao | null = transacaoRaw === 'Venda' ? 'Venda' : transacaoRaw === 'Aluguel' ? 'Aluguel' : null;
    return {
      id: `trovit-${idx}`,
      plataforma: 'trovit',
      nomeCampanha: nome,
      tipoCampanha: 'Listing',
      uf,
      localidade: 'Estado',
      transacao,
      utm: slugify(nome),
      habitantes: resolveHabitantes(uf, 'Estado'),
      status: 'ativa',
      isPlaceholder: true,
    };
  });
}

// --- Geração da série diária mock ---

interface BaseParams {
  orcamentoDiaBase: number;
  cpc: number;
  convRate: number; // leads por clique
  ticketMedio: number; // faturamento (R$) por lead
}

function buildBaseParams(c: Campanha): BaseParams {
  const key = c.id;
  const extras = c.extras ?? {};
  const isAmplo = c.localidade === 'Estado' || c.uf === 'BR' || c.localidade === 'Trafego' || c.localidade === 'Cobertura';
  const tier = isAmplo ? seededRandom(`${key}|tier`, 2.5, 6) : seededRandom(`${key}|tier`, 0.8, 2.2);

  const orcamentoDiaBase = typeof extras.orcamentoDiaReal === 'number'
    ? extras.orcamentoDiaReal
    : seededRandom(`${key}|orc`, 40, 300) * tier;

  const cpc = typeof extras.cpcReal === 'number' && extras.cpcReal > 0
    ? extras.cpcReal
    : seededRandom(`${key}|cpc`, 0.15, 3.2);

  const convRate = typeof extras.convRateReal === 'number' && extras.convRateReal > 0
    ? extras.convRateReal
    : seededRandom(`${key}|conv`, 0.04, 0.14);

  const ticketMedio = c.transacao === 'Venda'
    ? seededRandom(`${key}|ticket`, 150, 450)
    : c.transacao === 'Aluguel'
      ? seededRandom(`${key}|ticket`, 60, 200)
      : seededRandom(`${key}|ticket`, 80, 300);

  return { orcamentoDiaBase, cpc, convRate, ticketMedio };
}

export function gerarSerie(campanha: Campanha, dias: number = DIAS_HISTORICO, fimEm: Date = new Date()): DailyMetric[] {
  const ativa = campanha.status === 'ativa';
  const params = buildBaseParams(campanha);
  const serie: DailyMetric[] = [];

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(fimEm);
    d.setDate(d.getDate() - i);
    const data = d.toISOString().slice(0, 10);
    const key = `${campanha.id}|${data}`;

    // orçamento/dia é só o parâmetro interno (base + jitter) usado para simular o gasto real do dia;
    // não é exposto como métrica — o que o CEO chama de "Custo" é o investimentoTotal (gasto real).
    const orcamentoDiaSimulado = Math.round(params.orcamentoDiaBase * seededRandom(`${key}|orcJitter`, 0.9, 1.1) * 100) / 100;

    if (!ativa) {
      serie.push({ data, leads: 0, cliques: 0, investimentoTotal: 0, faturamento: 0 });
      continue;
    }

    const utilizacao = seededRandom(`${key}|util`, 0.55, 1.05);
    const investimentoTotal = Math.round(orcamentoDiaSimulado * utilizacao * 100) / 100;
    const cpcDia = Math.max(0.05, params.cpc * seededRandom(`${key}|cpcJitter`, 0.85, 1.15));
    const cliques = Math.max(0, Math.round(investimentoTotal / cpcDia));
    const convDia = Math.max(0.01, params.convRate * seededRandom(`${key}|convJitter`, 0.8, 1.2));
    const leads = Math.max(0, Math.round(cliques * convDia));
    const ticketDia = Math.max(10, params.ticketMedio * seededRandom(`${key}|ticketJitter`, 0.85, 1.2));
    const faturamento = Math.round(leads * ticketDia * 100) / 100;

    serie.push({ data, leads, cliques, investimentoTotal, faturamento });
  }

  return serie;
}

const BUILDERS: Record<Plataforma, () => Campanha[]> = {
  google: buildGoogleCampanhas,
  criteo: buildCriteoCampanhas,
  bing: buildBingCampanhas,
  trovit: buildTrovitCampanhas,
};

export function getCampanhasByPlataforma(plataforma: Plataforma, fimEm: Date = new Date()): CampanhaComSerie[] {
  return BUILDERS[plataforma]().map((campanha) => ({ campanha, serie: gerarSerie(campanha, DIAS_HISTORICO, fimEm) }));
}

export function getAllCampanhas(fimEm: Date = new Date()): CampanhaComSerie[] {
  return (Object.keys(BUILDERS) as Plataforma[]).flatMap((p) => getCampanhasByPlataforma(p, fimEm));
}
