import { getDbConnection } from '@/lib/db';

const MOTIVO_REATIVADO = 16;

export type VendaContrato = {
  idContrato: number;
  idCliente: number;
  nomeFantasia: string;
  tipoPessoa: string | null;
  dataContrato: string;
  dataInicioVeiculacao: string | null;
  valor: number;
  cancelado: boolean;
  lancamento: boolean;
  congelado: boolean;
  idVendedor: number;
  vendedorNome: string;
  squadNome: string | null;
  treinadorNome: string | null;
  pago: boolean | null;
  status: 'ativa' | 'congelada' | 'cancelada';
  paga: boolean;
};

export type SeriePeriodo = { periodo: string; qtdVendas: number; valor: number };

export type RankingVendedor = {
  idVendedor: number;
  nome: string;
  squadNome: string | null;
  treinadorNome: string | null;
  vendas: number;
  ativas: number;
  pagas: number;
  congeladas: number;
  canceladas: number;
  valorTotal: number;
  valorAtivas: number;
  ticketMedio: number;
};

export type RankingSquad = {
  squadNome: string;
  vendas: number;
  ativas: number;
  canceladas: number;
  congeladas: number;
  valorTotal: number;
};

export type VendasData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  kpis: {
    totalVendas: number;
    valorTotal: number;
    ticketMedio: number;
    ativas: number;
    pagas: number;
    pendentes: number;
    congeladas: number;
    canceladas: number;
    valorAtivas: number;
    maiorVenda: number;
    menorVenda: number;
  };
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  rankingVendedores: RankingVendedor[];
  rankingSquads: RankingSquad[];
  vendas: VendaContrato[];
};

