import axios from 'axios';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OMIE_APP_KEY = process.env.OMIE_APP_KEY;
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET;
const OMIE_API_URL = 'https://app.omie.com.br/api/v1/';
const OMIE_CACHE_FILE = process.env.OMIE_CACHE_FILE || '/tmp/omie-validator-cache.json';

const omieClient = axios.create({
  baseURL: OMIE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Cache simples para evitar erro de "Consumo Redundante" do Omie em chamadas estáticas
type OmieCacheEntry = { data: any; timestamp: number };

const omieCache: Record<string, OmieCacheEntry> = {};
const omieInflightCache = new Map<string, Promise<any>>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de cache
const STALE_CACHE_TTL = 1000 * 60 * 60 * 12; // 12 horas para fallback quando a Omie bloquear novas consultas

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getOmieErrorDetails(error: any) {
  return error?.response?.data?.faultstring || error?.response?.data || error?.message || 'Erro desconhecido';
}

function formatOmieError(details: any) {
  return typeof details === 'string' ? details : JSON.stringify(details);
}

function isRedundantError(details: any) {
  const text = formatOmieError(details);
  return (
    text.includes('REDUNDANT') ||
    text.includes('Consumo redundante') ||
    text.includes('API bloqueada por consumo indevido') ||
    text.includes('Já existe uma requisição desse método sendo executada')
  );
}

function getRedundantRetryDelay(details: any) {
  const text = formatOmieError(details);
  const seconds = Number(
    text.match(/Aguarde\s+(\d+)\s+segundos?/i)?.[1] ||
    text.match(/em\s+(\d+)\s+segundos?/i)?.[1] ||
    0
  );
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 5000);
  }
  return 1500;
}

export function isTemporaryOmieBlock(error: any) {
  return isRedundantError(getOmieErrorDetails(error));
}

