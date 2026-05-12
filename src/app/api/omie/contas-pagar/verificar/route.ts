import { NextResponse } from 'next/server';
import { listarContasPagar } from '@/lib/omie';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const codigo_cliente = searchParams.get('codigo_cliente');
  const valor = searchParams.get('valor');
  const data_vencimento = searchParams.get('data_vencimento');
  const numero_nf = searchParams.get('numero_nf');

  if (!codigo_cliente || !valor || !data_vencimento) {
    return NextResponse.json({ error: 'Parâmetros insuficientes (codigo_cliente, valor, data_vencimento obrigatórios)' }, { status: 400 });
  }

  try {
    // LOG: Debug dos parâmetros recebidos
    console.log(`[VERIFICAR] Buscando duplicatas para:`, {
      codigo_cliente,
      valor,
      data_vencimento,
      numero_nf
    });

    // Buscar todas as contas a pagar do cliente (com paginação completa)
    const data = await listarContasPagar({
      filtrar_cliente: Number(codigo_cliente),
      registros_por_pagina: 500
    });
    
    // LOG: Debug do retorno
    console.log(`[VERIFICAR] API retornou ${(data.conta_pagar_cadastro || []).length} contas para cliente ${codigo_cliente}`);

    const contas = data.conta_pagar_cadastro || [];

    // Converter e normalizar o valor
    const valorNumerico = Number(valor);
    
    // Função para normalizar valores (converter string com vírgula para número)
    const normalizarValor = (val: any) => {
      if (typeof val === 'number') return val;
      const str = String(val).trim();
      // Remover espaços, converter vírgula para ponto
      return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    };
    
    // Filtrar por valor com margem de até R$ 0,01 e data de vencimento em janela de 3 dias
    const dateObj = new Date(data_vencimento.split('/').reverse().join('-') + 'T12:00:00');
    const inicio = new Date(dateObj);
    inicio.setDate(inicio.getDate() - 3);
    const fim = new Date(dateObj);
    fim.setDate(fim.getDate() + 3);

    console.log(`[VERIFICAR] Critérios de busca:`, {
      valorPlanilha: valor,
      valorNumerico,
      data_vencimento,
      dataInicio: inicio.toISOString().split('T')[0],
      dataFim: fim.toISOString().split('T')[0],
      margem: '±0.01'
    });

    const duplicados = contas.filter((c: any) => {
      // Verificar valor (margem de R$ 0,01) - normalizar ambos
      const valorOmieNormalizado = normalizarValor(c.valor_documento);
      const diffValor = Math.abs(valorOmieNormalizado - valorNumerico);
      const valorOk = diffValor <= 0.01;

      // Verificar data de vencimento (janela de 3 dias)
      let dataOk = false;
      if (c.data_vencimento) {
        const cDate = new Date(c.data_vencimento.split('/').reverse().join('-') + 'T12:00:00');
        dataOk = cDate >= inicio && cDate <= fim;
      }

      // Log detalhado para debug
      if (!valorOk || !dataOk) {
        console.log(`[VERIFICAR] Conta ${c.codigo_lancamento_omie}: Valor ${c.valor_documento} → ${valorOmieNormalizado} (diff: ${diffValor.toFixed(2)}, OK: ${valorOk}), Vto: ${c.data_vencimento} (OK: ${dataOk}), Status: ${c.status_titulo}`);
      }

      if (!valorOk) return false;
      if (!dataOk) return false;

      // Se numero_nf foi fornecido, tentar matching também por NF
      if (numero_nf && c.numero_documento_fiscal) {
        // Normalizar números de NF para comparação (remover zeros à esquerda, etc)
        const nfPlanilha = String(numero_nf).trim();
        const nfOmie = String(c.numero_documento_fiscal).trim();
        
        // Match se os números finais forem iguais (útil quando há zeros à esquerda)
        if (nfPlanilha === nfOmie || nfPlanilha.slice(-10) === nfOmie.slice(-10)) {
          return true;
        }
      }

      // Caso contrário, é um duplicado por valor + data
      console.log(`[VERIFICAR] ✅ MATCH! Código ${c.codigo_lancamento_omie}, Valor ${valorOmieNormalizado}, Vto ${c.data_vencimento}, Status: ${c.status_titulo}`);
      return true;
    });

    // Enriquecer dados com informações de status
    const duplicadosEnriquecidos = duplicados.map((c: any) => {
      // Determinar o status
      let statusFormatado = c.status_titulo || 'DESCONHECIDO';
      const estaAberto = statusFormatado === 'ABERTO' || statusFormatado === 'ATRASADO';
      const estaPago = statusFormatado === 'PAGO' || statusFormatado === 'LIQUIDADO';

      return {
        codigo: c.codigo_lancamento_omie,
        status: statusFormatado,
        valor: c.valor_documento,
        vencimento: c.data_vencimento,
        nf: c.numero_documento_fiscal || 'N/A',
        descricao: c.descricao || '',
        observacao: c.observacao || '',
        data_pagamento: c.data_pagamento || null,
        estaAberto,
        estaPago,
        permiteAlteracao: estaAberto // Permite alterar se está aberto
      };
    });

    // Análise do resultado
    const temEmAberto = duplicadosEnriquecidos.some((d: any) => d.estaAberto);
    const temPago = duplicadosEnriquecidos.some((d: any) => d.estaPago);

    console.log(`Verificação: Cliente ${codigo_cliente}, Valor ${valor}, Data ${data_vencimento}, NF ${numero_nf || 'N/A'}. Total contas: ${contas.length}, Duplicados: ${duplicados.length}, Em Aberto: ${temEmAberto}, Pago: ${temPago}`);

    return NextResponse.json({
      exists: duplicadosEnriquecidos.length > 0,
      duplicados: duplicadosEnriquecidos,
      resumo: {
        total_encontrados: duplicadosEnriquecidos.length,
        tem_em_aberto: temEmAberto,
        tem_pago: temPago
      },
      debug: {
        total_contas_cliente: contas.length,
        contas_analisadas: contas.map((c: any) => ({
          codigo: c.codigo_lancamento_omie,
          valor: c.valor_documento,
          vencimento: c.data_vencimento,
          status: c.status_titulo
        }))
      }
    });

  } catch (error: any) {
    console.error('Erro na verificação:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
