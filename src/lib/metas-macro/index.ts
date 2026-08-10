import { getMetasPool } from '@/lib/db-metas';
import type { Segmento } from '@/lib/metas';
import { mesReferenciaDe } from '@/lib/metas';

export type MetaMacro = {
  id: number;
  segmento: Segmento;
  mesReferencia: string;
  metaEstoqueTotal: number;
  metaFinanceiraTotal: number;
  metaPvTotal: number;
  faturamentoTotal: number;
  estoqueUsados: number;
  acrescimoUsados: number;
  estoqueCarregadoMes: number;
  estoqueACarregar: number;
  estoqueSaiu: number;
  clientesAtivos: number;
  cancelamentosPv: number;
  cancelamentosValor: number;
  fichaLancamento: number;
  vendidas: number;
  acrescimoLancamentos: number;
  headcountIdeal: number;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: any): MetaMacro {
  return {
    id: r.id,
    segmento: r.segmento,
    mesReferencia: mesReferenciaDe(r.mes_referencia),
    metaEstoqueTotal: Number(r.meta_estoque_total),
    metaFinanceiraTotal: Number(r.meta_financeira_total),
    metaPvTotal: Number(r.meta_pv_total),
    faturamentoTotal: Number(r.faturamento_total),
    estoqueUsados: Number(r.estoque_usados),
    acrescimoUsados: Number(r.acrescimo_usados),
    estoqueCarregadoMes: Number(r.estoque_carregado_mes),
    estoqueACarregar: Number(r.estoque_a_carregar),
    estoqueSaiu: Number(r.estoque_saiu),
    clientesAtivos: Number(r.clientes_ativos),
    cancelamentosPv: Number(r.cancelamentos_pv),
    cancelamentosValor: Number(r.cancelamentos_valor),
    fichaLancamento: Number(r.ficha_lancamento),
    vendidas: Number(r.vendidas),
    acrescimoLancamentos: Number(r.acrescimo_lancamentos),
    headcountIdeal: Number(r.headcount_ideal),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Busca o registro macro manual de um segmento/mês — null se ainda não foi preenchido. */
export async function buscarMetaMacro(segmento: Segmento, mesReferencia: string): Promise<MetaMacro | null> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    'SELECT * FROM metas_macro WHERE segmento = $1 AND mes_referencia = $2',
    [segmento, mesReferenciaDe(mesReferencia)]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Histórico completo de um segmento, mais antigo primeiro — base da tendência mensal do bloco macro. */
export async function listarHistoricoMetaMacro(segmento: Segmento): Promise<MetaMacro[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    'SELECT * FROM metas_macro WHERE segmento = $1 ORDER BY mes_referencia',
    [segmento]
  );
  return rows.map(mapRow);
}

export type SalvarMetaMacroInput = {
  segmento: Segmento;
  mesReferencia: string;
  metaEstoqueTotal: number;
  metaFinanceiraTotal: number;
  metaPvTotal: number;
  faturamentoTotal: number;
  estoqueUsados: number;
  acrescimoUsados: number;
  estoqueCarregadoMes: number;
  estoqueACarregar: number;
  estoqueSaiu: number;
  clientesAtivos: number;
  cancelamentosPv: number;
  cancelamentosValor: number;
  fichaLancamento: number;
  vendidas: number;
  acrescimoLancamentos: number;
  headcountIdeal: number;
};

/** Cria ou substitui (upsert) o registro macro manual de um segmento/mês. */
export async function salvarMetaMacro(input: SalvarMetaMacroInput): Promise<MetaMacro> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO metas_macro (
      segmento, mes_referencia, meta_estoque_total, meta_financeira_total, meta_pv_total,
      faturamento_total, estoque_usados, acrescimo_usados, estoque_carregado_mes, estoque_a_carregar, estoque_saiu,
      clientes_ativos, cancelamentos_pv, cancelamentos_valor, ficha_lancamento, vendidas, acrescimo_lancamentos, headcount_ideal
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (segmento, mes_referencia) DO UPDATE SET
      meta_estoque_total = EXCLUDED.meta_estoque_total,
      meta_financeira_total = EXCLUDED.meta_financeira_total,
      meta_pv_total = EXCLUDED.meta_pv_total,
      faturamento_total = EXCLUDED.faturamento_total,
      estoque_usados = EXCLUDED.estoque_usados,
      acrescimo_usados = EXCLUDED.acrescimo_usados,
      estoque_carregado_mes = EXCLUDED.estoque_carregado_mes,
      estoque_a_carregar = EXCLUDED.estoque_a_carregar,
      estoque_saiu = EXCLUDED.estoque_saiu,
      clientes_ativos = EXCLUDED.clientes_ativos,
      cancelamentos_pv = EXCLUDED.cancelamentos_pv,
      cancelamentos_valor = EXCLUDED.cancelamentos_valor,
      ficha_lancamento = EXCLUDED.ficha_lancamento,
      vendidas = EXCLUDED.vendidas,
      acrescimo_lancamentos = EXCLUDED.acrescimo_lancamentos,
      headcount_ideal = EXCLUDED.headcount_ideal,
      updated_at = now()
    RETURNING *`,
    [
      input.segmento, mesReferenciaDe(input.mesReferencia), input.metaEstoqueTotal, input.metaFinanceiraTotal, input.metaPvTotal,
      input.faturamentoTotal, input.estoqueUsados, input.acrescimoUsados, input.estoqueCarregadoMes, input.estoqueACarregar, input.estoqueSaiu,
      input.clientesAtivos, input.cancelamentosPv, input.cancelamentosValor, input.fichaLancamento, input.vendidas, input.acrescimoLancamentos, input.headcountIdeal,
    ]
  );
  return mapRow(rows[0]);
}
