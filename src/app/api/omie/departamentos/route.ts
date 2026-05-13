import { NextResponse } from 'next/server';
import { listarDepartamentos } from '@/lib/omie';

export async function GET() {
  try {
    const data = await listarDepartamentos();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
