import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { canAccessScreen } from '@/lib/auth/permissions';
import { vincularPagamentos } from '@/lib/nfse/vincular';

const LIMITE_POR_CHAMADA = 10;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!canAccessScreen(session, '/nfse')) {
    return NextResponse.json({ error: 'Sem permissão para vincular NFS-e.' }, { status: 403 });
  }

  let idsPagamento: number[];
  try {
    const corpo = await request.json();
    idsPagamento = Array.isArray(corpo?.idsPagamento)
      ? corpo.idsPagamento.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (idsPagamento.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos um pagamento.' }, { status: 400 });
  }
  if (idsPagamento.length > LIMITE_POR_CHAMADA) {
    return NextResponse.json(
      { error: `Máximo de ${LIMITE_POR_CHAMADA} pagamentos por vez.` },
      { status: 400 },
    );
  }

  try {
    const resultado = await vincularPagamentos(idsPagamento);
    return NextResponse.json(resultado);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Falha ao vincular NFS-e.';
    console.error('[nfse/vincular]', error);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
