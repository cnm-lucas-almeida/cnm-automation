import { getMetasPool } from '@/lib/db-metas';
import type { ConsignadoRegistro } from './types';

// Arquivo baixado mensalmente do Portal de Consignações do governo, por
// CNPJ + competência (ex.: 43853784000103-202607v1.4.json). Um registro por
// CONTRATO de empréstimo ativo — um colaborador pode ter várias linhas.
// Validado em docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md (seção 1, Consignado).
interface ContratoConsignadoRaw {
  cpf: string;
  nomeTrabalhador: string;
  valorParcela: number;
  competencia: string; // "MM/YYYY"
}

function competenciaParaISO(competencia: string): string {
  const [mes, ano] = competencia.split('/');
  return `${ano}-${mes.padStart(2, '0')}`;
}

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function parseConsignadoJson(conteudo: string): { registros: ConsignadoRegistro[]; competencia: string } {
  const contratos: ContratoConsignadoRaw[] = JSON.parse(conteudo);
  if (contratos.length === 0) {
    throw new Error('Arquivo de consignado vazio.');
  }

  const competencias = new Set(contratos.map((c) => c.competencia));
  if (competencias.size > 1) {
    throw new Error(`Arquivo mistura mais de uma competência: ${[...competencias].join(', ')}.`);
  }
  const competencia = competenciaParaISO(contratos[0].competencia);

  const porCpf = new Map<string, { nome: string; total: number; qtd: number }>();
  for (const c of contratos) {
    const cpf = normalizarCpf(c.cpf);
    const atual = porCpf.get(cpf) ?? { nome: c.nomeTrabalhador, total: 0, qtd: 0 };
    atual.total += c.valorParcela;
    atual.qtd += 1;
    porCpf.set(cpf, atual);
  }

  const registros: ConsignadoRegistro[] = [...porCpf.entries()].map(([cpf, v]) => ({
    competencia,
    cpf,
    nome: v.nome,
    valorTotal: Math.round(v.total * 100) / 100,
    contratosQtd: v.qtd,
  }));

  return { registros, competencia };
}

export async function salvarConsignado(registros: ConsignadoRegistro[]): Promise<void> {
  if (registros.length === 0) return;
  const pool = getMetasPool();
  for (const r of registros) {
    await pool.query(
      `INSERT INTO folha_pagamento_consignado (competencia, cpf, nome, valor_total, contratos_qtd)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (competencia, cpf)
       DO UPDATE SET nome = EXCLUDED.nome, valor_total = EXCLUDED.valor_total, contratos_qtd = EXCLUDED.contratos_qtd`,
      [r.competencia, r.cpf, r.nome, r.valorTotal, r.contratosQtd]
    );
  }
}

export async function buscarConsignadoDoMes(ano: number, mes: number): Promise<Map<string, number>> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT cpf, valor_total FROM folha_pagamento_consignado WHERE competencia = $1`,
    [competencia]
  );
  return new Map(rows.map((r: any) => [r.cpf, parseFloat(r.valor_total)]));
}
