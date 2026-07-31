import {
  getBatidas,
  calcularHorasTrabalhadas,
  calcularCargaEsperadaMin,
  motivoStatusEspecial,
  getCalcularComOrcamento,
  parseCalcularLinhas,
} from '@/lib/secullum';

// Marcador de falta integral não justificada, validado ao vivo contra casos
// reais da planilha de junho/26 (docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md,
// seção 6): Entrada1 literalmente null (nenhuma batida, não é um marcador
// textual tipo SUSP/AT. MÉD/GERAR) + dia estava escalado (Memoria presente) +
// não é Folga/Neutro/NBanco.
const TOLERANCIA_CLT_MIN = 10;

export interface ResultadoHorasMes {
  horasPositivas: number; // decimal, horas de extra (além da tolerância CLT)
  horasNegativas: number; // decimal, horas de atraso/saída antecipada (não inclui falta integral)
  faltaQtd: number;
  faltaDatas: string[]; // ISO dates
  encontradoNoSecullum: boolean; // false = CPF não cadastrado no Secullum (ex.: cargo sem ponto)
}

const RESULTADO_VAZIO: Omit<ResultadoHorasMes, 'encontradoNoSecullum'> = {
  horasPositivas: 0,
  horasNegativas: 0,
  faltaQtd: 0,
  faltaDatas: [],
};

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// "Funcionário não encontrado" é esperado pra colaboradores sem ponto
// eletrônico (ex.: alguns cargos de liderança) — não é falha do sistema, não
// deve travar o fechamento dos outros colaboradores.
function ehFuncionarioNaoEncontrado(err: any): boolean {
  const dados = err?.response?.data;
  return err?.response?.status === 400 && Array.isArray(dados) && dados.some((d: any) => d?.Property === 'funcionarioCpf');
}

export async function calcularHorasMes(
  cpf: string,
  ano: number,
  mes: number,
  diasExcecao: Set<string> = new Set(),
  dataAdmissao: string | null = null
): Promise<ResultadoHorasMes> {
  const primeiroDiaMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;

  // Admissão no meio do mês: o Secullum já tem a escala cadastrada a partir da
  // data de contratação, mas às vezes também carrega dias anteriores a ela —
  // sem esse corte, esses dias virariam "falta" de um período em que o
  // colaborador nem tinha sido contratado ainda.
  const inicio = dataAdmissao && dataAdmissao > primeiroDiaMes ? dataAdmissao : primeiroDiaMes;
  if (inicio > fim) {
    return { ...RESULTADO_VAZIO, encontradoNoSecullum: true };
  }

  let batidas;
  try {
    batidas = await getBatidas(cpf, inicio, fim);
  } catch (err: any) {
    if (ehFuncionarioNaoEncontrado(err)) {
      return { ...RESULTADO_VAZIO, encontradoNoSecullum: false };
    }
    throw err;
  }

  let extrasMin = 0;
  let atrasosMin = 0;
  const faltaDatas: string[] = [];
  // Dias sem nenhuma batida e sem marcador (SUSP/AT. MÉD/ABONO/GERAR) no
  // /Batidas — parecem falta integral, mas o /Batidas não expõe declaração
  // (JustPa.) quando o dia não tem batida nenhuma, só o /Calcular tem essa
  // coluna. Ver getCalcularComOrcamento.
  const diasFaltaCandidata: string[] = [];

  for (const batida of batidas) {
    const dia = batida.Data.split('T')[0];
    if (diasExcecao.has(dia)) continue; // ex.: dia da Copa — não é falta, ver calendario.ts

    if (motivoStatusEspecial(batida) !== null) continue; // dia justificado (SUSP, AT. MÉD, ABONO, GERAR...)
    if (batida.Folga || batida.Neutro || batida.NBanco) continue;

    const cargaMin = calcularCargaEsperadaMin(batida);
    if (cargaMin === 0) continue; // dia não escalado (fim de semana etc.)

    if (!batida.Entrada1) {
      diasFaltaCandidata.push(dia);
      continue;
    }

    const trabalhadoMin = calcularHorasTrabalhadas(batida) * 60;
    const diffMin = trabalhadoMin - cargaMin;
    if (Math.abs(diffMin) <= TOLERANCIA_CLT_MIN) continue;

    if (diffMin > 0) extrasMin += diffMin;
    else atrasosMin += -diffMin;
  }

  if (diasFaltaCandidata.length > 0) {
    const calc = await getCalcularComOrcamento(cpf, inicio, fim);
    if (calc) {
      const porData = new Map(parseCalcularLinhas(calc).map((l) => [l.data, l.valores]));
      for (const dia of diasFaltaCandidata) {
        const justificado = !!porData.get(dia)?.['JustPa.'];
        if (!justificado) faltaDatas.push(dia);
      }
    } else {
      // Sem orçamento de /Calcular disponível (ou 429) — mantém o
      // comportamento anterior em vez de arriscar um falso negativo.
      faltaDatas.push(...diasFaltaCandidata);
    }
  }

  return {
    horasPositivas: Math.round((extrasMin / 60) * 100) / 100,
    horasNegativas: Math.round((atrasosMin / 60) * 100) / 100,
    faltaQtd: faltaDatas.length,
    faltaDatas,
    encontradoNoSecullum: true,
  };
}
