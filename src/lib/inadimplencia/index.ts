import { getDbConnection } from '@/lib/db';

const CACHE_TTL = 15 * 60 * 1000;

export type CasoBonificado = {
  idContrato: number;
  idCliente: number;
  clienteNome: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  tipoPessoa: string;
  email: string;
  telefone: string | null;
  clienteAtivo: boolean;
  idVendedor: number | null;
  vendedorNome: string | null;
  dataContrato: string;
  cancelado: boolean;
  statusContrato: number;
  valorMensalidade: number;
  qtdBonificadas: number;
  valorBonificado: number;
  qtdReaisGeradas: number;
  valorRealNaoPago: number;
  comissaoReal: number | null;
  comissaoEstimada: number;
  totalContratosLifetime: number;
  totalRecebidoLifetime: number;
  ultimoContratoCliente: string;
  temContratoAtivo: boolean;
  qtdCasosCliente: number;
  segmento: 'critico' | 'recuperavel';
  reincidente: boolean;
};

export type VendedorRanking = {
  idVendedor: number;
  nome: string;
  qtdContratos: number;
  qtdClientes: number;
  valorNaoRecebido: number;
  comissaoReal: number;
  comissaoEstimada: number;
};

export type EvolucaoMes = {
  mes: string;
  qtdContratos: number;
  valorPerdido: number;
};

export type ContratoDetalhe = {
  idContrato: number;
  dataContrato: string;
  cancelado: boolean;
  status: number;
  valorContrato: number;
  idVendedor: number | null;
  vendedorNome: string | null;
  dataInicioVeiculacao: string | null;
  dataCancelamento: string | null;
  dataCongelamento: string | null;
  diasNoAr: number | null;
  totalMensalidades: number;
  mensalidadesBonificadas: number;
  mensalidadesCobradas: number;
  mensalidadesPagasReais: number;
  totalRecebidoContrato: number;
  primeiroVencimento: string | null;
  ultimoVencimento: string | null;
};

export type DashboardData = {
  generatedAt: string;
  kpis: {
    totalContratos: number;
    totalClientes: number;
    totalReincidentes: number;
    valorNaoRecebido: number;
    valorBonificadoConsumido: number;
    comissaoRealTotal: number;
    comissaoEstimadaTotal: number;
    prejuizoConfirmado: number;
    prejuizoEstimadoAdicional: number;
  };
  segmentacao: { criticos: number; recuperaveis: number };
  evolucaoMensal: EvolucaoMes[];
  rankingVendedores: VendedorRanking[];
  casos: CasoBonificado[];
};

let _cache: { data: DashboardData; ts: number } | null = null;

const QUERY_CASOS = `
  WITH contratos_com_bonus AS (
    SELECT DISTINCT id_contrato
    FROM tb_financeiro_mensalidade
    WHERE deleted = 0 AND bonificado = 1
  ),
  contratos_pagamento_real AS (
    SELECT DISTINCT fm.id_contrato
    FROM tb_financeiro_mensalidade fm
    JOIN tb_pagamento p ON p.id_mensalidade_cliente = fm.id AND p.deleted = 0 AND p.estorno = 0
    WHERE fm.deleted = 0 AND fm.bonificado = 0
      AND fm.id_contrato IN (SELECT id_contrato FROM contratos_com_bonus)
  ),
  casos AS (
    SELECT cb.id_contrato
    FROM contratos_com_bonus cb
    LEFT JOIN contratos_pagamento_real pr ON pr.id_contrato = cb.id_contrato
    WHERE pr.id_contrato IS NULL
  ),
  mensalidade_agg AS (
    SELECT id_contrato,
      SUM(CASE WHEN bonificado = 1 THEN 1 ELSE 0 END) AS qtd_bonificadas,
      SUM(CASE WHEN bonificado = 1 THEN valor_total ELSE 0 END) AS valor_bonificado,
      SUM(CASE WHEN bonificado = 0 THEN 1 ELSE 0 END) AS qtd_reais,
      SUM(CASE WHEN bonificado = 0 THEN valor_total ELSE 0 END) AS valor_real_nao_pago
    FROM tb_financeiro_mensalidade
    WHERE deleted = 0
    GROUP BY id_contrato
  ),
  comissao_agg AS (
    SELECT cd.id_contrato, SUM(cd.valor_base_comissao * cf.comissao_vendedor_momento) AS comissao_real
    FROM tb_comissao_detalhamento cd
    JOIN tb_comissao_fechada cf ON cf.id = cd.id_comissao_fechada
    GROUP BY cd.id_contrato
  )
  SELECT
    fc.id AS id_contrato, fc.id_cliente, cl.nome AS cliente_nome, cl.nome_fantasia,
    cl.cpfcnpj, cl.tipo_pessoa, cl.email, cl.telefone_celuar AS telefone, cl.ativo AS cliente_ativo,
    fc.id_vendedor, v.nome AS vendedor_nome, fc.data_contrato, fc.cancelado, fc.status AS status_contrato,
    fc.valor_mensalidade, v.comissao_percentual,
    ma.qtd_bonificadas, ma.valor_bonificado, ma.qtd_reais, ma.valor_real_nao_pago,
    co.comissao_real
  FROM casos ca
  JOIN tb_financeiro_contrato fc ON fc.id = ca.id_contrato AND fc.deleted = 0
  JOIN tb_cliente cl ON cl.id = fc.id_cliente AND cl.deleted = 0
  LEFT JOIN tb_vendedor v ON v.id = fc.id_vendedor
  JOIN mensalidade_agg ma ON ma.id_contrato = ca.id_contrato
  LEFT JOIN comissao_agg co ON co.id_contrato = ca.id_contrato
`;

