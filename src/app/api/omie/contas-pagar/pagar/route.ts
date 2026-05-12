import { NextResponse } from 'next/server';
import { lancarPagamento } from '@/lib/omie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      codigo_lancamento_omie,
      codigo_conta_corrente,
      valor, 
      data_pagamento,
      observacao
    } = body;

    if (!codigo_lancamento_omie || !codigo_conta_corrente || !valor || !data_pagamento) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    const payloadPagamento = {
      codigo_lancamento: codigo_lancamento_omie,
      codigo_conta_corrente: codigo_conta_corrente,
      valor: valor,
      data: data_pagamento,
      observacao: observacao || "Baixa automática da importação de planilha retroativa"
    };

    const pagamentoResult = await lancarPagamento(payloadPagamento);

    return NextResponse.json({
      success: true,
      codigo_baixa: pagamentoResult.codigo_baixa,
      pagamento: pagamentoResult
    });

  } catch (error: any) {
    console.error("Erro no processo de baixa avulsa:", error);
    return NextResponse.json({ 
        error: error.message || 'Erro interno ao processar baixa.' 
    }, { status: 500 });
  }
}
