// Lógica pura de "esse path está liberado pra essas telas?" — sem banco, pra dar teste.

// Aceita tanto a rota da página ("/vendas") quanto a de API ("/api/vendas") sem
// precisar listar as duas — normaliza removendo o prefixo /api antes de comparar.
function normalize(pathname: string): string {
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

function matchesPrefix(normalized: string, prefixes: string[]): boolean {
  return prefixes.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}

// As rotas de API não espelham o caminho das telas (a tela /financeiro/dre consome
// /api/dre), então o prefixo normalizado nunca bate com a screen_key e o papel
// não-admin toma 403 mesmo com a tela liberada. Aqui ficam as exceções:
// prefixo de API -> telas que dão acesso a ele.
const API_EXTRA_SCREENS: Record<string, string[]> = {
  '/dre/projecao': ['/financeiro/projecao'],
  '/dre': ['/financeiro/dre'],
  '/quadro-comercial': ['/financeiro/quadro-comercial'],
  '/campanhas': ['/marketing/campanhas'],
  '/vendas/filtros': ['/estoque-semanal'],
  '/config/automacoes': ['/configuracoes/automacoes'],
  '/config/cidades-foco': ['/configuracoes/cidades-foco'],
  '/config/metas': ['/configuracoes/comercial/metas'],
  '/config/metas-macro': ['/configuracoes/comercial/metas-macro'],
};

export function pathAllowed(pathname: string, allowed: string[]): boolean {
  const normalized = normalize(pathname);
  if (matchesPrefix(normalized, allowed)) return true;

  return Object.entries(API_EXTRA_SCREENS).some(
    ([apiPrefix, screens]) =>
      matchesPrefix(normalized, [apiPrefix]) && screens.some((s) => allowed.includes(s))
  );
}
