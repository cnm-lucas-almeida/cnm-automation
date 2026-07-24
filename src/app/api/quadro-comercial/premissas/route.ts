import { NextRequest, NextResponse } from 'next/server';
import { salvarPremissasQuadro } from '@/lib/quadro-comercial';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ano = Number(body.ano);
    if (!Number.isInteger(ano)) {
      return NextResponse.json({ error: 'ano é obrigatório' }, { status: 400 });
    }

    const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const data = await salvarPremissasQuadro({
      ano,
      headcountMetaImoveis: numero(body.headcountMetaImoveis),
      headcountMetaVeiculos: numero(body.headcountMetaVeiculos),
      vendedoresPorSupervisorImoveis: numero(body.vendedoresPorSupervisorImoveis),
      vendedoresPorSupervisorVeiculos: numero(body.vendedoresPorSupervisorVeiculos),
      turnoverMensalPct: numero(body.turnoverMensalPct),
      custoMedioVendedor: numero(body.custoMedioVendedor),
      custoMedioSupervisor: numero(body.custoMedioSupervisor),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[quadro-comercial/premissas][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
