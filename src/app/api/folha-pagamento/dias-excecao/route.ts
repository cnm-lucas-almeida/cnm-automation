import { NextRequest, NextResponse } from 'next/server';
import { listarDiasExcecao, criarDiaExcecao, removerDiaExcecao } from '@/lib/folha-pagamento/overrides';

export async function GET() {
  try {
    const dias = await listarDiasExcecao();
    return NextResponse.json({ dias });
  } catch (error: any) {
    console.error('[folha-pagamento/dias-excecao][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data, motivo } = await request.json();
    if (!data || !motivo) {
      return NextResponse.json({ error: 'data e motivo são obrigatórios' }, { status: 400 });
    }
    const diaExcecao = await criarDiaExcecao(data, motivo);
    return NextResponse.json({ success: true, diaExcecao });
  } catch (error: any) {
    console.error('[folha-pagamento/dias-excecao][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') ?? '', 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Parâmetro id é obrigatório' }, { status: 400 });
    }
    await removerDiaExcecao(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[folha-pagamento/dias-excecao][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
