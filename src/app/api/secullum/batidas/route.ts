import { NextResponse } from 'next/server';
import { getBatidas } from '@/lib/secullum';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cpf = searchParams.get('cpf');
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');

    if (!cpf || !dataInicio || !dataFim) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: cpf, dataInicio, dataFim' }, { status: 400 });
    }

    const batidas = await getBatidas(cpf, dataInicio, dataFim);
    return NextResponse.json(batidas);
  } catch (error: any) {
    console.error('Erro ao buscar batidas Secullum:', error?.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
