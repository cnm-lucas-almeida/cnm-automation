import { DatabaseSync } from 'node:sqlite';
import path from 'path';

let db: DatabaseSync | null = null;

export function getAuthDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(path.join(process.cwd(), 'data', 'auth.db'));
  }
  return db;
}
