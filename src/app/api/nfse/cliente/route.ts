import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { canAccessScreen } from '@/lib/auth/permissions';
import { consultarNfsePorCliente } from '@/lib/nfse/por-cliente';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canAccessScreen(session, '/nfse')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const termo = (request.nextUrl.searchParams.get('termo') || '').trim();
  if (termo.length < 3) {
    return NextResponse.json({ error: 'Informe CPF/CNPJ, id do cliente ou nome (mínimo 3 caracteres).' }, { status: 400 });
  }

  try {
    const data = await consultarNfsePorCliente(termo);
    return NextResponse.json(data);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Falha ao consultar NFS-e do cliente.';
    console.error('[nfse/cliente]', error);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
