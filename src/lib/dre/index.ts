import * as XLSX from 'xlsx';
import { getMetasPool } from '@/lib/db-metas';

// Padrão esperado do arquivo importado: export de balancete com "Saldo atual" acumulado desde
// o início do ano fiscal (YTD), chaveado pelo código hierárquico da Classificação (ex.:
// "3.1.1.03.001") — nunca pelo ID interno da conta, que pode ser recriado/renumerado no Omie.
// getDreMensal deriva o valor de cada mês subtraindo o acumulado do mês anterior; por isso um
// export "movimentação do mês" (já sem acumular) quebra a conta — sempre usar "saldo atual
// acumulado", igual Bal_01..05 do modelo original. A Conferência (getConferencia) detecta esse
// tipo de erro comparando o YTD calculado contra o saldo direto do balancete.
export type LinhaBalancete = {
  contaId: number | null;
  classificacao: string;
  tipo: string | null;
  nome: string;
  saldoAnterior: number;
  debito: number;
  credito: number;
  saldoAtual: number;
};

const COLUNAS_ESPERADAS = [
  'Conta',
  'Classificação',
  'Tipo',
  'Nome da conta contábil',
  'Saldo anterior',
  'Débito',
  'Crédito',
  'Saldo atual',
];

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

export function parseBalanceteFile(buffer: Buffer): LinhaBalancete[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error('Planilha vazia ou sem linhas de dados.');
  }

  const colunasEncontradas = Object.keys(rows[0]);
  const colunasFaltando = COLUNAS_ESPERADAS.filter((c) => !colunasEncontradas.includes(c));
  if (colunasFaltando.length > 0) {
    throw new Error(
      `Colunas faltando no arquivo: ${colunasFaltando.join(', ')}. Esperado: ${COLUNAS_ESPERADAS.join(', ')}.`
    );
  }

  return rows
    .filter((r) => String(r['Classificação']).trim() !== '')
    .map((r) => ({
      contaId: r['Conta'] !== '' ? Number(r['Conta']) : null,
      classificacao: String(r['Classificação']).trim(),
      tipo: String(r['Tipo']).trim() || null,
      nome: String(r['Nome da conta contábil']).trim(),
      saldoAnterior: toNumber(r['Saldo anterior']),
      debito: toNumber(r['Débito']),
      credito: toNumber(r['Crédito']),
      saldoAtual: toNumber(r['Saldo atual']),
    }));
}

