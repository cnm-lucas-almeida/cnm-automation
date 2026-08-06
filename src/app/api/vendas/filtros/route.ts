import { NextResponse } from 'next/server';
import { getFiltrosVendas } from '@/lib/vendas';

export async function GET() {
  try {
    const data = await getFiltrosVendas();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[vendas/filtros]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
