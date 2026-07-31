import { NextRequest, NextResponse } from 'next/server';
import { listarOverrides, criarOverride, removerOverride } from '@/lib/folha-pagamento/overrides';

export async function GET() {
  try {
    const overrides = await listarOverrides();
    return NextResponse.json({ overrides });
  } catch (error: any) {
    console.error('[folha-pagamento/overrides][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cpf, nome, percentual, motivo, vigenciaInicio, vigenciaFim } = body;

    if (!cpf || !nome || typeof percentual !== 'number' || !motivo || !vigenciaInicio) {
      return NextResponse.json(
        { error: 'cpf, nome, percentual, motivo e vigenciaInicio são obrigatórios' },
        { status: 400 }
      );
    }

    const override = await criarOverride({ cpf, nome, percentual, motivo, vigenciaInicio, vigenciaFim });
    return NextResponse.json({ success: true, override });
  } catch (error: any) {
    console.error('[folha-pagamento/overrides][POST]', error);
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
    await removerOverride(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[folha-pagamento/overrides][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
