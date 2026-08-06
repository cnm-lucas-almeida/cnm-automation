import { NextResponse } from 'next/server';
import { getSaudeDiaria } from '@/lib/congelamentos';

export async function GET() {
  try {
    const data = await getSaudeDiaria();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[congelamentos/saude]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
