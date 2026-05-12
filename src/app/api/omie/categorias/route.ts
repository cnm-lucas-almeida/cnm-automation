import { NextResponse } from 'next/server';
import { listarCategorias } from '@/lib/omie';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pagina = Number(searchParams.get('pagina')) || 1;

  try {
    const data = await listarCategorias(pagina, 500);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
