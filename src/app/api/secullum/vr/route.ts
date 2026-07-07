import { NextResponse } from 'next/server';
import { getBatidas, isDiaElegivelVR, calcularHorasTrabalhadas } from '@/lib/secullum';

const DELAY_MS = 150;
const BATCH_SIZE = 10;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

interface FuncionarioInput {
  nome: string;
  cpf: string;
}

interface DiaTrabalhado {
  data: string;
  horasTrabalhadas: number;
  elegivelVR: boolean;
}

interface ResultadoFuncionario {
  nome: string;
  cpf: string;
  diasTrabalhados: number;
  diasElegiveis: number;
  valorVR: number;
  detalhes: DiaTrabalhado[];
  erro?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { funcionarios, dataInicio, dataFim, vrValor } = body as {
      funcionarios: FuncionarioInput[];
      dataInicio: string;
      dataFim: string;
      vrValor: number;
    };

    if (!funcionarios?.length || !dataInicio || !dataFim || vrValor == null) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: funcionarios, dataInicio, dataFim, vrValor' },
        { status: 400 }
      );
    }

    const resultados: ResultadoFuncionario[] = [];

    // Processar em lotes para respeitar rate limit
    for (let i = 0; i < funcionarios.length; i += BATCH_SIZE) {
      const lote = funcionarios.slice(i, i + BATCH_SIZE);

      const lotResults = await Promise.all(
        lote.map(async (func, idx): Promise<ResultadoFuncionario> => {
          await delay(idx * DELAY_MS);
          const cpf = normalizarCpf(func.cpf);

          try {
            const batidas = await getBatidas(cpf, dataInicio, dataFim);

            const detalhes: DiaTrabalhado[] = batidas.map((b) => {
              const horas = calcularHorasTrabalhadas(b);
              return {
                data: b.Data.split('T')[0],
                horasTrabalhadas: Math.round(horas * 100) / 100,
                elegivelVR: isDiaElegivelVR(b),
              };
            });

            const diasTrabalhados = detalhes.filter((d) => d.horasTrabalhadas > 0).length;
            const diasElegiveis = detalhes.filter((d) => d.elegivelVR).length;

            return {
              nome: func.nome,
              cpf: func.cpf,
              diasTrabalhados,
              diasElegiveis,
              valorVR: Math.round(diasElegiveis * vrValor * 100) / 100,
              detalhes,
            };
          } catch (err: any) {
            const detalhe = err?.response?.data
              ? JSON.stringify(err.response.data)
              : err.message;
            console.error(`Erro Secullum para CPF ${cpf}:`, detalhe);
            return {
              nome: func.nome,
              cpf: func.cpf,
              diasTrabalhados: 0,
              diasElegiveis: 0,
              valorVR: 0,
              detalhes: [],
              erro: detalhe,
            };
          }
        })
      );

      resultados.push(...lotResults);

      // Delay entre lotes para não sobrecarregar a API
      if (i + BATCH_SIZE < funcionarios.length) {
        await delay(500);
      }
    }

    const totalElegiveis = resultados.reduce((s, r) => s + r.diasElegiveis, 0);
    const totalVR = resultados.reduce((s, r) => s + r.valorVR, 0);

    return NextResponse.json({
      resultados,
      resumo: {
        totalFuncionarios: resultados.length,
        totalDiasElegiveis: totalElegiveis,
        totalVR: Math.round(totalVR * 100) / 100,
        vrValor,
      },
    });
  } catch (error: any) {
    console.error('Erro ao calcular VR Secullum:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
