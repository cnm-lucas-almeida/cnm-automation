import { NextRequest, NextResponse } from 'next/server';
import { parseBalanceteFile, importarBalancete } from '@/lib/dre';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const competencia = formData.get('competencia');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo do balancete é obrigatório' }, { status: 400 });
    }
    if (!competencia || typeof competencia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: 'competencia é obrigatória no formato YYYY-MM-DD' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const linhas = parseBalanceteFile(buffer);
    const total = await importarBalancete(competencia, linhas);

    return NextResponse.json({ success: true, linhasImportadas: total });
  } catch (error: any) {
    console.error('[dre/balancete/importar][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
