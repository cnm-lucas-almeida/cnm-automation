import axios from 'axios';

const OMIE_APP_KEY = process.env.OMIE_APP_KEY;
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET;
const OMIE_API_URL = 'https://app.omie.com.br/api/v1/';

const omieClient = axios.create({
  baseURL: OMIE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Cache simples para evitar erro de "Consumo Redundante" do Omie em chamadas estáticas
const omieCache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de cache

async function fetchWithCache(key: string, fetchFn: () => Promise<any>) {
  const now = Date.now();
  if (omieCache[key] && (now - omieCache[key].timestamp < CACHE_TTL)) {
    return omieCache[key].data;
  }
  const data = await fetchFn();
  omieCache[key] = { data, timestamp: now };
  return data;
}

export async function listarContasReceber(pagina = 1, registrosPorPagina = 500, filtroData: any = null) {
  const call = "ListarContasReceber";
  const param: any[] = [
    {
      pagina,
      registros_por_pagina: registrosPorPagina,
      apenas_importado_api: "N",
      filtrar_apenas_titulos_em_aberto: "N",
      filtrar_apenas_inclusao: "N"
    }
  ];

  // Adicionar filtros de data, se fornecidos
  if (filtroData) {
      if (filtroData.data_vencimento_inicial) param[0].filtrar_por_data_de = filtroData.data_vencimento_inicial;
      if (filtroData.data_vencimento_final) param[0].filtrar_por_data_ate = filtroData.data_vencimento_final;
  }

  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: param
  };

  try {
    const response = await omieClient.post('financas/contareceber/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao buscar dados na Omie:', details);
    throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}

export async function lancarRecebimento(params: {
  codigo_lancamento: number;
  codigo_conta_corrente: number;
  valor: number;
  data: string;
  observacao?: string;
}) {
  const payload = {
    call: "LancarRecebimento",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [
      {
        codigo_lancamento: params.codigo_lancamento,
        codigo_baixa: 0, // 0 para novo recebimento
        codigo_conta_corrente: params.codigo_conta_corrente,
        valor: params.valor,
        data: params.data,
        observacao: params.observacao || "Baixa automática via Omie Validator"
      }
    ]
  };

  try {
    const response = await omieClient.post('financas/contareceber/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao lançar recebimento na Omie:', details);
    throw new Error(`Falha ao lançar recebimento: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}

export async function conciliarRecebimento(codigo_baixa: number) {
  const payload = {
    call: "ConciliarRecebimento",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [
      {
        codigo_baixa: codigo_baixa
      }
    ]
  };

  try {
    const response = await omieClient.post('financas/contareceber/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao conciliar recebimento na Omie:', details);
    throw new Error(`Falha ao conciliar recebimento: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}

export async function listarClientesFornecedores(pagina = 1, registrosPorPagina = 50, termoBusca?: string) {
  const param: any = {
    pagina,
    registros_por_pagina: registrosPorPagina,
    apenas_importado_api: "N"
  };

  if (termoBusca) {
    param.clientesFiltro = {
      razao_social: termoBusca
    };
  }

  const payload = {
    call: "ListarClientes",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param]
  };

  try {
    const response = await omieClient.post('geral/clientes/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || "";
    
    // Omie retorna erro 500 com essa mensagem quando a busca não encontra nada.
    // Tratamos como lista vazia em vez de erro para não interromper o fluxo.
    if (details.includes("Não existem registros para a página")) {
      return { clientes_cadastro: [] };
    }

    const errorMsg = details || error?.response?.data || error.message;
    console.error('Erro ao buscar clientes/fornecedores na Omie:', errorMsg);
    throw new Error(`Falha na comunicação com Omie: ${typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}`);
  }
}

export async function listarCategorias() {
  return fetchWithCache(`todas-categorias-v2`, async () => {
    let allCategories: any[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    try {
      do {
        const payload = {
          call: "ListarCategorias",
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [
            {
              pagina,
              registros_por_pagina: 500
            }
          ]
        };
        const response = await omieClient.post('geral/categorias/', payload);
        const data = response.data;
        
        if (data.categoria_cadastro) {
          allCategories = allCategories.concat(data.categoria_cadastro);
        }
        
        totalPaginas = data.total_de_paginas || 1;
        pagina++;
        
        // Pequena pausa para evitar rate limit em muitas páginas
        if (pagina <= totalPaginas) {
          await new Promise(r => setTimeout(r, 100));
        }
      } while (pagina <= totalPaginas);

      return { categoria_cadastro: allCategories };
    } catch (error: any) {
      const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
      console.error('Erro ao buscar categorias na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
    }
  });
}

export async function listarContasCorrentes() {
  return fetchWithCache(`todas-contas-correntes`, async () => {
    let allAccounts: any[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    try {
      do {
        const payload = {
          call: "ListarContasCorrentes",
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [
            {
              pagina,
              registros_por_pagina: 100,
              apenas_importado_api: "N"
            }
          ]
        };
        const response = await omieClient.post('geral/contacorrente/', payload);
        const data = response.data;
        
        if (data.ListarContasCorrentes) {
          allAccounts = allAccounts.concat(data.ListarContasCorrentes);
        }
        
        totalPaginas = data.total_de_paginas || 1;
        pagina++;
        
        if (pagina <= totalPaginas) {
          await new Promise(r => setTimeout(r, 100));
        }
      } while (pagina <= totalPaginas);

      return { ListarContasCorrentes: allAccounts };
    } catch (error: any) {
      const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
      console.error('Erro ao buscar contas correntes na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
    }
  });
}

export async function incluirContaPagar(param: any) {
  const payload = {
    call: "IncluirContaPagar",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param]
  };

  try {
    const response = await omieClient.post('financas/contapagar/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao incluir conta a pagar na Omie:', details);
    throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}

export async function lancarPagamento(param: any) {
  const payload = {
    call: "LancarPagamento",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param]
  };

  try {
    const response = await omieClient.post('financas/contapagar/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao lançar pagamento na Omie:', details);
    throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}
export async function listarContasPagar(filtro: any) {
  let allAccounts: any[] = [];
  let pagina = 1;
  let totalPaginas = 1;

  try {
    do {
      const payload = {
        call: "ListarContasPagar",
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [
          {
            pagina,
            registros_por_pagina: 500,
            apenas_importado_api: "N",
            ...filtro
          }
        ]
      };

      const response = await omieClient.post('financas/contapagar/', payload);
      const data = response.data;

      if (data.conta_pagar_cadastro) {
        allAccounts = allAccounts.concat(data.conta_pagar_cadastro);
      }

      totalPaginas = data.total_de_paginas || 1;
      pagina++;

      // Pequena pausa para evitar rate limit em muitas páginas
      if (pagina <= totalPaginas) {
        await new Promise(r => setTimeout(r, 100));
      }
    } while (pagina <= totalPaginas);

    return { conta_pagar_cadastro: allAccounts };
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao listar contas a pagar na Omie:', details);
    throw new Error(`Falha na comunicação com Omie: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}
