import { NextRequest, NextResponse } from 'next/server';
import { listarMetas, criarMeta, mesReferenciaDe } from '@/lib/metas';

export async function GET(request: NextRequest) {
  try {
    const mes = request.nextUrl.searchParams.get('mes');
    const data = await listarMetas(mes ? mesReferenciaDe(mes) : undefined);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/metas][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { squadId, squadNome, segmento, mesReferencia, metaEstoqueDia, metaFinanceiraDia, metaPvDia } = body;

    if (!squadId || !squadNome || (segmento !== 'imoveis' && segmento !== 'veiculos')) {
      return NextResponse.json({ error: 'squadId, squadNome e segmento (imoveis|veiculos) são obrigatórios' }, { status: 400 });
    }

    const data = await criarMeta({
      squadId: Number(squadId),
      squadNome: String(squadNome),
      segmento,
      mesReferencia: mesReferenciaDe(mesReferencia || new Date().toISOString()),
      metaEstoqueDia: Number(metaEstoqueDia) || 0,
      metaFinanceiraDia: Number(metaFinanceiraDia) || 0,
      metaPvDia: Number(metaPvDia) || 0,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma meta cadastrada para esse squad.' }, { status: 409 });
    }
    console.error('[config/metas][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
