import { NextRequest, NextResponse } from 'next/server';
import { salvarCamposManuais, type CamposManuais } from '@/lib/folha-pagamento/manual';

const CAMPOS_EDITAVEIS = [
  'observacoes',
  'sitepd',
  'valeAlimentacao',
  'valeTransporte',
  'horasPositivasOverride',
  'horasNegativasOverride',
  'faltaQtdOverride',
  'comissaoOverride',
] as const satisfies readonly (keyof CamposManuais)[];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ano, mes, cpf } = body;

    if (!ano || !mes || !cpf) {
      return NextResponse.json({ error: 'ano, mes e cpf são obrigatórios' }, { status: 400 });
    }

    // Repassa só as chaves que vieram no corpo. Desestruturar tudo (como era
    // antes) transformava campo ausente em `undefined`, e lá embaixo em null —
    // aí não dava pra distinguir "não mexe neste campo" de "apaga este campo",
    // e apagar um valor virava impossível.
    const campos: Partial<CamposManuais> = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (campo in body) campos[campo] = body[campo] ?? null;
    }

    if (Object.keys(campos).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo editável informado' }, { status: 400 });
    }

    await salvarCamposManuais(ano, mes, cpf, campos);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[folha-pagamento/manual][POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
