import { NextRequest, NextResponse } from 'next/server';
import { getAuthDb } from '@/lib/auth/db';
import { requireAdminSession } from '@/lib/auth/guard';

type RoleRow = { id: number; name: string; isAdmin: number };

function serializeRole(db: ReturnType<typeof getAuthDb>, role: RoleRow) {
  const screens = db
    .prepare('SELECT screen_key as screenKey FROM role_permissions WHERE role_id = ?')
    .all(role.id) as { screenKey: string }[];
  return {
    id: role.id,
    name: role.name,
    isAdmin: !!role.isAdmin,
    screens: screens.map((s) => s.screenKey),
  };
}

export async function GET() {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  const db = getAuthDb();
  const roles = db.prepare('SELECT id, name, is_admin as isAdmin FROM roles ORDER BY name').all() as RoleRow[];
  return NextResponse.json({ roles: roles.map((r) => serializeRole(db, r)) });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminSession();
  if ('response' in guard) return guard.response;

  try {
    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const screens: unknown = body?.screens ?? [];

    if (!name) {
      return NextResponse.json({ error: 'Informe um nome para o papel.' }, { status: 400 });
    }
    if (!Array.isArray(screens) || !screens.every((s) => typeof s === 'string')) {
      return NextResponse.json({ error: 'screens deve ser uma lista de strings.' }, { status: 400 });
    }

    const db = getAuthDb();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO roles (name) VALUES (?)').run(name);
      const role = db.prepare('SELECT id, name, is_admin as isAdmin FROM roles WHERE name = ?').get(name) as RoleRow;
      const insertScreen = db.prepare('INSERT INTO role_permissions (role_id, screen_key) VALUES (?, ?)');
      for (const screen of screens) insertScreen.run(role.id, screen);
      db.exec('COMMIT');
      return NextResponse.json({ role: serializeRole(db, role) }, { status: 201 });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'Já existe um papel com esse nome.' }, { status: 409 });
    }
    console.error('[config/papeis][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
