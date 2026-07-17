import { getDbConnection } from '@/lib/db';
import { listarColaboradores } from '@/lib/convenia';
import { getVendasData } from '@/lib/vendas';
import { listarMetas } from '@/lib/metas';

const CACHE_TTL = 15 * 60 * 1000;
const GESTOR_NOME = 'Jackson Savi Alberti';
const META_PV_ATIVA_DIVISOR = 20;

export type Segmento = 'veiculos' | 'imoveis';
export type Ciclo = '1°' | '2°' | 'V';

export type InsideSalesRow = {
  nome: string;
  segmento: Segmento | null;
  cargo: string | null;
  ciclo: Ciclo;
  supervisor: string | null;
  squad: string | null;
  qtdPvAtiva: number | null;
  bases: number | null;
  baseMeta: number | null;
  metaQtdPvAtiva: number | null;
  metaFinanceiro: number | null;
  financeiroTotal: number | null;
  faltaMetaFinanceiro: number | null;
  financeiroPercentual: number | null;
  percentualMetaDiariaBatida: number;
  mediaPvPorDia: number | null;
  ticketMedioPorPlano: number;
  metaEstoqueTotal: number | null;
  estoqueTotal: number | null;
  faltaMetaEstoqueTotal: number | null;
  estoqueTotalPercentual: number | null;
  percentualMetaEstoqueDiariaBatida: number;
};

export type InsideSalesData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  diasUteisNoMes: number;
  linhas: InsideSalesRow[];
};

type VendedorAdminRow = {
  cpf: string;
  idVendedor: number;
  supervisorNome: string | null;
  squadNome: string | null;
  squadId: number | null;
};

type BaseRow = { id_vendedor: number | null; bases: number };
type EstoqueRow = { id_vendedor: number | null; estoque_total: number | null };

function segmentoFromDepartamento(departamento: string | null): Segmento | null {
  if (!departamento) return null;
  const d = departamento.toLowerCase();
  if (d.includes('veículo') || d.includes('veiculo')) return 'veiculos';
  if (d.includes('imó') || d.includes('imo')) return 'imoveis';
  return null;
}

function calcularCiclo(experiencePeriod: { firstEnd: string | null; secondEnd: string | null } | null, hoje: Date): Ciclo {
  if (!experiencePeriod?.firstEnd || !experiencePeriod?.secondEnd) return 'V';
  const primeiroFim = new Date(experiencePeriod.firstEnd);
  const segundoFim = new Date(experiencePeriod.secondEnd);
  if (hoje <= primeiroFim) return '1°';
  if (hoje <= segundoFim) return '2°';
  return 'V';
}

function diasUteisNoMes(dataInicialIso: string): number {
  const [ano, mes] = dataInicialIso.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const diaSemana = new Date(ano, mes - 1, dia).getDay();
    if (diaSemana !== 0 && diaSemana !== 6) count++;
  }
  return count;
}

/** Dias úteis (seg-sex) já decorridos dentro do período selecionado, inclusive nas duas pontas. */
function diasUteisNoPeriodo(dataInicialIso: string, dataFinalIso: string): number {
  const inicio = new Date(`${dataInicialIso}T00:00:00`);
  const fim = new Date(`${dataFinalIso}T00:00:00`);
  let count = 0;
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const diaSemana = d.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) count++;
  }
  return count;
}