const QUERY_LIFETIME = `
  WITH contratos_com_bonus AS (
    SELECT DISTINCT id_contrato
    FROM tb_financeiro_mensalidade
    WHERE deleted = 0 AND bonificado = 1
  ),
  contratos_pagamento_real AS (
    SELECT DISTINCT fm.id_contrato
    FROM tb_financeiro_mensalidade fm
    JOIN tb_pagamento p ON p.id_mensalidade_cliente = fm.id AND p.deleted = 0 AND p.estorno = 0
    WHERE fm.deleted = 0 AND fm.bonificado = 0
      AND fm.id_contrato IN (SELECT id_contrato FROM contratos_com_bonus)
  ),
  casos AS (
    SELECT cb.id_contrato
    FROM contratos_com_bonus cb
    LEFT JOIN contratos_pagamento_real pr ON pr.id_contrato = cb.id_contrato
    WHERE pr.id_contrato IS NULL
  ),
  clientes_casos AS (
    SELECT DISTINCT fc.id_cliente
    FROM casos ca JOIN tb_financeiro_contrato fc ON fc.id = ca.id_contrato AND fc.deleted = 0
  )
  SELECT
    cl.id AS id_cliente,
    COUNT(DISTINCT fc2.id) AS total_contratos_lifetime,
    MAX(fc2.data_contrato) AS ultimo_contrato_cliente,
    MAX(CASE WHEN fc2.cancelado = 0 THEN 1 ELSE 0 END) AS tem_contrato_ativo,
    COALESCE(SUM(CASE WHEN p2.deleted = 0 AND p2.estorno = 0 THEN p2.valor ELSE 0 END), 0) AS total_recebido_lifetime
  FROM clientes_casos cc
  JOIN tb_cliente cl ON cl.id = cc.id_cliente
  JOIN tb_financeiro_contrato fc2 ON fc2.id_cliente = cl.id AND fc2.deleted = 0
  LEFT JOIN tb_financeiro_mensalidade fm2 ON fm2.id_contrato = fc2.id AND fm2.deleted = 0
  LEFT JOIN tb_pagamento p2 ON p2.id_mensalidade_cliente = fm2.id
  GROUP BY cl.id
`;

