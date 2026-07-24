import { NextRequest, NextResponse } from 'next/server';
import { getAuthDb } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { requireAdminSession } from '@/lib/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const { id } = await params;
  const userId = Number(id);

  try {
    const body = await request.json();
    const roleId = body?.roleId !== undefined ? Number(body.roleId) : undefined;
    const password = body?.password !== undefined ? String(body.password) : undefined;

    const db = getAuthDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    }

    if (roleId !== undefined) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId);
      if (!role) {
        return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 });
      }
      db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(roleId, userId);
    }

    if (password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[config/usuarios/[id]][PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const { id } = await params;
  const userId = Number(id);

  if (userId === guard.session.userId) {
    return NextResponse.json({ error: 'Você não pode remover o próprio usuário.' }, { status: 400 });
  }

  const db = getAuthDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return NextResponse.json({ ok: true });
}
