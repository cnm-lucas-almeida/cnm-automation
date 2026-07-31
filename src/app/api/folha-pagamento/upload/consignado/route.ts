import { NextRequest, NextResponse } from 'next/server';
import { parseConsignadoJson, salvarConsignado } from '@/lib/folha-pagamento/consignado';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo JSON do Portal de Consignações é obrigatório' }, { status: 400 });
    }

    const conteudo = await file.text();
    const { registros, competencia } = parseConsignadoJson(conteudo);
    await salvarConsignado(registros);

    return NextResponse.json({ success: true, competencia, colaboradores: registros.length });
  } catch (error: any) {
    console.error('[folha-pagamento/upload/consignado][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
