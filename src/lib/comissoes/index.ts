import { getDbConnection } from '@/lib/db';
import {
  PERFIL_VENDEDOR,
  PERFIL_ATENDENTE,
  buscarTodosVendedoresAtivos,
  buscarComissaoFechada,
  buscarVendasElegiveis,
  buscarAditivosElegiveis,
  calcularAberto,
} from '@/lib/folha-pagamento/comissao';
import { perfilLabel, type TipoFechamento } from '@/lib/comissoes/constants';

// Fonte de dados e regras validadas em `docs/` + investigação real do admin
// (application/models/vendedor_model.php, comissao_fechada_model.php) — ver
// TAREFA_* / memória de projeto pra contexto completo. Só comissão FECHADA
// (tb_comissao_fechada/tb_comissao_detalhamento) entra no histórico; "mês em
// andamento" reaproveita a mesma lógica de cálculo aberto já validada em
// src/lib/folha-pagamento/comissao.ts, mas generalizada pra todos os
// vendedores ativos do perfil (não uma lista específica de colaboradores).
//
// Constantes client-safe (PERFIL_LABEL, perfilLabel, TipoFechamento) moraram em
// ./constants.ts de propósito: este arquivo importa getDbConnection (Node-only,
// puxa mysql2/pg/dns) e não pode ser importado por valor de um Client Component
// — só via `import type`. Componentes de UI devem importar PERFIL_LABEL/
// TipoFechamento direto de '@/lib/comissoes/constants', nunca daqui.

export type { TipoFechamento } from '@/lib/comissoes/constants';

// Perfis sem cálculo de comissão aberta implementado nesta v1 (comissionam por
// equipe/hierarquia — Assistente e Treinador/SDR por tb_vendedor_grupo — ou,
// no caso do Representante Comercial, fecham por semana em vez de mês).
const PERFIS_SEM_ESTIMATIVA_ABERTA = [2, 4, 5, 6];

// calcularMesEmAndamento faz ~150-300 queries sequenciais (uma conexão só, sem
// pool — não paraleliza de verdade, o protocolo MySQL não permite pipeline numa
// mesma conexão) e o resultado NÃO depende de período/perfil/tipoFechamento
// (sempre olha todo Vendedor/Atendente ativo do mês corrente). Sem cache, toda
// troca de filtro na tela refaria esse custo à toa. Mesmo padrão de
// src/lib/convenia/index.ts (cache em memória do processo + TTL curto).
const MES_ANDAMENTO_CACHE_TTL = 5 * 60 * 1000;
let mesEmAndamentoCache: { chave: string; data: ComissoesData['mesEmAndamento']; ts: number } | null = null;

export type FechamentoComissao = {
  idComissaoFechada: number;
  idVendedor: number;
  vendedorNome: string;
  perfil: number;
  perfilNome: string;
  tipoFechamento: TipoFechamento;
  anoReferencia: number;
  mesReferencia: number;
  dataFechamento: string | null;
  valorPago: number;
  valorBase: number;
  qtdVendas: number;
  qtdAditivos: number;
};

export type SeriePeriodo = { periodo: string; valor: number; qtd: number; faturamento: number };
export type Breakdown = { chave: string; valor: number; qtd: number };
export type RankingVendedor = {
  idVendedor: number; nome: string; perfil: number; perfilNome: string; valor: number; qtd: number;
};

export type ComissaoEmAndamento = {
  idVendedor: number;
  nome: string;
  perfil: number;
  perfilNome: string;
  valorEstimado: number;
};

export type ComissoesFiltros = {
  perfil?: number;
  tipoFechamento?: TipoFechamento;
};

