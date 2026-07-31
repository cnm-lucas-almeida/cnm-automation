import { getMetasPool } from '@/lib/db-metas';
import type { OverrideSalario, DiaExcecao } from './types';

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

// Colunas DATE voltam do node-postgres como objeto Date (não string) — sem
// essa conversão, `vigenciaInicio <= referencia` (index.ts) compara Date com
// string e SEMPRE dá false (a string "YYYY-MM-DD" vira NaN na coerção
// numérica da comparação relacional), fazendo nenhum override nunca aplicar.
// Bug real: override de +40% do Alex Galvão Borges cadastrado e nunca surtindo
// efeito no cálculo.
function paraDataISO(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString().split('T')[0] : String(valor);
}

function mapOverride(row: any): OverrideSalario {
  return {
    id: row.id,
    cpf: row.cpf,
    nome: row.nome,
    percentual: parseFloat(row.percentual),
    motivo: row.motivo,
    vigenciaInicio: paraDataISO(row.vigencia_inicio),
    vigenciaFim: row.vigencia_fim ? paraDataISO(row.vigencia_fim) : null,
  };
}

export async function listarOverrides(): Promise<OverrideSalario[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT id, cpf, nome, percentual, motivo, vigencia_inicio, vigencia_fim
     FROM folha_pagamento_override_salario
     ORDER BY nome`
  );
  return rows.map(mapOverride);
}

export async function criarOverride(input: {
  cpf: string;
  nome: string;
  percentual: number;
  motivo: string;
  vigenciaInicio: string;
  vigenciaFim?: string | null;
}): Promise<OverrideSalario> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO folha_pagamento_override_salario (cpf, nome, percentual, motivo, vigencia_inicio, vigencia_fim)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, cpf, nome, percentual, motivo, vigencia_inicio, vigencia_fim`,
    [normalizarCpf(input.cpf), input.nome, input.percentual, input.motivo, input.vigenciaInicio, input.vigenciaFim ?? null]
  );
  return mapOverride(rows[0]);
}

export async function removerOverride(id: number): Promise<void> {
  const pool = getMetasPool();
  await pool.query(`DELETE FROM folha_pagamento_override_salario WHERE id = $1`, [id]);
}

// Percentual de override vigente pra aquele CPF na competência (mes/ano) —
// tabela de exceção separada do mecanismo automático de dissídio (dissidio.ts).
export async function buscarOverridePercentual(cpf: string, ano: number, mes: number): Promise<number> {
  const pool = getMetasPool();
  const referencia = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(percentual), 0) AS total
     FROM folha_pagamento_override_salario
     WHERE cpf = $1
       AND vigencia_inicio <= $2
       AND (vigencia_fim IS NULL OR vigencia_fim >= $2)`,
    [normalizarCpf(cpf), referencia]
  );
  return parseFloat(rows[0].total);
}

function mapDiaExcecao(row: any): DiaExcecao {
  return { id: row.id, data: row.data, motivo: row.motivo };
}

export async function listarDiasExcecao(): Promise<DiaExcecao[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT id, data, motivo FROM folha_pagamento_dia_excecao ORDER BY data DESC`
  );
  return rows.map(mapDiaExcecao);
}

export async function criarDiaExcecao(data: string, motivo: string): Promise<DiaExcecao> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO folha_pagamento_dia_excecao (data, motivo)
     VALUES ($1, $2)
     ON CONFLICT (data) DO UPDATE SET motivo = EXCLUDED.motivo
     RETURNING id, data, motivo`,
    [data, motivo]
  );
  return mapDiaExcecao(rows[0]);
}

export async function removerDiaExcecao(id: number): Promise<void> {
  const pool = getMetasPool();
  await pool.query(`DELETE FROM folha_pagamento_dia_excecao WHERE id = $1`, [id]);
}

// Datas ISO (YYYY-MM-DD) dos dias-exceção do mês — usado pela lib de horas
// para não contar esses dias como falta (ex.: dia da Copa, 29/06/2026).
export async function buscarDiasExcecaoDoMes(ano: number, mes: number): Promise<Set<string>> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT data FROM folha_pagamento_dia_excecao
     WHERE EXTRACT(YEAR FROM data) = $1 AND EXTRACT(MONTH FROM data) = $2`,
    [ano, mes]
  );
  return new Set(rows.map((r: any) => (r.data instanceof Date ? r.data.toISOString().split('T')[0] : String(r.data))));
}
