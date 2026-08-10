import { getDbConnection } from '@/lib/db';
import { getMetasPool } from '@/lib/db-metas';
import { listarColaboradores } from '@/lib/convenia';
import { getVendasData } from '@/lib/vendas';
import { listarMetas, listarSquadsAdmin, mesReferenciaDe, type Segmento } from '@/lib/metas';
import {
  diasUteisNoMes, diasUteisNoPeriodo, buscarEstoqueTotal,
  GESTOR_NOME, segmentoFromDepartamento,
} from '@/lib/inside-sales';
import { buscarMetaMacro, type MetaMacro } from '@/lib/metas-macro';

export type { Segmento };

export type RollupMetrica = {
  meta: number | null;
  realizado: number;
  mediaRealizadaDia: number;
  /** null quando o mês já encerrou sem bater a meta — não há mais dias úteis pra dividir (evita o bug da planilha original, que dividia por dias-restantes negativo). */
  ritmoDiarioNecessario: number | null;
  projecaoMantendoRitmo: number;
  percentualAtingido: number | null;
};

export type RollupSquad = {
  squadId: number;
  squadNome: string;
  financeiro: RollupMetrica;
  pv: RollupMetrica;
  estoque: RollupMetrica;
};

export type StatusMes = 'passado' | 'atual' | 'futuro';

export type MetasComercialData = {
  generatedAt: string;
  segmento: Segmento;
  mesReferencia: string;
  statusMes: StatusMes;
  diasUteisNoMes: number;
  diasUteisDecorridos: number;
  squads: RollupSquad[];
  vertical: {
    financeiro: RollupMetrica;
    pv: RollupMetrica;
    estoque: RollupMetrica;
    headcountAtual: number;
    headcountIdeal: number | null;
  };
  macro: MetaMacro | null;
};

