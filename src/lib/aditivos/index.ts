import { getDbConnection } from '@/lib/db';

const BASE_URL = 'https://www.chavesnamao.com.br';

export type Segmento = 'imoveis' | 'veiculos' | 'outro';
export type TipoMovimentacao = 'UPGRADE' | 'DOWNGRADE';

function segmentoFromTipoPessoa2(tipoPessoa2: string | null): Segmento {
  if (tipoPessoa2 === 'IMOB' || tipoPessoa2 === 'CORRETOR') return 'imoveis';
  if (tipoPessoa2 === 'REVENDA_V' || tipoPessoa2 === 'REVENDA_VF') return 'veiculos';
  return 'outro';
}

export type Movimentacao = {
  id: number;
  dataAditivo: string;
  /** Data em que o registro foi criado no sistema — diferente de dataAditivo (data de
   * efetivação/previsão), útil pra investigar quando algo foi lançado com atraso ou errado. */
  dataCriacao: string | null;
  tipo: TipoMovimentacao;
  idContrato: number;
  idCliente: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  segmento: Segmento;
  vendedorNome: string | null;
  planoAntigoNome: string | null;
  planoAntigoQtd: number | null;
  planoAntigoDestaque: number | null;
  planoNovoNome: string | null;
  planoNovoQtd: number | null;
  planoNovoDestaque: number | null;
  valorAntigo: number;
  valorNovo: number;
  impacto: number;
  diferencaAnuncios: number | null;
  motivo: string | null;
  linkAdmin: string;
};

export type AditivosData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string; segmento: Segmento | 'todos' };
  kpis: {
    totalUpgrade: number;
    totalDowngrade: number;
    resultadoLiquido: number;
    qtdUpgrades: number;
    qtdDowngrades: number;
    volumeTotal: number;
    estoqueGanho: number;
    estoquePerdido: number;
    variacaoEstoque: number;
    ticketMedioUpgrade: number;
    ticketMedioDowngrade: number;
  };
  movimentacoes: Movimentacao[];
};

/**
 * tb_financeiro_contrato_aditivo também guarda ações administrativas que não são movimentação
 * comercial de plano (congelar/descongelar conta, reajuste de IGPM, troca de dados cadastrais) —
 * o próprio tipo_aditivo já filtra a maior parte (só pegamos UPGRADE/DOWNGRADE aqui), mas o
 * congelamento/descongelamento às vezes é misclassificado como UPGRADE/DOWNGRADE pelo backfill do
 * admin (ele só olha se o valor foi pra cima ou pra baixo, não o motivo real). Por isso o filtro de
 * motivo abaixo — mesma lista usada em src/lib/pagamentos/index.ts.
 *
 * NÃO incluímos aqui um filtro por "data de vencimento"/"mudança da data": testamos e ele excluía
 * upgrades comerciais genuínos que só mencionam a data de vencimento como cláusula secundária (ex.:
 * "alteração do plano de 40 para 150 anúncios... e alteração de vencimento do dia 05 para o 10").
 * Mudança de vencimento pura (sem mudança de valor) já fica de fora sozinha, porque nesse caso
 * tipo_aditivo vem como 'DATA' no admin, não 'UPGRADE'/'DOWNGRADE' — não precisa reforçar por texto.
 */
const EXCLUSAO_MOTIVO = `
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%congelamento%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%igpm%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%igmp%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%alteração de dados%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%dados cadastrais%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%titularidade%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%alteração de cpf%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%alteração de cnpj%'
  AND COALESCE(fca.motivo_aditivo, '') NOT LIKE '%cpf para cnpj%'
`;

