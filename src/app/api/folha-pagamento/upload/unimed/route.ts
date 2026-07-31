import { NextRequest, NextResponse } from 'next/server';
import { parseUnimedPdf, salvarUnimedEventos } from '@/lib/folha-pagamento/unimed';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo PDF do extrato Unimed é obrigatório' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { eventos, competencia } = await parseUnimedPdf(buffer);
    await salvarUnimedEventos(eventos);

    return NextResponse.json({ success: true, competencia, beneficiarios: eventos.length });
  } catch (error: any) {
    console.error('[folha-pagamento/upload/unimed][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
