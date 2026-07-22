import { NextRequest, NextResponse } from 'next/server';
import { getAditivosData, type Segmento } from '@/lib/aditivos';

const SEGMENTOS_VALIDOS: (Segmento | 'todos')[] = ['todos', 'imoveis', 'veiculos', 'outro'];

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
    const segmentoParam = request.nextUrl.searchParams.get('segmento');
    const segmento = SEGMENTOS_VALIDOS.includes(segmentoParam as any) ? (segmentoParam as Segmento | 'todos') : 'todos';
    const data = await getAditivosData(dataInicial, dataFinal, segmento);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[aditivos]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