const QUERY_DETALHE_CLIENTE = `
  WITH contratos_cliente AS (
    SELECT fc.id, fc.data_contrato, fc.data_cancelamento, fc.cancelado, fc.status, fc.valor_mensalidade,
      fc.data_inicio_veiculacao, fc.id_vendedor, v.nome AS vendedor_nome
    FROM tb_financeiro_contrato fc
    LEFT JOIN tb_vendedor v ON v.id = fc.id_vendedor
    WHERE fc.id_cliente = ? AND fc.deleted = 0
  ),
  mensalidade_pagamento_agg AS (
    -- Pré-agrega mensalidade x pagamento por contrato ANTES de qualquer outro join,
    -- pra não multiplicar linhas (fan-out) e evitar reavaliar subqueries de congelamento à toa.
    SELECT
      m.id_contrato,
      COUNT(DISTINCT m.id) AS total_mensalidades,
      COUNT(DISTINCT CASE WHEN m.bonificado = 1 THEN m.id END) AS mensalidades_bonificadas,
      COUNT(DISTINCT CASE WHEN m.bonificado = 0 THEN m.id END) AS mensalidades_cobradas,
      COUNT(DISTINCT CASE WHEN m.bonificado = 0 AND p.id IS NOT NULL AND p.deleted = 0 AND p.estorno = 0 THEN m.id END) AS mensalidades_pagas_reais,
      COALESCE(SUM(CASE WHEN p.deleted = 0 AND p.estorno = 0 THEN p.valor ELSE 0 END), 0) AS total_recebido_contrato,
      MIN(m.data_vencimento) AS primeiro_vencimento,
      MAX(m.data_vencimento) AS ultimo_vencimento
    FROM tb_financeiro_mensalidade m
    JOIN contratos_cliente cc ON cc.id = m.id_contrato
    LEFT JOIN tb_pagamento p ON p.id_mensalidade_cliente = m.id
    WHERE m.deleted = 0
    GROUP BY m.id_contrato
  ),
  periodo_agg AS (
    -- Sem filtro de deleted: o sistema soft-deleta mensalidades reais após congelar/cancelar,
    -- mas o período (periodo_inicial) reflete tempo de exibição que de fato aconteceu.
    SELECT m.id_contrato, MIN(m.periodo_inicial) AS primeiro_periodo_inicial
    FROM tb_financeiro_mensalidade m
    JOIN contratos_cliente cc ON cc.id = m.id_contrato
    GROUP BY m.id_contrato
  ),
  congelamento_ligado AS (
    SELECT cc2.id_contrato, MIN(cc2.data_congelamento) AS data_congelamento
    FROM tb_cliente_congelamento cc2
    JOIN contratos_cliente cli ON cli.id = cc2.id_contrato
    WHERE cc2.deleted = 0
    GROUP BY cc2.id_contrato
  ),
  contratos_resolvidos AS (
    -- Nome de coluna diferente de "data_congelamento" de propósito: se reusássemos o mesmo nome,
    -- o MySQL resolve a referência posterior pra coluna bruta do JOIN (cong.data_congelamento),
    -- não pra esta expressão calculada, e o fallback do congelamento não-vinculado nunca é usado.
    SELECT
      c.id AS id_contrato,
      c.data_contrato,
      c.cancelado,
      c.status,
      c.valor_mensalidade AS valor_contrato,
      c.id_vendedor,
      c.vendedor_nome,
      c.data_inicio_veiculacao,
      c.data_cancelamento,
      COALESCE(
        cong.data_congelamento,
        (SELECT MIN(cc3.data_congelamento) FROM tb_cliente_congelamento cc3
          WHERE cc3.deleted = 0 AND cc3.id_contrato IS NULL AND cc3.id_cliente = ?
            AND cc3.data_congelamento BETWEEN c.data_contrato AND COALESCE(c.data_cancelamento, NOW()))
      ) AS data_congelamento_resolvida,
      per.primeiro_periodo_inicial,
      COALESCE(mpa.total_mensalidades, 0) AS total_mensalidades,
      COALESCE(mpa.mensalidades_bonificadas, 0) AS mensalidades_bonificadas,
      COALESCE(mpa.mensalidades_cobradas, 0) AS mensalidades_cobradas,
      COALESCE(mpa.mensalidades_pagas_reais, 0) AS mensalidades_pagas_reais,
      COALESCE(mpa.total_recebido_contrato, 0) AS total_recebido_contrato,
      mpa.primeiro_vencimento,
      mpa.ultimo_vencimento
    FROM contratos_cliente c
    LEFT JOIN mensalidade_pagamento_agg mpa ON mpa.id_contrato = c.id
    LEFT JOIN periodo_agg per ON per.id_contrato = c.id
    LEFT JOIN congelamento_ligado cong ON cong.id_contrato = c.id
  )
  SELECT
    id_contrato,
    data_contrato,
    cancelado,
    status,
    valor_contrato,
    id_vendedor,
    vendedor_nome,
    data_inicio_veiculacao,
    data_cancelamento,
    data_congelamento_resolvida AS data_congelamento,
    primeiro_periodo_inicial,
    DATEDIFF(
      COALESCE(data_congelamento_resolvida, data_cancelamento, NOW()),
      COALESCE(primeiro_periodo_inicial, data_inicio_veiculacao, data_contrato)
    ) AS dias_no_ar,
    total_mensalidades,
    mensalidades_bonificadas,
    mensalidades_cobradas,
    mensalidades_pagas_reais,
    total_recebido_contrato,
    primeiro_vencimento,
    ultimo_vencimento
  FROM contratos_resolvidos
  ORDER BY data_contrato ASC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function mesKey(d: Date | string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getDashboardData(force = false): Promise<DashboardData> {
  if (!force && _cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  const connection = await getDbConnection();
  try {
    const [casosRows] = await connection.query(QUERY_CASOS);
    const [lifetimeRows] = await connection.query(QUERY_LIFETIME);

    const lifetimeMap = new Map<number, { totalContratosLifetime: number; totalRecebidoLifetime: number; ultimoContratoCliente: string; temContratoAtivo: boolean }>();
    for (const r of lifetimeRows as any[]) {
      lifetimeMap.set(r.id_cliente, {
        totalContratosLifetime: Number(r.total_contratos_lifetime),
        totalRecebidoLifetime: toNum(r.total_recebido_lifetime),
        ultimoContratoCliente: r.ultimo_contrato_cliente,
        temContratoAtivo: Boolean(r.tem_contrato_ativo),
      });
    }

    const casos: CasoBonificado[] = (casosRows as any[]).map((r) => {
      const lifetime = lifetimeMap.get(r.id_cliente) ?? { totalContratosLifetime: 0, totalRecebidoLifetime: 0, ultimoContratoCliente: r.data_contrato, temContratoAtivo: !r.cancelado };
      const comissaoReal = r.comissao_real === null ? null : toNum(r.comissao_real);
      const comissaoPercentual = toNum(r.comissao_percentual);
      const comissaoEstimada = comissaoReal === null ? toNum(r.valor_mensalidade) * comissaoPercentual : 0;

      return {
        idContrato: r.id_contrato,
        idCliente: r.id_cliente,
        clienteNome: r.cliente_nome,
        nomeFantasia: r.nome_fantasia,
        cpfCnpj: r.cpfcnpj,
        tipoPessoa: r.tipo_pessoa,
        email: r.email,
        telefone: r.telefone,
        clienteAtivo: Boolean(r.cliente_ativo),
        idVendedor: r.id_vendedor,
        vendedorNome: r.vendedor_nome,
        dataContrato: r.data_contrato,
        cancelado: Boolean(r.cancelado),
        statusContrato: r.status_contrato,
        valorMensalidade: toNum(r.valor_mensalidade),
        qtdBonificadas: Number(r.qtd_bonificadas),
        valorBonificado: toNum(r.valor_bonificado),
        qtdReaisGeradas: Number(r.qtd_reais),
        valorRealNaoPago: toNum(r.valor_real_nao_pago),
        comissaoReal,
        comissaoEstimada,
        totalContratosLifetime: lifetime.totalContratosLifetime,
        totalRecebidoLifetime: lifetime.totalRecebidoLifetime,
        ultimoContratoCliente: lifetime.ultimoContratoCliente,
        temContratoAtivo: lifetime.temContratoAtivo,
        qtdCasosCliente: 0,
        segmento: lifetime.totalRecebidoLifetime === 0 ? 'critico' : 'recuperavel',
        reincidente: false,
      };
    });

    // qtdCasosCliente é só contexto (quantas vezes ESSE cliente apareceu com um contrato bonificado-sem-pagamento).
    // "Reincidente" de verdade não pode depender só disso: um contrato pode nunca gerar mensalidade bonificada
    // (cancelado antes) e ainda assim fazer parte do mesmo padrão de nunca pagar. Por isso o critério combina
    // segmento crítico (nunca pagou nada em NENHUM contrato da vida toda) com 3+ contratos na vida toda —
    // um cliente com 9 contratos, 8 pagos e 1 grátis cancelado (ex: Kelly Neves) NÃO é reincidente do golpe,
    // é cliente normal com uma tentativa que não vingou.
    const ocorrenciasPorCliente = new Map<number, number>();
    for (const c of casos) {
      ocorrenciasPorCliente.set(c.idCliente, (ocorrenciasPorCliente.get(c.idCliente) ?? 0) + 1);
    }
    for (const c of casos) {
      c.qtdCasosCliente = ocorrenciasPorCliente.get(c.idCliente) ?? 1;
      c.reincidente = c.segmento === 'critico' && c.totalContratosLifetime >= 3;
    }

    const clientesUnicos = new Set(casos.map((c) => c.idCliente));
    const clientesCriticos = new Set(casos.filter((c) => c.segmento === 'critico').map((c) => c.idCliente));
    const clientesReincidentes = new Set(casos.filter((c) => c.reincidente).map((c) => c.idCliente));

    const valorNaoRecebido = casos.reduce((s, c) => s + c.valorRealNaoPago, 0);
    const valorBonificadoConsumido = casos.reduce((s, c) => s + c.valorBonificado, 0);
    const comissaoRealTotal = casos.reduce((s, c) => s + (c.comissaoReal ?? 0), 0);
    const comissaoEstimadaTotal = casos.reduce((s, c) => s + c.comissaoEstimada, 0);

    const evolucaoMap = new Map<string, { qtdContratos: number; valorPerdido: number }>();
    for (const c of casos) {
      const key = mesKey(c.dataContrato);
      const entry = evolucaoMap.get(key) ?? { qtdContratos: 0, valorPerdido: 0 };
      entry.qtdContratos += 1;
      entry.valorPerdido += c.valorRealNaoPago + (c.comissaoReal ?? c.comissaoEstimada);
      evolucaoMap.set(key, entry);
    }
    const evolucaoMensal: EvolucaoMes[] = Array.from(evolucaoMap.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const vendedorMap = new Map<number, VendedorRanking>();
    for (const c of casos) {
      if (c.idVendedor === null) continue;
      const entry = vendedorMap.get(c.idVendedor) ?? {
        idVendedor: c.idVendedor,
        nome: c.vendedorNome ?? `Vendedor #${c.idVendedor}`,
        qtdContratos: 0,
        qtdClientes: 0,
        valorNaoRecebido: 0,
        comissaoReal: 0,
        comissaoEstimada: 0,
      };
      entry.qtdContratos += 1;
      entry.valorNaoRecebido += c.valorRealNaoPago;
      entry.comissaoReal += c.comissaoReal ?? 0;
      entry.comissaoEstimada += c.comissaoEstimada;
      vendedorMap.set(c.idVendedor, entry);
    }
    for (const [idVendedor, entry] of vendedorMap) {
      entry.qtdClientes = new Set(casos.filter((c) => c.idVendedor === idVendedor).map((c) => c.idCliente)).size;
    }
    const rankingVendedores = Array.from(vendedorMap.values()).sort(
      (a, b) => b.comissaoReal + b.comissaoEstimada - (a.comissaoReal + a.comissaoEstimada)
    );

    const data: DashboardData = {
      generatedAt: new Date().toISOString(),
      kpis: {
        totalContratos: casos.length,
        totalClientes: clientesUnicos.size,
        totalReincidentes: clientesReincidentes.size,
        valorNaoRecebido,
        valorBonificadoConsumido,
        comissaoRealTotal,
        comissaoEstimadaTotal,
        prejuizoConfirmado: valorNaoRecebido + comissaoRealTotal,
        prejuizoEstimadoAdicional: comissaoEstimadaTotal,
      },
      segmentacao: {
        criticos: clientesCriticos.size,
        recuperaveis: clientesUnicos.size - clientesCriticos.size,
      },
      evolucaoMensal,
      rankingVendedores,
      casos,
    };

    _cache = { data, ts: Date.now() };
    return data;
  } finally {
    await connection.end();
  }
}

