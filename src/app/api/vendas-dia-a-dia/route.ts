import { NextRequest, NextResponse } from 'next/server';
import { getVendasDiaADiaData } from '@/lib/vendas-dia-a-dia';

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const competencia = request.nextUrl.searchParams.get('competencia') || competenciaAtual();
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === 'true';
    const data = await getVendasDiaADiaData(competencia, forceRefresh);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[vendas-dia-a-dia]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
