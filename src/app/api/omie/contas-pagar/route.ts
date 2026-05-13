import { NextResponse } from 'next/server';
import { incluirContaPagar, lancarPagamento } from '@/lib/omie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      codigo_fornecedor, 
      codigo_categoria, 
      codigo_departamento,
      id_conta_corrente, 
      valor, 
      data_vencimento, 
      data_pagamento,
      historico,
      numero_nf,
      observacao,
      id_externo 
    } = body;

    if (!codigo_fornecedor || !codigo_categoria || !codigo_departamento || !id_conta_corrente || !valor || !data_vencimento || !data_pagamento) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    // 1. Incluir Conta a Pagar
    const payloadInclusao = {
      codigo_lancamento_integracao: id_externo || `INT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      codigo_cliente_fornecedor: codigo_fornecedor,
      codigo_categoria: codigo_categoria,
      id_conta_corrente: id_conta_corrente,
      valor_documento: valor,
      data_vencimento: data_vencimento,
      data_previsao: data_pagamento, // A previsão será o próprio dia do pagamento
      data_emissao: data_pagamento,   // Data de emissão retroativa
      data_entrada: data_pagamento,   // Data de entrada retroativa
      numero_documento_fiscal: numero_nf || "",
      observacao: (historico ? `${historico}. ` : "") + (observacao || "")
    };

    if (codigo_departamento) {
      (payloadInclusao as any).distribuicao = [
        {
          cCodDep: String(codigo_departamento),
          nPerDep: 100
        }
      ];
    }

    const inclusaoResult = await incluirContaPagar(payloadInclusao);
    const codigo_lancamento_omie = inclusaoResult.codigo_lancamento_omie;

    if (!codigo_lancamento_omie) {
      throw new Error("Não foi possível obter o código do lançamento retornado pelo Omie.");
    }

    // 2. Lançar o Pagamento (Baixa)
    const payloadPagamento = {
      codigo_lancamento: codigo_lancamento_omie,
      codigo_conta_corrente: id_conta_corrente,
      valor: valor,
      data: data_pagamento,
      observacao: "Baixa automática da importação de planilha retroativa"
    };

    const pagamentoResult = await lancarPagamento(payloadPagamento);

    return NextResponse.json({
      success: true,
      codigo_lancamento_omie,
      codigo_baixa: pagamentoResult.codigo_baixa,
      inclusao: inclusaoResult,
      pagamento: pagamentoResult
    });

  } catch (error: any) {
    console.error("Erro no processo de importação e baixa:", error);
    return NextResponse.json({ 
        error: error.message || 'Erro interno ao processar inclusão e baixa.' 
    }, { status: 500 });
  }
}
