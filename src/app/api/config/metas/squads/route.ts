import { NextResponse } from 'next/server';
import { listarSquadsAdmin } from '@/lib/metas';

export async function GET() {
  try {
    const data = await listarSquadsAdmin();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[config/metas/squads][GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