export type TendenciaMes = {
  mesReferencia: string;
  financeiro: RollupMetrica;
  pv: RollupMetrica;
  estoque: RollupMetrica;
};

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function rangeDoMes(mesReferencia: string): { dataInicial: string; dataFinal: string } {
  const [ano, mes] = mesReferencia.slice(0, 7).split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    dataInicial: `${mesReferencia.slice(0, 7)}-01`,
    dataFinal: `${mesReferencia.slice(0, 7)}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

function statusDoMes(mesReferencia: string): StatusMes {
  const mesSel = mesReferencia.slice(0, 7);
  const mesAtual = isoHoje().slice(0, 7);
  if (mesSel < mesAtual) return 'passado';
  if (mesSel > mesAtual) return 'futuro';
  return 'atual';
}

function construirMetrica(
  meta: number | null,
  realizado: number,
  diasUteisTotalMes: number,
  diasUteisDecorridos: number,
  diasUteisRestantes: number
): RollupMetrica {
  const falta = meta != null ? Math.max(0, meta - realizado) : null;
  const ritmoDiarioNecessario =
    falta == null ? null : diasUteisRestantes > 0 ? falta / diasUteisRestantes : falta > 0 ? null : 0;
  const mediaRealizadaDia = diasUteisDecorridos > 0 ? realizado / diasUteisDecorridos : 0;
  const projecaoMantendoRitmo = mediaRealizadaDia * diasUteisTotalMes;
  const percentualAtingido = meta != null && meta > 0 ? (realizado / meta) * 100 : null;
  return { meta, realizado, mediaRealizadaDia, ritmoDiarioNecessario, projecaoMantendoRitmo, percentualAtingido };
}

/**
 * Squad atual de cada vendedor (crm_salesperson_allocation vigente → crm_squad_config → crm_squad),
 * mesma resolução "atual" já usada por `/inside-sales` (ver CONEXOES.md seção 3) — aqui direto no
 * MySQL, sem depender do cadastro na Convenia, porque queremos todo mundo alocado ao squad, não só
 * quem bate com um colaborador da Convenia.
 */
async function buscarSquadPorVendedor(segmento: Segmento): Promise<Map<number, number>> {
  const verticalId = segmento === 'veiculos' ? 2 : 1;
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(
      `SELECT csa.salesperson_id AS id_vendedor, squad.id AS squad_id
       FROM crm_salesperson_allocation csa
       JOIN crm_squad_config csc ON csc.id = csa.squad_config_id
       JOIN crm_squad squad ON squad.id = csc.squad_id
       WHERE csa.finished_at IS NULL AND squad.deleted = 0 AND squad.ativo = 1 AND squad.vertical_id = ?`,
      [verticalId]
    );
    const map = new Map<number, number>();
    for (const r of rows as any[]) map.set(Number(r.id_vendedor), Number(r.squad_id));
    return map;
  } finally {
    await connection.end();
  }
}

async function contarHeadcountAtual(segmento: Segmento): Promise<number> {
  const colaboradores = await listarColaboradores();
  return colaboradores.filter(
    (c) =>
      c.status !== 'Desligado' &&
      c.gestorNome === GESTOR_NOME &&
      c.cargo &&
      /vendedor/i.test(c.cargo) &&
      segmentoFromDepartamento(c.departamento) === segmento
  ).length;
}

const CACHE_TTL = 15 * 60 * 1000;
const cacheRollup = new Map<string, { data: MetasComercialData; ts: number }>();

/** Rollup por squad + vertical (Financeiro/PV/Estoque) de um segmento num mês — meta de `metas_squad`/`metas_macro`, realizado sempre calculado ao vivo pro período. */
export async function getMetasComerciaisData(segmento: Segmento, mesReferenciaInput: string): Promise<MetasComercialData> {
  const mesReferencia = mesReferenciaDe(mesReferenciaInput);
  const cacheKey = `${segmento}_${mesReferencia}`;
  const cached = cacheRollup.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const { dataInicial, dataFinal } = rangeDoMes(mesReferencia);
  const statusMes = statusDoMes(mesReferencia);
  const diasUteisTotalMes = diasUteisNoMes(dataInicial);
  const diasUteisDecorridos =
    statusMes === 'futuro' ? 0 : statusMes === 'passado' ? diasUteisTotalMes : diasUteisNoPeriodo(dataInicial, isoHoje());
  const diasUteisRestantes = Math.max(0, diasUteisTotalMes - diasUteisDecorridos);

  const [metas, squadsAdmin, vendorSquadMap, vendasData, estoquePorVendedor, macro, headcountAtual] = await Promise.all([
    listarMetas(mesReferencia),
    listarSquadsAdmin(),
    buscarSquadPorVendedor(segmento),
    getVendasData(dataInicial, dataFinal),
    buscarEstoqueTotal(dataInicial, dataFinal),
    buscarMetaMacro(segmento, mesReferencia),
    contarHeadcountAtual(segmento),
  ]);

  const metaPorSquad = new Map(metas.filter((m) => m.segmento === segmento).map((m) => [m.squadId, m]));
  const financeiroPorVendedor = new Map(vendasData.rankingVendedores.map((v) => [v.idVendedor, v.valorTotal]));
  const pvPorVendedor = new Map(vendasData.rankingVendedores.map((v) => [v.idVendedor, v.ativas]));

  const realizadoFinanceiroPorSquad = new Map<number, number>();
  const realizadoPvPorSquad = new Map<number, number>();
  const realizadoEstoquePorSquad = new Map<number, number>();
  for (const [idVendedor, squadId] of vendorSquadMap) {
    realizadoFinanceiroPorSquad.set(squadId, (realizadoFinanceiroPorSquad.get(squadId) ?? 0) + (financeiroPorVendedor.get(idVendedor) ?? 0));
    realizadoPvPorSquad.set(squadId, (realizadoPvPorSquad.get(squadId) ?? 0) + (pvPorVendedor.get(idVendedor) ?? 0));
    realizadoEstoquePorSquad.set(squadId, (realizadoEstoquePorSquad.get(squadId) ?? 0) + (estoquePorVendedor.get(idVendedor) ?? 0));
  }

  const squads: RollupSquad[] = squadsAdmin
    .filter((s) => s.segmento === segmento)
    .map((s) => {
      const meta = metaPorSquad.get(s.id);
      return {
        squadId: s.id,
        squadNome: s.nome,
        financeiro: construirMetrica(meta?.metaFinanceiraMes ?? null, realizadoFinanceiroPorSquad.get(s.id) ?? 0, diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
        pv: construirMetrica(meta?.metaPvMes ?? null, realizadoPvPorSquad.get(s.id) ?? 0, diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
        estoque: construirMetrica(meta?.metaEstoqueMes ?? null, realizadoEstoquePorSquad.get(s.id) ?? 0, diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
      };
    });

  const somar = (m: Map<number, number>) => Array.from(m.values()).reduce((a, b) => a + b, 0);

  const data: MetasComercialData = {
    generatedAt: new Date().toISOString(),
    segmento,
    mesReferencia,
    statusMes,
    diasUteisNoMes: diasUteisTotalMes,
    diasUteisDecorridos,
    squads,
    vertical: {
      financeiro: construirMetrica(macro?.metaFinanceiraTotal ?? null, somar(realizadoFinanceiroPorSquad), diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
      pv: construirMetrica(macro?.metaPvTotal ?? null, somar(realizadoPvPorSquad), diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
      estoque: construirMetrica(macro?.metaEstoqueTotal ?? null, somar(realizadoEstoquePorSquad), diasUteisTotalMes, diasUteisDecorridos, diasUteisRestantes),
      headcountAtual,
      headcountIdeal: macro?.headcountIdeal ?? null,
    },
    macro,
  };

  cacheRollup.set(cacheKey, { data, ts: Date.now() });
  return data;
}

/** Meses com meta cadastrada (squad ou macro) pra um segmento, mais antigo primeiro — base da tendência mensal. */
async function listarMesesComDados(segmento: Segmento): Promise<string[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT mes_referencia FROM (
       SELECT mes_referencia FROM metas_squad WHERE segmento = $1
       UNION
       SELECT mes_referencia FROM metas_macro WHERE segmento = $1
     ) t ORDER BY mes_referencia`,
    [segmento]
  );
  return rows.map((r: any) => mesReferenciaDe(r.mes_referencia));
}

/** Série mensal (vertical) pra gráfico de tendência — reaproveita `getMetasComerciaisData` mês a mês. */
export async function getTendenciaMensal(segmento: Segmento): Promise<TendenciaMes[]> {
  const meses = await listarMesesComDados(segmento);
  const resultados: TendenciaMes[] = [];
  for (const mes of meses) {
    const dados = await getMetasComerciaisData(segmento, mes);
    resultados.push({ mesReferencia: dados.mesReferencia, financeiro: dados.vertical.financeiro, pv: dados.vertical.pv, estoque: dados.vertical.estoque });
  }
  return resultados;
}
