import { NextResponse } from 'next/server';
import { getCalcular, invalidarCacheCalcular } from '@/lib/secullum';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cpf = searchParams.get('cpf');
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!cpf || !dataInicio || !dataFim) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: cpf, dataInicio, dataFim' }, { status: 400 });
    }

    const result = await getCalcular(cpf, dataInicio, dataFim, forceRefresh);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Erro ao buscar dados calculados Secullum:', error?.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const cpf = searchParams.get('cpf');
  const dataInicio = searchParams.get('dataInicio');
  const dataFim = searchParams.get('dataFim');

  if (!cpf || !dataInicio || !dataFim) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: cpf, dataInicio, dataFim' }, { status: 400 });
  }

  invalidarCacheCalcular(cpf, dataInicio, dataFim);
  return NextResponse.json({ ok: true });
}
