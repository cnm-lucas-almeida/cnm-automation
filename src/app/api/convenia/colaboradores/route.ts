import { NextResponse } from 'next/server';
import { listarColaboradores } from '@/lib/convenia';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('forceRefresh') === 'true';
    const apenasAtivos = searchParams.get('apenasAtivos') === 'true';

    let colaboradores = await listarColaboradores(forceRefresh);
    if (apenasAtivos) {
      colaboradores = colaboradores.filter((c) => c.status === 'Ativo');
    }

    return NextResponse.json(colaboradores);
  } catch (error: any) {
    console.error('Erro ao buscar colaboradores Convenia:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
