import { NextResponse } from 'next/server';
import { alterarContaPagar } from '@/lib/omie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      codigo_lancamento_omie,
      codigo_conta_corrente,
      codigo_categoria,
      codigo_departamento,
      codigo_fornecedor,
      data_vencimento,
      valor,
      data_pagamento,
      observacao
    } = body;

    if (!codigo_lancamento_omie || !codigo_conta_corrente || !codigo_categoria || !codigo_departamento || !valor) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    const payloadAlteracao: any = {
      codigo_lancamento_omie,
      valor_documento: valor,
      id_conta_corrente: codigo_conta_corrente,
      codigo_categoria,
      distribuicao: [
        {
          cCodDep: String(codigo_departamento),
          nPerDep: 100
        }
      ]
    };

    if (codigo_fornecedor) payloadAlteracao.codigo_cliente_fornecedor = codigo_fornecedor;
    if (data_vencimento) payloadAlteracao.data_vencimento = data_vencimento;
    if (data_pagamento) payloadAlteracao.data_previsao = data_pagamento;
    if (observacao) payloadAlteracao.observacao = observacao;

    const alteracaoResult = await alterarContaPagar(payloadAlteracao);

    return NextResponse.json({
      success: true,
      alteracao: alteracaoResult
    });
  } catch (error: any) {
    console.error('Erro ao atualizar conta já cadastrada:', error);
    return NextResponse.json({
      error: error.message || 'Erro interno ao atualizar conta.'
    }, { status: 500 });
  }
}