import { NextResponse } from 'next/server';
import { listarSquadsAdmin } from '@/lib/fila-leads';

export async function GET() {
  try {
    const data = await listarSquadsAdmin();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[fila-leads/squads][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
