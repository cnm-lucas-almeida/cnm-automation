import axios from 'axios';

const AUTH_URL = 'https://autenticador.secullum.com.br';
const PONTO_URL = 'https://pontowebintegracaoexterna.secullum.com.br';

const SECULLUM_USERNAME = process.env.SECULLUM_USERNAME!;
const SECULLUM_PASSWORD = process.env.SECULLUM_PASSWORD!;
const SECULLUM_BANCO_ID = process.env.SECULLUM_BANCO_ID!;

// ── Token cache ──────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number; refreshToken: string } | null = null;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// O endpoint de autenticação do Secullum falha esporadicamente com 500 (sem
// relação com credencial — reproduzido isolado, some numa nova tentativa).
// Retry com backoff, e uma única chamada em voo mesmo se vários colaboradores
// pedem token ao mesmo tempo (relatório roda com concorrência) — evita várias
// requisições de login simultâneas na mesma conta.
let requisicaoTokenEmVoo: Promise<string> | null = null;

async function autenticar(tentativa = 1): Promise<{ token: string; expiresAt: number; refreshToken: string }> {
  const params = new URLSearchParams({
    grant_type: 'password',
    username: SECULLUM_USERNAME,
    password: SECULLUM_PASSWORD,
    client_id: '3',
  });

  try {
    const res = await axios.post(`${AUTH_URL}/Token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });
    return {
      token: res.data.access_token,
      expiresAt: Date.now() + res.data.expires_in * 1000,
      refreshToken: res.data.refresh_token,
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 500 && tentativa <= 3) {
      await esperar(500 * tentativa);
      return autenticar(tentativa + 1);
    }
    const body = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[Secullum Auth] Falha no token:', status, body);
    throw new Error(`Auth Secullum falhou (${status}): ${body}`);
  }
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  if (!requisicaoTokenEmVoo) {
    requisicaoTokenEmVoo = autenticar().finally(() => {
      requisicaoTokenEmVoo = null;
    }).then((resultado) => {
      tokenCache = resultado;
      return resultado.token;
    });
  }

  return requisicaoTokenEmVoo;
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

// ── Orçamento de /Calcular para double-check de falta (folha-pagamento) ──────
//
// O /Batidas não expõe justificativa (declaração, abono) quando o dia não tem
// nenhuma batida — só o /Calcular tem essa info (colunas JustPa./AbonoN). Mas
// o /Calcular tem limite de 100 req/h por banco, então só vale a pena chamar
// pontualmente pros colaboradores com um dia de falta suspeita (sem marcador
// no /Batidas), nunca em massa. Teto de segurança abaixo do limite real —
// se estourar (mês anômalo com muita falta suspeita, ou 429 do próprio
// Secullum), degrada silenciosamente: mantém o comportamento atual (falta
// integral) pros colaboradores que não couberem no orçamento, em vez de
// travar o fechamento inteiro.
const CALCULAR_ORCAMENTO_MAX_POR_HORA = 80;
let calcularOrcamentoContagem = 0;
let calcularOrcamentoJanelaInicio = Date.now();

function reservarOrcamentoCalcular(): boolean {
  const agora = Date.now();
  if (agora - calcularOrcamentoJanelaInicio > 60 * 60 * 1000) {
    calcularOrcamentoJanelaInicio = agora;
    calcularOrcamentoContagem = 0;
  }
  if (calcularOrcamentoContagem >= CALCULAR_ORCAMENTO_MAX_POR_HORA) return false;
  calcularOrcamentoContagem++;
  return true;
}

// Retorna null quando não foi possível confirmar (sem orçamento disponível ou
// 429 do Secullum) — quem chama deve tratar isso como "mantenha o cálculo
// local", nunca propagar erro.
export async function getCalcularComOrcamento(
  cpf: string,
  dataInicio: string,
  dataFim: string
): Promise<CalcularResponse | null> {
  const key = `${cpf}|${dataInicio}|${dataFim}`;
  const now = Date.now();
  if (calcularCache[key] && now - calcularCache[key].timestamp < CALCULAR_CACHE_TTL) {
    return calcularCache[key].data;
  }

  if (!reservarOrcamentoCalcular()) return null;

  try {
    const { data } = await getCalcular(cpf, dataInicio, dataFim);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 429) return null;
    throw err;
  }
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

export function minutosParaHHMM(minutos: number): string {
  const negativo = minutos < 0;
  const abs = Math.round(Math.abs(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${negativo ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Banco de horas ────────────────────────────────────────────────────────────
//
// Saldo do período = soma das diferenças diárias entre o horário batido e o
// horário esperado da escala. Diferença positiva vira extra, negativa vira
// atraso, e o saldo é extras - atrasos (negativo = colaborador está devendo).
//
// Calculado a partir do /Batidas (não do /Calcular, que tem limite de 100 req/h
// por banco e travaria um relatório rodado para todos os colaboradores) —
// comparando o horário batido com o horário esperado da escala naquele dia
// (campos MemoriaEntrada/MemoriaSaida) e aplicando a tolerância diária de 10min
// do Art. 58 §1º da CLT, do mesmo jeito que o /Calcular oficial já faz. Validado
// batendo os dois métodos ponta a ponta para o mesmo colaborador e período.

const TOLERANCIA_CLT_MIN = 10;

export interface DiaDetalheBanco {
  data: string; // YYYY-MM-DD
  trabalhadoMin: number;
  cargaMin: number;
  diffMin: number; // trabalhadoMin - cargaMin (0 quando justificado — ver `motivo`)
  tipo: 'extra' | 'atraso' | 'neutro' | 'justificado';
  motivo: string | null; // ex.: "Atestado médico" — só preenchido quando tipo === 'justificado'
}

export interface BancoHoras {
  extrasMin: number; // horas trabalhadas além da escala no período
  atrasosMin: number; // horas abaixo da escala no período
  saldoMin: number; // extrasMin - atrasosMin (negativo = devendo)
  temRegistro: boolean; // false quando não há nenhuma batida no período
  // Detalhe dia a dia, usado pra explicar de onde vieram os valores de
  // extras/atrasos acumulados (tela de "detalhes" por colaborador).
  diasDetalhe: DiaDetalheBanco[];
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

// Nomes amigáveis pros marcadores mais comuns que o Secullum manda nesses campos.
// Marcador não mapeado aqui ainda assim é exibido (com o texto cru), só não fica
// bonito — completar esse mapa conforme formos vendo novos casos reais.
const MOTIVO_LABELS: Record<string, string> = {
  'AT. MÉD': 'Atestado médico',
  'ABONO': 'Abono',
  'DECL.': 'Declaração',
  'FE. IND': 'Férias individual',
  'SUSP': 'Suspensão disciplinar',
  'GERAR': 'Dia pendente de processamento no Secullum',
};

function formatarMotivo(marcador: string): string {
  const chave = marcador.trim().toUpperCase();
  return MOTIVO_LABELS[chave] ?? (marcador.trim() || 'Dia sem apuração no Secullum');
}

// Retorna o motivo (já formatado p/ exibição) do dia, ou null se o dia não tem
// nenhum marcador de status especial (ou seja, é batida normal/ausência comum).
export function motivoStatusEspecial(batida: Batida): string | null {
  const campos: Array<string | null | undefined> = [
    batida.Entrada1, batida.Saida1,
    batida.Entrada2, batida.Saida2,
    batida.Entrada3, batida.Saida3,
    batida.Entrada4, batida.Saida4,
    batida.Entrada5, batida.Saida5,
  ];
  const marcador = campos.find((v) => v != null && !horarioValido(v));
  return marcador != null ? formatarMotivo(marcador) : null;
}

export function calcularCargaEsperadaMin(batida: Batida): number {
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

export function calcularBancoHorasDeBatidas(batidas: Batida[]): BancoHoras {
  let extrasMin = 0;
  let atrasosMin = 0;
  const diasDetalhe: DiaDetalheBanco[] = [];

  for (const batida of batidas) {
    const dia = batida.Data.split('T')[0];
    const motivo = motivoStatusEspecial(batida);
    const pulaDia = batida.Folga || batida.Neutro || batida.NBanco || motivo !== null;
    const trabalhadoMin = calcularHorasTrabalhadas(batida) * 60;
    const cargaMin = calcularCargaEsperadaMin(batida);
    const diffMin = trabalhadoMin - cargaMin;

    let tipo: DiaDetalheBanco['tipo'] = 'neutro';
    // Dia justificado (atestado, abono etc.) não é déficit real — não soma em
    // atrasosMin nem mostra a diferença de horas, senão parece que a pessoa
    // ficou devendo o dia inteiro quando na verdade estava, por exemplo, de
    // atestado médico.
    let diffExibido = diffMin;
    if (motivo !== null) {
      tipo = 'justificado';
      diffExibido = 0;
    } else {
      const contaNoSaldo = !pulaDia && Math.abs(diffMin) > TOLERANCIA_CLT_MIN;
      if (contaNoSaldo) {
        if (diffMin > 0) {
          extrasMin += diffMin;
          tipo = 'extra';
        } else {
          atrasosMin += -diffMin;
          tipo = 'atraso';
        }
      }
    }
    diasDetalhe.push({ data: dia, trabalhadoMin, cargaMin, diffMin: diffExibido, tipo, motivo });
  }

  return {
    extrasMin,
    atrasosMin,
    saldoMin: extrasMin - atrasosMin,
    temRegistro: diasDetalhe.length > 0,
    diasDetalhe,
  };
}

export async function calcularBancoHoras(
  cpf: string,
  dataInicio: string,
  dataFim: string
): Promise<BancoHoras> {
  return calcularBancoHorasDeBatidas(await getBatidas(cpf, dataInicio, dataFim));
}
