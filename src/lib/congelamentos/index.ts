import { getDbConnection } from '@/lib/db';
import { DATA_CORTE_CONFIABILIDADE } from './constants';

export type Vertical = 'imovel' | 'veiculo';

export type Congelamento = {
  id: number;
  idCliente: number;
  idContrato: number | null;
  dataCongelamento: string;
  dataDescongelamento: string | null;
  vertical: Vertical | null;
  tipoPessoa2: string | null;
  nomePlano: string | null;
  valorMensalidade: number;
  estoqueVeiculo: number;
  estoqueImovel: number;
  diaVencimento: number | null;
  idUf: number | null;
  siglaUf: string | null;
  nomeCidade: string | null;
  nomeCliente: string | null;
  nomeFantasia: string | null;
  idMotivo: number | null;
  observacao: string | null;
  dataCadastroContrato: string | null;
};

export type SeriePeriodo = { periodo: string; qtd: number; valor: number };
export type SerieComparativoDia = { periodo: string; qtdAtual: number; valorAtual: number; qtdAnterior: number; valorAnterior: number };
export type Breakdown = { chave: string; qtd: number };

export type CongelamentosFiltros = {
  uf?: string;
  cidade?: string;
  vertical?: Vertical;
  motivo?: number;
};

export type Destaque = {
  idCliente: number;
  nome: string;
  local: string;
} & Record<string, unknown>;

export type CongelamentosData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  kpis: {
    congelamentos: { atual: number; anterior: number };
    receita: { atual: number; anterior: number };
    estoque: { atual: number; anterior: number };
    ticketMedio: { atual: number; anterior: number };
  };
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  serieComparativoPorDia: SerieComparativoDia[];
  porVencimento: Breakdown[];
  porPerfilCliente: Breakdown[];
  porUf: Breakdown[];
  motivosDisponiveis: { id: number; reason: string }[];
  destaques: {
    maiorReceita: Destaque | null;
    maiorEstoque: Destaque | null;
    maisAntigo: Destaque | null;
  };
  linhas: Congelamento[];
};

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

const TZ = 'America/Sao_Paulo';

function diaKey(d: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(d));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function mesKey(d: string | Date): string {
  const [year, month] = diaKey(d).split('-');
  return `${year}-${month}`;
}

function diffDiasInclusivo(dataInicial: string, dataFinal: string): number {
  const di = new Date(`${dataInicial}T00:00:00Z`).getTime();
  const df = new Date(`${dataFinal}T00:00:00Z`).getTime();
  return Math.round((df - di) / 86400000) + 1;
}

function somaDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Período imediatamente anterior, com a mesma quantidade de dias do período selecionado. */
function periodoAnterior(dataInicial: string, dataFinal: string): { inicio: string; fim: string } {
  const dias = diffDiasInclusivo(dataInicial, dataFinal);
  return { inicio: somaDias(dataInicial, -dias), fim: somaDias(dataInicial, -1) };
}

const BASE_QUERY = `
  SELECT
    cc.id,
    cc.id_cliente,
    cc.id_contrato,
    cc.data_congelamento,
    cc.vertical_congelamento,
    cc.tipo_pessoa2_congelamento,
    cc.nome_plano_congelamento,
    cc.valor_mensalidade_congelamento,
    cc.estoque_veiculo_congelamento,
    cc.estoque_imovel_congelamento,
    cc.dia_vencimento_congelamento,
    cc.id_uf_congelamento,
    u.sigla_uf,
    ci.nome_cidade,
    cc.nome_cliente_congelamento,
    cc.nome_fantasia_congelamento,
    cc.id_motivo_congelamento,
    cc.observacao_congelamento,
    cc.data_descongelamento,
    tfc.data_cadastro AS data_cadastro_contrato
  FROM tb_cliente_congelamento cc
  JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
  LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
  LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
  LEFT JOIN tb_financeiro_contrato tfc ON tfc.id = cc.id_contrato
  WHERE cc.deleted = 0
    AND cc.data_congelamento BETWEEN ? AND ?
`;

function filtroSql(filtros: CongelamentosFiltros): { sql: string; params: (string | number)[] } {
  let sql = '';
  const params: (string | number)[] = [];
  if (filtros.uf) { sql += ' AND u.sigla_uf = ?'; params.push(filtros.uf); }
  if (filtros.cidade) { sql += ' AND ci.nome_cidade = ?'; params.push(filtros.cidade); }
  if (filtros.vertical) { sql += ' AND cc.vertical_congelamento = ?'; params.push(filtros.vertical); }
  if (filtros.motivo) { sql += ' AND cc.id_motivo_congelamento = ?'; params.push(filtros.motivo); }
  return { sql, params };
}

