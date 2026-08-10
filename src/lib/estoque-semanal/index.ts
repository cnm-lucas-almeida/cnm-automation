import { getDbConnection } from '@/lib/db';
import { getVendasData, type Segmento, type VendasFiltros, type VendaContrato } from '@/lib/vendas';

export type LinhaEstoqueSemanal = {
  idVendedor: number;
  nome: string;
  squadNome: string | null;
  treinadorNome: string | null;
  totalVendas: number;
  totalCongeladas: number;
  totalCanceladas: number;
  totalAtivas: number;
  totalPagas: number;
  naoPagas: number;
  totalPendentes: number;
  valorTotal: number;
  valorTotalAtivas: number;
  valorPago: number;
  valorPendente: number;
  valorCongelado: number;
  valorCancelado: number;
  ticketMedio: number;
  ticketMedioAtivas: number;
  maiorVenda: number;
  menorVenda: number;
  qtdAnuncios: number;
};

export type EstoqueSemanalData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string; segmento: Segmento | 'todos' };
  linhas: LinhaEstoqueSemanal[];
};

type Acumulador = Omit<LinhaEstoqueSemanal, 'ticketMedio' | 'ticketMedioAtivas' | 'qtdAnuncios'> & {
  valores: number[];
  valoresAtivas: number[];
};

/** "Não paga" = 1ª parcela vencida sem pagamento (mesma fórmula do admin `relatorio_vendas_vendedor`,
 * sem os bugs documentados em BUGS_RELATORIO_VENDAS_VENDEDOR.md) — recorte por vencimento, não é o
 * inverso de "paga" nem de "pendente" (ver CONEXOES.md da skill relatorio-comercial). */
function naoPaga(venda: VendaContrato, hoje: Date): boolean {
  if (venda.pago !== false || !venda.dataVencimentoPrimeiraParcela) return false;
  return new Date(venda.dataVencimentoPrimeiraParcela) < hoje;
}

/** Estoque (qtd_imoveis/qtd_veiculos do plano ativo) por id_cliente — mesmo padrão de `/inside-sales`
 * (ROW_NUMBER PARTITION BY id_cliente WHERE ativo=1), aqui restrito aos clientes informados. */
