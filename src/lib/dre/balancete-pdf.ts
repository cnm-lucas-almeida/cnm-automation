import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { LinhaBalancete } from './index';

// O export do balancete em PDF (relatório "SCI Ambiente Contábil") usa a mesma tabela do export
// em xlsx (Conta, Classificação, Tipo, Nome da conta contábil, Saldo anterior, Débito, Crédito,
// Saldo atual), só que em texto posicionado por coordenada em vez de células. pdfjs-dist devolve
// cada valor como um item de texto com x/y — cada linha da tabela cai no mesmo y, e os limites de
// coluna abaixo foram medidos direto no PDF de exemplo (docs/BALANCETE_07.2026_...pdf) a partir do
// marcador de espaço fixo que o relatório imprime depois de cada valor numérico (~353/~424/~495pt).
// Não usar a posição inicial do próprio número como limite: como os valores são alinhados à
// direita, um número maior (ex. "6.805.644,90") pode começar bem à esquerda do início nominal da
// coluna e ainda pertencer a ela.
const X_CONTA_MAX = 55;
const X_TIPO = 128;
const X_NOME_MAX = 290;
const X_SALDO_ANTERIOR_MAX = 360;
const X_DEBITO_MAX = 430;
const X_CREDITO_MAX = 500;

const RE_CONTA = /^\d+$/;
const RE_CLASSIFICACAO = /^\d+(\.\d+)*$/;
const RE_VALOR = /^-?[\d.]+,\d{2}$/;

function toNumberBR(v: string): number {
  const limpo = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

type ItemPosicionado = { str: string; x: number; y: number };

export async function parseBalancetePdf(buffer: Buffer): Promise<LinhaBalancete[]> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const linhas: LinhaBalancete[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const itens: ItemPosicionado[] = (content.items as any[])
      .map((it) => ({ str: (it.str ?? '').trim(), x: it.transform[4] as number, y: it.transform[5] as number }))
      .filter((it) => it.str !== '');

    const porLinha = new Map<number, ItemPosicionado[]>();
    for (const item of itens) {
      const y = Math.round(item.y * 10) / 10;
      const bucket = porLinha.get(y);
      if (bucket) bucket.push(item);
      else porLinha.set(y, [item]);
    }

    for (const itensLinha of porLinha.values()) {
      // Título, "Empresa:", cabeçalho de coluna, o rodapé "Resumo" e o bloco de assinatura não
      // têm um ID de conta numérico na coluna "Conta" — mesmo filtro que o parser de xlsx usa
      // para descartar o rodapé do export do Omie.
      const contaItem = itensLinha.find((it) => it.x < X_CONTA_MAX && RE_CONTA.test(it.str));
      if (!contaItem) continue;

      const classificacaoItem = itensLinha.find(
        (it) => it.x >= X_CONTA_MAX && it.x < X_TIPO && RE_CLASSIFICACAO.test(it.str)
      );
      if (!classificacaoItem) continue;

      const tipoItem = itensLinha.find((it) => it.str === 'T');
      const nomeItem = itensLinha.find(
        (it) => it.x >= X_TIPO && it.x < X_NOME_MAX && !RE_VALOR.test(it.str)
      );

      const numeros = itensLinha.filter((it) => RE_VALOR.test(it.str)).sort((a, b) => a.x - b.x);
      const saldoAnterior = numeros.find((n) => n.x < X_SALDO_ANTERIOR_MAX);
      const debito = numeros.find((n) => n.x >= X_SALDO_ANTERIOR_MAX && n.x < X_DEBITO_MAX);
      const credito = numeros.find((n) => n.x >= X_DEBITO_MAX && n.x < X_CREDITO_MAX);
      const saldoAtual = numeros.find((n) => n.x >= X_CREDITO_MAX);

      linhas.push({
        contaId: Number(contaItem.str),
        classificacao: classificacaoItem.str,
        tipo: tipoItem ? tipoItem.str : null,
        nome: nomeItem ? nomeItem.str : '',
        saldoAnterior: saldoAnterior ? toNumberBR(saldoAnterior.str) : 0,
        debito: debito ? toNumberBR(debito.str) : 0,
        credito: credito ? toNumberBR(credito.str) : 0,
        saldoAtual: saldoAtual ? toNumberBR(saldoAtual.str) : 0,
      });
    }
  }

  if (linhas.length === 0) {
    throw new Error('Não encontrei linhas de balancete no PDF — layout pode ter mudado.');
  }

  return linhas;
}
