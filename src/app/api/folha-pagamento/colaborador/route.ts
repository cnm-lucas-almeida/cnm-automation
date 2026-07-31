import { NextRequest, NextResponse } from 'next/server';
import { getFolhaColaborador } from '@/lib/folha-pagamento';

// Recalcula 1 linha só — usado depois de editar Horas +/- pra atualizar a
// tela sem esperar o fechamento inteiro (que leva minutos por causa do rate
// limit do Convenia).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cpf = searchParams.get('cpf');
    const ano = parseInt(searchParams.get('ano') ?? '', 10);
    const mes = parseInt(searchParams.get('mes') ?? '', 10);

    if (!cpf || Number.isNaN(ano) || Number.isNaN(mes)) {
      return NextResponse.json({ error: 'cpf, ano e mes são obrigatórios' }, { status: 400 });
    }

    const colaborador = await getFolhaColaborador(cpf, ano, mes);
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado no Convenia' }, { status: 404 });
    }

    return NextResponse.json({ colaborador });
  } catch (error: any) {
    console.error('[folha-pagamento/colaborador][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
