import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type TipoPeriodo = 'semana' | 'quinzena' | 'mes';

export interface JanelaCalendario {
  inicio: Date;
  fim: Date;
}

function toIso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// Quinzena não tem limite de calendário oficial no Brasil — convenção usada aqui: dia 1-15 e dia 16-fim do mês.
function inicioQuinzena(d: Date): Date {
  return d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth(), 16);
}

function fimQuinzena(d: Date): Date {
  return d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 15) : endOfMonth(d);
}

/** Janela de calendário (semana seg-dom, quinzena ou mês) que contém `referencia`. */
export function periodoAtual(tipo: TipoPeriodo, referencia: Date): JanelaCalendario {
  if (tipo === 'semana') return { inicio: startOfWeek(referencia, { weekStartsOn: 1 }), fim: endOfWeek(referencia, { weekStartsOn: 1 }) };
  if (tipo === 'quinzena') return { inicio: inicioQuinzena(referencia), fim: fimQuinzena(referencia) };
  return { inicio: startOfMonth(referencia), fim: endOfMonth(referencia) };
}

/** Janela imediatamente anterior à `janela` dada, do mesmo tipo. */
export function periodoAnterior(tipo: TipoPeriodo, janela: JanelaCalendario): JanelaCalendario {
  return periodoAtual(tipo, subDays(janela.inicio, 1));
}

/** Nova data de referência ao navegar uma janela para trás (-1) ou para frente (+1). */
export function deslocarReferencia(tipo: TipoPeriodo, referencia: Date, direcao: 1 | -1): Date {
  const janela = periodoAtual(tipo, referencia);
  return direcao === 1 ? addDays(janela.fim, 1) : subDays(janela.inicio, 1);
}

/** true quando a janela de `referencia` é a mesma que conteria "hoje" — usado para desabilitar o avanço. */
export function ehPeriodoAtual(tipo: TipoPeriodo, referencia: Date, hoje: Date = new Date()): boolean {
  return toIso(periodoAtual(tipo, referencia).inicio) === toIso(periodoAtual(tipo, hoje).inicio);
}

function capitalizarPrimeira(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatarPeriodo(tipo: TipoPeriodo, janela: JanelaCalendario): string {
  if (tipo === 'mes') {
    return capitalizarPrimeira(format(janela.inicio, "MMMM 'de' yyyy", { locale: ptBR }));
  }
  if (tipo === 'semana') {
    return `${format(janela.inicio, 'dd/MM')} – ${format(janela.fim, 'dd/MM/yyyy')}`;
  }
  const numero = janela.inicio.getDate() === 1 ? '1ª' : '2ª';
  return `${numero} quinzena de ${format(janela.inicio, "MMMM 'de' yyyy", { locale: ptBR })}`;
}

/** Intervalo de datas puro (sempre, independente do tipo) — usado onde as duas datas
 * exatas precisam estar visíveis sem depender do nome do período. */
export function formatarIntervalo(janela: JanelaCalendario): string {
  return `${format(janela.inicio, 'dd/MM/yyyy')} – ${format(janela.fim, 'dd/MM/yyyy')}`;
}

/** Igual a `formatarPeriodo`, mas sempre deixa o intervalo de datas explícito — útil quando o nome
 * curto ("2ª quinzena de julho") sozinho não deixa claro quais dias exatamente entram na conta. */
export function formatarPeriodoCompleto(tipo: TipoPeriodo, janela: JanelaCalendario): string {
  const intervalo = formatarIntervalo(janela);
  if (tipo === 'semana') return intervalo;
  return `${formatarPeriodo(tipo, janela)} (${intervalo})`;
}

export { toIso as periodoParaIso };