export async function importarBalancete(competencia: string, linhas: LinhaBalancete[]): Promise<number> {
  const pool = getMetasPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const linha of linhas) {
      await client.query(
        `INSERT INTO dre_balancete_linha
           (competencia, conta_id, classificacao, tipo, nome, saldo_anterior, debito, credito, saldo_atual)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (competencia, classificacao) DO UPDATE SET
           conta_id = EXCLUDED.conta_id,
           tipo = EXCLUDED.tipo,
           nome = EXCLUDED.nome,
           saldo_anterior = EXCLUDED.saldo_anterior,
           debito = EXCLUDED.debito,
           credito = EXCLUDED.credito,
           saldo_atual = EXCLUDED.saldo_atual`,
        [
          competencia,
          linha.contaId,
          linha.classificacao,
          linha.tipo,
          linha.nome,
          linha.saldoAnterior,
          linha.debito,
          linha.credito,
          linha.saldoAtual,
        ]
      );
    }
    await client.query('COMMIT');
    return linhas.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCompetenciasDisponiveis(): Promise<string[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT to_char(competencia, 'YYYY-MM-DD') AS competencia
     FROM dre_balancete_linha
     ORDER BY competencia`
  );
  return rows.map((r) => r.competencia);
}

function mesAnterior(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, 1));
  data.setUTCMonth(data.getUTCMonth() - 1);
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export type NoDre = {
  classificacao: string;
  nome: string;
  tipo: string | null;
  profundidade: number;
  valoresMensais: number[];
  acumulado: number;
};

// Códigos usados pelos subtotais "padrão de mercado" (Lucro Bruto, EBIT, Resultado
// Financeiro, EBITDA), além dos fechamentos originais (Receita Líquida/Custos/Despesas).
const COD_RECEITA_BRUTA = '3.1.1';
const COD_DEDUCOES = '3.1.2';
const COD_RECEITAS_FINANCEIRAS = '3.1.3';
const COD_DESPESAS_FINANCEIRAS = '4.2.5';
// Única conta com movimento real de depreciação/amortização no plano de contas da Chaves na
// Mão (conferido linha a linha contra o plano de contas completo do escritório de
// contabilidade — as demais contas de depreciação são do template compartilhado entre
// clientes e não têm saldo aqui). Se a contabilidade passar a usar outra conta, adicionar o
// código aqui.
const CODS_DEPRECIACAO_AMORTIZACAO = ['4.2.1.03.013'];

export type DreMensal = {
  competencias: string[];
  arvore: NoDre[];
  fechamentos: {
    receitaLiquida: number[];
    totalCustos: number[];
    totalDespesas: number[];
    resultadoDoPeriodo: number[];
    lucroBruto: number[];
    resultadoFinanceiro: number[];
    ebit: number[];
    ebitda: number[];
  };
};

export async function getDreMensal(competenciaInicio: string, competenciaFim: string): Promise<DreMensal> {
  const pool = getMetasPool();

  const { rows: competenciasRows } = await pool.query(
    `SELECT DISTINCT to_char(competencia, 'YYYY-MM-DD') AS competencia
     FROM dre_balancete_linha
     WHERE competencia BETWEEN $1 AND $2
     ORDER BY competencia`,
    [competenciaInicio, competenciaFim]
  );
  const competencias: string[] = competenciasRows.map((r) => r.competencia);
  if (competencias.length === 0) {
    return {
      competencias: [],
      arvore: [],
      fechamentos: {
        receitaLiquida: [], totalCustos: [], totalDespesas: [], resultadoDoPeriodo: [],
        lucroBruto: [], resultadoFinanceiro: [], ebit: [], ebitda: [],
      },
    };
  }

  const competenciasComAnterior = Array.from(
    new Set([...competencias.map((c) => mesAnterior(c)), ...competencias])
  );

  const { rows } = await pool.query(
    `SELECT to_char(competencia, 'YYYY-MM-DD') AS competencia, classificacao, tipo, nome, saldo_atual
     FROM dre_balancete_linha
     WHERE competencia = ANY($1::date[])`,
    [competenciasComAnterior]
  );

  const saldoPorContaMes = new Map<string, number>();
  const infoConta = new Map<string, { nome: string; tipo: string | null }>();
  for (const r of rows) {
    saldoPorContaMes.set(`${r.classificacao}|${r.competencia}`, Number(r.saldo_atual));
    if (!infoConta.has(r.classificacao)) {
      infoConta.set(r.classificacao, { nome: r.nome, tipo: r.tipo });
    }
  }

  // A DRE só mostra o resultado (receitas e custos/despesas, grupos 3.x e 4.x do plano de
  // contas) — contas de balanço (1.x ATIVO, 2.x PASSIVO etc.) e os totais "3"/"4" nus (que
  // apenas duplicam "3.1"/"4.1"+"4.2") ficam de fora, igual à planilha original.
  const classificacoes = Array.from(infoConta.keys())
    .filter((c) => /^[34]\./.test(c))
    .sort();

  const arvore: NoDre[] = classificacoes.map((classificacao) => {
    const info = infoConta.get(classificacao)!;
    const valoresMensais = competencias.map((comp) => {
      const atual = saldoPorContaMes.get(`${classificacao}|${comp}`) ?? 0;
      const anterior = saldoPorContaMes.get(`${classificacao}|${mesAnterior(comp)}`) ?? 0;
      return atual - anterior;
    });
    return {
      classificacao,
      nome: info.nome,
      tipo: info.tipo,
      profundidade: classificacao.split('.').length,
      valoresMensais,
      acumulado: valoresMensais.reduce((a, b) => a + b, 0),
    };
  });

  const valorMensalDaConta = (codigo: string): number[] =>
    competencias.map((comp) => {
      const atual = saldoPorContaMes.get(`${codigo}|${comp}`) ?? 0;
      const anterior = saldoPorContaMes.get(`${codigo}|${mesAnterior(comp)}`) ?? 0;
      return atual - anterior;
    });

  const receitaLiquida = valorMensalDaConta('3.1');
  const totalCustos = valorMensalDaConta('4.1');
  const totalDespesas = valorMensalDaConta('4.2');
  const resultadoDoPeriodo = competencias.map(
    (_, i) => receitaLiquida[i] - totalCustos[i] - totalDespesas[i]
  );

  // Receita de vendas/serviços sem a receita financeira (3.1.3), que no plano de contas fica
  // dentro de "Receitas Operacionais" (3.1) mas não deveria compor o Lucro Bruto/EBIT — no
  // padrão de mercado ela só entra depois, junto do Resultado Financeiro.
  const receitaBruta = valorMensalDaConta(COD_RECEITA_BRUTA);
  const deducoes = valorMensalDaConta(COD_DEDUCOES);
  const receitasFinanceiras = valorMensalDaConta(COD_RECEITAS_FINANCEIRAS);
  const despesasFinanceiras = valorMensalDaConta(COD_DESPESAS_FINANCEIRAS);
  const depreciacaoAmortizacao = CODS_DEPRECIACAO_AMORTIZACAO
    .map((cod) => valorMensalDaConta(cod))
    .reduce((soma, valores) => soma.map((v, i) => v + valores[i]), competencias.map(() => 0));

  const lucroBruto = competencias.map((_, i) => receitaBruta[i] + deducoes[i] - totalCustos[i]);
  const resultadoFinanceiro = competencias.map((_, i) => receitasFinanceiras[i] - despesasFinanceiras[i]);
  const ebit = competencias.map((_, i) => lucroBruto[i] - (totalDespesas[i] - despesasFinanceiras[i]));
  const ebitda = competencias.map((_, i) => ebit[i] + depreciacaoAmortizacao[i]);

  return {
    competencias,
    arvore,
    fechamentos: {
      receitaLiquida, totalCustos, totalDespesas, resultadoDoPeriodo,
      lucroBruto, resultadoFinanceiro, ebit, ebitda,
    },
  };
}

export type ProvisaoIrCsll = {
  competencia: string;
  irpj: number;
  csll: number;
  observacao: string | null;
};

// Provisão de IRPJ/CSLL não vem do balancete — é um cálculo à parte (Lucro Real, com adições
// fiscais como brindes/doações) que a contabilidade fornece por competência. Guardamos aqui só
// o resultado já calculado; meses sem registro aqui simplesmente não têm essa linha na DRE.
export async function getProvisoesIrCsll(
  competenciaInicio: string,
  competenciaFim: string
): Promise<ProvisaoIrCsll[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT to_char(competencia, 'YYYY-MM-DD') AS competencia, irpj, csll, observacao
     FROM dre_provisao_ir_csll
     WHERE competencia BETWEEN $1 AND $2
     ORDER BY competencia`,
    [competenciaInicio, competenciaFim]
  );
  return rows.map((r) => ({
    competencia: r.competencia,
    irpj: Number(r.irpj),
    csll: Number(r.csll),
    observacao: r.observacao,
  }));
}

