import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes, scryptSync } from 'crypto';
import { DatabaseSync } from 'node:sqlite';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const username = env.ADMIN_USERNAME;
const password = env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('Defina ADMIN_USERNAME e ADMIN_PASSWORD no .env antes de rodar este script.');
  process.exit(1);
}

function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const dbPath = fileURLToPath(new URL('../data/auth.db', import.meta.url));
const db = new DatabaseSync(dbPath);

try {
  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
  if (!adminRole) {
    console.error("Papel 'Admin' não encontrado — rode `npm run migrate:auth` primeiro.");
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role_id = ? WHERE id = ?')
      .run(passwordHash, adminRole.id, existing.id);
    console.log(`Usuário admin "${username}" atualizado.`);
  } else {
    db.prepare('INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)')
      .run(username, passwordHash, adminRole.id);
    console.log(`Usuário admin "${username}" criado.`);
  }
} finally {
  db.close();
}
