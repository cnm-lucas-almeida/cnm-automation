import { NextResponse } from 'next/server';
import { obterProgressoConvenia } from '@/lib/convenia';
import { obterProgressoCalculo } from '@/lib/folha-pagamento';

// Progresso do fechamento em andamento — a busca de salário no Convenia é o
// gargalo real (1 chamada por colaborador, rate limit não permite lote); o
// cálculo por colaborador (Secullum + fórmulas) é a segunda fase, mais rápida.
// Estado em memória do processo — vale pra um fechamento por vez, suficiente
// pra uma ferramenta interna de uso individual.
export async function GET() {
  return NextResponse.json({
    convenia: obterProgressoConvenia(),
    calculo: obterProgressoCalculo(),
  });
}
