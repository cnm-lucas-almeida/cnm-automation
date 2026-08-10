import { NextRequest, NextResponse } from 'next/server';
import { getMetasComerciaisData, getTendenciaMensal } from '@/lib/metas-comercial';

export async function GET(request: NextRequest) {
  try {
    const segmento = request.nextUrl.searchParams.get('segmento');
    const mes = request.nextUrl.searchParams.get('mes');
    const tendencia = request.nextUrl.searchParams.get('tendencia') === '1';

    if (segmento !== 'imoveis' && segmento !== 'veiculos') {
      return NextResponse.json({ error: 'segmento (imoveis|veiculos) é obrigatório' }, { status: 400 });
    }
    if (!mes) {
      return NextResponse.json({ error: 'mes é obrigatório' }, { status: 400 });
    }

    const [rollup, tendenciaMensal] = await Promise.all([
      getMetasComerciaisData(segmento, mes),
      tendencia ? getTendenciaMensal(segmento) : Promise.resolve(null),
    ]);

    return NextResponse.json({ ...rollup, tendenciaMensal });
  } catch (error: any) {
    console.error('[metas-comercial][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
