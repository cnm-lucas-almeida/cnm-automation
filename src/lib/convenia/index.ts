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

function normalizarCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

async function conveniaFetch(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${CONVENIA_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { token: CONVENIA_TOKEN },
    cache: 'no-store',
  });

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
