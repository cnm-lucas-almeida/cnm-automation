import { NextRequest, NextResponse } from 'next/server';
import { getRankingSemanalData, semanaCampanhaAtual } from '@/lib/ranking-semanal';
import type { Segmento } from '@/lib/inside-sales';

const SEGMENTOS_VALIDOS: Segmento[] = ['imoveis', 'veiculos'];

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const padrao = semanaCampanhaAtual();
    const dataInicial = params.get('dataInicial') || padrao.dataInicial;
    const dataFinal = params.get('dataFinal') || padrao.dataFinal;
    const segmentoParam = params.get('segmento');
    const segmento = SEGMENTOS_VALIDOS.includes(segmentoParam as Segmento) ? (segmentoParam as Segmento) : 'imoveis';

    const data = await getRankingSemanalData(dataInicial, dataFinal, segmento);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[ranking-semanal][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
