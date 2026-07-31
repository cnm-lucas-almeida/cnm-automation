import { NextRequest, NextResponse } from 'next/server';
import { getDescongelamentosData, type Vertical, type Origem } from '@/lib/congelamentos';

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function seteDiasAtras(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const dataInicial = request.nextUrl.searchParams.get('dataInicial') || seteDiasAtras();
    const dataFinal = request.nextUrl.searchParams.get('dataFinal') || hoje();
    const uf = request.nextUrl.searchParams.get('uf');
    const cidade = request.nextUrl.searchParams.get('cidade');
    const vertical = request.nextUrl.searchParams.get('vertical') as Vertical | null;
    const origem = request.nextUrl.searchParams.get('origem') as Origem | null;

    const data = await getDescongelamentosData(dataInicial, dataFinal, {
      uf: uf || undefined,
      cidade: cidade || undefined,
      vertical: vertical || undefined,
      origem: origem || undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[congelamentos/descongelamentos]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
