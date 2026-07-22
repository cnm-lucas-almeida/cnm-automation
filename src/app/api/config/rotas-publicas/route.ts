import { NextRequest, NextResponse } from 'next/server';
import { getPublicRoutes, setPublicRoutes } from '@/lib/admin';

export async function GET() {
  return NextResponse.json({ routes: getPublicRoutes() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const routes = body?.routes;

    if (!Array.isArray(routes) || !routes.every((r) => typeof r === 'string')) {
      return NextResponse.json({ error: 'routes deve ser uma lista de strings' }, { status: 400 });
    }

    const invalida = routes.find((r) => r.trim() && !r.trim().startsWith('/'));
    if (invalida) {
      return NextResponse.json({ error: `Rota inválida: "${invalida}" precisa começar com "/"` }, { status: 400 });
    }

    setPublicRoutes(routes);
    return NextResponse.json({ routes: getPublicRoutes() });
  } catch (error: any) {
    console.error('[config/rotas-publicas][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