const QUERY = `
  SELECT
    fca.id, fca.id_contrato, fca.data_contrato_aditivo, fca.data_cadastro, fca.tipo_aditivo, fca.motivo_aditivo,
    fca.antigo_valor_mensalidade, fca.novo_valor_mensalidade,
    c.id AS id_cliente, c.nome_fantasia, c.nome AS nome_cliente, c.tipo_pessoa2,
    cid.nome_cidade, uf.sigla_uf,
    v.nome AS vendedor_nome,
    ipaold.nome AS plano_antigo_imovel_nome, ipaold.qtd_imoveis AS plano_antigo_imovel_qtd, ipaold.qtd_destaque AS plano_antigo_imovel_destaque,
    ipanew.nome AS plano_novo_imovel_nome, ipanew.qtd_imoveis AS plano_novo_imovel_qtd, ipanew.qtd_destaque AS plano_novo_imovel_destaque,
    vpaold.nome AS plano_antigo_veiculo_nome, vpaold.qtd_veiculos AS plano_antigo_veiculo_qtd, vpaold.qtd_destaque AS plano_antigo_veiculo_destaque,
    vpanew.nome AS plano_novo_veiculo_nome, vpanew.qtd_veiculos AS plano_novo_veiculo_qtd, vpanew.qtd_destaque AS plano_novo_veiculo_destaque
  FROM tb_financeiro_contrato_aditivo fca
  JOIN tb_financeiro_contrato fc ON fc.id = fca.id_contrato
  JOIN tb_cliente c ON c.id = fc.id_cliente
  LEFT JOIN tb_cidade cid ON cid.id = c.id_cidade
  LEFT JOIN tb_uf uf ON uf.id = cid.id_uf
  LEFT JOIN tb_vendedor v ON v.id = COALESCE(fca.id_vendedor, fc.id_vendedor)
  LEFT JOIN tb_imovel_plano_assinatura_valor ipavold ON fca.id_plano_valor_antigo = ipavold.id
  LEFT JOIN tb_imovel_plano_assinatura ipaold ON ipavold.id_plano = ipaold.id
  LEFT JOIN tb_imovel_plano_assinatura_valor ipavnew ON fca.id_plano_valor_novo = ipavnew.id
  LEFT JOIN tb_imovel_plano_assinatura ipanew ON ipavnew.id_plano = ipanew.id
  LEFT JOIN tb_veiculo_plano_assinatura_valor vpavold ON fca.id_plano_valor_antigo = vpavold.id
  LEFT JOIN tb_veiculo_plano_assinatura vpaold ON vpavold.id_plano = vpaold.id
  LEFT JOIN tb_veiculo_plano_assinatura_valor vpavnew ON fca.id_plano_valor_novo = vpavnew.id
  LEFT JOIN tb_veiculo_plano_assinatura vpanew ON vpavnew.id_plano = vpanew.id
  WHERE fca.deleted = 0
    AND fca.tipo_aditivo IN ('UPGRADE', 'DOWNGRADE')
    AND fca.novo_valor_mensalidade IS NOT NULL
    AND fca.antigo_valor_mensalidade IS NOT NULL
    AND fca.data_contrato_aditivo BETWEEN ? AND ?
    ${EXCLUSAO_MOTIVO}
  ORDER BY fca.data_contrato_aditivo DESC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function agregarKpis(movimentacoes: Movimentacao[]): AditivosData['kpis'] {
  const upgrades = movimentacoes.filter((m) => m.tipo === 'UPGRADE');
  const downgrades = movimentacoes.filter((m) => m.tipo === 'DOWNGRADE');

  const totalUpgrade = upgrades.reduce((s, m) => s + m.impacto, 0);
  const totalDowngrade = Math.abs(downgrades.reduce((s, m) => s + m.impacto, 0));

  const diffs = movimentacoes.map((m) => m.diferencaAnuncios).filter((d): d is number => d !== null);
  const estoqueGanho = diffs.filter((d) => d > 0).reduce((s, d) => s + d, 0);
  const estoquePerdido = Math.abs(diffs.filter((d) => d < 0).reduce((s, d) => s + d, 0));

  return {
    totalUpgrade,
    totalDowngrade,
    resultadoLiquido: totalUpgrade - totalDowngrade,
    qtdUpgrades: upgrades.length,
    qtdDowngrades: downgrades.length,
    volumeTotal: upgrades.length - downgrades.length,
    estoqueGanho,
    estoquePerdido,
    variacaoEstoque: estoqueGanho - estoquePerdido,
    ticketMedioUpgrade: upgrades.length > 0 ? totalUpgrade / upgrades.length : 0,
    ticketMedioDowngrade: downgrades.length > 0 ? totalDowngrade / downgrades.length : 0,
  };
}

export async function getAditivosData(
  dataInicial: string,
  dataFinal: string,
  segmento: Segmento | 'todos' = 'todos'
): Promise<AditivosData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`]);

    const todas: Movimentacao[] = (rows as any[]).map((r) => {
      const planoAntigoNome = r.plano_antigo_imovel_nome ?? r.plano_antigo_veiculo_nome ?? null;
      const planoAntigoQtd = r.plano_antigo_imovel_qtd ?? r.plano_antigo_veiculo_qtd ?? null;
      const planoAntigoDestaque = r.plano_antigo_imovel_destaque ?? r.plano_antigo_veiculo_destaque ?? null;
      const planoNovoNome = r.plano_novo_imovel_nome ?? r.plano_novo_veiculo_nome ?? null;
      const planoNovoQtd = r.plano_novo_imovel_qtd ?? r.plano_novo_veiculo_qtd ?? null;
      const planoNovoDestaque = r.plano_novo_imovel_destaque ?? r.plano_novo_veiculo_destaque ?? null;
      const valorAntigo = toNum(r.antigo_valor_mensalidade);
      const valorNovo = toNum(r.novo_valor_mensalidade);

      return {
        id: r.id,
        dataAditivo: r.data_contrato_aditivo,
        dataCriacao: r.data_cadastro ?? null,
        tipo: r.tipo_aditivo,
        idContrato: r.id_contrato,
        idCliente: r.id_cliente,
        clienteNome: r.nome_fantasia || r.nome_cliente,
        cidade: r.nome_cidade || null,
        uf: r.sigla_uf || null,
        segmento: segmentoFromTipoPessoa2(r.tipo_pessoa2),
        vendedorNome: r.vendedor_nome || null,
        planoAntigoNome,
        planoAntigoQtd: planoAntigoQtd === null ? null : Number(planoAntigoQtd),
        planoAntigoDestaque: planoAntigoDestaque === null ? null : Number(planoAntigoDestaque),
        planoNovoNome,
        planoNovoQtd: planoNovoQtd === null ? null : Number(planoNovoQtd),
        planoNovoDestaque: planoNovoDestaque === null ? null : Number(planoNovoDestaque),
        valorAntigo,
        valorNovo,
        impacto: valorNovo - valorAntigo,
        diferencaAnuncios: (planoAntigoQtd !== null && planoNovoQtd !== null) ? Number(planoNovoQtd) - Number(planoAntigoQtd) : null,
        motivo: r.motivo_aditivo || null,
        linkAdmin: `${BASE_URL}/admin/financial_contract_additive/index/${r.id_contrato}`,
      };
    });

    const movimentacoes = segmento === 'todos' ? todas : todas.filter((m) => m.segmento === segmento);

    const data: AditivosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal, segmento },
      kpis: agregarKpis(movimentacoes),
      movimentacoes,
    };

    return data;
  } finally {
    await connection.end();
  }
}