async function readPersistentCache() {
  try {
    const content = await readFile(OMIE_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, OmieCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writePersistentCache(cache: Record<string, OmieCacheEntry>) {
  try {
    await mkdir(OMIE_CACHE_FILE.substring(0, OMIE_CACHE_FILE.lastIndexOf('/')), { recursive: true });
    await writeFile(OMIE_CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (error) {
    console.warn('Não foi possível persistir o cache da Omie.', error);
  }
}

async function getCacheEntry(key: string) {
  if (omieCache[key]) {
    return omieCache[key];
  }

  const persistentCache = await readPersistentCache();
  const entry = persistentCache[key];
  if (entry) {
    omieCache[key] = entry;
  }
  return entry;
}

async function setCacheEntry(key: string, data: any) {
  const entry = { data, timestamp: Date.now() };
  omieCache[key] = entry;

  const persistentCache = await readPersistentCache();
  persistentCache[key] = entry;
  await writePersistentCache(persistentCache);
}

async function postOmieWithRetry(path: string, payload: any, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await omieClient.post(path, payload);
      return response.data;
    } catch (error: any) {
      const details = getOmieErrorDetails(error);
      const shouldRetry = isRedundantError(details) && attempt < attempts;

      if (shouldRetry) {
        const delay = getRedundantRetryDelay(details);
        console.warn(`Omie bloqueou temporariamente ${path}. Nova tentativa em ${Math.ceil(delay / 1000)}s.`);
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }
}

async function fetchWithCache(key: string, fetchFn: () => Promise<any>) {
  const now = Date.now();
  const cachedEntry = await getCacheEntry(key);
  if (cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL)) {
    return cachedEntry.data;
  }

  const inflightRequest = omieInflightCache.get(key);
  if (inflightRequest) {
    return inflightRequest;
  }

  const request = (async () => {
    try {
      const data = await fetchFn();
      await setCacheEntry(key, data);
      return data;
    } catch (error: any) {
      const staleEntry = await getCacheEntry(key);
      const details = getOmieErrorDetails(error);

      if (staleEntry && isRedundantError(details) && (Date.now() - staleEntry.timestamp < STALE_CACHE_TTL)) {
        console.warn(`Usando cache persistido da Omie para ${key} após bloqueio temporário por consumo redundante.`);
        return staleEntry.data;
      }

      throw error;
    } finally {
      omieInflightCache.delete(key);
    }
  })();

  omieInflightCache.set(key, request);
  return request;
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
  const cacheKey = `clientes:${pagina}:${registrosPorPagina}:${termoBusca || ''}`;

  return fetchWithCache(cacheKey, async () => {
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
      return await postOmieWithRetry('geral/clientes/', payload);
    } catch (error: any) {
      const details = getOmieErrorDetails(error) || "";
      
      // Omie retorna erro 500 com essa mensagem quando a busca não encontra nada.
      // Tratamos como lista vazia em vez de erro para não interromper o fluxo.
      if (String(details).includes("Não existem registros para a página")) {
        return { clientes_cadastro: [] };
      }

      if (isTemporaryOmieBlock(error)) {
        console.warn('Busca de clientes temporariamente bloqueada pela Omie. Retornando lista vazia para evitar falha do fluxo.');
        return {
          clientes_cadastro: [],
          bloqueio_temporario: true,
          mensagem: formatOmieError(details)
        };
      }

      const errorMsg = details || error?.response?.data || error.message;
      console.error('Erro ao buscar clientes/fornecedores na Omie:', errorMsg);
      throw new Error(`Falha na comunicação com Omie: ${typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}`);
    }
  });
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
        const data = await postOmieWithRetry('geral/categorias/', payload);
        
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
      const details = getOmieErrorDetails(error);
      console.error('Erro ao buscar categorias na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${formatOmieError(details)}`);
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
        const data = await postOmieWithRetry('geral/contacorrente/', payload);
        
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
      const details = getOmieErrorDetails(error);
      console.error('Erro ao buscar contas correntes na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${formatOmieError(details)}`);
    }
  });
}

export async function listarDepartamentos() {
  return fetchWithCache(`todos-departamentos`, async () => {
    let allDepartments: any[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    try {
      do {
        const payload = {
          call: "ListarDepartamentos",
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [
            {
              pagina,
              registros_por_pagina: 500
            }
          ]
        };
        const data = await postOmieWithRetry('geral/departamentos/', payload);

        if (data.departamentos) {
          allDepartments = allDepartments.concat(data.departamentos);
        }

        totalPaginas = data.total_de_paginas || 1;
        pagina++;

        if (pagina <= totalPaginas) {
          await new Promise(r => setTimeout(r, 100));
        }
      } while (pagina <= totalPaginas);

      return { departamentos: allDepartments };
    } catch (error: any) {
      const details = getOmieErrorDetails(error);
      console.error('Erro ao buscar departamentos na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${formatOmieError(details)}`);
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

export async function alterarContaPagar(param: any) {
  const payload = {
    call: "AlterarContaPagar",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param]
  };

  try {
    const response = await omieClient.post('financas/contapagar/', payload);
    return response.data;
  } catch (error: any) {
    const details = error?.response?.data?.faultstring || error?.response?.data || error.message;
    console.error('Erro ao alterar conta a pagar na Omie:', details);
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
  const cacheKey = `contas-pagar:${JSON.stringify(filtro || {})}`;

  return fetchWithCache(cacheKey, async () => {
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

        const data = await postOmieWithRetry('financas/contapagar/', payload);

        if (data.conta_pagar_cadastro) {
          allAccounts = allAccounts.concat(data.conta_pagar_cadastro);
        }

        totalPaginas = data.total_de_paginas || 1;
        pagina++;

        if (pagina <= totalPaginas) {
          await new Promise(r => setTimeout(r, 100));
        }
      } while (pagina <= totalPaginas);

      return { conta_pagar_cadastro: allAccounts };
    } catch (error: any) {
      const details = getOmieErrorDetails(error);
      console.error('Erro ao listar contas a pagar na Omie:', details);
      throw new Error(`Falha na comunicação com Omie: ${formatOmieError(details)}`);
    }
  });
}
