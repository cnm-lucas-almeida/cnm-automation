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

const calcularCache: Record<string, { data: CalcularResponse; timestamp: number; fromCache: boolean }> = {};
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
  // Horário esperado da escala nesse dia (independe do horário batido) — usado para
  // calcular extras/atrasos localmente sem depender do /Calcular.
  MemoriaEntrada1?: string | null; MemoriaSaida1?: string | null;
  MemoriaEntrada2?: string | null; MemoriaSaida2?: string | null;
  MemoriaEntrada3?: string | null; MemoriaSaida3?: string | null;
  MemoriaEntrada4?: string | null; MemoriaSaida4?: string | null;
  MemoriaEntrada5?: string | null; MemoriaSaida5?: string | null;
  Funcionario?: { NumeroPis: string; NumeroFolha: string; NumeroIdentificador: string };
}

// Resposta bruta do endpoint /Calcular: tabela em formato colunar (uma linha por dia).
export interface CalcularResponse {
  Colunas: string[];
  Linhas: Array<{ Key: string; Value: Array<string | null> }>;
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
): Promise<{ data: CalcularResponse; fromCache: boolean; cachedAt?: number }> {
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
  // Este endpoint só aceita POST com os campos capitalizados abaixo (não GET com dataInicio/dataFim).
  const res = await axios.post(
    `${PONTO_URL}/IntegracaoExterna/Calcular`,
    { DataInicial: dataInicio, DataFinal: dataFim, FuncionarioCpf: cpf },
    { headers: pontoHeaders(token), timeout: 20_000 }
  );

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

// ── Parsing genérico do /Calcular ─────────────────────────────────────────────

export interface LinhaCalculo {
  data: string; // YYYY-MM-DD
  valores: Record<string, string | null>; // nome da coluna → valor (ex.: "Ex75%": "01:19")
}

export function parseCalcularLinhas(resp: CalcularResponse): LinhaCalculo[] {
  return resp.Linhas.map((linha) => {
    const valores: Record<string, string | null> = {};
    resp.Colunas.forEach((col, i) => {
      valores[col] = linha.Value[i] ?? null;
    });
    return { data: linha.Key.split('T')[0], valores };
  });
}

function hhmmParaMinutos(valor: string | null): number {
  if (!valor) return 0;
  const negativo = valor.startsWith('-');
  const limpo = negativo ? valor.slice(1) : valor;
  const [h, m] = limpo.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return (negativo ? -1 : 1) * (h * 60 + m);
}

export function minutosParaHHMM(minutos: number): string {
  const negativo = minutos < 0;
  const abs = Math.round(Math.abs(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${negativo ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Banco de horas — Copa do Mundo (folga em 29/06) ───────────────────────────
//
// No dia 29/06 a empresa liberou os colaboradores durante o jogo do Brasil, mas
// o mês de junho fechou como se o dia tivesse sido trabalhado integralmente (8h).
// As horas não trabalhadas naquele dia viraram uma dívida da empresa com o
// colaborador, a ser paga em folha em julho — descontada pelas horas extras e
// voltando a crescer com eventuais atrasos, ambos contados a partir de 01/07
// (o fechamento de junho não entra na conta).
//
// Calculado a partir do /Batidas (não do /Calcular, que tem limite de 100 req/h
// por banco e travaria um relatório rodado para todos os colaboradores) —
// comparando o horário batido com o horário esperado da escala naquele dia
// (campos MemoriaEntrada/MemoriaSaida) e aplicando a tolerância diária de 10min
// do Art. 58 §1º da CLT, do mesmo jeito que o /Calcular oficial já faz. Validado
// batendo os dois métodos ponta a ponta para o mesmo colaborador e período.

const COPA_DATA = '2026-06-29';
const COPA_COMPENSACAO_INICIO = '2026-07-01';
const TOLERANCIA_CLT_MIN = 10;

export interface BancoHorasCopa {
  devidoMin: number; // quanto a empresa deve pelo dia 29/06
  extrasMin: number; // horas trabalhadas além da escala, acumuladas desde 01/07
  atrasosMin: number; // horas abaixo da escala, acumuladas desde 01/07
  compensadoMin: number; // extrasMin - atrasosMin
  faltaPagarMin: number; // devidoMin - compensadoMin
  diaCopaEncontrado: boolean;
}

// Em dias com status administrativo (atestado médico, abono, declaração, férias
// individual etc.), o Secullum retorna um marcador textual nos campos Entrada/Saida
// em vez de HH:mm ou null (ex.: "AT. MÉD", "ABONO", "DECL.", "FE. IND", "GERAR" ou
// até string vazia). Sem esse check, o parse de horário vira NaN, o dia conta como
// 0min trabalhado contra a carga esperada inteira (Memoria*) e o colaborador aparece
// devendo/atrasado num dia em que na verdade estava, por exemplo, de atestado médico.
const HORARIO_REGEX = /^\d{1,2}:\d{2}$/;

function horarioValido(valor: string | null | undefined): boolean {
  return valor == null || HORARIO_REGEX.test(valor);
}

function diaComStatusEspecial(batida: Batida): boolean {
  const campos: Array<string | null | undefined> = [
    batida.Entrada1, batida.Saida1,
    batida.Entrada2, batida.Saida2,
    batida.Entrada3, batida.Saida3,
    batida.Entrada4, batida.Saida4,
    batida.Entrada5, batida.Saida5,
  ];
  return campos.some((v) => v != null && !horarioValido(v));
}

function calcularCargaEsperadaMin(batida: Batida): number {
  const pares: Array<[string | null | undefined, string | null | undefined]> = [
    [batida.MemoriaEntrada1, batida.MemoriaSaida1],
    [batida.MemoriaEntrada2, batida.MemoriaSaida2],
    [batida.MemoriaEntrada3, batida.MemoriaSaida3],
    [batida.MemoriaEntrada4, batida.MemoriaSaida4],
    [batida.MemoriaEntrada5, batida.MemoriaSaida5],
  ];

  let totalMinutos = 0;
  for (const [entrada, saida] of pares) {
    if (entrada && saida) {
      const diff = horasParaMinutos(saida) - horasParaMinutos(entrada);
      if (diff > 0) totalMinutos += diff;
    }
  }
  return totalMinutos;
}

export async function calcularBancoHorasCopa(cpf: string, dataFim: string): Promise<BancoHorasCopa> {
  const batidas = await getBatidas(cpf, COPA_DATA, dataFim);

  let devidoMin = 0;
  let diaCopaEncontrado = false;
  let extrasMin = 0;
  let atrasosMin = 0;

  for (const batida of batidas) {
    const dia = batida.Data.split('T')[0];
    const pulaDia = batida.Folga || batida.Neutro || batida.NBanco || diaComStatusEspecial(batida);
    const trabalhadoMin = calcularHorasTrabalhadas(batida) * 60;
    const cargaMin = calcularCargaEsperadaMin(batida);
    const diffMin = trabalhadoMin - cargaMin;

    if (dia === COPA_DATA) {
      devidoMin = pulaDia ? 0 : Math.max(0, -diffMin);
      diaCopaEncontrado = true;
    } else if (dia >= COPA_COMPENSACAO_INICIO && !pulaDia && Math.abs(diffMin) > TOLERANCIA_CLT_MIN) {
      if (diffMin > 0) extrasMin += diffMin;
      else atrasosMin += -diffMin;
    }
  }

  const compensadoMin = extrasMin - atrasosMin;
  // Sem dívida da Copa (colaborador não saiu mais cedo em 29/06), não há o que
  // "faltar pagar" — mesmo que a pessoa tenha atrasos de julho sem relação
  // nenhuma com a Copa, isso é banco de horas normal, não vira dívida da Copa.
  const faltaPagarMin = devidoMin > 0 ? devidoMin - compensadoMin : 0;

  return { devidoMin, extrasMin, atrasosMin, compensadoMin, faltaPagarMin, diaCopaEncontrado };
}
