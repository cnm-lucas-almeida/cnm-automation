import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getMetasPool } from '@/lib/db-metas';
import type { UnimedEvento } from './types';

// Demonstrativo de faturamento Unimed: um bloco por beneficiário, terminando
// numa linha resumo "Mensalidade : X  Inscrição : X  Eventos : X  ...". O
// usuário decidiu usar "Eventos" (uso real do plano no mês), não a
// "Mensalidade" (prêmio fixo) — ver docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md.
//
// pdfjs-dist devolve cada célula como um item de texto separado com posição
// x/y — testado contra o PDF real e NÃO sofre o problema de colunas coladas
// que a extração de texto corrido tem. Blocos de família que quebram entre
// páginas (confirmado no levantamento) são resolvidos concatenando os itens
// de todas as páginas antes de processar, em vez de processar página a página.

function normalizarNumeroBR(valor: string): number {
  const limpo = valor.replace(/\./g, '').replace(',', '.');
  return parseFloat(limpo) || 0;
}

export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parseUnimedPdf(buffer: Buffer): Promise<{ eventos: UnimedEvento[]; competencia: string }> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const itens: string[] = [];
  let competencia: string | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const str = (item.str ?? '').trim();
      if (str === '') continue;
      itens.push(str);

      if (competencia === null) {
        const m = str.match(/Competência:\s*(\d{2})\/(\d{4})/);
        if (m) competencia = `${m[2]}-${m[1]}`;
      }
    }
  }

  if (!competencia) {
    throw new Error('Não encontrei "Competência: MM/YYYY" no PDF — layout pode ter mudado.');
  }

  const somaPorNome = new Map<string, number>();
  let nomeAtual: string | null = null;

  for (let i = 0; i < itens.length; i++) {
    if (itens[i] === 'Nome:' && itens[i + 1]) {
      nomeAtual = itens[i + 1];
      continue;
    }
    if (itens[i] === 'Eventos :' && itens[i + 1] && nomeAtual) {
      const valor = normalizarNumeroBR(itens[i + 1]);
      const chave = normalizarNome(nomeAtual);
      somaPorNome.set(chave, (somaPorNome.get(chave) ?? 0) + valor);
      nomeAtual = null;
    }
  }

  const eventos: UnimedEvento[] = [...somaPorNome.entries()].map(([nomeBeneficiario, valorEventos]) => ({
    competencia: competencia!,
    nomeBeneficiario,
    valorEventos: Math.round(valorEventos * 100) / 100,
  }));

  return { eventos, competencia };
}

export async function salvarUnimedEventos(eventos: UnimedEvento[]): Promise<void> {
  if (eventos.length === 0) return;
  const pool = getMetasPool();
  for (const e of eventos) {
    await pool.query(
      `INSERT INTO folha_pagamento_unimed_evento (competencia, nome_beneficiario, valor_eventos)
       VALUES ($1, $2, $3)
       ON CONFLICT (competencia, nome_beneficiario)
       DO UPDATE SET valor_eventos = EXCLUDED.valor_eventos`,
      [e.competencia, e.nomeBeneficiario, e.valorEventos]
    );
  }
}

// Chaveado por nome normalizado (sem CPF/matrícula no PDF — ver armadilha no
// levantamento). O orquestrador precisa cruzar isso com o nome do Convenia
// também normalizado, e sinalizar quem não bateu pra conferência manual.
export async function buscarUnimedDoMes(ano: number, mes: number): Promise<Map<string, number>> {
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT nome_beneficiario, valor_eventos FROM folha_pagamento_unimed_evento WHERE competencia = $1`,
    [competencia]
  );
  return new Map(rows.map((r: any) => [r.nome_beneficiario, parseFloat(r.valor_eventos)]));
}
