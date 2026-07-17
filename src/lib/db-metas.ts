import { Pool } from 'pg';

let pool: Pool | null = null;

export function getMetasPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.METAS_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
