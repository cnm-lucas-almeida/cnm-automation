import { NextRequest, NextResponse } from 'next/server';
import { atualizarMeta, excluirMeta } from '@/lib/metas';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const metaId = parseInt(id, 10);
    if (!Number.isFinite(metaId)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { metaEstoqueDia, metaFinanceiraDia } = body;

    const data = await atualizarMeta(metaId, {
      metaEstoqueDia: Number(metaEstoqueDia) || 0,
      metaFinanceiraDia: Number(metaFinanceiraDia) || 0,
    });

    if (!data) {
      return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/metas/:id][PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const metaId = parseInt(id, 10);
    if (!Number.isFinite(metaId)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const ok = await excluirMeta(metaId);
    if (!ok) {
      return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[config/metas/:id][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
