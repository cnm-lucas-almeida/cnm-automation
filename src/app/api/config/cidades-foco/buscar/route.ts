import { NextRequest, NextResponse } from 'next/server';
import { buscarCidadesAdmin } from '@/lib/cidades-foco';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    if (q.trim().length < 2) {
      return NextResponse.json([]);
    }
    const data = await buscarCidadesAdmin(q.trim());
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/cidades-foco/buscar][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
