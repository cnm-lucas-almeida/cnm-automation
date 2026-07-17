import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/inadimplencia';

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('refresh') === '1';
    const data = await getDashboardData(force);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[inadimplencia/dashboard]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
