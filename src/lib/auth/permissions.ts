import { getAuthDb } from './db';
import { pathAllowed } from './screen-access';
import type { Session } from './session';

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

  return pathAllowed(pathname, getAllowedScreens(session.roleId));
}
