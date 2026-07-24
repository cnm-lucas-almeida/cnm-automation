import { NextRequest, NextResponse } from 'next/server';
import { salvarHistoricoMensal } from '@/lib/quadro-comercial';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { competencia, vendedoresImoveis, vendedoresVeiculos, backOfficeImoveis, backOfficeVeiculos, admitidos, desligamentos, observacao } = body;

    if (!competencia || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: 'competencia é obrigatória no formato YYYY-MM-DD' }, { status: 400 });
    }

    const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const data = await salvarHistoricoMensal({
      competencia,
      vendedoresImoveis: numero(vendedoresImoveis),
      vendedoresVeiculos: numero(vendedoresVeiculos),
      backOfficeImoveis: numero(backOfficeImoveis),
      backOfficeVeiculos: numero(backOfficeVeiculos),
      admitidos: admitidos != null && admitidos !== '' ? Number(admitidos) : null,
      desligamentos: desligamentos != null && desligamentos !== '' ? Number(desligamentos) : null,
      observacao: observacao || null,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[quadro-comercial/historico][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
