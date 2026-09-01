// Composição do salário usado na folha.
//
// HISTÓRICO — dissídio antecipado (removido em 01/09/2026, fechamento de agosto):
// até agosto/26 este arquivo aplicava por cima do Convenia um reajuste de 5% ao
// ano acumulado mês a mês pela data de admissão (teto de 12 meses), porque o
// Convenia guardava só o salário "oficial" e a empresa já pagava o reajuste da
// convenção coletiva antecipado. O próprio código previa que isso cairia
// "quando a convenção sair e consolidar o salário-base no Convenia".
//
// Foi o que aconteceu: o RH consolidou o reajuste direto no Convenia. Conferido
// contra a planilha de junho (`docs/RH/Folha Junho Atualizada - Dissídio.xlsx`)
// numa amostra de 20 colaboradores — em 16 o salário do Convenia hoje é
// exatamente `base × 1,05` (dissídio cheio) e nos outros 4 é o "Salário atual"
// de junho; em nenhum caso é a base sem reajuste. Continuar multiplicando por
// (1 + dissídio) inflava a folha em até 5%, e o erro se propagava para valor
// hora, hora extra, HE+75%, DSR e desconto de faltas.
//
// Se um dia a empresa voltar a antecipar reajuste fora do Convenia, o mecanismo
// está no git (arquivo `dissidio.ts`, removido neste commit).
//
// A tabela de exceção de liderança (`folha_pagamento_override_salario`) continua
// valendo: é reajuste de mérito/mercado lançado à mão, não dissídio.

export interface SalarioCalculado {
  salarioBase: number;
  overridePercentual: number;
  salarioAtualizado: number;
}

export function calcularSalarioAtualizado(
  salarioBase: number,
  overridePercentual = 0
): SalarioCalculado {
  return {
    salarioBase,
    overridePercentual,
    salarioAtualizado: salarioBase * (1 + overridePercentual),
  };
}
