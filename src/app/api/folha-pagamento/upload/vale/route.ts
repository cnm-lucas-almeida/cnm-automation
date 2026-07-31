import { NextRequest, NextResponse } from 'next/server';
import { parseValeXlsx, salvarVale } from '@/lib/folha-pagamento/vale';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const competencia = formData.get('competencia');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo XLSX de VA/VT é obrigatório' }, { status: 400 });
    }
    if (!competencia || typeof competencia !== 'string' || !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: 'competencia é obrigatória no formato YYYY-MM' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const registros = parseValeXlsx(buffer, competencia);
    await salvarVale(registros);

    return NextResponse.json({ success: true, competencia, colaboradores: registros.length });
  } catch (error: any) {
    console.error('[folha-pagamento/upload/vale][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
