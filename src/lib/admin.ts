export function isAdmin(): boolean {
  return process.env.IS_ADMIN === 'true';
}

function publicRoutePrefixes(): string[] {
  return (process.env.PUBLIC_ROUTES ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
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
