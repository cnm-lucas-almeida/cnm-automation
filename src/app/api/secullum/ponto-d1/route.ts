import { getBatidas, analisarIntervaloAlmoco, type AnaliseAlmoco, type Batida } from '@/lib/secullum';
import { listarColaboradores } from '@/lib/convenia';

const DELAY_MS = 150;
const BATCH_SIZE = 10;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataD1(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface BatidaResumo {
  entrada1: string | null; saida1: string | null;
  entrada2: string | null; saida2: string | null;
  entrada3: string | null; saida3: string | null;
  entrada4: string | null; saida4: string | null;
  entrada5: string | null; saida5: string | null;
}

function mapBatidaResumo(b: Batida): BatidaResumo {
  return {
    entrada1: b.Entrada1, saida1: b.Saida1,
    entrada2: b.Entrada2, saida2: b.Saida2,
    entrada3: b.Entrada3, saida3: b.Saida3,
    entrada4: b.Entrada4, saida4: b.Saida4,
    entrada5: b.Entrada5, saida5: b.Saida5,
  };
}

interface ResultadoColaborador {
  nome: string;
  cpf: string;
  cargo: string | null;
  departamento: string | null;
  status: 'ok' | 'violacao' | 'sem_batida' | 'erro';
  analise?: AnaliseAlmoco;
  batida?: BatidaResumo;
  erro?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get('data') || dataD1();

  let colaboradores;
  try {
    colaboradores = (await listarColaboradores()).filter((c) => c.status === 'Ativo' && c.cpf);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        send({ type: 'total', data, total: colaboradores.length });

        const resultados: ResultadoColaborador[] = [];
        let processed = 0;

        for (let i = 0; i < colaboradores.length; i += BATCH_SIZE) {
          const lote = colaboradores.slice(i, i + BATCH_SIZE);

          const lotResults = await Promise.all(
            lote.map(async (col, idx): Promise<ResultadoColaborador> => {
              await delay(idx * DELAY_MS);

              try {
                const batidas = await getBatidas(col.cpf!, data, data);
                if (!batidas.length) {
                  return {
                    nome: col.nome,
                    cpf: col.cpf!,
                    cargo: col.cargo,
                    departamento: col.departamento,
                    status: 'sem_batida',
                  };
                }

                const analise = analisarIntervaloAlmoco(batidas[0]);
                return {
                  nome: col.nome,
                  cpf: col.cpf!,
                  cargo: col.cargo,
                  departamento: col.departamento,
                  status: analise.violacao ? 'violacao' : 'ok',
                  analise,
                  batida: mapBatidaResumo(batidas[0]),
                };
              } catch (err: any) {
                const detalhe = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
                return {
                  nome: col.nome,
                  cpf: col.cpf!,
                  cargo: col.cargo,
                  departamento: col.departamento,
                  status: 'erro',
                  erro: detalhe,
                };
              }
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

        const violacoes = resultados.filter((r) => r.status === 'violacao');

        send({
          type: 'done',
          data,
          resumo: {
            totalColaboradores: resultados.length,
            totalViolacoes: violacoes.length,
            totalSemBatida: resultados.filter((r) => r.status === 'sem_batida').length,
            totalErros: resultados.filter((r) => r.status === 'erro').length,
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
