import axios from 'axios';

const AUTH_URL = 'https://autenticador.secullum.com.br';
const PONTO_URL = 'https://pontowebintegracaoexterna.secullum.com.br';

const SECULLUM_USERNAME = process.env.SECULLUM_USERNAME!;
const SECULLUM_PASSWORD = process.env.SECULLUM_PASSWORD!;
const SECULLUM_BANCO_ID = process.env.SECULLUM_BANCO_ID!;

// ── Token cache ──────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number; refreshToken: string } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: 'password',
    username: SECULLUM_USERNAME,
    password: SECULLUM_PASSWORD,
    client_id: '3',
  });

  let res: any;
  try {
    res = await axios.post(`${AUTH_URL}/Token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });
  } catch (err: any) {
    const body = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[Secullum Auth] Falha no token:', err?.response?.status, body);
    throw new Error(`Auth Secullum falhou (${err?.response?.status}): ${body}`);
  }

  tokenCache = {
    token: res.data.access_token,
    expiresAt: now + res.data.expires_in * 1000,
    refreshToken: res.data.refresh_token,
  };

  return tokenCache.token;
}

// ── /Calcular cache (max 100 req/h por banco) ─────────────────────────────────

const calcularCache: Record<string, { data: CalcularDia[]; timestamp: number; fromCache: boolean }> = {};
const CALCULAR_CACHE_TTL = 60 * 60 * 1000; // 1 hora

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Banco {
  id: number;
  nome: string;
  documento: string;
  quantidadePessoas: number;
}

export interface Batida {
  Id: number;
  FuncionarioId: number;
  Data: string;
  Entrada1: string | null; Saida1: string | null;
  Entrada2: string | null; Saida2: string | null;
  Entrada3: string | null; Saida3: string | null;
  Entrada4: string | null; Saida4: string | null;
  Entrada5: string | null; Saida5: string | null;
  Folga: boolean;
  Neutro: boolean;
  Compensado: boolean;
  Refeicao: boolean;
  NBanco: boolean;
  Funcionario?: { NumeroPis: string; NumeroFolha: string; NumeroIdentificador: string };
}

export interface CalcularDia {
  Data: string;
  [key: string]: unknown;
}

export interface CacheInfo {
  fromCache: boolean;
  cachedAt?: number;
}

// ── API Helpers ───────────────────────────────────────────────────────────────

function pontoHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    secullumidbancoselecionado: SECULLUM_BANCO_ID,
  };
}

// ── Exported functions ────────────────────────────────────────────────────────

export async function listarBancos(): Promise<Banco[]> {
  const token = await getToken();
  const res = await axios.get(`${AUTH_URL}/ContasSecullumExterno/ListarBancos`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  return res.data;
}

export async function getBatidas(cpf: string, dataInicio: string, dataFim: string): Promise<Batida[]> {
  const token = await getToken();
  const res = await axios.get(`${PONTO_URL}/IntegracaoExterna/Batidas`, {
    headers: pontoHeaders(token),
    params: { dataInicio, dataFim, funcionarioCpf: cpf },
    timeout: 20_000,
  });
  return res.data;
}

export async function getCalcular(
  cpf: string,
  dataInicio: string,
  dataFim: string,
  forceRefresh = false
): Promise<{ data: CalcularDia[]; fromCache: boolean; cachedAt?: number }> {
  const key = `${cpf}|${dataInicio}|${dataFim}`;
  const now = Date.now();

  if (!forceRefresh && calcularCache[key] && now - calcularCache[key].timestamp < CALCULAR_CACHE_TTL) {
    return {
      data: calcularCache[key].data,
      fromCache: true,
      cachedAt: calcularCache[key].timestamp,
    };
  }

  const token = await getToken();
  const res = await axios.get(`${PONTO_URL}/IntegracaoExterna/Calcular`, {
    headers: pontoHeaders(token),
    params: { dataInicio, dataFim, funcionarioCpf: cpf },
    timeout: 20_000,
  });

  calcularCache[key] = { data: res.data, timestamp: now, fromCache: false };
  return { data: res.data, fromCache: false };
}

export function invalidarCacheCalcular(cpf: string, dataInicio: string, dataFim: string) {
  const key = `${cpf}|${dataInicio}|${dataFim}`;
  delete calcularCache[key];
}

// ── VR Calculation logic ──────────────────────────────────────────────────────

function horasParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export function calcularHorasTrabalhadas(batida: Batida): number {
  const pares: Array<[string | null, string | null]> = [
    [batida.Entrada1, batida.Saida1],
    [batida.Entrada2, batida.Saida2],
    [batida.Entrada3, batida.Saida3],
    [batida.Entrada4, batida.Saida4],
    [batida.Entrada5, batida.Saida5],
  ];

  let totalMinutos = 0;
  for (const [entrada, saida] of pares) {
    if (entrada && saida) {
      const diff = horasParaMinutos(saida) - horasParaMinutos(entrada);
      if (diff > 0) totalMinutos += diff;
    }
  }
  return totalMinutos / 60;
}

export function isDiaElegivelVR(batida: Batida, minHoras = 4): boolean {
  if (batida.Folga || batida.Neutro) return false;
  if (!batida.Entrada1) return false;
  return calcularHorasTrabalhadas(batida) >= minHoras;
}

// ── Análise de intervalo de almoço ─────────────────────────────────────────────

export type ViolacaoAlmoco = 'sem_intervalo' | 'intervalo_insuficiente' | null;

export interface AnaliseAlmoco {
  data: string;
  totalHorasTrabalhadas: number;
  maiorIntervaloMinutos: number | null;
  batidaIncompleta: boolean;
  violacao: ViolacaoAlmoco;
  minutosFaltantes: number;
}

export function analisarIntervaloAlmoco(
  batida: Batida,
  limiteHoras = 6,
  minutosMinimos = 60
): AnaliseAlmoco {
  const pares: Array<[string | null, string | null]> = [
    [batida.Entrada1, batida.Saida1],
    [batida.Entrada2, batida.Saida2],
    [batida.Entrada3, batida.Saida3],
    [batida.Entrada4, batida.Saida4],
    [batida.Entrada5, batida.Saida5],
  ];

  const paresCompletos = pares.filter(([e, s]) => e && s) as [string, string][];
  const batidaIncompleta = pares.some(([e, s]) => (e && !s) || (!e && s));

  const totalMinutos = paresCompletos.reduce((soma, [e, s]) => {
    const diff = horasParaMinutos(s) - horasParaMinutos(e);
    return diff > 0 ? soma + diff : soma;
  }, 0);
  const totalHoras = totalMinutos / 60;

  const gaps: number[] = [];
  for (let i = 0; i < paresCompletos.length - 1; i++) {
    const gap = horasParaMinutos(paresCompletos[i + 1][0]) - horasParaMinutos(paresCompletos[i][1]);
    if (gap > 0) gaps.push(gap);
  }
  const maiorIntervalo = gaps.length ? Math.max(...gaps) : null;

  let violacao: ViolacaoAlmoco = null;
  let minutosFaltantes = 0;

  const diaAplicavel = !batida.Folga && !batida.Neutro && totalHoras > limiteHoras;
  if (diaAplicavel) {
    if (maiorIntervalo === null) {
      violacao = 'sem_intervalo';
      minutosFaltantes = minutosMinimos;
    } else if (maiorIntervalo < minutosMinimos) {
      violacao = 'intervalo_insuficiente';
      minutosFaltantes = minutosMinimos - maiorIntervalo;
    }
  }

  return {
    data: batida.Data.split('T')[0],
    totalHorasTrabalhadas: Math.round(totalHoras * 100) / 100,
    maiorIntervaloMinutos: maiorIntervalo,
    batidaIncompleta,
    violacao,
    minutosFaltantes,
  };
}
