import { NextResponse } from 'next/server';
import { lancarRecebimento, conciliarRecebimento } from '@/lib/omie';
import { appendLog } from '@/lib/logger';

export async function POST(request: Request) {
  let params: any = {};
  try {
    const body = await request.json();
    const { codigo_lancamento, valor, data, id_conta_corrente, nota, documento } = body;
    params = { codigo_lancamento, valor, nota, documento };

    if (!codigo_lancamento || !valor || !data || !id_conta_corrente) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    // Step 1: Lançar o recebimento (Baixa)
    console.log(`Iniciando baixa para o título ${codigo_lancamento} no valor de R$ ${valor}...`);
    const lancamentoResult = await lancarRecebimento({
      codigo_lancamento,
      valor,
      data,
      codigo_conta_corrente: id_conta_corrente
    });

    const codigo_baixa = lancamentoResult.codigo_baixa;
    
    if (!codigo_baixa) {
      throw new Error("Não foi possível obter o código da baixa retornado pelo Omie.");
    }

    // Step 2: Conciliar o recebimento
    console.log(`Baixa realizada com sucesso (ID: ${codigo_baixa}). Iniciando conciliação...`);
    const conciliacaoResult = await conciliarRecebimento(codigo_baixa);

    // LOG DE SUCESSO
    await appendLog({
      id_lancamento: codigo_lancamento,
      valor: valor,
      id_baixa: codigo_baixa,
      status: 'SUCESSO',
      mensagem: 'Baixa e conciliação realizadas',
      nota: nota,
      documento: documento
    });

    return NextResponse.json({
      success: true,
      codigo_baixa,
      conciliacao: conciliacaoResult
    });

  } catch (error: any) {
    console.error("Erro no processo de conciliação:", error);
    
    // LOG DE ERRO
    await appendLog({
      id_lancamento: params.codigo_lancamento || 'N/A',
      valor: params.valor || 0,
      status: 'ERRO',
      mensagem: error.message || 'Erro interno',
      nota: params.nota,
      documento: params.documento
    });

    return NextResponse.json({ 
        error: error.message || 'Erro interno ao processar conciliação.' 
    }, { status: 500 });
  }
}
