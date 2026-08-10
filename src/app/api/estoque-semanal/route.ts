import { NextRequest, NextResponse } from 'next/server';
import { getEstoqueSemanalData } from '@/lib/estoque-semanal';
import type { Segmento, TipoContrato, StatusVenda } from '@/lib/vendas';

const SEGMENTOS_VALIDOS: (Segmento | 'todos')[] = ['todos', 'imoveis', 'veiculos', 'outro'];
const TIPOS_VALIDOS: TipoContrato[] = ['todos', 'usados', 'lancamento'];
const STATUS_VALIDOS: StatusVenda[] = ['ativa', 'congelada', 'cancelada'];

function primeiroDiaDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const dataInicial = request.nextUrl.searchParams.get('dataInicial') || primeiroDiaDoMes();
    const dataFinal = request.nextUrl.searchParams.get('dataFinal') || hoje();
    const segmentoParam = request.nextUrl.searchParams.get('segmento');
    const segmento = SEGMENTOS_VALIDOS.includes(segmentoParam as any) ? (segmentoParam as Segmento | 'todos') : 'todos';

    const squadParam = request.nextUrl.searchParams.get('squad');
    const treinadorParam = request.nextUrl.searchParams.get('treinador');
    const tipoParam = request.nextUrl.searchParams.get('tipo');
    const statusParam = request.nextUrl.searchParams.get('status');

    const data = await getEstoqueSemanalData(dataInicial, dataFinal, segmento, {
      squad: squadParam || undefined,
      treinador: treinadorParam || undefined,
      tipo: TIPOS_VALIDOS.includes(tipoParam as any) ? (tipoParam as TipoContrato) : undefined,
      status: STATUS_VALIDOS.includes(statusParam as any) ? (statusParam as StatusVenda) : undefined,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[estoque-semanal]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
