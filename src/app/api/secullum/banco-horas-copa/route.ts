import { calcularBancoHorasCopa, type BancoHorasCopa } from '@/lib/secullum';
import { listarColaboradores } from '@/lib/convenia';

const DELAY_MS = 150;
const BATCH_SIZE = 10;

// Colaboradores que não batem ponto no Secullum (cargo isento de controle de
// jornada) e por isso não entram nesse relatório de banco de horas.
const CPFS_EXCLUIDOS = new Set([
  '05464225943', // Alex Galvão Borges — Coordenador de Inovação e IA
]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Usa D-1 por padrão: o dia corrente ainda está em aberto no Secullum (turno não
// fechado), o que faz o /Calcular contar as horas restantes do dia como "atraso".
function dataD1Padrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface ResultadoColaborador {
  nome: string;
  cpf: string;
  cargo: string | null;
  departamento: string | null;
  status: 'pendente' | 'quitado' | 'sem_registro' | 'erro';
  banco?: BancoHorasCopa;
  erro?: string;
  rateLimited?: boolean;
}

async function calcularResultado(
  col: { nome: string; cpf: string; cargo: string | null; departamento: string | null },
  dataFim: string
): Promise<ResultadoColaborador> {
  try {
    const banco = await calcularBancoHorasCopa(col.cpf, dataFim);
    if (!banco.diaCopaEncontrado) {
      return { ...col, status: 'sem_registro' };
    }
    return { ...col, status: banco.faltaPagarMin > 0 ? 'pendente' : 'quitado', banco };
  } catch (err: any) {
    const status = err?.response?.status;
    const detalhe = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { ...col, status: 'erro', erro: detalhe, rateLimited: status === 429 };
  }
}

// Consulta avulsa (usada para retry de um único colaborador sem refazer o lote inteiro).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataFim = searchParams.get('dataFim') || dataD1Padrao();
  const cpf = searchParams.get('cpf');

  if (cpf) {
    let colaboradores;
    try {
      colaboradores = await listarColaboradores();
    } catch (error: any) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    const col = colaboradores.find((c) => c.cpf === cpf);
    if (!col) {
      return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }
    if (CPFS_EXCLUIDOS.has(cpf)) {
      return Response.json({ error: 'Colaborador não bate ponto — fora do escopo deste relatório' }, { status: 400 });
    }
    const resultado = await calcularResultado(
      { nome: col.nome, cpf: col.cpf!, cargo: col.cargo, departamento: col.departamento },
      dataFim
    );
    return Response.json(resultado);
  }

  let colaboradores;
  try {
    colaboradores = (await listarColaboradores()).filter(
      (c) => c.status === 'Ativo' && c.cpf && !CPFS_EXCLUIDOS.has(c.cpf)
    );
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        send({ type: 'total', dataFim, total: colaboradores.length });

        const resultados: ResultadoColaborador[] = [];
        let processed = 0;

        for (let i = 0; i < colaboradores.length; i += BATCH_SIZE) {
          const lote = colaboradores.slice(i, i + BATCH_SIZE);

          const lotResults = await Promise.all(
            lote.map(async (col, idx) => {
              await delay(idx * DELAY_MS);
              return calcularResultado(
                { nome: col.nome, cpf: col.cpf!, cargo: col.cargo, departamento: col.departamento },
                dataFim
              );
            })
          );

          for (const r of lotResults) {
            resultados.push(r);
            processed++;
            send({ type: 'item', processed, total: colaboradores.length, resultado: r });
          }

          if (i + BATCH_SIZE < colaboradores.length) {
            await delay(500);
          }
        }

        send({
          type: 'done',
          dataFim,
          resumo: {
            totalColaboradores: resultados.length,
            totalPendentes: resultados.filter((r) => r.status === 'pendente').length,
            totalQuitados: resultados.filter((r) => r.status === 'quitado').length,
            totalSemRegistro: resultados.filter((r) => r.status === 'sem_registro').length,
            totalErros: resultados.filter((r) => r.status === 'erro').length,
            totalRateLimited: resultados.filter((r) => r.rateLimited).length,
          },
        });
      } catch (error: any) {
        send({ type: 'error', message: error.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