/**
 * "Agendados": aditivos JÁ solicitados/assinados, mas que só entram em vigor numa data futura
 * (financial_contract_additive_scheduled, status='SCHEDULED'). Diferente do efetivado
 * (tb_financeiro_contrato_aditivo), que só ganha registro quando a mudança já está valendo na
 * mensalidade — daí a equipe que preenche a planilha manual às vezes registrar um aditivo numa data
 * em que ele só foi *solicitado*, não *efetivado*, causando divergência com o relatório de efetivados.
 *
 * Reaproveita o mesmo formato (AditivosData/Movimentacao) do efetivado pra reusar a mesma tabela/KPIs
 * na tela — só que aqui "dataAditivo" é a data PREVISTA pra entrar em vigor (scheduled_date), e
 * "planoAntigo/planoNovo" são o plano atual/desejado do agendamento.
 *
 * Não tem filtro de período: o volume de agendamentos pendentes é naturalmente pequeno (~dezenas),
 * então mostramos todos de uma vez, como a própria tela de agendamento do admin já faz.
 */
const QUERY_AGENDADOS = `
  SELECT
    fcas.id, fcas.contract_id, fcas.scheduled_date, fcas.date_contract_additive, fcas.created_at, fcas.type_additive,
    fcas.monthly_value, fcas.additive_observation,
    c.id AS id_cliente, c.nome_fantasia, c.nome AS nome_cliente, c.tipo_pessoa2,
    cid.nome_cidade, uf.sigla_uf,
    v.nome AS vendedor_nome,
    fc.valor_mensalidade_original,
    fca_ultimo.novo_valor_mensalidade AS ultimo_valor_efetivado,
    COALESCE(ipa_atual.nome, ipa_atual_fb.nome) AS plano_atual_imovel_nome,
    COALESCE(ipa_atual.qtd_imoveis, ipa_atual_fb.qtd_imoveis) AS plano_atual_imovel_qtd,
    COALESCE(ipa_atual.qtd_destaque, ipa_atual_fb.qtd_destaque) AS plano_atual_imovel_destaque,
    ipa_novo.nome AS plano_novo_imovel_nome, ipa_novo.qtd_imoveis AS plano_novo_imovel_qtd, ipa_novo.qtd_destaque AS plano_novo_imovel_destaque,
    COALESCE(vpa_atual.nome, vpa_atual_fb.nome) AS plano_atual_veiculo_nome,
    COALESCE(vpa_atual.qtd_veiculos, vpa_atual_fb.qtd_veiculos) AS plano_atual_veiculo_qtd,
    COALESCE(vpa_atual.qtd_destaque, vpa_atual_fb.qtd_destaque) AS plano_atual_veiculo_destaque,
    vpa_novo.nome AS plano_novo_veiculo_nome, vpa_novo.qtd_veiculos AS plano_novo_veiculo_qtd, vpa_novo.qtd_destaque AS plano_novo_veiculo_destaque
  FROM financial_contract_additive_scheduled fcas
  JOIN tb_financeiro_contrato fc ON fc.id = fcas.contract_id
  JOIN tb_cliente c ON c.id = fc.id_cliente
  LEFT JOIN tb_cidade cid ON cid.id = c.id_cidade
  LEFT JOIN tb_uf uf ON uf.id = cid.id_uf
  LEFT JOIN tb_vendedor v ON v.id = fcas.vendor_id
  -- "Plano atual": NÃO dá pra confiar em fcas.current_plan_id (já vimos casos apontando pra um
  -- id_imovel_plano_assinatura_cliente de OUTRO cliente, ou pra um id que não existe em lugar
  -- nenhum — parece um dado mal preenchido na origem, no admin). Em vez disso, usamos o mesmo plano
  -- "novo" gravado no último aditivo JÁ EFETIVADO desse contrato — é o mesmo dado que a aba
  -- Efetivados já usa, então é confiável. Se o contrato nunca teve aditivo, caímos pro plano
  -- atualmente ativo do cliente (mesma fonte que a tela /admin/clients/plans/{id} usa).
  LEFT JOIN tb_financeiro_contrato_aditivo fca_ultimo ON fca_ultimo.id = (
    SELECT fca2.id FROM tb_financeiro_contrato_aditivo fca2
    WHERE fca2.id_contrato = fcas.contract_id AND fca2.deleted = 0
    ORDER BY fca2.data_contrato_aditivo DESC, fca2.id DESC LIMIT 1
  )
  LEFT JOIN tb_imovel_plano_assinatura_valor ipav_atual ON ipav_atual.id = fca_ultimo.id_plano_valor_novo
  LEFT JOIN tb_imovel_plano_assinatura ipa_atual ON ipa_atual.id = ipav_atual.id_plano
  LEFT JOIN tb_imovel_plano_assinatura ipa_novo ON ipa_novo.id = fcas.desired_plan_id
  LEFT JOIN tb_veiculo_plano_assinatura_valor vpav_atual ON vpav_atual.id = fca_ultimo.id_plano_valor_novo
  LEFT JOIN tb_veiculo_plano_assinatura vpa_atual ON vpa_atual.id = vpav_atual.id_plano
  LEFT JOIN tb_veiculo_plano_assinatura vpa_novo ON vpa_novo.id = fcas.desired_plan_id
  LEFT JOIN tb_imovel_plano_assinatura_cliente ipac_fb ON ipac_fb.id = (
    SELECT ipac2.id FROM tb_imovel_plano_assinatura_cliente ipac2
    WHERE ipac2.id_cliente = c.id AND ipac2.deleted = 0 AND ipac2.ativo = 1
    ORDER BY ipac2.id DESC LIMIT 1
  )
  LEFT JOIN tb_imovel_plano_assinatura ipa_atual_fb ON ipa_atual_fb.id = ipac_fb.id_imovel_plano_assinatura
  LEFT JOIN tb_veiculo_plano_assinatura_cliente vpac_fb ON vpac_fb.id = (
    SELECT vpac2.id FROM tb_veiculo_plano_assinatura_cliente vpac2
    WHERE vpac2.id_cliente = c.id AND vpac2.deleted = 0 AND vpac2.ativo = 1
    ORDER BY vpac2.id DESC LIMIT 1
  )
  LEFT JOIN tb_veiculo_plano_assinatura vpa_atual_fb ON vpa_atual_fb.id = vpac_fb.id_veiculo_plano_assinatura
  WHERE fcas.status = 'SCHEDULED'
    AND fcas.type_additive IN ('UPGRADE', 'DOWNGRADE')
  ORDER BY fcas.scheduled_date ASC
`;