const MAPA_ACENTOS: [string, string][] = [
  ['á', 'a'], ['à', 'a'], ['ã', 'a'], ['â', 'a'], ['ä', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['õ', 'o'], ['ô', 'o'], ['ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ç', 'c'], ['ñ', 'n'],
];

function normalizarNome(nome: string): string {
  let s = nome.replace(/ /g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [de, para] of MAPA_ACENTOS) s = s.split(de).join(para);
  return s;
}

/** Mesma normalização de `normalizarNome`, em SQL, para casar nomes vindos da Convenia (sem acento) com `tb_vendedor.nome` (com acento, e às vezes espaço não-quebrável colado por cópia de planilha). */
function sqlNomeNormalizado(coluna: string): string {
  let expr = `LOWER(TRIM(REPLACE(${coluna}, UNHEX('C2A0'), ' ')))`;
  for (const [de, para] of MAPA_ACENTOS) expr = `REPLACE(${expr}, '${de}', '${para}')`;
  return expr;
}

/**
 * Casa colaboradores da Convenia com tb_vendedor por CPF; quando o CPF não está
 * cadastrado no admin (comum em contratações recentes), cai para match por nome.
 */
async function buscarDadosAdmin(
  colaboradores: { cpf: string | null; nome: string }[]
): Promise<{ porCpf: Map<string, VendedorAdminRow>; porNome: Map<string, VendedorAdminRow> }> {
  const porCpf = new Map<string, VendedorAdminRow>();
  const porNome = new Map<string, VendedorAdminRow>();

  const cpfs = colaboradores.map((c) => c.cpf).filter((cpf): cpf is string => Boolean(cpf));
  const nomes = colaboradores.map((c) => normalizarNome(c.nome));
  if (cpfs.length === 0 && nomes.length === 0) return { porCpf, porNome };

  const connection = await getDbConnection();
  try {
    const cpfPlaceholders = cpfs.map(() => '?').join(',') || 'NULL';
    const nomePlaceholders = nomes.map(() => '?').join(',') || 'NULL';
    const [rows] = await connection.query(
      `
      SELECT
        v.id AS id_vendedor,
        REPLACE(REPLACE(REPLACE(v.documento, '.', ''), '-', ''), '/', '') AS cpf,
        ${sqlNomeNormalizado('v.nome')} AS nome_normalizado,
        sup.nome AS supervisor_nome,
        squad.name AS squad_nome,
        squad.id AS squad_id
      FROM tb_vendedor v
      LEFT JOIN tb_vendedor_grupo vg ON vg.id_vendedor = v.id AND vg.deleted = 0 AND vg.perfil = 4 AND vg.data_fim IS NULL
      LEFT JOIN tb_vendedor sup ON sup.id = vg.id_vendedor_pai
      LEFT JOIN crm_salesperson_allocation csa ON csa.salesperson_id = v.id AND csa.finished_at IS NULL
      LEFT JOIN crm_squad_config csc ON csc.id = csa.squad_config_id
      LEFT JOIN crm_squad squad ON squad.id = csc.squad_id
      WHERE v.deleted = 0 AND v.data_fim IS NULL
        AND (
          REPLACE(REPLACE(REPLACE(v.documento, '.', ''), '-', ''), '/', '') IN (${cpfPlaceholders})
          OR ${sqlNomeNormalizado('v.nome')} IN (${nomePlaceholders})
        )
      `,
      [...cpfs, ...nomes]
    );

    for (const r of rows as any[]) {
      const row: VendedorAdminRow = {
        cpf: r.cpf,
        idVendedor: r.id_vendedor,
        supervisorNome: r.supervisor_nome,
        squadNome: r.squad_nome,
        squadId: r.squad_id,
      };
      if (r.cpf) porCpf.set(r.cpf, row);
      if (r.nome_normalizado) porNome.set(r.nome_normalizado, row);
    }
    return { porCpf, porNome };
  } finally {
    await connection.end();
  }
}

async function buscarBases(dataInicial: string, dataFinal: string): Promise<Map<number, number>> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(
      `
      SELECT
        (SELECT fcpc1.id_vendedor FROM tb_financeiro_contrato_pre_cadastro fcpc1
         WHERE fcpc1.id_cliente = glc.id_cliente ORDER BY fcpc1.id DESC LIMIT 1) AS id_vendedor,
        COUNT(*) AS bases
      FROM tb_gerencia_link_contrato glc
      LEFT JOIN (
        SELECT id_crm, id_cliente FROM tb_contrato_conversao sub_cc
        WHERE created_at = (SELECT MAX(created_at) FROM tb_contrato_conversao WHERE sub_cc.id_cliente = id_cliente GROUP BY id_cliente)
        GROUP BY id_cliente
      ) tcc ON tcc.id_cliente = glc.id_cliente
      LEFT JOIN tb_contato_pj tcp ON tcp.id = tcc.id_crm
      WHERE glc.deleted = 0
        AND glc.data_cadastro BETWEEN ? AND ?
        AND tcp.deal_flow = 'OUTBOUND'
      GROUP BY id_vendedor
      HAVING id_vendedor IS NOT NULL
      `,
      [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`]
    );

    const map = new Map<number, number>();
    for (const r of rows as BaseRow[]) {
      if (r.id_vendedor != null) map.set(Number(r.id_vendedor), Number(r.bases));
    }
    return map;
  } finally {
    await connection.end();
  }
}

/**
 * Espelha o campo "QTDE ANUN" da tela relatorio_vendas_vendedor do admin: soma, por vendedor,
 * a capacidade de anúncios (qtd_imoveis/qtd_veiculos) do plano ativo do cliente em cada contrato do período.
 */
async function buscarEstoqueTotal(dataInicial: string, dataFinal: string): Promise<Map<number, number>> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(
      `
      SELECT
        fc.id_vendedor AS id_vendedor,
        SUM(COALESCE(ipa.qtd_imoveis, vpa.qtd_veiculos)) AS estoque_total
      FROM tb_cliente c
      INNER JOIN tb_financeiro_contrato fc ON fc.id_cliente = c.id
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id_cliente ORDER BY id DESC) AS rn
        FROM tb_imovel_plano_assinatura_cliente
        WHERE ativo = 1 AND deleted = 0
      ) ipac ON ipac.id_cliente = c.id AND ipac.rn = 1
      LEFT JOIN tb_imovel_plano_assinatura ipa ON ipa.id = ipac.id_imovel_plano_assinatura
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id_cliente ORDER BY id DESC) AS rn
        FROM tb_veiculo_plano_assinatura_cliente
        WHERE ativo = 1 AND deleted = 0
      ) vpac ON vpac.id_cliente = c.id AND vpac.rn = 1
      LEFT JOIN tb_veiculo_plano_assinatura vpa ON vpa.id = vpac.id_veiculo_plano_assinatura
      WHERE c.deleted = 0
        AND fc.deleted = 0
        AND fc.valor_mensalidade_original > 0.01
        AND fc.data_contrato BETWEEN ? AND ?
      GROUP BY fc.id_vendedor
      `,
      [dataInicial, dataFinal]
    );

    const map = new Map<number, number>();
    for (const r of rows as EstoqueRow[]) {
      if (r.id_vendedor != null) map.set(Number(r.id_vendedor), Number(r.estoque_total ?? 0));
    }
    return map;
  } finally {
    await connection.end();
  }
}

let cache: { data: InsideSalesData; key: string; ts: number } | null = null;

export async function getInsideSalesData(
  dataInicial: string,
  dataFinal: string,
  forceRefresh = false
): Promise<InsideSalesData> {
  const cacheKey = `${dataInicial}_${dataFinal}`;
  const now = Date.now();
  if (!forceRefresh && cache && cache.key === cacheKey && now - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  const colaboradores = await listarColaboradores(forceRefresh);
  const insideSales = colaboradores.filter(
    (c) =>
      c.status !== 'Desligado' &&
      c.gestorNome === GESTOR_NOME &&
      c.cargo &&
      /vendedor/i.test(c.cargo)
  );

  const [{ porCpf, porNome }, bases, vendasData, metas, estoqueTotalPorVendedor] = await Promise.all([
    buscarDadosAdmin(insideSales.map((c) => ({ cpf: c.cpf, nome: c.nome }))),
    buscarBases(dataInicial, dataFinal),
    getVendasData(dataInicial, dataFinal),
    listarMetas(),
    buscarEstoqueTotal(dataInicial, dataFinal),
  ]);

  const ativasPorVendedor = new Map(vendasData.rankingVendedores.map((v) => [v.idVendedor, v.ativas]));
  const valorTotalPorVendedor = new Map(vendasData.rankingVendedores.map((v) => [v.idVendedor, v.valorTotal]));
  const metasPorSquad = new Map(metas.map((m) => [m.squadId, m]));
  const hoje = new Date();
  const diasUteis = diasUteisNoMes(dataInicial);
  const diasUteisDecorridos = diasUteisNoPeriodo(dataInicial, dataFinal);

  const linhas: InsideSalesRow[] = insideSales.map((c) => {
    const admin = (c.cpf && porCpf.get(c.cpf)) || porNome.get(normalizarNome(c.nome));
    const qtdPvAtiva = admin ? ativasPorVendedor.get(admin.idVendedor) ?? 0 : null;
    const qtdBases = admin ? bases.get(admin.idVendedor) ?? 0 : null;
    const financeiroTotal = admin ? valorTotalPorVendedor.get(admin.idVendedor) ?? 0 : null;
    const meta = admin?.squadId != null ? metasPorSquad.get(admin.squadId) : undefined;
    const metaFinanceiro = meta?.metaFinanceiraMes ?? null;
    const metaEstoqueTotal = meta?.metaEstoqueMes ?? null;
    const estoqueTotal = admin ? estoqueTotalPorVendedor.get(admin.idVendedor) ?? 0 : null;

    // % Meta Diária Financeiro Batida: realizado / (meta diária × dias úteis do mês). Dias de afastamento não são descontados por ora.
    const metaAjustadaDiasUteis = meta ? meta.metaFinanceiraDia * diasUteis : 0;
    const percentualMetaDiariaBatida = metaAjustadaDiasUteis > 0 && financeiroTotal != null
      ? (financeiroTotal / metaAjustadaDiasUteis) * 100
      : 0;

    // % Meta Estoque Diária Batida: mesmo raciocínio, para estoque.
    const metaEstoqueAjustadaDiasUteis = meta ? meta.metaEstoqueDia * diasUteis : 0;
    const percentualMetaEstoqueDiariaBatida = metaEstoqueAjustadaDiasUteis > 0 && estoqueTotal != null
      ? (estoqueTotal / metaEstoqueAjustadaDiasUteis) * 100
      : 0;

    // Ticket Médio trazido por Plano: financeiro total / qtd PV ativa
    const ticketMedioPorPlano = qtdPvAtiva ? (financeiroTotal ?? 0) / qtdPvAtiva : 0;

    return {
      nome: c.nome,
      segmento: segmentoFromDepartamento(c.departamento),
      cargo: c.cargo,
      ciclo: calcularCiclo(c.experiencePeriod, hoje),
      supervisor: admin?.supervisorNome ?? null,
      squad: admin?.squadNome ?? null,
      qtdPvAtiva,
      bases: qtdBases,
      baseMeta: qtdBases != null ? qtdBases / diasUteis : null,
      metaQtdPvAtiva: qtdPvAtiva != null ? qtdPvAtiva / META_PV_ATIVA_DIVISOR : null,
      metaFinanceiro,
      financeiroTotal,
      faltaMetaFinanceiro: financeiroTotal != null && metaFinanceiro != null ? financeiroTotal - metaFinanceiro : null,
      financeiroPercentual: financeiroTotal != null && metaFinanceiro ? (financeiroTotal / metaFinanceiro) * 100 : null,
      percentualMetaDiariaBatida,
      mediaPvPorDia: qtdPvAtiva != null && diasUteisDecorridos > 0 ? qtdPvAtiva / diasUteisDecorridos : null,
      ticketMedioPorPlano,
      metaEstoqueTotal,
      estoqueTotal,
      faltaMetaEstoqueTotal: estoqueTotal != null && metaEstoqueTotal != null ? estoqueTotal - metaEstoqueTotal : null,
      estoqueTotalPercentual: estoqueTotal != null && metaEstoqueTotal ? (estoqueTotal / metaEstoqueTotal) * 100 : null,
      percentualMetaEstoqueDiariaBatida,
    };
  });

  const data: InsideSalesData = {
    generatedAt: new Date().toISOString(),
    periodo: { dataInicial, dataFinal },
    diasUteisNoMes: diasUteis,
    linhas: linhas.sort((a, b) => a.nome.localeCompare(b.nome)),
  };

  cache = { data, key: cacheKey, ts: now };
  return data;
}
