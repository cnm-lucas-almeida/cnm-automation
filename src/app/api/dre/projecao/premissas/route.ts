import { NextRequest, NextResponse } from 'next/server';
import { salvarPremissasProjecao } from '@/lib/dre/projecao';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ano = Number(body.ano);
    if (!Number.isInteger(ano)) {
      return NextResponse.json({ error: 'ano é obrigatório' }, { status: 400 });
    }

    const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const receitaIncrementoMensal = Array.isArray(body.receitaIncrementoMensal)
      ? Array.from({ length: 12 }, (_, i) => numero(body.receitaIncrementoMensal[i]))
      : Array(12).fill(0);

    const data = await salvarPremissasProjecao({
      ano,
      folhaSalario: numero(body.folhaSalario),
      folhaFgts: numero(body.folhaFgts),
      folhaInss: numero(body.folhaInss),
      folhaRat: numero(body.folhaRat),
      folhaTerceiros: numero(body.folhaTerceiros),
      folhaVr: numero(body.folhaVr),
      propagandaAumentoPct: numero(body.propagandaAumentoPct),
      receitaIncrementoMensal,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[dre/projecao/premissas][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
