import { getDbConnection } from '@/lib/db';

export type Categoria = 'PF' | 'PJ' | 'ADITIVO';

export type Pagamento = {
  idPagamento: number;
  dataPagamento: string;
  valor: number;
  formaPagamento: string;
  estorno: boolean;
  motivo: string | null;
  idEmpresa: number | null;
  empresaNome: string | null;
  idCliente: number;
  clienteNome: string;
  tipoPessoa: string | null;
  temNfs: boolean;
  categoria: Categoria;
};

export type SeriePeriodo = {
  periodo: string;
  qtdPagamentos: number;
  valorRecebido: number;
  valorEstornado: number;
  porForma: Record<string, { valor: number; qtd: number }>;
};

export type RankingFormaPagamento = {
  formaPagamento: string;
  qtdPagamentos: number;
  valorRecebido: number;
  valorEstornado: number;
};

export type AgregadoPagamentos = {
  kpis: {
    totalPagamentos: number;
    valorRecebido: number;
    valorEstornado: number;
    valorLiquido: number;
    ticketMedio: number;
    qtdEstornos: number;
    qtdComNfs: number;
    qtdSemNfs: number;
  };
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  rankingFormaPagamento: RankingFormaPagamento[];
};

export type PagamentosData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  porCategoria: {
    geral: AgregadoPagamentos;
    pf: AgregadoPagamentos;
    pj: AgregadoPagamentos;
    aditivo: AgregadoPagamentos;
  };
  pagamentos: Pagamento[];
};

/**
 * Categoriza cada pagamento em PF / PJ / ADITIVO usando o mesmo critério que o admin (PHP)
 * já usa pra apurar comissão (financeiro_mensalidade_model.php: buscaComissoes/contaParcelasPagasAditivo):
 * - id_mensalidade_cliente NULL           -> PF (pagamento avulso de plano/assinatura, sem contrato PJ por trás).
 *   Não usamos tb_cliente.tipo_pessoa aqui porque tipo_pessoa2 = 'REVENDA_VF' é uma PF com contrato PJ.
 * - id_mensalidade_cliente NOT NULL       -> mensalidade de um tb_financeiro_contrato (o mesmo universo de /vendas).
 *   Dentro desse grupo, se existir um tb_financeiro_contrato_aditivo do mesmo contrato com
 *   data_contrato_aditivo <= data_cadastro da mensalidade (o aditivo vigente mais recente naquele momento),
 *   o pagamento é de ADITIVO; senão é PJ (contrato original).
 *
 * tb_financeiro_contrato_aditivo também é usada pra registrar ações administrativas que NÃO são
 * aditivo comercial (congelar/descongelar conta de usados, ajuste anual de IGPM, troca de dados
 * cadastrais/titularidade/CPF-CNPJ, mudança de data de vencimento) — mais da metade dos registros
 * da tabela são só congelamento/descongelamento. Sem filtrar isso, quase todo contrato que já foi
 * congelado/descongelado uma vez passaria a contar como "aditivo" pra sempre. Por isso o filtro de
 * motivo_aditivo abaixo restringe ADITIVO a mudança comercial de plano/valor (upgrade, downgrade,
 * reativação, monetização etc.) — IGPM foi tratado como PJ normal, não como aditivo, por decisão
 * de negócio (reajuste contratual obrigatório, não é uma venda adicional).
 */
