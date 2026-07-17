import { NextRequest, NextResponse } from 'next/server';
import { getCarrinhoData } from '@/lib/carrinho';

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
    const data = await getCarrinhoData(dataInicial, dataFinal);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[carrinho]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
