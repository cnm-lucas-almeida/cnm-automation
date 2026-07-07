import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/glpi';

export async function GET(request: NextRequest) {
  try {
    const grupo = request.nextUrl.searchParams.get('grupo') || undefined;
    const mes = request.nextUrl.searchParams.get('mes') || undefined;
    const dataInicio = request.nextUrl.searchParams.get('dataInicio') || undefined;
    const dataFim = request.nextUrl.searchParams.get('dataFim') || undefined;
    const data = await getDashboardData(grupo, mes, dataInicio, dataFim);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[GLPI dashboard]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
