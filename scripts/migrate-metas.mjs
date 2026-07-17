import { readFileSync, readdirSync } from 'fs';
import { Client } from 'pg';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const client = new Client({
  connectionString: env.METAS_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const dir = new URL('../migrations/metas/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`- ${file} já aplicada, pulando.`);
      continue;
    }
    const sql = readFileSync(new URL(file, dir), 'utf-8');
    console.log(`> aplicando ${file}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ok.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  console.log('Migrations concluídas.');
} finally {
  await client.end();
}
