import { getMetasPool } from '@/lib/db-metas';
import { getDbConnection } from '@/lib/db';

export type Segmento = 'imoveis' | 'veiculos';

export type MetaSquad = {
  id: number;
  squadId: number;
  squadNome: string;
  segmento: Segmento;
  mesReferencia: string;
  metaEstoqueDia: number;
  metaEstoqueSemana: number;
  metaEstoqueMes: number;
  metaFinanceiraDia: number;
  metaFinanceiraSemana: number;
  metaFinanceiraMes: number;
  metaPvDia: number;
  metaPvSemana: number;
  metaPvMes: number;
  createdAt: string;
  updatedAt: string;
};

export type SquadAdmin = {
  id: number;
  nome: string;
  segmento: Segmento;
};

const DIAS_UTEIS_SEMANA = 5;
const DIAS_UTEIS_MES = 20;

function mapRow(r: any): MetaSquad {
  const metaEstoqueDia = Number(r.meta_estoque_dia);
  const metaFinanceiraDia = Number(r.meta_financeira_dia);
  const metaPvDia = Number(r.meta_pv_dia);
  return {
    id: r.id,
    squadId: r.squad_id,
    squadNome: r.squad_nome,
    segmento: r.segmento,
    mesReferencia: mesReferenciaDe(r.mes_referencia),
    metaEstoqueDia,
    metaEstoqueSemana: metaEstoqueDia * DIAS_UTEIS_SEMANA,
    metaEstoqueMes: metaEstoqueDia * DIAS_UTEIS_MES,
    metaFinanceiraDia,
    metaFinanceiraSemana: metaFinanceiraDia * DIAS_UTEIS_SEMANA,
    metaFinanceiraMes: metaFinanceiraDia * DIAS_UTEIS_MES,
    metaPvDia,
    metaPvSemana: metaPvDia * DIAS_UTEIS_SEMANA,
    metaPvMes: metaPvDia * DIAS_UTEIS_MES,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Primeiro dia do mês (formato YYYY-MM-01) a partir de qualquer data dentro do mês.
 * Aceita string ISO ou `Date` — colunas `DATE` do Postgres voltam como objeto `Date`, não string.
 */
export function mesReferenciaDe(data: string | Date): string {
  const iso = data instanceof Date ? data.toISOString() : data;
  return `${iso.slice(0, 7)}-01`;
}

/** Metas cadastradas para um mês (padrão: mês atual) — usado tanto pelo cadastro quanto pelo `/inside-sales`. */
export async function listarMetas(mesReferencia: string = mesReferenciaDe(new Date().toISOString())): Promise<MetaSquad[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    'SELECT * FROM metas_squad WHERE mes_referencia = $1 ORDER BY segmento, squad_nome',
    [mesReferencia]
  );
  return rows.map(mapRow);
}

/** Todos os meses com meta cadastrada para um squad, mais antigo primeiro — base da tendência mensal. */
export async function listarHistoricoMeta(squadId: number): Promise<MetaSquad[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    'SELECT * FROM metas_squad WHERE squad_id = $1 ORDER BY mes_referencia',
    [squadId]
  );
  return rows.map(mapRow);
}

export type CriarMetaInput = {
  squadId: number;
  squadNome: string;
  segmento: Segmento;
  mesReferencia: string;
  metaEstoqueDia: number;
  metaFinanceiraDia: number;
  metaPvDia: number;
};

export async function criarMeta(input: CriarMetaInput): Promise<MetaSquad> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO metas_squad (squad_id, squad_nome, segmento, mes_referencia, meta_estoque_dia, meta_financeira_dia, meta_pv_dia)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.squadId, input.squadNome, input.segmento, input.mesReferencia, input.metaEstoqueDia, input.metaFinanceiraDia, input.metaPvDia]
  );
  return mapRow(rows[0]);
}

export type AtualizarMetaInput = {
  metaEstoqueDia: number;
  metaFinanceiraDia: number;
  metaPvDia: number;
};

export async function atualizarMeta(id: number, input: AtualizarMetaInput): Promise<MetaSquad | null> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `UPDATE metas_squad SET meta_estoque_dia = $1, meta_financeira_dia = $2, meta_pv_dia = $3, updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [input.metaEstoqueDia, input.metaFinanceiraDia, input.metaPvDia, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function excluirMeta(id: number): Promise<boolean> {
  const pool = getMetasPool();
  const { rowCount } = await pool.query('DELETE FROM metas_squad WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** Squads ativos vindos do admin (crm_squad, MySQL) para o seletor de cadastro de metas. */
export async function listarSquadsAdmin(): Promise<SquadAdmin[]> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(
      `SELECT id, name, vertical_id FROM crm_squad WHERE deleted = 0 AND ativo = 1 ORDER BY name`
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      nome: r.name,
      segmento: r.vertical_id === 2 ? 'veiculos' : 'imoveis',
    }));
  } finally {
    await connection.end();
  }
}
