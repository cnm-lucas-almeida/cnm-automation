import { NextRequest, NextResponse } from 'next/server';
import { getAuthDb } from '@/lib/auth/db';
import { requireAdminSession } from '@/lib/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const { id } = await params;
  const roleId = Number(id);

  try {
    const body = await request.json();
    const name = body?.name !== undefined ? String(body.name).trim() : undefined;
    const screens: unknown = body?.screens;

    const db = getAuthDb();
    const role = db.prepare('SELECT id, is_admin as isAdmin FROM roles WHERE id = ?').get(roleId) as
      | { id: number; isAdmin: number }
      | undefined;
    if (!role) {
      return NextResponse.json({ error: 'Papel não encontrado.' }, { status: 404 });
    }

    db.exec('BEGIN');
    try {
      if (name) {
        db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name, roleId);
      }
      if (screens !== undefined) {
        if (!Array.isArray(screens) || !screens.every((s) => typeof s === 'string')) {
          throw new Error('screens deve ser uma lista de strings.');
        }
        db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
        const insertScreen = db.prepare('INSERT INTO role_permissions (role_id, screen_key) VALUES (?, ?)');
        for (const screen of screens) insertScreen.run(roleId, screen);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'Já existe um papel com esse nome.' }, { status: 409 });
    }
    console.error('[config/papeis/[id]][PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const { id } = await params;
  const roleId = Number(id);
  const db = getAuthDb();

  const role = db.prepare('SELECT id, is_admin as isAdmin FROM roles WHERE id = ?').get(roleId) as
    | { id: number; isAdmin: number }
    | undefined;
  if (!role) {
    return NextResponse.json({ error: 'Papel não encontrado.' }, { status: 404 });
  }
  if (role.isAdmin) {
    return NextResponse.json({ error: 'O papel Admin não pode ser removido.' }, { status: 400 });
  }

  const inUse = db.prepare('SELECT COUNT(*) as total FROM users WHERE role_id = ?').get(roleId) as { total: number };
  if (inUse.total > 0) {
    return NextResponse.json(
      { error: 'Existem usuários com esse papel — reatribua-os antes de remover.' },
      { status: 409 }
    );
  }

  db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
  return NextResponse.json({ ok: true });
}
