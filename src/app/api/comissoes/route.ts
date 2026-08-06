import { NextRequest, NextResponse } from 'next/server';
import { getComissoesData, type TipoFechamento } from '@/lib/comissoes';

function periodoAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodoInicioAno(): string {
  return `${new Date().getFullYear()}-01`;
}

export async function GET(request: NextRequest) {
  try {
    const periodoInicial = request.nextUrl.searchParams.get('periodoInicial') || periodoInicioAno();
    const periodoFinal = request.nextUrl.searchParams.get('periodoFinal') || periodoAtual();
    const perfilParam = request.nextUrl.searchParams.get('perfil');
    const tipoFechamento = request.nextUrl.searchParams.get('tipoFechamento') as TipoFechamento | null;

    const data = await getComissoesData(periodoInicial, periodoFinal, {
      perfil: perfilParam !== null && perfilParam !== '' ? Number(perfilParam) : undefined,
      tipoFechamento: tipoFechamento || undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[comissoes]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
