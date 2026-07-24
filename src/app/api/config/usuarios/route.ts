import { NextRequest, NextResponse } from 'next/server';
import { getAuthDb } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { requireAdminSession } from '@/lib/auth/guard';

export async function GET() {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const db = getAuthDb();
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.role_id as roleId, r.name as roleName
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.username`
    )
    .all();

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  try {
    const body = await request.json();
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    const roleId = Number(body?.roleId);

    if (!username || !password) {
      return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });
    }
    if (!roleId) {
      return NextResponse.json({ error: 'Selecione um papel.' }, { status: 400 });
    }

    const db = getAuthDb();
    const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId);
    if (!role) {
      return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)')
      .run(username, passwordHash, roleId);

    return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'Já existe um usuário com esse username.' }, { status: 409 });
    }
    console.error('[config/usuarios][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