async function buscarEstoquePorCliente(idsClientes: number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (idsClientes.length === 0) return mapa;

  const connection = await getDbConnection();
  try {
    const placeholders = idsClientes.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT
        c.id AS id_cliente,
        COALESCE(ipa.qtd_imoveis, vpa.qtd_veiculos) AS estoque
      FROM tb_cliente c
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id_cliente ORDER BY id DESC) as rn
        FROM tb_imovel_plano_assinatura_cliente WHERE ativo = 1 AND deleted = 0
      ) ipac ON ipac.id_cliente = c.id AND ipac.rn = 1
      LEFT JOIN tb_imovel_plano_assinatura ipa ON ipa.id = ipac.id_imovel_plano_assinatura
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id_cliente ORDER BY id DESC) as rn
        FROM tb_veiculo_plano_assinatura_cliente WHERE ativo = 1 AND deleted = 0
      ) vpac ON vpac.id_cliente = c.id AND vpac.rn = 1
      LEFT JOIN tb_veiculo_plano_assinatura vpa ON vpa.id = vpac.id_veiculo_plano_assinatura
      WHERE c.id IN (${placeholders})`,
      idsClientes
    );
    for (const r of rows as any[]) {
      mapa.set(r.id_cliente, r.estoque === null ? 0 : Number(r.estoque));
    }
    return mapa;
  } finally {
    await connection.end();
  }
}

export async function getEstoqueSemanalData(
  dataInicial: string,
  dataFinal: string,
  segmento: Segmento | 'todos' = 'todos',
  filtros: VendasFiltros = {}
): Promise<EstoqueSemanalData> {
  const vendasData = await getVendasData(dataInicial, dataFinal, segmento, filtros);
  const hoje = new Date();

  const acumuladores = new Map<number, Acumulador>();
  for (const v of vendasData.vendas) {
    const entry = acumuladores.get(v.idVendedor) ?? {
      idVendedor: v.idVendedor,
      nome: v.vendedorNome,
      squadNome: v.squadNome,
      treinadorNome: v.treinadorNome,
      totalVendas: 0,
      totalCongeladas: 0,
      totalCanceladas: 0,
      totalAtivas: 0,
      totalPagas: 0,
      naoPagas: 0,
      totalPendentes: 0,
      valorTotal: 0,
      valorTotalAtivas: 0,
      valorPago: 0,
      valorPendente: 0,
      valorCongelado: 0,
      valorCancelado: 0,
      maiorVenda: 0,
      menorVenda: 0,
      valores: [],
      valoresAtivas: [],
    };

    entry.totalVendas += 1;
    entry.valorTotal += v.valor;
    entry.valores.push(v.valor);

    if (v.status === 'ativa') {
      entry.totalAtivas += 1;
      entry.valorTotalAtivas += v.valor;
      entry.valoresAtivas.push(v.valor);
      if (v.paga) {
        entry.totalPagas += 1;
        entry.valorPago += v.valor;
      } else {
        entry.valorPendente += v.valor;
      }
    } else if (v.status === 'congelada') {
      entry.totalCongeladas += 1;
      entry.valorCongelado += v.valor;
    } else {
      entry.totalCanceladas += 1;
      entry.valorCancelado += v.valor;
    }

    if (naoPaga(v, hoje)) entry.naoPagas += 1;

    acumuladores.set(v.idVendedor, entry);
  }

  // Estoque somado só sobre as vendas ativas (mesmo espírito do admin original, mas usando
  // nossa definição corrigida de "ativa" — se o mesmo cliente tiver 2 contratos ativos com o
  // mesmo vendedor no período, o estoque dele entra 2x, igual ao admin).
  const idsClientesAtivos = [...new Set(vendasData.vendas.filter((v) => v.status === 'ativa').map((v) => v.idCliente))];
  const estoquePorCliente = await buscarEstoquePorCliente(idsClientesAtivos);
  const qtdAnunciosPorVendedor = new Map<number, number>();
  for (const v of vendasData.vendas) {
    if (v.status !== 'ativa') continue;
    const estoque = estoquePorCliente.get(v.idCliente) ?? 0;
    qtdAnunciosPorVendedor.set(v.idVendedor, (qtdAnunciosPorVendedor.get(v.idVendedor) ?? 0) + estoque);
  }

  const linhas: LinhaEstoqueSemanal[] = Array.from(acumuladores.values()).map((a) => ({
    idVendedor: a.idVendedor,
    nome: a.nome,
    squadNome: a.squadNome,
    treinadorNome: a.treinadorNome,
    totalVendas: a.totalVendas,
    totalCongeladas: a.totalCongeladas,
    totalCanceladas: a.totalCanceladas,
    totalAtivas: a.totalAtivas,
    totalPagas: a.totalPagas,
    naoPagas: a.naoPagas,
    totalPendentes: a.totalAtivas - a.totalPagas,
    valorTotal: a.valorTotal,
    valorTotalAtivas: a.valorTotalAtivas,
    valorPago: a.valorPago,
    valorPendente: a.valorPendente,
    valorCongelado: a.valorCongelado,
    valorCancelado: a.valorCancelado,
    ticketMedio: a.totalVendas > 0 ? a.valorTotal / a.totalVendas : 0,
    ticketMedioAtivas: a.totalAtivas > 0 ? a.valorTotalAtivas / a.totalAtivas : 0,
    maiorVenda: a.valores.length ? Math.max(...a.valores) : 0,
    menorVenda: a.valores.length ? Math.min(...a.valores) : 0,
    qtdAnuncios: qtdAnunciosPorVendedor.get(a.idVendedor) ?? 0,
  }));

  linhas.sort((a, b) => b.totalVendas - a.totalVendas);

  return {
    generatedAt: new Date().toISOString(),
    periodo: { dataInicial, dataFinal, segmento },
    linhas,
  };
}
