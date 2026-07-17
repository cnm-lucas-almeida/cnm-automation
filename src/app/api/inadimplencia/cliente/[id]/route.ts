import { NextResponse } from 'next/server';
import { getDetalheContratosCliente } from '@/lib/inadimplencia';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idCliente = parseInt(id, 10);
    if (!Number.isFinite(idCliente)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }
    const data = await getDetalheContratosCliente(idCliente);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[inadimplencia/cliente/:id]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
