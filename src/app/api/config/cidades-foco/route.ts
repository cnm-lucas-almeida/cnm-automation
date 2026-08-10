import { NextRequest, NextResponse } from 'next/server';
import { listarCidadesFoco, criarCidadeFoco } from '@/lib/cidades-foco';

export async function GET() {
  try {
    const data = await listarCidadesFoco();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/cidades-foco][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idCidade, nomeCidade, siglaUf, categoria } = body;

    if (!idCidade || !nomeCidade || !siglaUf) {
      return NextResponse.json({ error: 'idCidade, nomeCidade e siglaUf são obrigatórios' }, { status: 400 });
    }

    const data = await criarCidadeFoco({
      idCidade: Number(idCidade),
      nomeCidade: String(nomeCidade),
      siglaUf: String(siglaUf),
      categoria: categoria ? String(categoria) : undefined,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Essa cidade já está marcada como foco nessa categoria.' }, { status: 409 });
    }
    console.error('[config/cidades-foco][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