export async function getAgendadosData(segmento: Segmento | 'todos' = 'todos'): Promise<AditivosData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY_AGENDADOS);

    const todas: Movimentacao[] = (rows as any[]).map((r) => {
      const planoAntigoNome = r.plano_atual_imovel_nome ?? r.plano_atual_veiculo_nome ?? null;
      const planoAntigoQtd = r.plano_atual_imovel_qtd ?? r.plano_atual_veiculo_qtd ?? null;
      const planoAntigoDestaque = r.plano_atual_imovel_destaque ?? r.plano_atual_veiculo_destaque ?? null;
      const planoNovoNome = r.plano_novo_imovel_nome ?? r.plano_novo_veiculo_nome ?? null;
      const planoNovoQtd = r.plano_novo_imovel_qtd ?? r.plano_novo_veiculo_qtd ?? null;
      const planoNovoDestaque = r.plano_novo_imovel_destaque ?? r.plano_novo_veiculo_destaque ?? null;
      // Valor atual do contrato não fica "congelado" na tabela de agendamento (só o valor desejado
      // fica) — usamos o último aditivo já efetivado desse contrato como referência e, na falta
      // dele, o valor original do contrato. Pode ficar levemente impreciso se algo mudar entre a
      // solicitação e a efetivação, diferente do valor "travado" que o efetivado tem.
      const valorAntigo = toNum(r.ultimo_valor_efetivado ?? r.valor_mensalidade_original);
      const valorNovo = toNum(r.monthly_value);

      return {
        id: r.id,
        dataAditivo: r.scheduled_date,
        dataCriacao: r.created_at ?? null,
        tipo: r.type_additive,
        idContrato: r.contract_id,
        idCliente: r.id_cliente,
        clienteNome: r.nome_fantasia || r.nome_cliente,
        cidade: r.nome_cidade || null,
        uf: r.sigla_uf || null,
        segmento: segmentoFromTipoPessoa2(r.tipo_pessoa2),
        vendedorNome: r.vendedor_nome || null,
        planoAntigoNome,
        planoAntigoQtd: planoAntigoQtd === null ? null : Number(planoAntigoQtd),
        planoAntigoDestaque: planoAntigoDestaque === null ? null : Number(planoAntigoDestaque),
        planoNovoNome,
        planoNovoQtd: planoNovoQtd === null ? null : Number(planoNovoQtd),
        planoNovoDestaque: planoNovoDestaque === null ? null : Number(planoNovoDestaque),
        valorAntigo,
        valorNovo,
        impacto: valorNovo - valorAntigo,
        diferencaAnuncios: (planoAntigoQtd !== null && planoNovoQtd !== null) ? Number(planoNovoQtd) - Number(planoAntigoQtd) : null,
        motivo: r.additive_observation || null,
        linkAdmin: `${BASE_URL}/admin/financial_contract_additive/index/${r.contract_id}`,
      };
    });

    const movimentacoes = segmento === 'todos' ? todas : todas.filter((m) => m.segmento === segmento);

    const data: AditivosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial: '', dataFinal: '', segmento },
      kpis: agregarKpis(movimentacoes),
      movimentacoes,
    };

    return data;
  } finally {
    await connection.end();
  }
}
