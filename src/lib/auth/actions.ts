'use server';

import { redirect } from 'next/navigation';
import { getAuthDb } from './db';
import { verifyPassword } from './password';
import { createSession, destroySession } from './session';

export type LoginState = { error?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) {
    return { error: 'Informe usuário e senha.' };
  }

  const db = getAuthDb();
  const user = db
    .prepare('SELECT id, password_hash as passwordHash FROM users WHERE username = ?')
    .get(username) as { id: number; passwordHash: string } | undefined;

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Usuário ou senha inválidos.' };
  }

  await createSession(user.id);
  redirect('/');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}