const QUERY = `
  SELECT
    p.id AS id_pagamento,
    p.data_pagamento,
    p.valor,
    p.forma_pagamento,
    p.estorno,
    p.motivo,
    p.id_empresa,
    e.razao_social AS empresa_nome,
    p.id_cliente,
    cl.nome_fantasia,
    cl.tipo_pessoa,
    p.id_nfs,
    p.id_mensalidade_cliente,
    fca.id AS id_aditivo
  FROM tb_pagamento p
  INNER JOIN tb_cliente cl ON cl.id = p.id_cliente
  LEFT JOIN tb_empresa e ON e.id = p.id_empresa
  LEFT JOIN tb_financeiro_mensalidade fm ON fm.id = p.id_mensalidade_cliente
  LEFT JOIN tb_financeiro_contrato_aditivo fca ON fca.id = (
    SELECT fca2.id
    FROM tb_financeiro_contrato_aditivo fca2
    WHERE fca2.id_contrato = fm.id_contrato
      AND fca2.deleted = 0
      AND fca2.data_contrato_aditivo <= fm.data_cadastro
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%congelamento%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%igpm%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%igmp%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%data de vencimento%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%mudança da data%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%alteração de dados%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%dados cadastrais%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%titularidade%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%alteração de cpf%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%alteração de cnpj%'
      AND COALESCE(fca2.motivo_aditivo, '') NOT LIKE '%cpf para cnpj%'
    ORDER BY fca2.data_contrato_aditivo DESC, fca2.id DESC
    LIMIT 1
  )
  WHERE p.deleted = 0
    AND p.data_pagamento BETWEEN ? AND ?
  ORDER BY p.data_pagamento ASC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

const TZ = 'America/Sao_Paulo';

/**
 * data_pagamento é TIMESTAMP (sessão MySQL em Brazil/East), então o instante já é correto —
 * mas bucketar por getUTC* pegaria o dia em UTC, não o dia real em horário de Brasília
 * (ex: pagamento às 23h de BRT vira 02h UTC do dia seguinte). Por isso extraímos ano/mês/dia
 * explicitamente no fuso de Brasília, independente do fuso do processo Node (mesma correção
 * já aplicada em src/lib/assinaturas/index.ts).
 */
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

function agregar(pagamentos: Pagamento[]): AgregadoPagamentos {
  type Acc = { qtdPagamentos: number; valorRecebido: number; valorEstornado: number; porForma: Record<string, { valor: number; qtd: number }> };
  const diaMap = new Map<string, Acc>();
  const mesMap = new Map<string, Acc>();
  for (const p of pagamentos) {
    const dKey = diaKey(p.dataPagamento);
    const mKey = mesKey(p.dataPagamento);
    const dEntry = diaMap.get(dKey) ?? { qtdPagamentos: 0, valorRecebido: 0, valorEstornado: 0, porForma: {} };
    const mEntry = mesMap.get(mKey) ?? { qtdPagamentos: 0, valorRecebido: 0, valorEstornado: 0, porForma: {} };
    dEntry.qtdPagamentos += 1;
    mEntry.qtdPagamentos += 1;
    if (p.estorno) {
      dEntry.valorEstornado += p.valor;
      mEntry.valorEstornado += p.valor;
    } else {
      dEntry.valorRecebido += p.valor;
      mEntry.valorRecebido += p.valor;
      const dForma = dEntry.porForma[p.formaPagamento] ?? { valor: 0, qtd: 0 };
      dForma.valor += p.valor;
      dForma.qtd += 1;
      dEntry.porForma[p.formaPagamento] = dForma;
      const mForma = mEntry.porForma[p.formaPagamento] ?? { valor: 0, qtd: 0 };
      mForma.valor += p.valor;
      mForma.qtd += 1;
      mEntry.porForma[p.formaPagamento] = mForma;
    }
    diaMap.set(dKey, dEntry);
    mesMap.set(mKey, mEntry);
  }
  const seriePorDia = Array.from(diaMap.entries()).map(([periodo, v]) => ({ periodo, ...v })).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const seriePorMes = Array.from(mesMap.entries()).map(([periodo, v]) => ({ periodo, ...v })).sort((a, b) => a.periodo.localeCompare(b.periodo));

  const formaMap = new Map<string, RankingFormaPagamento>();
  for (const p of pagamentos) {
    const entry = formaMap.get(p.formaPagamento) ?? { formaPagamento: p.formaPagamento, qtdPagamentos: 0, valorRecebido: 0, valorEstornado: 0 };
    entry.qtdPagamentos += 1;
    if (p.estorno) entry.valorEstornado += p.valor;
    else entry.valorRecebido += p.valor;
    formaMap.set(p.formaPagamento, entry);
  }
  const rankingFormaPagamento = Array.from(formaMap.values()).sort((a, b) => b.valorRecebido - a.valorRecebido);

  const pagos = pagamentos.filter((p) => !p.estorno);
  const estornados = pagamentos.filter((p) => p.estorno);
  const valorRecebido = pagos.reduce((s, p) => s + p.valor, 0);
  const valorEstornado = estornados.reduce((s, p) => s + p.valor, 0);

  return {
    kpis: {
      totalPagamentos: pagos.length,
      valorRecebido,
      valorEstornado,
      valorLiquido: valorRecebido - valorEstornado,
      ticketMedio: pagos.length > 0 ? valorRecebido / pagos.length : 0,
      qtdEstornos: estornados.length,
      qtdComNfs: pagos.filter((p) => p.temNfs).length,
      qtdSemNfs: pagos.filter((p) => !p.temNfs).length,
    },
    seriePorDia,
    seriePorMes,
    rankingFormaPagamento,
  };
}

export async function getPagamentosData(dataInicial: string, dataFinal: string): Promise<PagamentosData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`]);

    const pagamentos: Pagamento[] = (rows as any[]).map((r) => {
      const categoria: Categoria = r.id_mensalidade_cliente == null ? 'PF' : r.id_aditivo != null ? 'ADITIVO' : 'PJ';
      return {
        idPagamento: r.id_pagamento,
        dataPagamento: r.data_pagamento,
        valor: toNum(r.valor),
        formaPagamento: r.forma_pagamento ?? 'outro',
        estorno: Boolean(r.estorno),
        motivo: r.motivo,
        idEmpresa: r.id_empresa,
        empresaNome: r.empresa_nome,
        idCliente: r.id_cliente,
        clienteNome: r.nome_fantasia,
        tipoPessoa: r.tipo_pessoa,
        temNfs: r.id_nfs !== null,
        categoria,
      };
    });

    const porCategoria = {
      geral: agregar(pagamentos),
      pf: agregar(pagamentos.filter((p) => p.categoria === 'PF')),
      pj: agregar(pagamentos.filter((p) => p.categoria === 'PJ')),
      aditivo: agregar(pagamentos.filter((p) => p.categoria === 'ADITIVO')),
    };

    const data: PagamentosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      porCategoria,
      pagamentos,
    };

    return data;
  } finally {
    await connection.end();
  }
}
