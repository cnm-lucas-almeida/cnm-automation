import { NextRequest, NextResponse } from 'next/server';
import { atualizarAutomacao, excluirAutomacao, type SalvarAutomacaoInput, type StatusAutomacao } from '@/lib/automacoes';

const STATUS_VALIDOS: StatusAutomacao[] = ['ativo', 'planejado', 'pausado'];

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const automacaoId = parseInt(id, 10);
    if (!Number.isFinite(automacaoId)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { iniciativa, descricao, setor, sistema, salarioImpostos, horasMes, horasManualMes, horasManualDia, colaboradores, status, responsavel } = body;

    if (!iniciativa || !setor || !sistema) {
      return NextResponse.json({ error: 'iniciativa, setor e sistema são obrigatórios' }, { status: 400 });
    }
    if (status && !STATUS_VALIDOS.includes(status)) {
      return NextResponse.json({ error: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` }, { status: 400 });
    }

    const input: SalvarAutomacaoInput = {
      iniciativa: String(iniciativa),
      descricao: descricao ? String(descricao) : null,
      setor: String(setor),
      sistema: String(sistema),
      salarioImpostos: Number(salarioImpostos) || 0,
      horasMes: Number(horasMes) || 200,
      horasManualMes: Number(horasManualMes) || 0,
      horasManualDia: horasManualDia !== null && horasManualDia !== undefined && horasManualDia !== '' ? Number(horasManualDia) : null,
      colaboradores: Number(colaboradores) || 1,
      status: (status as StatusAutomacao) || 'ativo',
      responsavel: responsavel ? String(responsavel) : null,
    };

    const data = await atualizarAutomacao(automacaoId, input);
    if (!data) {
      return NextResponse.json({ error: 'Iniciativa não encontrada' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/automacoes/:id][PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const automacaoId = parseInt(id, 10);
    if (!Number.isFinite(automacaoId)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const ok = await excluirAutomacao(automacaoId);
    if (!ok) {
      return NextResponse.json({ error: 'Iniciativa não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[config/automacoes/:id][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
