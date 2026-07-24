import { NextRequest, NextResponse } from 'next/server';
import { getDreMensal, getConferencia, getProvisoesIrCsll } from '@/lib/dre';

export async function GET(request: NextRequest) {
  try {
    const inicio = request.nextUrl.searchParams.get('inicio');
    const fim = request.nextUrl.searchParams.get('fim');
    if (!inicio || !fim) {
      return NextResponse.json({ error: 'Parâmetros inicio e fim (YYYY-MM-DD) são obrigatórios' }, { status: 400 });
    }

    const [dre, conferencia, provisoes] = await Promise.all([
      getDreMensal(inicio, fim),
      getConferencia(inicio, fim),
      getProvisoesIrCsll(inicio, fim),
    ]);

    // IR/CSLL não vem do balancete — só existe para as competências em que a contabilidade
    // já forneceu a apuração (ver dre_provisao_ir_csll). Meses sem registro entram como 0.
    const provisaoPorCompetencia = new Map(provisoes.map((p) => [p.competencia, p]));
    const irpj = dre.competencias.map((c) => provisaoPorCompetencia.get(c)?.irpj ?? 0);
    const csll = dre.competencias.map((c) => provisaoPorCompetencia.get(c)?.csll ?? 0);
    const resultadoLiquido = dre.fechamentos.resultadoDoPeriodo.map((v, i) => v - irpj[i] - csll[i]);

    return NextResponse.json({
      ...dre,
      fechamentos: { ...dre.fechamentos, irpj, csll, resultadoLiquido },
      conferencia,
    });
  } catch (error: any) {
    console.error('[dre][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
