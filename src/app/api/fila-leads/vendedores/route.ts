import { NextResponse } from 'next/server';
import { listarVendedoresAdmin } from '@/lib/fila-leads';

export async function GET() {
  try {
    const data = await listarVendedoresAdmin();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[fila-leads/vendedores][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
