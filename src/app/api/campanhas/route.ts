import { NextRequest, NextResponse } from 'next/server';
import { getCampanhasByPlataforma, type Plataforma } from '@/lib/campanhas';

const PLATAFORMAS_VALIDAS: Plataforma[] = ['google', 'criteo', 'bing', 'trovit'];

export async function GET(request: NextRequest) {
  try {
    const plataformaParam = request.nextUrl.searchParams.get('plataforma');
    const plataforma = PLATAFORMAS_VALIDAS.includes(plataformaParam as Plataforma)
      ? (plataformaParam as Plataforma)
      : 'google';
    const data = getCampanhasByPlataforma(plataforma);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[campanhas]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
