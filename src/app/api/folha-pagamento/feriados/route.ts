import { NextRequest, NextResponse } from 'next/server';
import { listarFeriados, criarFeriado, removerFeriado } from '@/lib/folha-pagamento/feriados';

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anoParam = searchParams.get('ano');
    const ano = anoParam ? parseInt(anoParam, 10) : undefined;
    if (anoParam && Number.isNaN(ano)) {
      return NextResponse.json({ error: 'Parâmetro ano inválido' }, { status: 400 });
    }
    const feriados = await listarFeriados(ano);
    return NextResponse.json({ feriados });
  } catch (error) {
    console.error('[folha-pagamento/feriados][GET]', error);
    return NextResponse.json({ error: mensagemErro(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data, descricao } = await request.json();
    if (!data || !descricao || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: 'data (YYYY-MM-DD) e descricao são obrigatórios' }, { status: 400 });
    }
    const feriado = await criarFeriado(data, String(descricao).trim());
    return NextResponse.json({ success: true, feriado });
  } catch (error) {
    console.error('[folha-pagamento/feriados][POST]', error);
    return NextResponse.json({ error: mensagemErro(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') ?? '', 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Parâmetro id é obrigatório' }, { status: 400 });
    }
    await removerFeriado(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[folha-pagamento/feriados][DELETE]', error);
    return NextResponse.json({ error: mensagemErro(error) }, { status: 500 });
  }
}
