import { NextRequest, NextResponse } from 'next/server';
import { getProjecaoQuadro, getQuadroGeral, getAtivosTI } from '@/lib/quadro-comercial';

export async function GET(request: NextRequest) {
  try {
    const anoParam = request.nextUrl.searchParams.get('ano');
    const ano = anoParam ? Number(anoParam) : new Date().getFullYear();
    if (!Number.isInteger(ano)) {
      return NextResponse.json({ error: 'ano inválido' }, { status: 400 });
    }

    const [projecao, quadroGeral, ativosTI] = await Promise.all([
      getProjecaoQuadro(ano),
      getQuadroGeral(),
      getAtivosTI(),
    ]);

    return NextResponse.json({ ...projecao, quadroGeral, ativosTI });
  } catch (error: any) {
    console.error('[quadro-comercial][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
