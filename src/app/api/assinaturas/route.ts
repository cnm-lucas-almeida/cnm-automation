import { NextRequest, NextResponse } from 'next/server';
import { getAssinaturasData, type Segmento } from '@/lib/assinaturas';

function primeiroDiaDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const dataInicial = request.nextUrl.searchParams.get('dataInicial') || primeiroDiaDoMes();
    const dataFinal = request.nextUrl.searchParams.get('dataFinal') || hoje();
    const segment = request.nextUrl.searchParams.get('segment') as Segmento | null;
    const adStatus = request.nextUrl.searchParams.get('adStatus');
    const data = await getAssinaturasData(dataInicial, dataFinal, {
      segment: segment || undefined,
      adStatus: adStatus || undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[assinaturas]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