export async function salvarProvisaoIrCsll(input: {
  competencia: string;
  irpj: number;
  csll: number;
  observacao?: string | null;
}): Promise<ProvisaoIrCsll> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO dre_provisao_ir_csll (competencia, irpj, csll, observacao)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (competencia) DO UPDATE SET
       irpj = EXCLUDED.irpj, csll = EXCLUDED.csll, observacao = EXCLUDED.observacao, updated_at = now()
     RETURNING to_char(competencia, 'YYYY-MM-DD') AS competencia, irpj, csll, observacao`,
    [input.competencia, input.irpj, input.csll, input.observacao ?? null]
  );
  return {
    competencia: rows[0].competencia,
    irpj: Number(rows[0].irpj),
    csll: Number(rows[0].csll),
    observacao: rows[0].observacao,
  };
}

export type ItemConferencia = {
  grupo: string;
  classificacao: string;
  ytdCalculado: number;
  balanceteDireto: number;
  diferenca: number;
  status: 'OK' | 'DIVERGE';
};

const GRUPOS_CONFERENCIA: { grupo: string; classificacao: string }[] = [
  { grupo: 'Receita bruta', classificacao: '3.1.1' },
  { grupo: 'Deduções', classificacao: '3.1.2' },
  { grupo: 'Receitas financeiras', classificacao: '3.1.3' },
  { grupo: 'Receita Líquida', classificacao: '3.1' },
  { grupo: 'Custo dos serviços', classificacao: '4.1.3' },
  { grupo: 'Total Custos', classificacao: '4.1' },
  { grupo: 'Desp. administrativas', classificacao: '4.2.1' },
  { grupo: 'Desp. comerciais', classificacao: '4.2.2' },
  { grupo: 'Outras desp./provisões', classificacao: '4.2.4' },
  { grupo: 'Desp. financeiras', classificacao: '4.2.5' },
  { grupo: 'Desp. tributárias', classificacao: '4.2.6' },
  { grupo: 'Outras despesas', classificacao: '4.2.9' },
  { grupo: 'Total Despesas Operacionais', classificacao: '4.2' },
];

export async function getConferencia(
  competenciaInicio: string,
  competenciaFim: string
): Promise<ItemConferencia[]> {
  const dre = await getDreMensal(competenciaInicio, competenciaFim);
  const pool = getMetasPool();

  const porClassificacao = new Map(dre.arvore.map((n) => [n.classificacao, n.acumulado]));

  const itens: ItemConferencia[] = [];
  for (const { grupo, classificacao } of GRUPOS_CONFERENCIA) {
    const ytdCalculado = porClassificacao.get(classificacao) ?? 0;
    const { rows } = await pool.query(
      `SELECT saldo_atual FROM dre_balancete_linha WHERE competencia = $1 AND classificacao = $2`,
      [competenciaFim, classificacao]
    );
    const balanceteDireto = rows[0] ? Number(rows[0].saldo_atual) : 0;
    const diferenca = ytdCalculado - balanceteDireto;
    itens.push({
      grupo,
      classificacao,
      ytdCalculado,
      balanceteDireto,
      diferenca,
      status: Math.abs(diferenca) < 0.5 ? 'OK' : 'DIVERGE',
    });
  }

  const resultadoCalculado = dre.fechamentos.resultadoDoPeriodo.reduce((a, b) => a + b, 0);
  const receitaLiquida = itens.find((i) => i.classificacao === '3.1')!.balanceteDireto;
  const totalCustos = itens.find((i) => i.classificacao === '4.1')!.balanceteDireto;
  const totalDespesas = itens.find((i) => i.classificacao === '4.2')!.balanceteDireto;
  const resultadoDireto = receitaLiquida - totalCustos - totalDespesas;
  const diferencaResultado = resultadoCalculado - resultadoDireto;
  itens.push({
    grupo: 'Resultado do Período',
    classificacao: '',
    ytdCalculado: resultadoCalculado,
    balanceteDireto: resultadoDireto,
    diferenca: diferencaResultado,
    status: Math.abs(diferencaResultado) < 0.5 ? 'OK' : 'DIVERGE',
  });

  return itens;
}
