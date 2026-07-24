import { getAuthDb } from './db';
import type { Session } from './session';

// Aceita tanto a rota da página ("/vendas") quanto a de API ("/api/vendas") sem
// precisar listar as duas — normaliza removendo o prefixo /api antes de comparar.
function normalize(pathname: string): string {
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

function matchesPrefix(normalized: string, prefixes: string[]): boolean {
  return prefixes.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}

export function getAllowedScreens(roleId: number): string[] {
  const db = getAuthDb();
  const rows = db
    .prepare('SELECT screen_key as screenKey FROM role_permissions WHERE role_id = ?')
    .all(roleId) as { screenKey: string }[];
  return rows.map((r) => r.screenKey);
}

export function canAccessScreen(session: Session | null, pathname: string): boolean {
  if (!session) return false;
  if (session.isAdmin) return true;

  return matchesPrefix(normalize(pathname), getAllowedScreens(session.roleId));
}
