import { NextRequest, NextResponse } from 'next/server';
import { listarAutomacoes, criarAutomacao, type SalvarAutomacaoInput, type StatusAutomacao } from '@/lib/automacoes';

const STATUS_VALIDOS: StatusAutomacao[] = ['ativo', 'planejado', 'pausado'];

function parseInput(body: any): { input?: SalvarAutomacaoInput; error?: string } {
  const { iniciativa, descricao, setor, sistema, salarioImpostos, horasMes, horasManualMes, horasManualDia, colaboradores, status, responsavel } = body;

  if (!iniciativa || !setor || !sistema) {
    return { error: 'iniciativa, setor e sistema são obrigatórios' };
  }
  if (status && !STATUS_VALIDOS.includes(status)) {
    return { error: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` };
  }

  return {
    input: {
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
    },
  };
}

export async function GET() {
  try {
    const data = await listarAutomacoes();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/automacoes][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input, error } = parseInput(body);
    if (error || !input) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const data = await criarAutomacao(input);
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('[config/automacoes][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
