import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  port: parseInt(env.DB_PORT || '3306', 10),
});

try {
  const [cnt] = await conn.query('SELECT COUNT(*) AS n FROM cart_recovery_touch');
  console.log('cart_recovery_touch rows:', cnt[0].n);

  const [idx] = await conn.query('SHOW INDEX FROM cart_recovery_touch');
  console.log('Indexes on cart_recovery_touch:', idx.map(i => `${i.Key_name}(${i.Column_name})`).join(', '));

  const [cols] = await conn.query('DESCRIBE cart_recovery_touch');
  console.log('cart_recovery_touch columns:', cols.map(c => c.Field).join(', '));

  const [colsCr] = await conn.query('DESCRIBE cart_recovery');
  console.log('cart_recovery columns:', colsCr.map(c => c.Field).join(', '));
} finally {
  await conn.end();
}