export type ComissoesData = {
  generatedAt: string;
  periodo: { inicial: string; final: string };
  kpis: {
    totalPago: number;
    qtdFechamentos: number;
    totalVendas: number;
    ticketMedio: number;
    totalPeriodoAnterior: number;
    variacaoPct: number | null;
  };
  seriePorMes: SeriePeriodo[];
  porPerfil: Breakdown[];
  porTipoFechamento: Breakdown[];
  ranking: RankingVendedor[];
  fechamentos: FechamentoComissao[];
  mesEmAndamento: {
    anoReferencia: number;
    mesReferencia: number;
    totalEstimado: number;
    totalFaturamentoEstimado: number;
    itens: ComissaoEmAndamento[];
    perfisNaoDisponiveis: string[];
  };
};

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function somaMeses(periodo: string, delta: number): string {
  const [ano, mes] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function diferencaEmMeses(inicial: string, final: string): number {
  const [anoI, mesI] = inicial.split('-').map(Number);
  const [anoF, mesF] = final.split('-').map(Number);
  return (anoF - anoI) * 12 + (mesF - mesI) + 1;
}

// Condição de período (mês derivado pra SEMANAL) + filtros de perfil/tipo, compartilhada entre
// buscarFechamentos e contarVendasDistintas — mesmo WHERE, duas agregações diferentes.
function construirCondicaoPeriodo(
  periodoInicial: string,
  periodoFinal: string,
  filtros: ComissoesFiltros
): { sql: string; params: (string | number)[] } {
  let sql = `
    WHERE CONCAT(COALESCE(cf.ano_referencia, YEAR(cf.data_inicio)), '-', LPAD(COALESCE(cf.mes_referencia, MONTH(cf.data_inicio)), 2, '0'))
      BETWEEN ? AND ?
  `;
  const params: (string | number)[] = [periodoInicial, periodoFinal];

  if (filtros.perfil !== undefined) {
    sql += ' AND v.perfil = ?';
    params.push(filtros.perfil);
  }
  if (filtros.tipoFechamento) {
    sql += ' AND cf.tipo_fechamento = ?';
    params.push(filtros.tipoFechamento);
  }
  return { sql, params };
}

// Conta VENDAS DISTINTAS (por id_contrato) no período, não a soma de qtd_vendas por fechamento —
// perfis hierárquicos (Assistente/Treinador comissionam sobre a equipe inteira via
// tb_vendedor_grupo) geram um fechamento próprio que referencia OS MESMOS contratos já contados
// no fechamento do vendedor individual. Somar qtd_vendas de todos os fechamentos triplica/
// quadruplica a contagem (confirmado: 4023 linhas vs. 1404 contratos distintos em jul/2026).
async function contarVendasDistintas(
  conn: Awaited<ReturnType<typeof getDbConnection>>,
  periodoInicial: string,
  periodoFinal: string,
  filtros: ComissoesFiltros
): Promise<number> {
  const { sql: condicao, params } = construirCondicaoPeriodo(periodoInicial, periodoFinal, filtros);
  const sql = `
    SELECT COUNT(DISTINCT cd.id_contrato) AS total
    FROM tb_comissao_fechada cf
    JOIN tb_vendedor v ON v.id = cf.id_vendedor
    JOIN tb_comissao_detalhamento cd
      ON cd.id_comissao_fechada = cf.id AND (cd.excecao IS NULL OR cd.excecao = 0) AND cd.tipo_comissao = 'VENDA'
    ${condicao}
  `;
  const [rows] = await conn.query(sql, params);
  return toNum((rows as any[])[0]?.total);
}

async function buscarFechamentos(
  conn: Awaited<ReturnType<typeof getDbConnection>>,
  periodoInicial: string,
  periodoFinal: string,
  filtros: ComissoesFiltros
): Promise<FechamentoComissao[]> {
  const { sql: condicao, params } = construirCondicaoPeriodo(periodoInicial, periodoFinal, filtros);
  let sql = `
    SELECT
      cf.id AS id_comissao_fechada,
      cf.id_vendedor,
      v.nome AS vendedor_nome,
      v.perfil,
      cf.tipo_fechamento,
      COALESCE(cf.ano_referencia, YEAR(cf.data_inicio)) AS ano_referencia,
      COALESCE(cf.mes_referencia, MONTH(cf.data_inicio)) AS mes_referencia,
      cf.data_fechamento,
      COALESCE(SUM(cd.valor_base_comissao * cf.comissao_vendedor_momento), 0) AS valor_pago,
      COALESCE(SUM(cd.valor_base_comissao), 0) AS valor_base,
      COALESCE(SUM(IF(cd.tipo_comissao = 'VENDA', 1, 0)), 0) AS qtd_vendas,
      COALESCE(SUM(IF(cd.tipo_comissao = 'ADITIVO', 1, 0)), 0) AS qtd_aditivos
    FROM tb_comissao_fechada cf
    JOIN tb_vendedor v ON v.id = cf.id_vendedor
    LEFT JOIN tb_comissao_detalhamento cd
      ON cd.id_comissao_fechada = cf.id AND (cd.excecao IS NULL OR cd.excecao = 0)
    ${condicao}
  `;

  sql += ' GROUP BY cf.id ORDER BY ano_referencia DESC, mes_referencia DESC';

  const [rows] = await conn.query(sql, params);
  return (rows as any[]).map((r) => ({
    idComissaoFechada: r.id_comissao_fechada,
    idVendedor: r.id_vendedor,
    vendedorNome: r.vendedor_nome,
    perfil: r.perfil,
    perfilNome: perfilLabel(r.perfil),
    tipoFechamento: r.tipo_fechamento,
    anoReferencia: r.ano_referencia,
    mesReferencia: r.mes_referencia,
    dataFechamento: r.data_fechamento,
    valorPago: toNum(r.valor_pago),
    valorBase: toNum(r.valor_base),
    qtdVendas: toNum(r.qtd_vendas),
    qtdAditivos: toNum(r.qtd_aditivos),
  }));
}

async function buscarAnoMesAtual(conn: Awaited<ReturnType<typeof getDbConnection>>): Promise<{ ano: number; mes: number }> {
  const [rows] = await conn.query('SELECT YEAR(CURDATE()) AS ano, MONTH(CURDATE()) AS mes');
  const linha = (rows as any[])[0];
  return { ano: linha.ano, mes: linha.mes };
}

async function calcularMesEmAndamento(
  conn: Awaited<ReturnType<typeof getDbConnection>>,
  ano: number,
  mes: number
): Promise<ComissoesData['mesEmAndamento']> {
  const mapas = await buscarTodosVendedoresAtivos(conn);
  const vendedores = Array.from(mapas.porNomeNormalizado.values())
    .filter((v) => v.perfil === PERFIL_VENDEDOR || v.perfil === PERFIL_ATENDENTE);

  const itens: ComissaoEmAndamento[] = [];
  let totalFaturamentoEstimado = 0;
  for (const vendedor of vendedores) {
    const fechado = await buscarComissaoFechada(conn, vendedor.id, ano, mes);
    // Se o mês corrente já foi fechado pra esse vendedor (raro, mas acontece com Rescisão no meio
    // do mês), a comissão dele já está contada na agregação histórica normal (buscarFechamentos) —
    // pular aqui evita contar duas vezes (uma na barra "Fechado", outra na "Em andamento").
    if (fechado !== null) continue;

    const vendas = await buscarVendasElegiveis(conn, vendedor.id, ano, mes, vendedor.perfil);
    const aditivos = vendedor.perfil === PERFIL_ATENDENTE
      ? await buscarAditivosElegiveis(conn, vendedor.id, ano, mes)
      : [];
    const valorEstimado = calcularAberto(vendas, aditivos, vendedor);
    if (valorEstimado > 0) {
      itens.push({
        idVendedor: vendedor.id,
        nome: vendedor.nome,
        perfil: vendedor.perfil,
        perfilNome: perfilLabel(vendedor.perfil),
        valorEstimado,
      });
      totalFaturamentoEstimado += [...vendas, ...aditivos].reduce((s, v) => s + v, 0);
    }
  }

  itens.sort((a, b) => b.valorEstimado - a.valorEstimado);

  return {
    anoReferencia: ano,
    mesReferencia: mes,
    totalEstimado: itens.reduce((s, i) => s + i.valorEstimado, 0),
    totalFaturamentoEstimado,
    itens,
    perfisNaoDisponiveis: PERFIS_SEM_ESTIMATIVA_ABERTA.map(perfilLabel),
  };
}

export async function getComissoesData(
  periodoInicial: string,
  periodoFinal: string,
  filtros: ComissoesFiltros = {}
): Promise<ComissoesData> {
  const conn = await getDbConnection();
  try {
    const fechamentos = await buscarFechamentos(conn, periodoInicial, periodoFinal, filtros);

    const numMeses = diferencaEmMeses(periodoInicial, periodoFinal);
    const periodoAnteriorFinal = somaMeses(periodoInicial, -1);
    const periodoAnteriorInicial = somaMeses(periodoInicial, -numMeses);
    const fechamentosAnteriores = await buscarFechamentos(conn, periodoAnteriorInicial, periodoAnteriorFinal, filtros);
    const totalPeriodoAnterior = fechamentosAnteriores.reduce((s, f) => s + f.valorPago, 0);

    const totalPago = fechamentos.reduce((s, f) => s + f.valorPago, 0);
    const qtdFechamentos = fechamentos.length;
    const totalVendas = await contarVendasDistintas(conn, periodoInicial, periodoFinal, filtros);

    const mesMap = new Map<string, { valor: number; qtd: number; faturamento: number }>();
    const perfilMap = new Map<string, Breakdown>();
    const tipoMap = new Map<string, Breakdown>();
    const vendedorMap = new Map<number, RankingVendedor>();

    for (const f of fechamentos) {
      const periodo = `${f.anoReferencia}-${String(f.mesReferencia).padStart(2, '0')}`;
      const mEntry = mesMap.get(periodo) ?? { valor: 0, qtd: 0, faturamento: 0 };
      mEntry.valor += f.valorPago;
      mEntry.faturamento += f.valorBase;
      mEntry.qtd += 1;
      mesMap.set(periodo, mEntry);

      const pEntry = perfilMap.get(f.perfilNome) ?? { chave: f.perfilNome, valor: 0, qtd: 0 };
      pEntry.valor += f.valorPago;
      pEntry.qtd += 1;
      perfilMap.set(f.perfilNome, pEntry);

      const tEntry = tipoMap.get(f.tipoFechamento) ?? { chave: f.tipoFechamento, valor: 0, qtd: 0 };
      tEntry.valor += f.valorPago;
      tEntry.qtd += 1;
      tipoMap.set(f.tipoFechamento, tEntry);

      const vEntry = vendedorMap.get(f.idVendedor) ?? {
        idVendedor: f.idVendedor, nome: f.vendedorNome, perfil: f.perfil, perfilNome: f.perfilNome, valor: 0, qtd: 0,
      };
      vEntry.valor += f.valorPago;
      vEntry.qtd += 1;
      vendedorMap.set(f.idVendedor, vEntry);
    }

    const seriePorMes = Array.from(mesMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const porPerfil = Array.from(perfilMap.values()).sort((a, b) => b.valor - a.valor);
    const porTipoFechamento = Array.from(tipoMap.values()).sort((a, b) => b.valor - a.valor);
    const ranking = Array.from(vendedorMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 20);

    const { ano: anoAtual, mes: mesAtual } = await buscarAnoMesAtual(conn);
    const chaveCache = `${anoAtual}-${mesAtual}`;
    const agora = Date.now();
    let mesEmAndamento: ComissoesData['mesEmAndamento'];
    if (mesEmAndamentoCache && mesEmAndamentoCache.chave === chaveCache && agora - mesEmAndamentoCache.ts < MES_ANDAMENTO_CACHE_TTL) {
      mesEmAndamento = mesEmAndamentoCache.data;
    } else {
      mesEmAndamento = await calcularMesEmAndamento(conn, anoAtual, mesAtual);
      mesEmAndamentoCache = { chave: chaveCache, data: mesEmAndamento, ts: agora };
    }

    return {
      generatedAt: new Date().toISOString(),
      periodo: { inicial: periodoInicial, final: periodoFinal },
      kpis: {
        totalPago,
        qtdFechamentos,
        totalVendas,
        ticketMedio: qtdFechamentos > 0 ? totalPago / qtdFechamentos : 0,
        totalPeriodoAnterior,
        variacaoPct: totalPeriodoAnterior > 0 ? ((totalPago - totalPeriodoAnterior) / totalPeriodoAnterior) * 100 : null,
      },
      seriePorMes,
      porPerfil,
      porTipoFechamento,
      ranking,
      fechamentos,
      mesEmAndamento,
    };
  } finally {
    await conn.end();
  }
}
