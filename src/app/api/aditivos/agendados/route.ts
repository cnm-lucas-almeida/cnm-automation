import { NextRequest, NextResponse } from 'next/server';
import { getAgendadosData, type Segmento } from '@/lib/aditivos';

const SEGMENTOS_VALIDOS: (Segmento | 'todos')[] = ['todos', 'imoveis', 'veiculos', 'outro'];

export async function GET(request: NextRequest) {
  try {
    const segmentoParam = request.nextUrl.searchParams.get('segmento');
    const segmento = SEGMENTOS_VALIDOS.includes(segmentoParam as any) ? (segmentoParam as Segmento | 'todos') : 'todos';
    const data = await getAgendadosData(segmento);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[aditivos/agendados]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
