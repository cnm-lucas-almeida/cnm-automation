import { NextRequest, NextResponse } from 'next/server';
import { getFolhaPagamento } from '@/lib/folha-pagamento';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hoje = new Date();
    const ano = parseInt(searchParams.get('ano') ?? String(hoje.getFullYear()), 10);
    const mes = parseInt(searchParams.get('mes') ?? String(hoje.getMonth() + 1), 10);
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (Number.isNaN(ano) || Number.isNaN(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: 'Parâmetros ano/mes inválidos' }, { status: 400 });
    }

    const resultado = await getFolhaPagamento(ano, mes, forceRefresh);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('[folha-pagamento][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
