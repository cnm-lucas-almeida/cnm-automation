import { getMetasPool } from '@/lib/db-metas';
import { getDbConnection } from '@/lib/db';

export type CidadeFoco = {
  id: number;
  idCidade: number;
  nomeCidade: string;
  siglaUf: string;
  /** Agrupamento/campanha (ex.: "SUL", "SP ESTADO", "REATIVAÇÃO", "BRASIL + 500") — uma cidade pode ter várias linhas, uma por categoria. */
  categoria: string;
  createdAt: string;
};

export type CidadeAdmin = {
  idCidade: number;
  nomeCidade: string;
  siglaUf: string;
};

const CATEGORIA_PADRAO = 'FOCO';

function mapRow(r: any): CidadeFoco {
  return {
    id: r.id,
    idCidade: r.id_cidade,
    nomeCidade: r.nome_cidade,
    siglaUf: r.sigla_uf,
    categoria: r.categoria,
    createdAt: r.created_at,
  };
}

export async function listarCidadesFoco(): Promise<CidadeFoco[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query('SELECT * FROM cidade_foco ORDER BY nome_cidade, categoria');
  return rows.map(mapRow);
}

/** Conjunto de id_cidade marcados como foco — usado pela lib de fila-leads pra checar pertencimento. */
export async function buscarIdsCidadesFoco(): Promise<Set<number>> {
  const pool = getMetasPool();
  const { rows } = await pool.query('SELECT id_cidade FROM cidade_foco');
  return new Set(rows.map((r: any) => r.id_cidade));
}

export async function criarCidadeFoco(input: CidadeAdmin & { categoria?: string }): Promise<CidadeFoco> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO cidade_foco (id_cidade, nome_cidade, sigla_uf, categoria) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.idCidade, input.nomeCidade, input.siglaUf, input.categoria || CATEGORIA_PADRAO]
  );
  return mapRow(rows[0]);
}

export async function removerCidadeFoco(id: number): Promise<boolean> {
  const pool = getMetasPool();
  const { rowCount } = await pool.query('DELETE FROM cidade_foco WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** Busca cidades no admin (MySQL) por nome, pro seletor de cadastro — exclui as já marcadas como foco. */
export async function buscarCidadesAdmin(query: string): Promise<CidadeAdmin[]> {
  const connection = await getDbConnection();
  try {
    const termo = `%${query}%`;
    const [rows] = await connection.query(
      `SELECT cid.id AS id_cidade, cid.nome_cidade, uf.sigla_uf
       FROM tb_cidade cid
       JOIN tb_uf uf ON uf.id = cid.id_uf
       WHERE cid.nome_cidade LIKE ?
       ORDER BY cid.nome_cidade
       LIMIT 30`,
      [termo]
    );
    return (rows as any[]).map((r) => ({
      idCidade: r.id_cidade,
      nomeCidade: r.nome_cidade,
      siglaUf: r.sigla_uf,
    }));
  } finally {
    await connection.end();
  }
}
