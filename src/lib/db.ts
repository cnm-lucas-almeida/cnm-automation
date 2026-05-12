import mysql from 'mysql2/promise';

export async function getDbConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || '3306', 10),
    });
    return connection;
  } catch (err: any) {
    if (err && typeof err === 'object' && 'errors' in err) {
      const msgs = err.errors.map((e: any) => e.message).join(' | ');
      throw new Error(`Falha de conexão MySQL: ${msgs}`);
    }
    throw err;
  }
}
