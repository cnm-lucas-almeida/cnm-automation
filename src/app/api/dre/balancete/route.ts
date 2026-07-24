import { NextResponse } from 'next/server';
import { getCompetenciasDisponiveis } from '@/lib/dre';

export async function GET() {
  try {
    const competencias = await getCompetenciasDisponiveis();
    return NextResponse.json({ competencias });
  } catch (error: any) {
    console.error('[dre/balancete][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
