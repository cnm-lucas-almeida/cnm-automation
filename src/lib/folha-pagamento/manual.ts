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

export async function salvarCamposManuais(
  ano: number,
  mes: number,
  cpf: string,
  campos: Partial<CamposManuais>
): Promise<void> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  await pool.query(
    `INSERT INTO folha_pagamento_manual
       (competencia, cpf, observacoes, sitepd, vale_alimentacao, vale_transporte, horas_positivas_override, horas_negativas_override, falta_qtd_override)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (competencia, cpf) DO UPDATE SET
       observacoes = COALESCE(EXCLUDED.observacoes, folha_pagamento_manual.observacoes),
       sitepd = COALESCE(EXCLUDED.sitepd, folha_pagamento_manual.sitepd),
       vale_alimentacao = COALESCE(EXCLUDED.vale_alimentacao, folha_pagamento_manual.vale_alimentacao),
       vale_transporte = COALESCE(EXCLUDED.vale_transporte, folha_pagamento_manual.vale_transporte),
       horas_positivas_override = COALESCE(EXCLUDED.horas_positivas_override, folha_pagamento_manual.horas_positivas_override),
       horas_negativas_override = COALESCE(EXCLUDED.horas_negativas_override, folha_pagamento_manual.horas_negativas_override),
       falta_qtd_override = COALESCE(EXCLUDED.falta_qtd_override, folha_pagamento_manual.falta_qtd_override),
       updated_at = now()`,
    [
      competencia,
      normalizarCpf(cpf),
      campos.observacoes ?? null,
      campos.sitepd ?? null,
      campos.valeAlimentacao ?? null,
      campos.valeTransporte ?? null,
      campos.horasPositivasOverride ?? null,
      campos.horasNegativasOverride ?? null,
      campos.faltaQtdOverride ?? null,
    ]
  );
}
