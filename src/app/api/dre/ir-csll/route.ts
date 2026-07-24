import { NextRequest, NextResponse } from 'next/server';
import { salvarProvisaoIrCsll } from '@/lib/dre';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { competencia, irpj, csll, observacao } = body;

    if (!competencia || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: 'competencia é obrigatória no formato YYYY-MM-DD' }, { status: 400 });
    }

    const data = await salvarProvisaoIrCsll({
      competencia,
      irpj: Number(irpj) || 0,
      csll: Number(csll) || 0,
      observacao: observacao ? String(observacao) : null,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[dre/ir-csll][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
