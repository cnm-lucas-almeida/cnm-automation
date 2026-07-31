import * as XLSX from 'xlsx';
import { getMetasPool } from '@/lib/db-metas';
import type { OdontoCertificado } from './types';

// Planilha Bradesco Odonto: uma linha por vínculo (titular ou dependente),
// agrupada por CERTIFICADO. Valor validado contra dados reais em
// docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md (seção 1, Odonto): R$ 17,57 fixo por
// dependente, aderência exata em 42/43 casos comparáveis.
export const VALOR_UNITARIO_DEPENDENTE_PADRAO = 17.57;

interface LinhaOdontoRaw {
  NOME: string;
  TITULARIDADE: string;
  CERTIFICADO: string | number;
  CPF: string;
}

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function parseOdontoXlsx(
  buffer: Buffer,
  competencia: string,
  valorUnitario = VALOR_UNITARIO_DEPENDENTE_PADRAO
): OdontoCertificado[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas: LinhaOdontoRaw[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const porCertificado = new Map<string, { titular: LinhaOdontoRaw | null; dependentes: number }>();

  for (const linha of linhas) {
    const certificado = String(linha.CERTIFICADO).trim();
    const atual = porCertificado.get(certificado) ?? { titular: null, dependentes: 0 };

    const titularidade = String(linha.TITULARIDADE).trim().toLowerCase();
    if (titularidade === 'titular') {
      atual.titular = linha;
    } else if (titularidade === 'dependente') {
      atual.dependentes += 1;
    }

    porCertificado.set(certificado, atual);
  }

  const resultado: OdontoCertificado[] = [];
  for (const [certificado, dados] of porCertificado) {
    if (!dados.titular) continue; // certificado sem titular identificado — não deveria ocorrer, mas não quebra o import
    resultado.push({
      competencia,
      certificado,
      cpfTitular: normalizarCpf(dados.titular.CPF),
      nomeTitular: dados.titular.NOME,
      dependentesQtd: dados.dependentes,
      valorUnitario,
    });
  }

  return resultado;
}

export async function salvarOdonto(registros: OdontoCertificado[]): Promise<void> {
  if (registros.length === 0) return;
  const pool = getMetasPool();
  for (const r of registros) {
    await pool.query(
      `INSERT INTO folha_pagamento_odonto_certificado
         (competencia, certificado, cpf_titular, nome_titular, dependentes_qtd, valor_unitario)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (competencia, certificado)
       DO UPDATE SET cpf_titular = EXCLUDED.cpf_titular, nome_titular = EXCLUDED.nome_titular,
                      dependentes_qtd = EXCLUDED.dependentes_qtd, valor_unitario = EXCLUDED.valor_unitario`,
      [r.competencia, r.certificado, r.cpfTitular, r.nomeTitular, r.dependentesQtd, r.valorUnitario]
    );
  }
}

export async function buscarOdontoDoMes(ano: number, mes: number): Promise<Map<string, number>> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT cpf_titular, dependentes_qtd, valor_unitario
     FROM folha_pagamento_odonto_certificado
     WHERE competencia = $1 AND cpf_titular IS NOT NULL`,
    [competencia]
  );
  const mapa = new Map<string, number>();
  for (const r of rows) {
    mapa.set(r.cpf_titular, r.dependentes_qtd * parseFloat(r.valor_unitario));
  }
  return mapa;
}
