import { getDbConnection } from '@/lib/db';
import { diasUteisEntre } from './business-day';

const MOTIVO_REATIVADO = 16;

export type Segmento = 'imoveis' | 'veiculos' | 'outro';
export type StatusVenda = 'ativa' | 'congelada' | 'cancelada';
export type TipoContrato = 'todos' | 'usados' | 'lancamento';

function segmentoFromTipoPessoa2(tipoPessoa2: string | null): Segmento {
  if (tipoPessoa2 === 'IMOB' || tipoPessoa2 === 'CORRETOR') return 'imoveis';
  if (tipoPessoa2 === 'REVENDA_V' || tipoPessoa2 === 'REVENDA_VF') return 'veiculos';
  return 'outro';
}

export type VendaContrato = {
  idContrato: number;
  idCliente: number;
  nomeFantasia: string;
  tipoPessoa: string | null;
  segmento: Segmento;
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
  status: StatusVenda;
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

export type SequenciaVendedor = {
  idVendedor: number;
  nome: string;
  squadNome: string | null;
  treinadorNome: string | null;
  diasUteisNoPeriodo: number;
  diasSemVenda: number;
  vendeuTodoDia: boolean;
  ultimaVenda: string | null;
};

export type FiltrosVendas = { squads: string[]; treinadores: string[] };

export type VendasFiltros = {
  squad?: string;
  treinador?: string;
  tipo?: TipoContrato;
  status?: StatusVenda;
};

export type VendasData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string; segmento: Segmento | 'todos' };
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
    vendasUsados: number;
    valorUsados: number;
    vendasLancamento: number;
    valorLancamento: number;
  };
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  rankingVendedores: RankingVendedor[];
  rankingSquads: RankingSquad[];
  sequenciaVendedores: SequenciaVendedor[];
  vendas: VendaContrato[];
};

const QUERY = `
  SELECT
    fc.id AS id_contrato,
    cl.id AS id_cliente,
    cl.nome_fantasia,
    cl.tipo_pessoa2,
    (cc.id IS NOT NULL AND cc.data_descongelamento IS NULL) AS congelado,
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
  -- Fonte de verdade de congelamento/descongelamento é tb_cliente_congelamento (não tb_cliente.congelado,
  -- que é só a foto atual do cliente e diverge do que /congelamentos considera "ainda congelado").
  -- Pega o registro MAIS RECENTE deste contrato específico (nunca "qualquer aberto do cliente": ~800
  -- contratos têm congelamentos antigos nunca fechados quando o cliente recongelou depois, e cliente
  -- pode ter vários contratos ao longo do tempo — misturar isso reabre congelamento de contrato antigo
  -- não relacionado). "Ainda congelado" = o mais recente não tem data_descongelamento.
  LEFT JOIN tb_cliente_congelamento cc ON cc.id = (
    SELECT cci.id
    FROM tb_cliente_congelamento cci
    WHERE cci.id_contrato = fc.id
      AND cci.deleted = 0
    ORDER BY cci.id DESC
    LIMIT 1
  )
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

// Vendedores ativos "de carteira" na data de referência (mesmo critério do legado
// `getVendorsHasNoSales`) — sem essa lista, quem ficou zerado o período inteiro não
// aparece em nenhuma linha da query principal e sumiria da sequência de vendas.
const QUERY_VENDEDORES_ATIVOS = `
  SELECT
    v.id AS id_vendedor,
    v.nome AS vendedor_nome,
    squad.name AS squad_nome,
    v2.nome AS treinador_nome
  FROM tb_vendedor v
  LEFT JOIN crm_salesperson_allocation csa ON csa.id = (
    SELECT csai.id
    FROM crm_salesperson_allocation csai
    WHERE csai.salesperson_id = v.id
      AND ? BETWEEN csai.started_at AND COALESCE(csai.finished_at, ?)
    ORDER BY csai.started_at DESC, csai.id DESC
    LIMIT 1
  )
  LEFT JOIN crm_squad squad ON squad.id = csa.squad_id
  LEFT JOIN tb_vendedor_grupo vg ON vg.id_vendedor = v.id AND vg.deleted = 0 AND vg.perfil = 4
    AND ? >= vg.data_inicio AND (vg.data_fim IS NULL OR ? <= vg.data_fim)
  LEFT JOIN tb_vendedor v2 ON v2.id = vg.id_vendedor_pai AND v2.deleted = 0
  WHERE v.deleted = 0
    AND v.perfil = 0
    AND v.comissao_parcelas = 1
    AND v.comissao_parcela_inicial = 1
    AND v.data_fim IS NULL
  ORDER BY v.nome ASC
`;

const QUERY_FILTROS = `
  SELECT DISTINCT squad.name AS squad, v2.nome AS treinador
  FROM tb_financeiro_contrato fc
  INNER JOIN tb_vendedor v ON v.id = fc.id_vendedor
  LEFT JOIN crm_salesperson_allocation csa ON csa.id = (
    SELECT csai.id
    FROM crm_salesperson_allocation csai
    WHERE csai.salesperson_id = v.id
      AND fc.data_contrato BETWEEN csai.started_at AND COALESCE(csai.finished_at, NOW())
    ORDER BY csai.started_at DESC, csai.id DESC
    LIMIT 1
  )
  LEFT JOIN crm_squad squad ON squad.id = csa.squad_id
  LEFT JOIN tb_vendedor_grupo vg ON vg.id_vendedor = v.id AND vg.deleted = 0 AND vg.perfil = 4
    AND fc.data_contrato >= vg.data_inicio AND (vg.data_fim IS NULL OR fc.data_contrato <= vg.data_fim)
  LEFT JOIN tb_vendedor v2 ON v2.id = vg.id_vendedor_pai AND v2.deleted = 0
  WHERE fc.deleted = 0 AND fc.valor_mensalidade_original > 0.01
    AND (squad.name IS NOT NULL OR v2.nome IS NOT NULL)
  ORDER BY squad, treinador
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

