import * as XLSX from 'xlsx';
import { getMetasPool } from '@/lib/db-metas';
import { normalizarNome } from './unimed';

// Planilha de acompanhamento da empresa (upload mensal, nome do arquivo muda
// todo mês — ex.: "09 CNM SETEMBRO 2026.xlsx"). 3 abas, identificadas pelo
// CONTEÚDO (colunas), não pelo nome literal da aba (que também muda por mês):
//   - CLT: tem coluna "REFEIÇÃO" — VA = "VALOR VR", VT = "soma" (já vem
//     somado no arquivo: Flash + Urbs + Metro).
//   - Estagiário/Aprendiz: sem "REFEIÇÃO" (não recebem VA) — VT é a soma de
//     todas as colunas "VT ..."/"VL ..." (não têm uma coluna "soma" pronta).
// Sem CPF em nenhuma aba — cruzamento só por nome (mesmo risco já conhecido
// do Unimed).
export type CategoriaVale = 'clt' | 'outros';

export interface ValeRegistro {
  competencia: string;
  nomeOriginal: string;
  nomeNormalizado: string;
  categoria: CategoriaVale;
  valorVA: number;
  valorVT: number;
}

function normalizarChaveColuna(chave: string): string {
  return chave.trim().toUpperCase();
}

function parseValorMonetario(valor: unknown): number {
  if (valor == null) return 0;
  const texto = String(valor).replace(/R\$/gi, '').trim();
  if (texto === '' || texto === '-') return 0;
  const limpo = texto.replace(/\./g, '').replace(',', '.'); // caso venha em formato BR em algum mês
  const numero = parseFloat(texto.includes(',') ? limpo : texto);
  return Number.isNaN(numero) ? 0 : numero;
}

function extrairNome(linha: Record<string, unknown>): string | null {
  const chave = Object.keys(linha).find((k) => normalizarChaveColuna(k) === 'NOME');
  if (!chave) return null;
  const nome = String(linha[chave] ?? '').trim();
  return nome || null;
}

function parseAbaCLT(linhas: Record<string, unknown>[], competencia: string): ValeRegistro[] {
  const registros: ValeRegistro[] = [];
  for (const linha of linhas) {
    const nomeOriginal = extrairNome(linha);
    if (!nomeOriginal) continue;

    const chaveVA = Object.keys(linha).find((k) => normalizarChaveColuna(k) === 'VALOR VR');
    const chaveVT = Object.keys(linha).find((k) => normalizarChaveColuna(k) === 'SOMA');
    // Linhas de anotação (ex.: "adicional pessoas novas: média de 30 pessoas")
    // têm nome preenchido mas nenhum valor — não são um colaborador de verdade.
    if (!chaveVA && !chaveVT) continue;

    registros.push({
      competencia,
      nomeOriginal,
      nomeNormalizado: normalizarNome(nomeOriginal),
      categoria: 'clt',
      valorVA: chaveVA ? parseValorMonetario(linha[chaveVA]) : 0,
      valorVT: chaveVT ? parseValorMonetario(linha[chaveVT]) : 0,
    });
  }
  return registros;
}

function parseAbaSemVA(linhas: Record<string, unknown>[], competencia: string): ValeRegistro[] {
  const registros: ValeRegistro[] = [];
  for (const linha of linhas) {
    const nomeOriginal = extrairNome(linha);
    if (!nomeOriginal) continue;

    const colunasVT = Object.keys(linha).filter((k) => {
      const chave = normalizarChaveColuna(k);
      return chave.startsWith('VT ') || chave.startsWith('VL ') || chave === 'VT' || chave === 'VL';
    });
    if (colunasVT.length === 0) continue;

    const valorVT = colunasVT.reduce((soma, k) => soma + parseValorMonetario(linha[k]), 0);

    registros.push({
      competencia,
      nomeOriginal,
      nomeNormalizado: normalizarNome(nomeOriginal),
      categoria: 'outros',
      valorVA: 0,
      valorVT,
    });
  }
  return registros;
}

export function parseValeXlsx(buffer: Buffer, competencia: string): ValeRegistro[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const registros: ValeRegistro[] = [];

  for (const nomeAba of workbook.SheetNames) {
    const linhas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { defval: '' });
    if (linhas.length === 0) continue;

    const colunas = Object.keys(linhas[0]).map(normalizarChaveColuna);
    const ehCLT = colunas.some((c) => c === 'REFEIÇÃO' || c === 'VALOR VR');
    const registrosAba = ehCLT ? parseAbaCLT(linhas, competencia) : parseAbaSemVA(linhas, competencia);
    registros.push(...registrosAba);
  }

  return registros;
}

export async function salvarVale(registros: ValeRegistro[]): Promise<void> {
  if (registros.length === 0) return;
  const pool = getMetasPool();
  for (const r of registros) {
    await pool.query(
      `INSERT INTO folha_pagamento_vale (competencia, nome_normalizado, nome_original, categoria, valor_va, valor_vt)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (competencia, nome_normalizado)
       DO UPDATE SET nome_original = EXCLUDED.nome_original, categoria = EXCLUDED.categoria,
                      valor_va = EXCLUDED.valor_va, valor_vt = EXCLUDED.valor_vt`,
      [r.competencia, r.nomeNormalizado, r.nomeOriginal, r.categoria, r.valorVA, r.valorVT]
    );
  }
}

export async function buscarValeDoMes(ano: number, mes: number): Promise<Map<string, { va: number; vt: number }>> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT nome_normalizado, valor_va, valor_vt FROM folha_pagamento_vale WHERE competencia = $1`,
    [competencia]
  );
  return new Map(rows.map((r: any) => [r.nome_normalizado, { va: parseFloat(r.valor_va), vt: parseFloat(r.valor_vt) }]));
}
