import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const dbPath = fileURLToPath(new URL('../data/auth.db', import.meta.url));
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const dir = new URL('../migrations/auth/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} já aplicada, pulando.`);
      continue;
    }
    const sql = readFileSync(new URL(file, dir), 'utf-8');
    console.log(`> aplicando ${file}...`);
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      console.log('  ok.');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  console.log('Migrations concluídas.');
} finally {
  db.close();
}
