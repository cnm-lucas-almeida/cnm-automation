import { getMetasPool } from '@/lib/db-metas';
import { getDreMensal } from '@/lib/dre';

export type PremissasProjecao = {
  ano: number;
  folhaSalario: number;
  folhaFgts: number;
  folhaInss: number;
  folhaRat: number;
  folhaTerceiros: number;
  folhaVr: number;
  propagandaAumentoPct: number;
  // Incremento em R$ da Receita Bruta sobre o mês anterior, um valor por mês do calendário
  // (índice 0 = Jan ... 11 = Dez). Só importa pros meses ainda não realizados — a projeção
  // encadeia a partir do último mês real e vai somando o incremento configurado de cada mês.
  receitaIncrementoMensal: number[];
};

const PREMISSAS_PADRAO: Omit<PremissasProjecao, 'ano'> = {
  folhaSalario: 0,
  folhaFgts: 0,
  folhaInss: 0,
  folhaRat: 0,
  folhaTerceiros: 0,
  folhaVr: 0,
  propagandaAumentoPct: 0,
  receitaIncrementoMensal: Array(12).fill(0),
};

export async function getPremissasProjecao(ano: number): Promise<PremissasProjecao> {
  const pool = getMetasPool();
  const { rows } = await pool.query(`SELECT * FROM dre_projecao_premissa WHERE ano = $1`, [ano]);
  if (!rows[0]) return { ano, ...PREMISSAS_PADRAO };
  const r = rows[0];
  return {
    ano,
    folhaSalario: Number(r.folha_salario),
    folhaFgts: Number(r.folha_fgts),
    folhaInss: Number(r.folha_inss),
    folhaRat: Number(r.folha_rat),
    folhaTerceiros: Number(r.folha_terceiros),
    folhaVr: Number(r.folha_vr),
    propagandaAumentoPct: Number(r.propaganda_aumento_pct),
    receitaIncrementoMensal: (r.receita_incremento_mensal ?? PREMISSAS_PADRAO.receitaIncrementoMensal).map(Number),
  };
}

export async function salvarPremissasProjecao(input: PremissasProjecao): Promise<PremissasProjecao> {
  const pool = getMetasPool();
  await pool.query(
    `INSERT INTO dre_projecao_premissa
       (ano, folha_salario, folha_fgts, folha_inss, folha_rat, folha_terceiros, folha_vr, propaganda_aumento_pct, receita_incremento_mensal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (ano) DO UPDATE SET
       folha_salario = EXCLUDED.folha_salario,
       folha_fgts = EXCLUDED.folha_fgts,
       folha_inss = EXCLUDED.folha_inss,
       folha_rat = EXCLUDED.folha_rat,
       folha_terceiros = EXCLUDED.folha_terceiros,
       folha_vr = EXCLUDED.folha_vr,
       propaganda_aumento_pct = EXCLUDED.propaganda_aumento_pct,
       receita_incremento_mensal = EXCLUDED.receita_incremento_mensal,
       updated_at = now()`,
    [
      input.ano, input.folhaSalario, input.folhaFgts, input.folhaInss, input.folhaRat,
      input.folhaTerceiros, input.folhaVr, input.propagandaAumentoPct, input.receitaIncrementoMensal,
    ]
  );
  return input;
}

type Metodo = 'run-rate' | '% receita' | 'fixo-folha' | 'var-propaganda';

type LinhaDriver = {
  chave: string;
  label: string;
  grupo: 'RECEITAS' | 'CUSTOS' | 'DESPESAS';
  metodo: Metodo;
  // Soma os códigos com sinal +1, subtrai os com sinal -1 — validado célula a célula contra o
  // relatório gerencial (docs/Relatório_Gerencial_Projecao jun. dez.26.xlsx, aba "De-Para
  // Realizado") em 2026-07-24. Ex.: "Desp. comerciais (não-folha)" = 4.2.2 − 4.2.2.01 − 4.2.2.02
  // — a planilha descreve a regra como "menos folha com. menos comissões", mas comissões
  // (4.2.2.01.009) já está dentro de 4.2.2.01, então subtraí-la de novo dava valor errado.
  codigos: { codigo: string; sinal: 1 | -1 }[];
};