export async function getDetalheContratosCliente(idCliente: number): Promise<ContratoDetalhe[]> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.execute(QUERY_DETALHE_CLIENTE, [idCliente, idCliente]);
    return (rows as any[]).map((r) => ({
      idContrato: r.id_contrato,
      dataContrato: r.data_contrato,
      cancelado: Boolean(r.cancelado),
      status: r.status,
      valorContrato: toNum(r.valor_contrato),
      idVendedor: r.id_vendedor,
      vendedorNome: r.vendedor_nome,
      dataInicioVeiculacao: r.data_inicio_veiculacao,
      dataCancelamento: r.data_cancelamento,
      dataCongelamento: r.data_congelamento,
      diasNoAr: r.dias_no_ar === null ? null : Number(r.dias_no_ar),
      totalMensalidades: Number(r.total_mensalidades),
      mensalidadesBonificadas: Number(r.mensalidades_bonificadas),
      mensalidadesCobradas: Number(r.mensalidades_cobradas),
      mensalidadesPagasReais: Number(r.mensalidades_pagas_reais),
      totalRecebidoContrato: toNum(r.total_recebido_contrato),
      primeiroVencimento: r.primeiro_vencimento,
      ultimoVencimento: r.ultimo_vencimento,
    }));
  } finally {
    await connection.end();
  }
}
