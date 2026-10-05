import { getMetasPool } from '@/lib/db-metas';
import type { Feriado } from './types';

// Feriados cadastrados pelo RH além dos nacionais (municipais, pontes
// oficiais). Entram no DSR como dia de descanso — ver calendario.ts.
// Não mexem na detecção de falta do Secullum: quem trabalhou no feriado
// continua com as horas contadas normalmente.

// Colunas DATE voltam do node-postgres como Date — mesma armadilha de
// overrides.ts: sem converter, a comparação com string ISO nunca bate.
function paraDataISO(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString().split('T')[0] : String(valor);
}

interface FeriadoRow {
  id: number;
  data: unknown;
  descricao: string;
}

function mapFeriado(row: FeriadoRow): Feriado {
  return { id: row.id, data: paraDataISO(row.data), descricao: row.descricao };
}

export async function listarFeriados(ano?: number): Promise<Feriado[]> {
  const pool = getMetasPool();
  const { rows } = ano
    ? await pool.query<FeriadoRow>(
        `SELECT id, data, descricao FROM folha_pagamento_feriado
         WHERE EXTRACT(YEAR FROM data) = $1
         ORDER BY data`,
        [ano]
      )
    : await pool.query<FeriadoRow>(`SELECT id, data, descricao FROM folha_pagamento_feriado ORDER BY data`);
  return rows.map(mapFeriado);
}

export async function criarFeriado(data: string, descricao: string): Promise<Feriado> {
  const pool = getMetasPool();
  const { rows } = await pool.query<FeriadoRow>(
    `INSERT INTO folha_pagamento_feriado (data, descricao)
     VALUES ($1, $2)
     ON CONFLICT (data) DO UPDATE SET descricao = EXCLUDED.descricao
     RETURNING id, data, descricao`,
    [data, descricao]
  );
  return mapFeriado(rows[0]);
}

export async function removerFeriado(id: number): Promise<void> {
  const pool = getMetasPool();
  await pool.query(`DELETE FROM folha_pagamento_feriado WHERE id = $1`, [id]);
}

// Datas ISO (YYYY-MM-DD) dos feriados cadastrados no mês — vai para
// calcularDiasMes/calcularDiasPeriodo como `feriadosExtras`.
export async function buscarFeriadosDoMes(ano: number, mes: number): Promise<Set<string>> {
  const pool = getMetasPool();
  const { rows } = await pool.query<{ data: unknown }>(
    `SELECT data FROM folha_pagamento_feriado
     WHERE EXTRACT(YEAR FROM data) = $1 AND EXTRACT(MONTH FROM data) = $2`,
    [ano, mes]
  );
  return new Set(rows.map((r) => paraDataISO(r.data)));
}
