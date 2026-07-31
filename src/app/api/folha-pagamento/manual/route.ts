import { NextRequest, NextResponse } from 'next/server';
import { salvarCamposManuais } from '@/lib/folha-pagamento/manual';

export async function POST(request: NextRequest) {
  try {
    const {
      ano, mes, cpf, observacoes, sitepd, valeAlimentacao, valeTransporte,
      horasPositivasOverride, horasNegativasOverride, faltaQtdOverride,
    } = await request.json();

    if (!ano || !mes || !cpf) {
      return NextResponse.json({ error: 'ano, mes e cpf são obrigatórios' }, { status: 400 });
    }

    await salvarCamposManuais(ano, mes, cpf, {
      observacoes, sitepd, valeAlimentacao, valeTransporte, horasPositivasOverride, horasNegativasOverride, faltaQtdOverride,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[folha-pagamento/manual][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