const QUERY = `
  SELECT
    fc.id AS id_contrato,
    cl.id AS id_cliente,
    cl.nome_fantasia,
    cl.tipo_pessoa2,
    cl.congelado,
    fc.data_contrato,
    fc.data_inicio_veiculacao,
    fc.valor_mensalidade_original AS valor,
    fc.cancelado,
    fc.lancamentos,
    fc.id_motivo_cancelamento,
    v.id AS id_vendedor,
    v.nome AS vendedor_nome,
    squad.name AS squad_nome,
    v2.nome AS treinador_nome,
    fm.pago
  FROM tb_cliente cl
  INNER JOIN tb_financeiro_contrato fc ON fc.id_cliente = cl.id
  INNER JOIN tb_vendedor v ON v.id = fc.id_vendedor
  LEFT JOIN crm_salesperson_allocation csa ON csa.id = (
    SELECT csai.id
    FROM crm_salesperson_allocation csai
    WHERE csai.salesperson_id = v.id
      AND fc.data_contrato BETWEEN csai.started_at AND COALESCE(csai.finished_at, ?)
    ORDER BY csai.started_at DESC, csai.id DESC
    LIMIT 1
  )
  LEFT JOIN crm_squad squad ON squad.id = csa.squad_id
  LEFT JOIN tb_vendedor_grupo vg ON vg.id_vendedor = v.id AND vg.deleted = 0 AND vg.perfil = 4
    AND fc.data_contrato >= vg.data_inicio AND (vg.data_fim IS NULL OR fc.data_contrato <= vg.data_fim)
  LEFT JOIN tb_vendedor v2 ON v2.id = vg.id_vendedor_pai AND v2.deleted = 0
  LEFT JOIN tb_financeiro_mensalidade fm ON fm.id = (
    SELECT fmi.id
    FROM tb_financeiro_mensalidade fmi
    WHERE fmi.id_contrato = fc.id
      AND fmi.deleted = 0
      AND fmi.parcela = 1
      AND fmi.bonificado = 0
      AND fmi.adicionado_automaticamente = 1
    ORDER BY fmi.id DESC
    LIMIT 1
  )
  WHERE cl.deleted = 0
    AND fc.deleted = 0
    AND fc.valor_mensalidade_original > 0.01
    AND fc.data_contrato BETWEEN ? AND ?
  ORDER BY fc.data_contrato ASC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
}

function diaKey(d: string | Date): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function mesKey(d: string | Date): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getVendasData(dataInicial: string, dataFinal: string): Promise<VendasData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [dataFinal, dataInicial, dataFinal]);

    const vendas: VendaContrato[] = (rows as any[]).map((r) => {
      const cancelado = Boolean(r.cancelado);
      const congeladaBase = Boolean(r.congelado);
      const pago = r.pago === null ? null : Boolean(r.pago);
      const foiReativado = r.id_motivo_cancelamento !== null && Number(r.id_motivo_cancelamento) === MOTIVO_REATIVADO;
      const canceladaEfetiva = cancelado && !foiReativado;
      const congelada = congeladaBase && !canceladaEfetiva && (pago === false || pago === null);
      const status: VendaContrato['status'] = canceladaEfetiva ? 'cancelada' : congelada ? 'congelada' : 'ativa';
      const diasParaVeiculacao = diasEntre(r.data_inicio_veiculacao, r.data_contrato);
      const paga = pago === true && !canceladaEfetiva && diasParaVeiculacao !== null && diasParaVeiculacao < 28;

      return {
        idContrato: r.id_contrato,
        idCliente: r.id_cliente,
        nomeFantasia: r.nome_fantasia,
        tipoPessoa: r.tipo_pessoa2,
        dataContrato: r.data_contrato,
        dataInicioVeiculacao: r.data_inicio_veiculacao,
        valor: toNum(r.valor),
        cancelado: canceladaEfetiva,
        lancamento: Boolean(r.lancamentos),
        congelado: congelada,
        idVendedor: r.id_vendedor,
        vendedorNome: r.vendedor_nome,
        squadNome: r.squad_nome,
        treinadorNome: r.treinador_nome,
        pago,
        status,
        paga,
      };
    });

    const diaMap = new Map<string, { qtdVendas: number; valor: number }>();
    const mesMap = new Map<string, { qtdVendas: number; valor: number }>();
    for (const v of vendas) {
      const dKey = diaKey(v.dataContrato);
      const mKey = mesKey(v.dataContrato);
      const dEntry = diaMap.get(dKey) ?? { qtdVendas: 0, valor: 0 };
      dEntry.qtdVendas += 1;
      dEntry.valor += v.valor;
      diaMap.set(dKey, dEntry);
      const mEntry = mesMap.get(mKey) ?? { qtdVendas: 0, valor: 0 };
      mEntry.qtdVendas += 1;
      mEntry.valor += v.valor;
      mesMap.set(mKey, mEntry);
    }

    const seriePorDia = Array.from(diaMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const seriePorMes = Array.from(mesMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    const vendedorMap = new Map<number, RankingVendedor>();
    for (const v of vendas) {
      const entry = vendedorMap.get(v.idVendedor) ?? {
        idVendedor: v.idVendedor,
        nome: v.vendedorNome,
        squadNome: v.squadNome,
        treinadorNome: v.treinadorNome,
        vendas: 0,
        ativas: 0,
        pagas: 0,
        congeladas: 0,
        canceladas: 0,
        valorTotal: 0,
        valorAtivas: 0,
        ticketMedio: 0,
      };
      entry.vendas += 1;
      entry.valorTotal += v.valor;
      if (v.status === 'ativa') {
        entry.ativas += 1;
        entry.valorAtivas += v.valor;
      } else if (v.status === 'congelada') {
        entry.congeladas += 1;
      } else {
        entry.canceladas += 1;
      }
      if (v.paga) entry.pagas += 1;
      vendedorMap.set(v.idVendedor, entry);
    }
    for (const entry of vendedorMap.values()) {
      entry.ticketMedio = entry.vendas > 0 ? entry.valorTotal / entry.vendas : 0;
    }
    const rankingVendedores = Array.from(vendedorMap.values()).sort((a, b) => b.vendas - a.vendas);

    const squadMap = new Map<string, RankingSquad>();
    for (const v of vendas) {
      const nome = v.squadNome ?? 'Sem squad';
      const entry = squadMap.get(nome) ?? { squadNome: nome, vendas: 0, ativas: 0, canceladas: 0, congeladas: 0, valorTotal: 0 };
      entry.vendas += 1;
      entry.valorTotal += v.valor;
      if (v.status === 'ativa') entry.ativas += 1;
      else if (v.status === 'congelada') entry.congeladas += 1;
      else entry.canceladas += 1;
      squadMap.set(nome, entry);
    }
    const rankingSquads = Array.from(squadMap.values()).sort((a, b) => b.vendas - a.vendas);

    const totalVendas = vendas.length;
    const valorTotal = vendas.reduce((s, v) => s + v.valor, 0);
    const ativas = vendas.filter((v) => v.status === 'ativa').length;
    const pagas = vendas.filter((v) => v.paga).length;
    const congeladas = vendas.filter((v) => v.status === 'congelada').length;
    const canceladas = vendas.filter((v) => v.status === 'cancelada').length;
    const valorAtivas = vendas.filter((v) => v.status === 'ativa').reduce((s, v) => s + v.valor, 0);
    const valores = vendas.map((v) => v.valor);

    const data: VendasData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      kpis: {
        totalVendas,
        valorTotal,
        ticketMedio: totalVendas > 0 ? valorTotal / totalVendas : 0,
        ativas,
        pagas,
        pendentes: ativas - pagas,
        congeladas,
        canceladas,
        valorAtivas,
        maiorVenda: valores.length ? Math.max(...valores) : 0,
        menorVenda: valores.length ? Math.min(...valores) : 0,
      },
      seriePorDia,
      seriePorMes,
      rankingVendedores,
      rankingSquads,
      vendas,
    };

    return data;
  } finally {
    await connection.end();
  }
}