function mapRow(r: any): Congelamento {
  return {
    id: r.id,
    idCliente: r.id_cliente,
    idContrato: r.id_contrato,
    dataCongelamento: r.data_congelamento,
    dataDescongelamento: r.data_descongelamento,
    vertical: r.vertical_congelamento,
    tipoPessoa2: r.tipo_pessoa2_congelamento,
    nomePlano: r.nome_plano_congelamento,
    valorMensalidade: toNum(r.valor_mensalidade_congelamento),
    estoqueVeiculo: toNum(r.estoque_veiculo_congelamento),
    estoqueImovel: toNum(r.estoque_imovel_congelamento),
    diaVencimento: r.dia_vencimento_congelamento,
    idUf: r.id_uf_congelamento,
    siglaUf: r.sigla_uf,
    nomeCidade: r.nome_cidade,
    nomeCliente: r.nome_cliente_congelamento,
    nomeFantasia: r.nome_fantasia_congelamento,
    idMotivo: r.id_motivo_congelamento,
    observacao: r.observacao_congelamento,
    dataCadastroContrato: r.data_cadastro_contrato,
  };
}

async function totaisPeriodo(
  connection: Awaited<ReturnType<typeof getDbConnection>>,
  dataInicial: string,
  dataFinal: string,
  filtros: CongelamentosFiltros
): Promise<{ qtd: number; valor: number; estoque: number }> {
  const { sql: extraSql, params: extraParams } = filtroSql(filtros);
  const query = `
    SELECT
      COUNT(DISTINCT cc.id) AS qtd,
      COALESCE(SUM(cc.valor_mensalidade_congelamento), 0) AS valor,
      COALESCE(SUM(cc.estoque_veiculo_congelamento), 0) + COALESCE(SUM(cc.estoque_imovel_congelamento), 0) AS estoque
    FROM tb_cliente_congelamento cc
    JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
    LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
    LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
    WHERE cc.deleted = 0
      AND cc.data_congelamento BETWEEN ? AND ?
      ${extraSql}
  `;
  const [rows] = await connection.query(query, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams]);
  const r = (rows as any[])[0];
  return { qtd: toNum(r?.qtd), valor: toNum(r?.valor), estoque: toNum(r?.estoque) };
}

async function seriePorDiaSql(
  connection: Awaited<ReturnType<typeof getDbConnection>>,
  dataInicial: string,
  dataFinal: string,
  filtros: CongelamentosFiltros
): Promise<Map<string, { qtd: number; valor: number }>> {
  const { sql: extraSql, params: extraParams } = filtroSql(filtros);
  const query = `
    SELECT DATE(cc.data_congelamento) AS dia, COUNT(DISTINCT cc.id) AS qtd, COALESCE(SUM(cc.valor_mensalidade_congelamento), 0) AS valor
    FROM tb_cliente_congelamento cc
    JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
    LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
    LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
    WHERE cc.deleted = 0
      AND cc.data_congelamento BETWEEN ? AND ?
      ${extraSql}
    GROUP BY dia
  `;
  const [rows] = await connection.query(query, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams]);
  const map = new Map<string, { qtd: number; valor: number }>();
  for (const r of rows as any[]) {
    map.set(diaKey(r.dia), { qtd: toNum(r.qtd), valor: toNum(r.valor) });
  }
  return map;
}

