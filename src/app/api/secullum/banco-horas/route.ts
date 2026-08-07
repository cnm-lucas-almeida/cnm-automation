import { calcularBancoHoras, type BancoHoras } from '@/lib/secullum';
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

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Usa D-1 por padrão: o dia corrente ainda está em aberto no Secullum (turno não
// fechado), o que faria as horas restantes do dia contarem como "atraso".
function dataD1Padrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return iso(d);
}

function inicioMesPadrao(): string {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}

interface ResultadoColaborador {
  nome: string;
  cpf: string;
  cargo: string | null;
  departamento: string | null;
  status: 'ok' | 'sem_registro' | 'erro';
  banco?: BancoHoras;
  erro?: string;
  rateLimited?: boolean;
}

async function calcularResultado(
  col: { nome: string; cpf: string; cargo: string | null; departamento: string | null },
  dataInicio: string,
  dataFim: string
): Promise<ResultadoColaborador> {
  try {
    const banco = await calcularBancoHoras(col.cpf, dataInicio, dataFim);
    if (!banco.temRegistro) {
      return { ...col, status: 'sem_registro' };
    }
    return { ...col, status: 'ok', banco };
  } catch (err: any) {
    const status = err?.response?.status;
    const detalhe = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { ...col, status: 'erro', erro: detalhe, rateLimited: status === 429 };
  }
}

// Consulta avulsa (usada para retry de um único colaborador sem refazer o lote inteiro).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataInicio = searchParams.get('dataInicio') || inicioMesPadrao();
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
      dataInicio,
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
        send({ type: 'total', dataInicio, dataFim, total: colaboradores.length });

        const resultados: ResultadoColaborador[] = [];
        let processed = 0;

        for (let i = 0; i < colaboradores.length; i += BATCH_SIZE) {
          const lote = colaboradores.slice(i, i + BATCH_SIZE);

          const lotResults = await Promise.all(
            lote.map(async (col, idx) => {
              await delay(idx * DELAY_MS);
              return calcularResultado(
                { nome: col.nome, cpf: col.cpf!, cargo: col.cargo, departamento: col.departamento },
                dataInicio,
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
          dataInicio,
          dataFim,
          resumo: {
            totalColaboradores: resultados.length,
            totalDevendo: resultados.filter((r) => r.banco && r.banco.saldoMin < 0).length,
            totalPositivos: resultados.filter((r) => r.banco && r.banco.saldoMin > 0).length,
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
