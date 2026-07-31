import { NextRequest, NextResponse } from 'next/server';
import { getCongelamentosData, type Vertical } from '@/lib/congelamentos';

function primeiroDiaDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const dataInicial = request.nextUrl.searchParams.get('dataInicial') || primeiroDiaDoMes();
    const dataFinal = request.nextUrl.searchParams.get('dataFinal') || hoje();
    const uf = request.nextUrl.searchParams.get('uf');
    const cidade = request.nextUrl.searchParams.get('cidade');
    const vertical = request.nextUrl.searchParams.get('vertical') as Vertical | null;
    const motivo = request.nextUrl.searchParams.get('motivo');

    const data = await getCongelamentosData(dataInicial, dataFinal, {
      uf: uf || undefined,
      cidade: cidade || undefined,
      vertical: vertical || undefined,
      motivo: motivo ? Number(motivo) : undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[congelamentos]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
