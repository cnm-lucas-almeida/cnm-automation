import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getAuthDb } from './db';

const COOKIE_NAME = 'cnm_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type Session = {
  userId: number;
  username: string;
  roleId: number;
  isAdmin: boolean;
};

export async function createSession(userId: number): Promise<void> {
  const db = getAuthDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt.toISOString());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    getAuthDb().prepare('DELETE FROM sessions WHERE id = ?').run(token);
  }

  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  return getSessionByToken(token);
}

export function getSessionByToken(token: string): Session | null {
  const db = getAuthDb();
  const row = db
    .prepare(
      `SELECT s.expires_at as expiresAt, u.id as userId, u.username as username,
              u.role_id as roleId, r.is_admin as isAdmin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.id = ?`
    )
    .get(token) as
    | { expiresAt: string; userId: number; username: string; roleId: number; isAdmin: number }
    | undefined;

  if (!row) return null;

  if (new Date(row.expiresAt) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
    return null;
  }

  return {
    userId: row.userId,
    username: row.username,
    roleId: row.roleId,
    isAdmin: !!row.isAdmin,
  };
}

export const COOKIE_NAME_SESSION = COOKIE_NAME;
