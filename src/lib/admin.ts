import fs from 'fs';
import path from 'path';

export function isAdmin(): boolean {
  return process.env.IS_ADMIN === 'true';
}

// Lista de rotas públicas vive num arquivo versionado (não no .env), para que a
// configuração feita na tela de Configurações vá junto no commit/deploy.
const PUBLIC_ROUTES_FILE = path.join(process.cwd(), 'config', 'public-routes.json');

export function getPublicRoutes(): string[] {
  try {
    const raw = fs.readFileSync(PUBLIC_ROUTES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function setPublicRoutes(routes: string[]): void {
  const normalized = Array.from(new Set(routes.map((r) => r.trim()).filter(Boolean)));
  fs.writeFileSync(PUBLIC_ROUTES_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
}

function publicRoutePrefixes(): string[] {
  return getPublicRoutes();
}

// Aceita tanto a rota da página ("/vendas") quanto a de API ("/api/vendas") sem
// precisar listar as duas — normaliza removendo o prefixo /api antes de comparar.
function normalize(pathname: string): string {
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

export function isPublicRoute(pathname: string): boolean {
  const normalized = normalize(pathname);
  return publicRoutePrefixes().some((p) => normalized === p || normalized.startsWith(`${p}/`));
}

export function canAccess(pathname: string): boolean {
  return isAdmin() || isPublicRoute(pathname);
}
