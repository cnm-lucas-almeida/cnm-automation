import { NextRequest, NextResponse } from 'next/server';
import { parseOdontoXlsx, salvarOdonto, VALOR_UNITARIO_DEPENDENTE_PADRAO } from '@/lib/folha-pagamento/odonto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const competencia = formData.get('competencia');
    const valorUnitarioRaw = formData.get('valorUnitario');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo XLSX do Odonto é obrigatório' }, { status: 400 });
    }
    if (!competencia || typeof competencia !== 'string' || !/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: 'competencia é obrigatória no formato YYYY-MM' }, { status: 400 });
    }

    const valorUnitario = valorUnitarioRaw ? parseFloat(String(valorUnitarioRaw)) : VALOR_UNITARIO_DEPENDENTE_PADRAO;
    const buffer = Buffer.from(await file.arrayBuffer());
    const registros = parseOdontoXlsx(buffer, competencia, valorUnitario);
    await salvarOdonto(registros);

    return NextResponse.json({ success: true, competencia, certificados: registros.length });
  } catch (error: any) {
    console.error('[folha-pagamento/upload/odonto][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
