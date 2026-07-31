const CONVENIA_URL = 'https://public-api.convenia.com.br/api/v3';
const CONVENIA_TOKEN = process.env.CONVENIA_TOKEN!;

const CACHE_TTL = 5 * 60 * 1000;
const PAGE_SIZE = 100;

export interface ExperiencePeriod {
  firstEnd: string | null;
  secondEnd: string | null;
}

export interface Colaborador {
  id: string;
  nome: string;
  cpf: string | null;
  pis: string | null;
  status: string;
  cargo: string | null;
  departamento: string | null;
  dataAdmissao: string | null;
  email: string | null;
  gestorNome: string | null;
  experiencePeriod: ExperiencePeriod | null;
}

let cache: { data: Colaborador[]; ts: number } | null = null;
const salarioCache = new Map<string, { salario: number; ts: number }>();

// Busca de salário é 1 chamada por colaborador (rate limit não permite lote)
// e é o gargalo real do fechamento — expõe o andamento pra tela mostrar uma
// barra de progresso de verdade em vez do usuário achar que travou.
export interface ProgressoConvenia {
  total: number;
  atual: number;
}
let progressoSalario: ProgressoConvenia = { total: 0, atual: 0 };

export function obterProgressoConvenia(): ProgressoConvenia {
  return { ...progressoSalario };
}

function normalizarCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A API do Convenia tem rate limit agressivo — buscar salário de ~150
// colaboradores um por um (endpoint de detalhe não é em lote) esbarra nele
// fácil mesmo com poucas requisições simultâneas. Throttle global (mínimo
// 1,5s entre requisições, processo inteiro) + retry com backoff no 429.
//
// A reserva do próximo horário PRECISA acontecer antes do await, não depois
// — bug real encontrado: duas chamadas concorrentes (ex.: useEffect disparado
// 2x pelo Strict Mode do React em dev) liam `proximaRequisicaoLiberadaEm`
// antes de qualquer uma delas atualizar, calculavam a mesma espera e
// disparavam o fetch juntas, furando o throttle e estourando o 429 mesmo com
// o intervalo configurado.
let proximaRequisicaoLiberadaEm = 0;
const INTERVALO_MIN_MS = 1500;

async function conveniaFetch(path: string, params: Record<string, string | number> = {}, tentativa = 1): Promise<any> {
  const agora = Date.now();
  const inicioPermitido = Math.max(agora, proximaRequisicaoLiberadaEm);
  proximaRequisicaoLiberadaEm = inicioPermitido + INTERVALO_MIN_MS; // reserva o slot já, antes de esperar
  const espera = inicioPermitido - agora;
  if (espera > 0) await esperar(espera);

  const url = new URL(`${CONVENIA_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { token: CONVENIA_TOKEN },
    cache: 'no-store',
  });

  if (res.status === 429 && tentativa <= 8) {
    await esperar(Math.min(30_000, 1000 * 2 ** tentativa));
    return conveniaFetch(path, params, tentativa + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Convenia ${res.status}: ${body}`);
  }
  return res.json();
}

function mapColaborador(raw: any): Colaborador {
  return {
    id: raw.id,
    nome: [raw.name, raw.last_name].filter(Boolean).join(' '),
    cpf: normalizarCpf(raw.documents?.cpf ?? null),
    pis: raw.documents?.pis ?? null,
    status: raw.status,
    cargo: raw.job?.name ?? null,
    departamento: raw.department?.name ?? null,
    dataAdmissao: raw.hiring_date ?? null,
    email: raw.contact_information?.personal_email ?? null,
    gestorNome: raw.supervisor ? [raw.supervisor.name, raw.supervisor.last_name].filter(Boolean).join(' ') : null,
    experiencePeriod: raw.experience_period
      ? { firstEnd: raw.experience_period.first_end ?? null, secondEnd: raw.experience_period.second_end ?? null }
      : null,
  };
}

export async function listarColaboradores(forceRefresh = false): Promise<Colaborador[]> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  const colaboradores: Colaborador[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const res = await conveniaFetch('/employees', { paginate: PAGE_SIZE, page });
    for (const raw of res.data ?? []) colaboradores.push(mapColaborador(raw));
    lastPage = res.last_page ?? 1;
    page++;
  } while (page <= lastPage);

  cache = { data: colaboradores, ts: now };
  return colaboradores;
}

// A lista (/employees) não traz salário — só o detalhe (/employees/{id}) traz,
// e o detalhe por sua vez não repete o CPF. É preciso combinar as duas chamadas.
export async function buscarSalario(id: string, forceRefresh = false): Promise<number> {
  const now = Date.now();
  const cached = salarioCache.get(id);
  if (!forceRefresh && cached && now - cached.ts < CACHE_TTL) {
    return cached.salario;
  }

  const res = await conveniaFetch(`/employees/${id}`);
  const salario = parseFloat(res.data?.salary ?? '0') || 0;
  salarioCache.set(id, { salario, ts: now });
  return salario;
}

async function mapComConcorrencia<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;

  async function worker() {
    while (indice < items.length) {
      const atual = indice++;
      resultados[atual] = await fn(items[atual]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return resultados;
}

export interface ColaboradorComSalario extends Colaborador {
  salario: number;
}

export async function listarColaboradoresComSalario(forceRefresh = false): Promise<ColaboradorComSalario[]> {
  const colaboradores = await listarColaboradores(forceRefresh);
  progressoSalario = { total: colaboradores.length, atual: 0 };

  const resultado = await mapComConcorrencia(colaboradores, 1, async (c) => {
    const salario = await buscarSalario(c.id, forceRefresh);
    progressoSalario = { ...progressoSalario, atual: progressoSalario.atual + 1 };
    return { ...c, salario };
  });

  return resultado;
}
