import 'server-only';

export type ResultadoVinculo = {
  idPagamento: number;
  status: 'success' | 'processing' | 'error' | 'rate_limit';
  mensagem: string;
};

export type RespostaVinculo = {
  resultados: ResultadoVinculo[];
  rateLimited: boolean;
  retryAfter: number | null;
};

const ADMIN_BASE_URL = (process.env.CNM_ADMIN_URL ?? 'https://www.chavesnamao.com.br/').replace(/\/?$/, '/');
const ADMIN_USER = process.env.CNM_ADMIN_USER;
const ADMIN_PASS = process.env.CNM_ADMIN_PASS;
const TIMEOUT_MS = 120_000;

function extrairCookies(resposta: Response): string {
  const cookies = resposta.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

// A vinculação é feita pelo Admin, não direto na Omie: lá já existe o controle de
// consumo da API (espera o bloqueio passar em vez de insistir), a gravação em banco
// e o upload do PDF. Chamar a Omie daqui criaria um segundo consumidor competindo
// pela mesma cota.
async function autenticarNoAdmin(): Promise<string> {
  if (!ADMIN_USER || !ADMIN_PASS) {
    throw new Error(
      'Vinculação indisponível: configure CNM_ADMIN_USER e CNM_ADMIN_PASS no ambiente.',
    );
  }

  const resposta = await fetch(`${ADMIN_BASE_URL}auth/login/enter/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: ADMIN_USER, password: ADMIN_PASS }),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });

  const corpo = await resposta.text();
  if (!resposta.ok || corpo.toLowerCase().slice(0, 50).includes('error')) {
    throw new Error(`Falha ao autenticar no Admin (HTTP ${resposta.status}).`);
  }

  const cookies = extrairCookies(resposta);
  if (!cookies) throw new Error('Admin não devolveu cookie de sessão.');
  return cookies;
}

export async function vincularPagamentos(idsPagamento: number[]): Promise<RespostaVinculo> {
  const cookies = await autenticarNoAdmin();

  const corpo = new URLSearchParams();
  for (const id of idsPagamento) corpo.append('payment_ids[]', String(id));

  const resposta = await fetch(`${ADMIN_BASE_URL}admin/nfs_massivo/processar_direto/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookies,
    },
    body: corpo,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  type RespostaAdmin = {
    results?: Array<{ id: number | string; status: ResultadoVinculo['status']; message?: string }>;
    rate_limited?: boolean;
    retry_after?: number | string;
  };

  const texto = await resposta.text();
  let dados: RespostaAdmin;
  try {
    dados = JSON.parse(texto) as RespostaAdmin;
  } catch {
    throw new Error(
      resposta.status === 401 || resposta.status === 403
        ? 'Sessão do Admin recusada ao vincular.'
        : `Resposta inesperada do Admin (HTTP ${resposta.status}).`,
    );
  }

  const resultados: ResultadoVinculo[] = (dados.results ?? []).map((r) => ({
    idPagamento: Number(r.id),
    status: r.status,
    mensagem: r.message ?? '',
  }));

  return {
    resultados,
    rateLimited: Boolean(dados.rate_limited),
    retryAfter: dados.retry_after ? Number(dados.retry_after) : null,
  };
}
