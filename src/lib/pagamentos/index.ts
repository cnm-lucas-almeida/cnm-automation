import { getDbConnection } from '@/lib/db';

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

export type PagamentosData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
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
  pagamentos: Pagamento[];
};

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
    p.id_nfs
  FROM tb_pagamento p
  INNER JOIN tb_cliente cl ON cl.id = p.id_cliente
  LEFT JOIN tb_empresa e ON e.id = p.id_empresa
  WHERE p.deleted = 0
    AND p.data_pagamento BETWEEN ? AND ?
  ORDER BY p.data_pagamento ASC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function diaKey(d: string | Date): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function mesKey(d: string | Date): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getPagamentosData(dataInicial: string, dataFinal: string): Promise<PagamentosData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`]);

    const pagamentos: Pagamento[] = (rows as any[]).map((r) => ({
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
    }));

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

    const data: PagamentosData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
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
      pagamentos,
    };

    return data;
  } finally {
    await connection.end();
  }
}
