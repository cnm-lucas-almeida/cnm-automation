// Dissídio antecipado: a empresa paga o reajuste da convenção coletiva antes
// dela ser publicada oficialmente. Confirmado com a planilha real de junho/26
// (docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md, seção 3): 5% ao ano, acumulado mês
// a mês, com base na data de admissão de cada colaborador (não uma data única
// pra empresa toda). Teto de 12 meses = ciclo de um ano — quem já está há mais
// de 12 meses acumula o valor cheio, até a convenção oficial sair e consolidar
// o salário-base no Convenia (nesse momento a taxa/teto abaixo precisam ser
// revistos com o RH).
const TAXA_ANUAL = 0.05;
const MESES_TETO = 12;

function mesesEntre(dataAdmissaoISO: string, ano: number, mes: number): number {
  const admissao = new Date(dataAdmissaoISO);
  const anoAdmissao = admissao.getUTCFullYear();
  const mesAdmissao = admissao.getUTCMonth() + 1;
  const total = (ano - anoAdmissao) * 12 + (mes - mesAdmissao);
  return Math.max(0, total);
}

export function calcularPercentualDissidio(dataAdmissao: string | null, ano: number, mes: number): number {
  if (!dataAdmissao) return 0;
  const meses = Math.min(MESES_TETO, mesesEntre(dataAdmissao, ano, mes));
  return (TAXA_ANUAL / 12) * meses;
}

export interface SalarioComDissidio {
  salarioBase: number;
  dissidioPercentual: number;
  overridePercentual: number;
  salarioAtualizado: number;
}

export function calcularSalarioAtualizado(
  salarioBase: number,
  dataAdmissao: string | null,
  ano: number,
  mes: number,
  overridePercentual = 0
): SalarioComDissidio {
  const dissidioPercentual = calcularPercentualDissidio(dataAdmissao, ano, mes);
  const salarioAtualizado = salarioBase * (1 + dissidioPercentual + overridePercentual);
  return { salarioBase, dissidioPercentual, overridePercentual, salarioAtualizado };
}
