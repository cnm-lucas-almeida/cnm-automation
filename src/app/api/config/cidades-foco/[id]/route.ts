import { NextRequest, NextResponse } from 'next/server';
import { removerCidadeFoco } from '@/lib/cidades-foco';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cidadeFocoId = parseInt(id, 10);
    if (!Number.isFinite(cidadeFocoId)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const ok = await removerCidadeFoco(cidadeFocoId);
    if (!ok) {
      return NextResponse.json({ error: 'Cidade foco não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[config/cidades-foco/:id][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
