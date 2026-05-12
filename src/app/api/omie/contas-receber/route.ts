import { NextResponse } from 'next/server';
import { listarContasReceber } from '@/lib/omie';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    const pageParam = searchParams.get('page');
    const nota = searchParams.get('nota');

    const formatDateToOmie = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    const filtroData = (dateStart && dateEnd) ? {
      data_vencimento_inicial: formatDateToOmie(dateStart),
      data_vencimento_final: formatDateToOmie(dateEnd)
    } : null;

    // Helper: delay entre chamadas para respeitar rate limit do Omie
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const isRetryableError = (msg: string) => {
      const retryable = ['REDUNDANT', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'socket hang up', 'network', 'timeout'];
      return retryable.some(keyword => msg?.toLowerCase().includes(keyword.toLowerCase()));
    };

    const fetchWithRetry = async (pagina: number, tentativas = 3): Promise<any> => {
      try {
        return await listarContasReceber(pagina, 500, filtroData);
      } catch (err: any) {
        if (tentativas > 0 && isRetryableError(err.message)) {
          console.log(`Erro recuperável na página ${pagina}: ${err.message}. Aguardando 5s... (${tentativas} tentativas restantes)`);
          await delay(5000);
          return fetchWithRetry(pagina, tentativas - 1);
        }
        throw err;
      }
    };

    // Se o frontend pediu uma página específica, retornamos apenas ela
    if (pageParam) {
      const p = parseInt(pageParam);
      const result = await fetchWithRetry(p);
      
      // Se houver filtro de nota, filtramos o array final dessa página
      if (nota && result.conta_receber_cadastro) {
        result.conta_receber_cadastro = result.conta_receber_cadastro.filter(
          (c: any) => c.numero_documento_fiscal?.toString().trim() === nota
        );
      }
      return NextResponse.json(result);
    }

    // Comportamento legado: buscar todas as páginas (caso algo ainda use sem o parâmetro 'page')
    const firstPage = await fetchWithRetry(1);
    let todosOsRegistros = firstPage.conta_receber_cadastro || [];
    const totalPaginas = firstPage.total_de_paginas || 1;

    for (let p = 2; p <= totalPaginas; p++) {
      await delay(1000);
      const result = await fetchWithRetry(p);
      if (result.conta_receber_cadastro) {
        todosOsRegistros = todosOsRegistros.concat(result.conta_receber_cadastro);
      }
    }

    if (nota) {
      todosOsRegistros = todosOsRegistros.filter(
        (c: any) => c.numero_documento_fiscal?.toString().trim() === nota
      );
    }
    
    return NextResponse.json({ conta_receber_cadastro: todosOsRegistros });
  } catch (error: any) {
    console.error("Erro na rota Omie:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