const DRIVERS: LinhaDriver[] = [
  { chave: 'receitaBruta', label: 'Receita bruta com vendas e serviços', grupo: 'RECEITAS', metodo: 'run-rate', codigos: [{ codigo: '3.1.1', sinal: 1 }] },
  { chave: 'deducoes', label: '(–) Deduções da receita', grupo: 'RECEITAS', metodo: '% receita', codigos: [{ codigo: '3.1.2', sinal: 1 }] },
  { chave: 'receitasFinanceiras', label: 'Receitas financeiras', grupo: 'RECEITAS', metodo: 'run-rate', codigos: [{ codigo: '3.1.3', sinal: 1 }] },
  { chave: 'propaganda', label: 'Propaganda e publicidade', grupo: 'CUSTOS', metodo: 'var-propaganda', codigos: [{ codigo: '4.1.3.03.017', sinal: 1 }] },
  { chave: 'demaisCustos', label: 'Demais custos dos serviços (não-folha)', grupo: 'CUSTOS', metodo: 'run-rate', codigos: [{ codigo: '4.1.3', sinal: 1 }, { codigo: '4.1.3.03.017', sinal: -1 }] },
  {
    chave: 'folhaConsolidada', label: 'Folha consolidada (caixa) — toda a empresa', grupo: 'DESPESAS', metodo: 'fixo-folha',
    codigos: [
      { codigo: '4.2.1.01', sinal: 1 }, { codigo: '4.2.1.02', sinal: 1 },
      { codigo: '4.2.2.01', sinal: 1 }, { codigo: '4.2.2.02', sinal: 1 },
      { codigo: '4.2.2.01.009', sinal: -1 },
    ],
  },
  { chave: 'comissoes', label: 'Comissões comerciais', grupo: 'DESPESAS', metodo: '% receita', codigos: [{ codigo: '4.2.2.01.009', sinal: 1 }] },
  { chave: 'taxaCartao', label: 'Taxa de cartão', grupo: 'DESPESAS', metodo: '% receita', codigos: [{ codigo: '4.2.5.02.007', sinal: 1 }] },
  { chave: 'despAdmNaoFolha', label: 'Despesas administrativas (não-folha)', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.1', sinal: 1 }, { codigo: '4.2.1.01', sinal: -1 }, { codigo: '4.2.1.02', sinal: -1 }] },
  { chave: 'despComNaoFolha', label: 'Despesas comerciais (não-folha)', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.2', sinal: 1 }, { codigo: '4.2.2.01', sinal: -1 }, { codigo: '4.2.2.02', sinal: -1 }] },
  { chave: 'outrasDespProvisoes', label: 'Outras despesas e provisões', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.4', sinal: 1 }] },
  { chave: 'despFinanceirasSCartao', label: 'Despesas financeiras (s/ taxa cartão)', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.5', sinal: 1 }, { codigo: '4.2.5.02.007', sinal: -1 }] },
  { chave: 'despTributarias', label: 'Despesas tributárias', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.6', sinal: 1 }] },
  { chave: 'outrasDespesas', label: 'Outras despesas', grupo: 'DESPESAS', metodo: 'run-rate', codigos: [{ codigo: '4.2.9', sinal: 1 }] },
];

export type LinhaProjecao = {
  chave: string;
  label: string;
  grupo: 'RECEITAS' | 'CUSTOS' | 'DESPESAS';
  metodo: Metodo;
  valoresMensais: number[]; // 12 posições, Jan..Dez — índices < mesesRealizados vêm do balancete
  anoProjetado: number; // soma dos 12 meses
  pctReceita: number;
};

export type Projecao = {
  ano: number;
  mesesRealizados: number;
  mesesRestantes: number;
  ultimaCompetencia: string | null;
  premissas: PremissasProjecao;
  linhas: LinhaProjecao[];
  fechamentos: {
    receitaLiquida: number[];
    totalCustos: number[];
    totalDespesas: number[];
    resultadoDoPeriodo: number[];
  };
};

export async function getProjecao(ano: number): Promise<Projecao> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-01`;
  const dre = await getDreMensal(inicio, fim);
  const premissas = await getPremissasProjecao(ano);

  const mesesRealizados = dre.competencias.length;
  const mesesRestantes = 12 - mesesRealizados;
  const ultimaCompetencia = dre.competencias[dre.competencias.length - 1] ?? null;

  // Série mensal realizada de um driver (só os meses já importados) — soma/subtrai os códigos
  // do driver mês a mês, reaproveitando os valores que getDreMensal já calculou por classificação.
  const valoresMensaisPorCodigo = new Map(dre.arvore.map((n) => [n.classificacao, n.valoresMensais]));
  const acumuladoPorCodigo = new Map(dre.arvore.map((n) => [n.classificacao, n.acumulado]));

  const realizadoMensalDoDriver = (driver: LinhaDriver): number[] =>
    Array.from({ length: mesesRealizados }, (_, i) =>
      driver.codigos.reduce((soma, { codigo, sinal }) => soma + sinal * (valoresMensaisPorCodigo.get(codigo)?.[i] ?? 0), 0)
    );
  const realizadoAcumuladoDoDriver = (driver: LinhaDriver): number =>
    driver.codigos.reduce((soma, { codigo, sinal }) => soma + sinal * (acumuladoPorCodigo.get(codigo) ?? 0), 0);

  // Base pra "% receita": sempre a Receita Bruta (mesma referência usada no relatório original).
  const realizadoReceitaBruta = realizadoAcumuladoDoDriver(DRIVERS[0]);
  const realizadoMensalReceitaBruta = realizadoMensalDoDriver(DRIVERS[0]);

  const folhaMensal =
    premissas.folhaSalario + premissas.folhaFgts + premissas.folhaInss +
    premissas.folhaRat + premissas.folhaTerceiros + premissas.folhaVr;

  // Receita bruta projetada mês a mês primeiro — "% receita" e o "% s/ receita" do rodapé
  // dependem dela. Encadeada a partir do último mês real: cada mês projetado soma o incremento
  // em R$ configurado pra aquele mês do calendário sobre o mês anterior (real ou já projetado).
  let valorAnteriorReceitaBruta = mesesRealizados > 0 ? realizadoMensalReceitaBruta[mesesRealizados - 1] : 0;
  const receitaBrutaProjetadaPorMes: number[] = Array.from({ length: mesesRestantes }, (_, k) => {
    const mesCalendario = mesesRealizados + k; // 0 = Jan
    const incremento = premissas.receitaIncrementoMensal[mesCalendario] ?? 0;
    valorAnteriorReceitaBruta += incremento;
    return valorAnteriorReceitaBruta;
  });

  const linhas: LinhaProjecao[] = DRIVERS.map((driver) => {
    const realizadoMensal = realizadoMensalDoDriver(driver);
    const realizadoAcumulado = realizadoAcumuladoDoDriver(driver);
    const mediaMensal = mesesRealizados > 0 ? realizadoAcumulado / mesesRealizados : 0;

    const projetadoMensal: number[] = Array.from({ length: mesesRestantes }, (_, k) => {
      if (driver.chave === 'receitaBruta') return receitaBrutaProjetadaPorMes[k];
      if (driver.metodo === 'run-rate') return mediaMensal;
      if (driver.metodo === 'var-propaganda') return mediaMensal * (1 + premissas.propagandaAumentoPct);
      if (driver.metodo === '% receita') {
        return realizadoReceitaBruta !== 0 ? receitaBrutaProjetadaPorMes[k] * (realizadoAcumulado / realizadoReceitaBruta) : 0;
      }
      if (driver.metodo === 'fixo-folha') return folhaMensal;
      return 0;
    });

    const valoresMensais = [...realizadoMensal, ...projetadoMensal];
    const anoProjetado = valoresMensais.reduce((a, b) => a + b, 0);
    return {
      chave: driver.chave, label: driver.label, grupo: driver.grupo, metodo: driver.metodo,
      valoresMensais, anoProjetado,
      pctReceita: 0, // preenchido depois de calcular a receita líquida do ano
    };
  });

  const somaGrupoPorMes = (grupo: LinhaProjecao['grupo']): number[] =>
    Array.from({ length: 12 }, (_, i) => linhas.filter((l) => l.grupo === grupo).reduce((s, l) => s + l.valoresMensais[i], 0));

  const receitaLiquida = somaGrupoPorMes('RECEITAS');
  const totalCustos = somaGrupoPorMes('CUSTOS');
  const totalDespesas = somaGrupoPorMes('DESPESAS');
  const resultadoDoPeriodo = Array.from({ length: 12 }, (_, i) => receitaLiquida[i] - totalCustos[i] - totalDespesas[i]);

  const receitaLiquidaAno = receitaLiquida.reduce((a, b) => a + b, 0);
  for (const linha of linhas) {
    linha.pctReceita = receitaLiquidaAno !== 0 ? linha.anoProjetado / receitaLiquidaAno : 0;
  }

  return {
    ano, mesesRealizados, mesesRestantes, ultimaCompetencia, premissas, linhas,
    fechamentos: { receitaLiquida, totalCustos, totalDespesas, resultadoDoPeriodo },
  };
}
