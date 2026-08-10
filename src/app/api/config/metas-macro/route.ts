import { NextRequest, NextResponse } from 'next/server';
import { buscarMetaMacro, salvarMetaMacro } from '@/lib/metas-macro';

export async function GET(request: NextRequest) {
  try {
    const segmento = request.nextUrl.searchParams.get('segmento');
    const mes = request.nextUrl.searchParams.get('mes');
    if ((segmento !== 'imoveis' && segmento !== 'veiculos') || !mes) {
      return NextResponse.json({ error: 'segmento (imoveis|veiculos) e mes são obrigatórios' }, { status: 400 });
    }
    const data = await buscarMetaMacro(segmento, mes);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/metas-macro][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { segmento, mesReferencia } = body;
    if (segmento !== 'imoveis' && segmento !== 'veiculos') {
      return NextResponse.json({ error: 'segmento (imoveis|veiculos) é obrigatório' }, { status: 400 });
    }
    if (!mesReferencia) {
      return NextResponse.json({ error: 'mesReferencia é obrigatório' }, { status: 400 });
    }

    const num = (v: unknown) => Number(v) || 0;
    const data = await salvarMetaMacro({
      segmento,
      mesReferencia,
      metaEstoqueTotal: num(body.metaEstoqueTotal),
      metaFinanceiraTotal: num(body.metaFinanceiraTotal),
      metaPvTotal: num(body.metaPvTotal),
      faturamentoTotal: num(body.faturamentoTotal),
      estoqueUsados: num(body.estoqueUsados),
      acrescimoUsados: num(body.acrescimoUsados),
      estoqueCarregadoMes: num(body.estoqueCarregadoMes),
      estoqueACarregar: num(body.estoqueACarregar),
      estoqueSaiu: num(body.estoqueSaiu),
      clientesAtivos: num(body.clientesAtivos),
      cancelamentosPv: num(body.cancelamentosPv),
      cancelamentosValor: num(body.cancelamentosValor),
      fichaLancamento: num(body.fichaLancamento),
      vendidas: num(body.vendidas),
      acrescimoLancamentos: num(body.acrescimoLancamentos),
      headcountIdeal: num(body.headcountIdeal),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('[config/metas-macro][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
