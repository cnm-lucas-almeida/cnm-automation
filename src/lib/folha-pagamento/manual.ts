import { getMetasPool } from '@/lib/db-metas';

export interface CamposManuais {
  observacoes: string | null;
  sitepd: string | null;
  valeAlimentacao: number | null;
  valeTransporte: number | null;
  horasPositivasOverride: number | null; // RH controla exceções de hora editando direto, não por dia-exceção automático
  horasNegativasOverride: number | null;
  faltaQtdOverride: number | null; // corrige o nº de faltas detectado no Secullum (recalcula DSR)
}

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export async function buscarCamposManuaisDoMes(ano: number, mes: number): Promise<Map<string, CamposManuais>> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT cpf, observacoes, sitepd, vale_alimentacao, vale_transporte, horas_positivas_override, horas_negativas_override, falta_qtd_override
     FROM folha_pagamento_manual WHERE competencia = $1`,
    [competencia]
  );
  return new Map(
    rows.map((r: any) => [
      r.cpf,
      {
        observacoes: r.observacoes,
        sitepd: r.sitepd,
        valeAlimentacao: r.vale_alimentacao !== null ? parseFloat(r.vale_alimentacao) : null,
        valeTransporte: r.vale_transporte !== null ? parseFloat(r.vale_transporte) : null,
        horasPositivasOverride: r.horas_positivas_override !== null ? parseFloat(r.horas_positivas_override) : null,
        horasNegativasOverride: r.horas_negativas_override !== null ? parseFloat(r.horas_negativas_override) : null,
        faltaQtdOverride: r.falta_qtd_override !== null ? parseInt(r.falta_qtd_override, 10) : null,
      },
    ])
  );
}

export async function buscarCamposManuaisColaborador(ano: number, mes: number, cpf: string): Promise<CamposManuais | null> {
  const mapa = await buscarCamposManuaisDoMes(ano, mes);
  return mapa.get(normalizarCpf(cpf)) ?? null;
}

// Mapa campo -> coluna. Usado pra montar o UPDATE só com o que o cliente
// realmente mandou.
const COLUNAS: Record<keyof CamposManuais, string> = {
  observacoes: 'observacoes',
  sitepd: 'sitepd',
  valeAlimentacao: 'vale_alimentacao',
  valeTransporte: 'vale_transporte',
  horasPositivasOverride: 'horas_positivas_override',
  horasNegativasOverride: 'horas_negativas_override',
  faltaQtdOverride: 'falta_qtd_override',
};

// Grava só os campos presentes em `campos` — a chave existir (mesmo valendo
// null) significa "escreve isso"; a chave ausente significa "não mexe".
//
// Antes isso era um `COALESCE(EXCLUDED.campo, valor_atual)` pra cada coluna,
// o que tornava **impossível apagar um valor**: mandar null pra limpar caía no
// COALESCE e o valor antigo voltava. Como a tela atualiza a célula
// otimisticamente, parecia que tinha salvo — até o próximo cálculo trazer o
// número de volta. Caso real: o VA manual da Alana (R$257,90) não saía de
// jeito nenhum.
export async function salvarCamposManuais(
  ano: number,
  mes: number,
  cpf: string,
  campos: Partial<CamposManuais>
): Promise<void> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const informados = (Object.keys(COLUNAS) as (keyof CamposManuais)[]).filter((k) => k in campos);
  if (informados.length === 0) return;

  const colunas = informados.map((k) => COLUNAS[k]);
  const valores = informados.map((k) => campos[k] ?? null);
  const placeholders = colunas.map((_, i) => `$${i + 3}`);
  const atribuicoes = colunas.map((c) => `${c} = EXCLUDED.${c}`);

  const pool = getMetasPool();
  await pool.query(
    `INSERT INTO folha_pagamento_manual (competencia, cpf, ${colunas.join(', ')})
     VALUES ($1, $2, ${placeholders.join(', ')})
     ON CONFLICT (competencia, cpf) DO UPDATE SET
       ${atribuicoes.join(', ')},
       updated_at = now()`,
    [competencia, normalizarCpf(cpf), ...valores]
  );
}
