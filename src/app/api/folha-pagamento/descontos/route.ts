import { NextRequest, NextResponse } from 'next/server';
import { getDescontosImportados } from '@/lib/folha-pagamento';

// Refresh rápido das colunas que vêm de import (Unimed, Odonto, Consignado,
// VA/VT). Existe porque recarregar o fechamento inteiro depois de um upload
// custa ~5 min — quase tudo esperando o rate limit do Convenia pra rebuscar
// salários que não mudaram. Nenhuma dessas 4 colunas depende do Convenia.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hoje = new Date();
    const ano = parseInt(searchParams.get('ano') ?? String(hoje.getFullYear()), 10);
    const mes = parseInt(searchParams.get('mes') ?? String(hoje.getMonth() + 1), 10);

    if (Number.isNaN(ano) || Number.isNaN(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: 'Parâmetros ano/mes inválidos' }, { status: 400 });
    }

    return NextResponse.json({ ano, mes, descontos: await getDescontosImportados(ano, mes) });
  } catch (error: any) {
    console.error('[folha-pagamento/descontos][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
