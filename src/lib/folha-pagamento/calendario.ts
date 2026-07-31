// "Dias de descanso" pra fins de DSR = domingos + feriados nacionais do mês que
// não caem num domingo. "Dias úteis" = resto dos dias do mês (inclui sábado —
// setor comercial/imobiliário trabalha sábado). Validado contra a planilha real
// de junho/2026: 30 dias, 4 domingos + Corpus Christi (04/06) = 5 descanso, 25
// úteis — bate exatamente com a fórmula ÷25×5 encontrada nas células.
//
// Feriados municipais (ex.: Curitiba) não estão cobertos — se algum mês fechar
// diferente do esperado, é o primeiro lugar a checar.

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
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
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

function chaveISO(data: Date): string {
  return data.toISOString().split('T')[0];
}

export function feriadosNacionais(ano: number): Set<string> {
  const pascoaAno = pascoa(ano);
  const feriados = [
    `${ano}-01-01`, // Confraternização Universal
    chaveISO(somarDias(pascoaAno, -48)), // Carnaval (segunda)
    chaveISO(somarDias(pascoaAno, -47)), // Carnaval (terça)
    chaveISO(somarDias(pascoaAno, -2)), // Sexta-feira Santa
    chaveISO(somarDias(pascoaAno, 60)), // Corpus Christi
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // Nossa Sr.ª Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-11-20`, // Consciência Negra (nacional desde 2023)
    `${ano}-12-25`, // Natal
  ];
  return new Set(feriados);
}

export interface DiasMes {
  totalDias: number;
  diasUteis: number;
  diasDescanso: number; // domingos + feriados que não caem num domingo
}

export function calcularDiasMes(ano: number, mes: number): DiasMes {
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const feriados = feriadosNacionais(ano);

  let diasDescanso = 0;
  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const domingo = data.getUTCDay() === 0;
    const feriado = feriados.has(chaveISO(data));
    if (domingo || feriado) diasDescanso++;
  }

  return { totalDias, diasUteis: totalDias - diasDescanso, diasDescanso };
}

// Proporcional para admissão/desligamento no meio do mês — conta só os dias do
// período efetivamente trabalhado dentro do mês (validado contra a planilha:
// colaboradores admitidos no meio do mês usam divisores como ÷14×2, ÷6 etc.).
export function calcularDiasPeriodo(ano: number, mes: number, diaInicio: number, diaFim: number): DiasMes {
  const feriados = feriadosNacionais(ano);
  let diasDescanso = 0;
  const totalDias = diaFim - diaInicio + 1;

  for (let dia = diaInicio; dia <= diaFim; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const domingo = data.getUTCDay() === 0;
    const feriado = feriados.has(chaveISO(data));
    if (domingo || feriado) diasDescanso++;
  }

  return { totalDias, diasUteis: totalDias - diasDescanso, diasDescanso };
}
