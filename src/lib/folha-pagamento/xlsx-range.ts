import * as XLSX from 'xlsx';

// Alguns exportadores gravam o XLSX com o "!ref" (intervalo usado da aba)
// errado — apontando só para o cabeçalho, mesmo com centenas de linhas de
// dados presentes no arquivo. Como `sheet_to_json` confia no "!ref", a
// planilha é lida como vazia e o import termina com 0 registros, sem erro
// nenhum.
//
// Caso real: `Odonto 08.26.xlsx` (fechamento de agosto/26) veio com
// `!ref = "A1:J1"` e 1.640 células preenchidas até a linha 164. O RH importou,
// a tela não acusou nada e a coluna Odonto ficou zerada.
//
// Aqui o intervalo é recalculado a partir das células que realmente existem
// na aba. Só amplia — se o "!ref" já cobre tudo, nada muda.
export function corrigirRangeDaAba(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  let maxLinha = 0;
  let maxColuna = 0;

  for (const chave of Object.keys(sheet)) {
    if (chave.startsWith('!')) continue;
    const celula = XLSX.utils.decode_cell(chave);
    if (celula.r + 1 > maxLinha) maxLinha = celula.r + 1;
    if (celula.c > maxColuna) maxColuna = celula.c;
  }

  if (maxLinha === 0) return sheet;

  const declarado = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (declarado && declarado.e.r + 1 >= maxLinha && declarado.e.c >= maxColuna) return sheet;

  return {
    ...sheet,
    '!ref': XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxLinha - 1, c: maxColuna } }),
  };
}
