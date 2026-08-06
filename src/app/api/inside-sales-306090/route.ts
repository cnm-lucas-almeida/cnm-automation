import { NextRequest, NextResponse } from 'next/server';
import { getInsideSales306090Data } from '@/lib/inside-sales-306090';

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === 'true';
    const data = await getInsideSales306090Data(forceRefresh);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[inside-sales-306090]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