type VendedorAtivoRow = { id_vendedor: number; vendedor_nome: string; squad_nome: string | null; treinador_nome: string | null };

/**
 * Dias úteis sem venda (contando de trás pra frente a partir do fim do período filtrado —
 * não é uma janela fixa até hoje) e se o vendedor vendeu em todos os dias úteis do período.
 * Inclui vendedores ativos sem nenhuma venda no período (`vendedoresAtivos`), igual ao legado.
 */
function calcularSequenciaVendedores(
  vendas: VendaContrato[],
  vendedoresAtivos: VendedorAtivoRow[],
  dataInicial: string,
  dataFinal: string,
  squad?: string,
  treinador?: string
): SequenciaVendedor[] {
  const diasUteis = diasUteisEntre(dataInicial, dataFinal);

  type Info = { vendedor: string; squad: string | null; treinador: string | null };
  const universo = new Map<number, Info>();
  for (const v of vendedoresAtivos) {
    if (squad && v.squad_nome !== squad) continue;
    if (treinador && v.treinador_nome !== treinador) continue;
    universo.set(v.id_vendedor, { vendedor: v.vendedor_nome, squad: v.squad_nome, treinador: v.treinador_nome });
  }

  const diasVendidos = new Map<number, Set<string>>();
  for (const v of vendas) {
    if (!universo.has(v.idVendedor)) {
      universo.set(v.idVendedor, { vendedor: v.vendedorNome, squad: v.squadNome, treinador: v.treinadorNome });
    }
    const dKey = diaKey(v.dataContrato);
    if (!diasUteis.includes(dKey)) continue;
    const dias = diasVendidos.get(v.idVendedor) ?? new Set<string>();
    dias.add(dKey);
    diasVendidos.set(v.idVendedor, dias);
  }

  const resultado: SequenciaVendedor[] = [];
  for (const [idVendedor, info] of universo) {
    const dias = diasVendidos.get(idVendedor) ?? new Set<string>();
    let diasSemVenda = 0;
    for (let i = diasUteis.length - 1; i >= 0; i--) {
      if (dias.has(diasUteis[i])) break;
      diasSemVenda += 1;
    }
    const ultimaVenda = [...dias].sort().at(-1) ?? null;
    resultado.push({
      idVendedor,
      nome: info.vendedor,
      squadNome: info.squad,
      treinadorNome: info.treinador,
      diasUteisNoPeriodo: diasUteis.length,
      diasSemVenda,
      vendeuTodoDia: diasUteis.length > 0 && diasUteis.every((d) => dias.has(d)),
      ultimaVenda,
    });
  }

  return resultado.sort((a, b) => b.diasSemVenda - a.diasSemVenda);
}

export async function getVendasData(
  dataInicial: string,
  dataFinal: string,
  segmento: Segmento | 'todos' = 'todos',
  filtros: VendasFiltros = {}
): Promise<VendasData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [dataFinal, dataInicial, dataFinal]);
    const [vendedoresAtivosRows] = await connection.query(QUERY_VENDEDORES_ATIVOS, [
      dataFinal, dataFinal, dataFinal, dataFinal,
    ]);

    let vendas: VendaContrato[] = (rows as any[]).map((r) => {
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
        segmento: segmentoFromTipoPessoa2(r.tipo_pessoa2),
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

    if (segmento !== 'todos') vendas = vendas.filter((v) => v.segmento === segmento);
    if (filtros.squad) vendas = vendas.filter((v) => v.squadNome === filtros.squad);
    if (filtros.treinador) vendas = vendas.filter((v) => v.treinadorNome === filtros.treinador);
    if (filtros.tipo && filtros.tipo !== 'todos') {
      vendas = vendas.filter((v) => v.segmento === 'imoveis' && v.lancamento === (filtros.tipo === 'lancamento'));
    }
    if (filtros.status) vendas = vendas.filter((v) => v.status === filtros.status);

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

    // Usados vs lançamento: só faz sentido dentro de imóveis, calculado sobre o conjunto já filtrado.
    const imoveisVendas = vendas.filter((v) => v.segmento === 'imoveis');
    const usadosVendas = imoveisVendas.filter((v) => !v.lancamento);
    const lancamentoVendas = imoveisVendas.filter((v) => v.lancamento);

    const sequenciaVendedores = calcularSequenciaVendedores(
      vendas,
      vendedoresAtivosRows as VendedorAtivoRow[],
      dataInicial,
      dataFinal,
      filtros.squad,
      filtros.treinador
    );

    const data: VendasData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal, segmento },
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
        vendasUsados: usadosVendas.length,
        valorUsados: usadosVendas.reduce((s, v) => s + v.valor, 0),
        vendasLancamento: lancamentoVendas.length,
        valorLancamento: lancamentoVendas.reduce((s, v) => s + v.valor, 0),
      },
      seriePorDia,
      seriePorMes,
      rankingVendedores,
      rankingSquads,
      sequenciaVendedores,
      vendas,
    };

    return data;
  } finally {
    await connection.end();
  }
}

export async function getFiltrosVendas(): Promise<FiltrosVendas> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY_FILTROS);
    const squads = new Set<string>();
    const treinadores = new Set<string>();
    for (const r of rows as any[]) {
      if (r.squad) squads.add(r.squad);
      if (r.treinador) treinadores.add(r.treinador);
    }
    return { squads: [...squads].sort(), treinadores: [...treinadores].sort() };
  } finally {
    await connection.end();
  }
}
