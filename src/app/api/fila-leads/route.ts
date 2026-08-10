import { NextRequest, NextResponse } from 'next/server';
import { getFilaLeadsData } from '@/lib/fila-leads';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const dataInicial = params.get('dataInicial');
    const dataFinal = params.get('dataFinal');

    if (!dataInicial || !dataFinal) {
      return NextResponse.json({ error: 'dataInicial e dataFinal são obrigatórios' }, { status: 400 });
    }

    const vendedorIdRaw = params.get('vendedorId');
    const squadIdRaw = params.get('squadId');

    const data = await getFilaLeadsData({
      dataInicial,
      dataFinal,
      busca: params.get('busca') || undefined,
      statusLink: params.get('statusLink') || undefined,
      tipo: (params.get('tipo') as 'I' | 'V' | 'L' | null) || undefined,
      vendedorId: vendedorIdRaw ? Number(vendedorIdRaw) : undefined,
      squadId: squadIdRaw ? Number(squadIdRaw) : undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[fila-leads][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
