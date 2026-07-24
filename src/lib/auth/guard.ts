import { NextResponse } from 'next/server';
import { getSession, type Session } from './session';

export async function requireAdminSession(): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (!session?.isAdmin) {
    return { response: NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 }) };
  }
  return { session };
}