export async function getCongelamentosData(
  dataInicialInput: string,
  dataFinalInput: string,
  filtros: CongelamentosFiltros = {}
): Promise<CongelamentosData> {
  // Antes de 23/07/2026 os congelamentos não têm snapshot confiável (ver DATA_CORTE_CONFIABILIDADE) — nunca
  // consultamos antes disso, mesmo que o preset/filtro selecionado peça um período mais amplo.
  const dataInicial = dataInicialInput < DATA_CORTE_CONFIABILIDADE ? DATA_CORTE_CONFIABILIDADE : dataInicialInput;
  const dataFinal = dataFinalInput < dataInicial ? dataInicial : dataFinalInput;

  const connection = await getDbConnection();
  try {
    const { sql: extraSql, params: extraParams } = filtroSql(filtros);
    const query = `${BASE_QUERY}${extraSql} ORDER BY cc.data_congelamento DESC`;
    const params = [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams];

    const [rows] = await connection.query(query, params);
    const linhas: Congelamento[] = (rows as any[]).map(mapRow);

    const diaMap = new Map<string, { qtd: number; valor: number }>();
    const mesMap = new Map<string, { qtd: number; valor: number }>();
    const vencimentoMap = new Map<number, number>();
    const perfilMap = new Map<string, number>();
    const ufMap = new Map<string, number>();

    for (const l of linhas) {
      const dKey = diaKey(l.dataCongelamento);
      const mKey = mesKey(l.dataCongelamento);
      const dEntry = diaMap.get(dKey) ?? { qtd: 0, valor: 0 };
      dEntry.qtd += 1;
      dEntry.valor += l.valorMensalidade;
      diaMap.set(dKey, dEntry);
      const mEntry = mesMap.get(mKey) ?? { qtd: 0, valor: 0 };
      mEntry.qtd += 1;
      mEntry.valor += l.valorMensalidade;
      mesMap.set(mKey, mEntry);

      if (l.diaVencimento != null) {
        vencimentoMap.set(l.diaVencimento, (vencimentoMap.get(l.diaVencimento) ?? 0) + 1);
      }

      const perfil = l.vertical === 'imovel' ? 'Imóveis' : l.vertical === 'veiculo' ? 'Veículos' : 'Não informado';
      perfilMap.set(perfil, (perfilMap.get(perfil) ?? 0) + 1);

      const uf = l.siglaUf ?? 'Não informado';
      ufMap.set(uf, (ufMap.get(uf) ?? 0) + 1);
    }

    const seriePorDia = Array.from(diaMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const seriePorMes = Array.from(mesMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const porVencimento = Array.from(vencimentoMap.entries())
      .map(([dia, qtd]) => ({ chave: `Dia ${dia}`, qtd }))
      .sort((a, b) => a.chave.localeCompare(b.chave, undefined, { numeric: true }));
    const porPerfilCliente = Array.from(perfilMap.entries())
      .map(([chave, qtd]) => ({ chave, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // Top 7 UFs + "Outros", mesmo espírito do protótipo original.
    const ufOrdenado = Array.from(ufMap.entries()).sort((a, b) => b[1] - a[1]);
    const top7 = ufOrdenado.slice(0, 7);
    const outros = ufOrdenado.slice(7).reduce((s, [, qtd]) => s + qtd, 0);
    const porUf: Breakdown[] = top7.map(([chave, qtd]) => ({ chave, qtd }));
    if (outros > 0) porUf.push({ chave: 'Outros', qtd: outros });

    const totalQtd = linhas.length;
    const totalValor = linhas.reduce((s, l) => s + l.valorMensalidade, 0);
    const totalEstoque = linhas.reduce((s, l) => s + l.estoqueVeiculo + l.estoqueImovel, 0);

    const maiorReceita = linhas.length
      ? [...linhas].sort((a, b) => b.valorMensalidade - a.valorMensalidade)[0]
      : null;
    const maiorEstoque = linhas.length
      ? [...linhas].sort((a, b) => (b.estoqueVeiculo + b.estoqueImovel) - (a.estoqueVeiculo + a.estoqueImovel))[0]
      : null;
    const comContrato = linhas.filter((l) => l.dataCadastroContrato != null);
    const maisAntigo = comContrato.length
      ? [...comContrato].sort((a, b) => new Date(a.dataCadastroContrato!).getTime() - new Date(b.dataCadastroContrato!).getTime())[0]
      : null;

    function paraDestaque(l: Congelamento | null): Destaque | null {
      if (!l) return null;
      return {
        idCliente: l.idCliente,
        nome: l.nomeFantasia || l.nomeCliente || `Cliente #${l.idCliente}`,
        local: l.nomeCidade ? `${l.nomeCidade} - ${l.siglaUf ?? ''}` : '—',
        valorMensalidade: l.valorMensalidade,
        estoqueTotal: l.estoqueVeiculo + l.estoqueImovel,
        dataCadastroContrato: l.dataCadastroContrato,
        dataCongelamento: l.dataCongelamento,
      };
    }

    const anterior = periodoAnterior(dataInicial, dataFinal);
    const totaisAnterior = await totaisPeriodo(connection, anterior.inicio, anterior.fim, filtros);
    const diaMapAnterior = await seriePorDiaSql(connection, anterior.inicio, anterior.fim, filtros);

    // Alinha por posição (dia 1 do período atual x dia 1 do período anterior, etc.) — as datas em si não coincidem,
    // mas os dois períodos têm o mesmo número de dias (ver periodoAnterior), então o offset é comparável.
    const diasNoPeriodo = diffDiasInclusivo(dataInicial, dataFinal);
    const serieComparativoPorDia: SerieComparativoDia[] = Array.from({ length: diasNoPeriodo }, (_, offset) => {
      const diaAtual = somaDias(dataInicial, offset);
      const diaAnterior = somaDias(anterior.inicio, offset);
      const atual = diaMap.get(diaAtual) ?? { qtd: 0, valor: 0 };
      const ant = diaMapAnterior.get(diaAnterior) ?? { qtd: 0, valor: 0 };
      return { periodo: diaAtual, qtdAtual: atual.qtd, valorAtual: atual.valor, qtdAnterior: ant.qtd, valorAnterior: ant.valor };
    });

    const [motivoRows] = await connection.query(
      'SELECT id, reason FROM tb_cliente_congelado_motivo WHERE deleted_at IS NULL ORDER BY reason'
    );
    const motivosDisponiveis = (motivoRows as any[]).map((m) => ({ id: m.id, reason: m.reason }));

    const data: CongelamentosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      kpis: {
        congelamentos: { atual: totalQtd, anterior: totaisAnterior.qtd },
        receita: { atual: totalValor, anterior: totaisAnterior.valor },
        estoque: { atual: totalEstoque, anterior: totaisAnterior.estoque },
        ticketMedio: {
          atual: totalQtd > 0 ? totalValor / totalQtd : 0,
          anterior: totaisAnterior.qtd > 0 ? totaisAnterior.valor / totaisAnterior.qtd : 0,
        },
      },
      seriePorDia,
      seriePorMes,
      serieComparativoPorDia,
      porVencimento,
      porPerfilCliente,
      porUf,
      motivosDisponiveis,
      destaques: { maiorReceita: paraDestaque(maiorReceita), maiorEstoque: paraDestaque(maiorEstoque), maisAntigo: paraDestaque(maisAntigo) },
      linhas,
    };

    return data;
  } finally {
    await connection.end();
  }
}

// ---------------------------------------------------------------------------
// Descongelamentos — "história" de quem descongelou no período, independente
// de quando o congelamento original aconteceu. Diferente de getCongelamentosData,
// NÃO trava a data mínima em DATA_CORTE_CONFIABILIDADE: descongelar um cliente
// que congelou há anos é um evento válido e datado com precisão (data_descongelamento),
// só o snapshot de valor/estoque/plano daquele congelamento antigo é que pode faltar.
// ---------------------------------------------------------------------------

export type Origem = 'manual' | 'automatico';
export type ResultadoContrato = 'ativo' | 'cancelado' | 'nao_encontrado';

export type Descongelamento = {
  id: number;
  idCliente: number;
  idContrato: number | null;
  dataCongelamento: string;
  dataDescongelamento: string;
  diasCongelado: number;
  vertical: Vertical | null;
  nomePlano: string | null;
  valorMensalidade: number | null;
  estoqueVeiculo: number | null;
  estoqueImovel: number | null;
  temSnapshot: boolean;
  siglaUf: string | null;
  nomeCidade: string | null;
  nomeCliente: string | null;
  nomeFantasia: string | null;
  origem: Origem;
  resultadoContrato: ResultadoContrato;
  jaVoltouACongelar: boolean;
};

export type DescongelamentosFiltros = {
  uf?: string;
  cidade?: string;
  vertical?: Vertical;
  origem?: Origem;
};

export type DescongelamentosData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  kpis: {
    descongelamentos: { atual: number; anterior: number };
    tempoMedioCongeladoDias: { atual: number; anterior: number };
    taxaCancelamentoPos: { atual: number; anterior: number };
    taxaRecorrencia: { atual: number; anterior: number };
  };
  coberturaSnapshot: { comDado: number; total: number };
  receitaReativada: number;
  estoqueReativado: number;
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  serieComparativoPorDia: SerieComparativoDia[];
  porOrigem: Breakdown[];
  porResultado: Breakdown[];
  destaques: {
    maiorTempoCongelado: Destaque | null;
    reincidenteRecente: Destaque | null;
  };
  linhas: Descongelamento[];
};

const BASE_QUERY_DESCONGELAMENTO = `
  SELECT
    cc.id,
    cc.id_cliente,
    cc.id_contrato,
    cc.data_congelamento,
    cc.data_descongelamento,
    cc.id_usuario_descongelou,
    cc.vertical_congelamento,
    cc.nome_plano_congelamento,
    cc.valor_mensalidade_congelamento,
    cc.estoque_veiculo_congelamento,
    cc.estoque_imovel_congelamento,
    cc.id_uf_congelamento,
    u.sigla_uf,
    ci.nome_cidade,
    cc.nome_cliente_congelamento,
    cc.nome_fantasia_congelamento,
    tfc.id AS contrato_encontrado,
    tfc.cancelado AS contrato_cancelado_atual,
    DATEDIFF(cc.data_descongelamento, cc.data_congelamento) AS dias_congelado,
    EXISTS (
      SELECT 1 FROM tb_cliente_congelamento cc2
      WHERE cc2.id_cliente = cc.id_cliente AND cc2.deleted = 0 AND cc2.data_congelamento > cc.data_descongelamento
    ) AS ja_voltou_a_congelar
  FROM tb_cliente_congelamento cc
  JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
  LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
  LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
  LEFT JOIN tb_financeiro_contrato tfc ON tfc.id = cc.id_contrato
  WHERE cc.deleted = 0
    AND cc.data_descongelamento BETWEEN ? AND ?
`;

function filtroSqlDescongelamento(filtros: DescongelamentosFiltros): { sql: string; params: (string | number)[] } {
  let sql = '';
  const params: (string | number)[] = [];
  if (filtros.uf) { sql += ' AND u.sigla_uf = ?'; params.push(filtros.uf); }
  if (filtros.cidade) { sql += ' AND ci.nome_cidade = ?'; params.push(filtros.cidade); }
  if (filtros.vertical) { sql += ' AND cc.vertical_congelamento = ?'; params.push(filtros.vertical); }
  // Achado na investigação: descongelamento automático grava id_usuario_descongelou = NULL
  // (diferente do congelamento automático, que grava 0) — assimetria do código legado, não é bug nosso.
  if (filtros.origem === 'automatico') sql += ' AND cc.id_usuario_descongelou IS NULL';
  if (filtros.origem === 'manual') sql += ' AND cc.id_usuario_descongelou IS NOT NULL';
  return { sql, params };
}

function mapRowDescongelamento(r: any): Descongelamento {
  const temSnapshot = r.vertical_congelamento !== null || r.valor_mensalidade_congelamento !== null;
  const resultadoContrato: ResultadoContrato = r.contrato_encontrado == null
    ? 'nao_encontrado'
    : toNum(r.contrato_cancelado_atual) === 1 ? 'cancelado' : 'ativo';
  return {
    id: r.id,
    idCliente: r.id_cliente,
    idContrato: r.id_contrato,
    dataCongelamento: r.data_congelamento,
    dataDescongelamento: r.data_descongelamento,
    diasCongelado: toNum(r.dias_congelado),
    vertical: r.vertical_congelamento,
    nomePlano: r.nome_plano_congelamento,
    valorMensalidade: r.valor_mensalidade_congelamento === null ? null : toNum(r.valor_mensalidade_congelamento),
    estoqueVeiculo: r.estoque_veiculo_congelamento === null ? null : toNum(r.estoque_veiculo_congelamento),
    estoqueImovel: r.estoque_imovel_congelamento === null ? null : toNum(r.estoque_imovel_congelamento),
    temSnapshot,
    siglaUf: r.sigla_uf,
    nomeCidade: r.nome_cidade,
    nomeCliente: r.nome_cliente_congelamento,
    nomeFantasia: r.nome_fantasia_congelamento,
    origem: r.id_usuario_descongelou == null ? 'automatico' : 'manual',
    resultadoContrato,
    jaVoltouACongelar: Boolean(r.ja_voltou_a_congelar),
  };
}

async function totaisPeriodoDescongelamento(
  connection: Awaited<ReturnType<typeof getDbConnection>>,
  dataInicial: string,
  dataFinal: string,
  filtros: DescongelamentosFiltros
): Promise<{ qtd: number; tempoMedioDias: number; taxaCancelamento: number; taxaRecorrencia: number }> {
  const { sql: extraSql, params: extraParams } = filtroSqlDescongelamento(filtros);
  const query = `
    SELECT
      COUNT(*) AS qtd,
      COALESCE(AVG(DATEDIFF(cc.data_descongelamento, cc.data_congelamento)), 0) AS tempo_medio_dias,
      SUM(tfc.id IS NOT NULL) AS com_contrato,
      SUM(tfc.cancelado = 1) AS cancelados,
      SUM(
        EXISTS (
          SELECT 1 FROM tb_cliente_congelamento cc2
          WHERE cc2.id_cliente = cc.id_cliente AND cc2.deleted = 0 AND cc2.data_congelamento > cc.data_descongelamento
        )
      ) AS reincidentes
    FROM tb_cliente_congelamento cc
    JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
    LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
    LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
    LEFT JOIN tb_financeiro_contrato tfc ON tfc.id = cc.id_contrato
    WHERE cc.deleted = 0
      AND cc.data_descongelamento BETWEEN ? AND ?
      ${extraSql}
  `;
  const [rows] = await connection.query(query, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams]);
  const r = (rows as any[])[0];
  const qtd = toNum(r?.qtd);
  const comContrato = toNum(r?.com_contrato);
  return {
    qtd,
    tempoMedioDias: toNum(r?.tempo_medio_dias),
    taxaCancelamento: comContrato > 0 ? toNum(r?.cancelados) / comContrato : 0,
    taxaRecorrencia: qtd > 0 ? toNum(r?.reincidentes) / qtd : 0,
  };
}

async function seriePorDiaDescongelamentoSql(
  connection: Awaited<ReturnType<typeof getDbConnection>>,
  dataInicial: string,
  dataFinal: string,
  filtros: DescongelamentosFiltros
): Promise<Map<string, { qtd: number; valor: number }>> {
  const { sql: extraSql, params: extraParams } = filtroSqlDescongelamento(filtros);
  const query = `
    SELECT DATE(cc.data_descongelamento) AS dia, COUNT(*) AS qtd, COALESCE(SUM(cc.valor_mensalidade_congelamento), 0) AS valor
    FROM tb_cliente_congelamento cc
    JOIN tb_cliente c ON c.id = cc.id_cliente AND c.deleted = 0
    LEFT JOIN tb_uf u ON u.id = cc.id_uf_congelamento
    LEFT JOIN tb_cidade ci ON ci.id = cc.id_cidade_congelamento
    WHERE cc.deleted = 0
      AND cc.data_descongelamento BETWEEN ? AND ?
      ${extraSql}
    GROUP BY dia
  `;
  const [rows] = await connection.query(query, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams]);
  const map = new Map<string, { qtd: number; valor: number }>();
  for (const r of rows as any[]) {
    map.set(diaKey(r.dia), { qtd: toNum(r.qtd), valor: toNum(r.valor) });
  }
  return map;
}

export async function getDescongelamentosData(
  dataInicial: string,
  dataFinal: string,
  filtros: DescongelamentosFiltros = {}
): Promise<DescongelamentosData> {
  const connection = await getDbConnection();
  try {
    const { sql: extraSql, params: extraParams } = filtroSqlDescongelamento(filtros);
    const query = `${BASE_QUERY_DESCONGELAMENTO}${extraSql} ORDER BY cc.data_descongelamento DESC`;
    const params = [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...extraParams];

    const [rows] = await connection.query(query, params);
    const linhas: Descongelamento[] = (rows as any[]).map(mapRowDescongelamento);

    const diaMap = new Map<string, { qtd: number; valor: number }>();
    const mesMap = new Map<string, { qtd: number; valor: number }>();
    const origemMap = new Map<string, number>();
    const resultadoMap = new Map<string, number>();

    for (const l of linhas) {
      const dKey = diaKey(l.dataDescongelamento);
      const mKey = mesKey(l.dataDescongelamento);
      const dEntry = diaMap.get(dKey) ?? { qtd: 0, valor: 0 };
      dEntry.qtd += 1;
      dEntry.valor += l.valorMensalidade ?? 0;
      diaMap.set(dKey, dEntry);
      const mEntry = mesMap.get(mKey) ?? { qtd: 0, valor: 0 };
      mEntry.qtd += 1;
      mEntry.valor += l.valorMensalidade ?? 0;
      mesMap.set(mKey, mEntry);

      const origemLabel = l.origem === 'manual' ? 'Manual' : 'Automático';
      origemMap.set(origemLabel, (origemMap.get(origemLabel) ?? 0) + 1);

      const resultadoLabel = l.resultadoContrato === 'ativo' ? 'Ativo' : l.resultadoContrato === 'cancelado' ? 'Cancelado' : 'Contrato não encontrado';
      resultadoMap.set(resultadoLabel, (resultadoMap.get(resultadoLabel) ?? 0) + 1);
    }

    const seriePorDia = Array.from(diaMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const seriePorMes = Array.from(mesMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const porOrigem = Array.from(origemMap.entries()).map(([chave, qtd]) => ({ chave, qtd })).sort((a, b) => b.qtd - a.qtd);
    const porResultado = Array.from(resultadoMap.entries()).map(([chave, qtd]) => ({ chave, qtd })).sort((a, b) => b.qtd - a.qtd);

    const comSnapshot = linhas.filter((l) => l.temSnapshot);
    const receitaReativada = comSnapshot.reduce((s, l) => s + (l.valorMensalidade ?? 0), 0);
    const estoqueReativado = comSnapshot.reduce((s, l) => s + (l.estoqueVeiculo ?? 0) + (l.estoqueImovel ?? 0), 0);

    const maiorTempoCongelado = linhas.length ? [...linhas].sort((a, b) => b.diasCongelado - a.diasCongelado)[0] : null;
    const reincidentes = linhas.filter((l) => l.jaVoltouACongelar);
    const reincidenteRecente = reincidentes.length
      ? [...reincidentes].sort((a, b) => new Date(b.dataDescongelamento).getTime() - new Date(a.dataDescongelamento).getTime())[0]
      : null;

    function paraDestaque(l: Descongelamento | null): Destaque | null {
      if (!l) return null;
      return {
        idCliente: l.idCliente,
        nome: l.nomeFantasia || l.nomeCliente || `Cliente #${l.idCliente}`,
        local: l.nomeCidade ? `${l.nomeCidade} - ${l.siglaUf ?? ''}` : '—',
        diasCongelado: l.diasCongelado,
        dataDescongelamento: l.dataDescongelamento,
      };
    }

    const anterior = periodoAnterior(dataInicial, dataFinal);
    const totaisAnterior = await totaisPeriodoDescongelamento(connection, anterior.inicio, anterior.fim, filtros);
    const diaMapAnterior = await seriePorDiaDescongelamentoSql(connection, anterior.inicio, anterior.fim, filtros);

    const diasNoPeriodo = diffDiasInclusivo(dataInicial, dataFinal);
    const serieComparativoPorDia: SerieComparativoDia[] = Array.from({ length: diasNoPeriodo }, (_, offset) => {
      const diaAtual = somaDias(dataInicial, offset);
      const diaAnterior = somaDias(anterior.inicio, offset);
      const atual = diaMap.get(diaAtual) ?? { qtd: 0, valor: 0 };
      const ant = diaMapAnterior.get(diaAnterior) ?? { qtd: 0, valor: 0 };
      return { periodo: diaAtual, qtdAtual: atual.qtd, valorAtual: atual.valor, qtdAnterior: ant.qtd, valorAnterior: ant.valor };
    });

    const totalQtd = linhas.length;
    const totalComContrato = linhas.filter((l) => l.resultadoContrato !== 'nao_encontrado').length;
    const totalCancelados = linhas.filter((l) => l.resultadoContrato === 'cancelado').length;
    const tempoMedioCongeladoDias = totalQtd > 0 ? linhas.reduce((s, l) => s + l.diasCongelado, 0) / totalQtd : 0;

    const data: DescongelamentosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      kpis: {
        descongelamentos: { atual: totalQtd, anterior: totaisAnterior.qtd },
        tempoMedioCongeladoDias: { atual: tempoMedioCongeladoDias, anterior: totaisAnterior.tempoMedioDias },
        taxaCancelamentoPos: { atual: totalComContrato > 0 ? totalCancelados / totalComContrato : 0, anterior: totaisAnterior.taxaCancelamento },
        taxaRecorrencia: { atual: totalQtd > 0 ? reincidentes.length / totalQtd : 0, anterior: totaisAnterior.taxaRecorrencia },
      },
      coberturaSnapshot: { comDado: comSnapshot.length, total: totalQtd },
      receitaReativada,
      estoqueReativado,
      seriePorDia,
      seriePorMes,
      serieComparativoPorDia,
      porOrigem,
      porResultado,
      destaques: { maiorTempoCongelado: paraDestaque(maiorTempoCongelado), reincidenteRecente: paraDestaque(reincidenteRecente) },
      linhas,
    };

    return data;
  } finally {
    await connection.end();
  }
}

export type SaudeDiaria = {
  generatedAt: string;
  descongelamentosHoje: { automatico: number; manual: number; total: number };
  congelamentosHoje: { automatico: number; manual: number; total: number };
  backlogPagoCongelado: number;
  tendencia: { dia: string; automatico: number; manual: number }[];
  alertas: { manualHoje: boolean; backlog: boolean };
};

export async function getSaudeDiaria(): Promise<SaudeDiaria> {
  const connection = await getDbConnection();
  try {
    const [thawRows] = await connection.query(`
      SELECT
        COALESCE(SUM(id_usuario_descongelou IS NULL), 0) auto,
        COALESCE(SUM(id_usuario_descongelou IS NOT NULL), 0) manual
      FROM tb_cliente_congelamento
      WHERE deleted = 0 AND DATE(data_descongelamento) = CURDATE()
    `);
    const t = (thawRows as any[])[0];
    const descAuto = toNum(t?.auto);
    const descManual = toNum(t?.manual);

    const [freezeRows] = await connection.query(`
      SELECT
        COALESCE(SUM(id_usuario_congelou = 0), 0) auto,
        COALESCE(SUM(COALESCE(id_usuario_congelou, -1) <> 0), 0) manual
      FROM tb_cliente_congelamento
      WHERE deleted = 0 AND DATE(data_congelamento) = CURDATE()
    `);
    const f = (freezeRows as any[])[0];
    const congAuto = toNum(f?.auto);
    const congManual = toNum(f?.manual);

    const [backlogRows] = await connection.query(`
      SELECT COUNT(*) total FROM (
        SELECT DISTINCT c.id
        FROM tb_financeiro_contrato ct
        JOIN tb_cliente c ON c.id = ct.id_cliente
        WHERE c.congelado = 1 AND c.ativo = 1 AND c.deleted = 0
          AND ct.cancelado = 0 AND ct.deleted = 0 AND ct.status NOT IN (4, 5, 6, 7)
          AND EXISTS (SELECT 1 FROM tb_cliente_congelamento s WHERE s.id_cliente = c.id AND s.deleted = 0 AND s.data_descongelamento IS NULL AND s.id_usuario_congelou = 0)
          AND NOT EXISTS (SELECT 1 FROM tb_cliente_congelamento man WHERE man.id_cliente = c.id AND man.deleted = 0 AND man.data_descongelamento IS NULL AND man.id_usuario_congelou <> 0)
          AND EXISTS (SELECT 1 FROM tb_financeiro_mensalidade p WHERE p.id_contrato = ct.id AND p.pago = 1 AND p.multa = 0 AND p.deleted = 0 AND p.data_vencimento >= (CURDATE() - INTERVAL 45 DAY))
          AND NOT EXISTS (SELECT 1 FROM tb_financeiro_mensalidade o JOIN tb_financeiro_contrato oc ON oc.id = o.id_contrato AND oc.cancelado = 0 AND oc.deleted = 0 WHERE oc.id_cliente = c.id AND o.pago = 0 AND o.multa = 0 AND o.deleted = 0 AND o.data_vencimento < CURDATE())
      ) t
    `);
    const backlog = toNum((backlogRows as any[])[0]?.total);

    const [trendRows] = await connection.query(`
      SELECT DATE(data_descongelamento) dia,
        COALESCE(SUM(id_usuario_descongelou IS NULL), 0) auto,
        COALESCE(SUM(id_usuario_descongelou IS NOT NULL), 0) manual
      FROM tb_cliente_congelamento
      WHERE deleted = 0 AND data_descongelamento >= (CURDATE() - INTERVAL 13 DAY)
      GROUP BY dia
    `);
    const trendMap = new Map<string, { auto: number; manual: number }>();
    for (const r of trendRows as any[]) {
      trendMap.set(diaKey(r.dia), { auto: toNum(r.auto), manual: toNum(r.manual) });
    }
    const hojeKey = diaKey(new Date());
    const tendencia = Array.from({ length: 14 }, (_, i) => {
      const dia = somaDias(hojeKey, i - 13);
      const v = trendMap.get(dia) ?? { auto: 0, manual: 0 };
      return { dia, automatico: v.auto, manual: v.manual };
    });

    return {
      generatedAt: new Date().toISOString(),
      descongelamentosHoje: { automatico: descAuto, manual: descManual, total: descAuto + descManual },
      congelamentosHoje: { automatico: congAuto, manual: congManual, total: congAuto + congManual },
      backlogPagoCongelado: backlog,
      tendencia,
      alertas: { manualHoje: descManual > 0, backlog: backlog > 0 },
    };
  } finally {
    await connection.end();
  }
}
