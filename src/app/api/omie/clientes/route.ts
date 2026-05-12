import { NextResponse } from 'next/server';
import { listarClientesFornecedores } from '@/lib/omie';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pagina = Number(searchParams.get('pagina')) || 1;
  const registrosPorPagina = Number(searchParams.get('registros')) || 50;
  const termo = searchParams.get('termo') || undefined;

  try {
    const data = await listarClientesFornecedores(pagina, registrosPorPagina, termo);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
