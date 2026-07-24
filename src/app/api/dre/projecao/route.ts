import { NextRequest, NextResponse } from 'next/server';
import { getProjecao } from '@/lib/dre/projecao';

export async function GET(request: NextRequest) {
  try {
    const anoParam = request.nextUrl.searchParams.get('ano');
    const ano = anoParam ? Number(anoParam) : new Date().getFullYear();
    if (!Number.isInteger(ano)) {
      return NextResponse.json({ error: 'ano inválido' }, { status: 400 });
    }

    const data = await getProjecao(ano);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[dre/projecao][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
