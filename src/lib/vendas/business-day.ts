/**
 * Feriados nacionais fixos (mês/dia). Só muda se uma lei federal criar/remover feriado
 * (ex.: 20/11 virou feriado nacional em 2024) — não depende de atualização anual.
 */
const FIXED_HOLIDAYS: [month: number, day: number][] = [
  [1, 1], // Confraternização Universal
  [4, 21], // Tiradentes
  [5, 1], // Dia do Trabalho
  [9, 7], // Independência
  [10, 12], // Nossa Senhora Aparecida
  [11, 2], // Finados
  [11, 15], // Proclamação da República
  [11, 20], // Consciência Negra
  [12, 25], // Natal
];

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher — base dos feriados móveis. */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function addDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

function chave(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const holidaySetCache = new Map<number, Set<string>>();

function feriadosDoAno(ano: number): Set<string> {
  const cached = holidaySetCache.get(ano);
  if (cached) return cached;

  const set = new Set<string>();
  for (const [mes, dia] of FIXED_HOLIDAYS) {
    set.add(chave(new Date(ano, mes - 1, dia)));
  }
  const dPascoa = pascoa(ano);
  set.add(chave(addDias(dPascoa, -47))); // Carnaval (terça)
  set.add(chave(addDias(dPascoa, -2))); // Sexta-feira Santa
  set.add(chave(addDias(dPascoa, 60))); // Corpus Christi

  holidaySetCache.set(ano, set);
  return set;
}

export function isDiaUtil(data: Date): boolean {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !feriadosDoAno(data.getFullYear()).has(chave(data));
}

/** Dias úteis entre `from` e `to` (YYYY-MM-DD, inclusivo), em ordem crescente. */
export function diasUteisEntre(from: string, to: string): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const fim = new Date(`${to}T00:00:00`);
  while (cursor <= fim) {
    if (isDiaUtil(cursor)) dias.push(chave(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}
