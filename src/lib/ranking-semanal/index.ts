import { listarColaboradores } from '@/lib/convenia';
import {
  buscarDadosAdmin, normalizarNome, GESTOR_NOME, segmentoFromDepartamento, calcularCiclo,
  type Ciclo, type Segmento,
} from '@/lib/inside-sales';
import { getFilaLeadsData, type TipoBase } from '@/lib/fila-leads';
import { getEstoqueSemanalData } from '@/lib/estoque-semanal';
import { listarMetas } from '@/lib/metas';

// Squads no admin vêm com prefixo "IMOV - SQUAD "/"VEIC - SQUAD " — removido só na exibição.
// Duplicado de inside-sales-306090/vendas-dia-a-dia (ver CONEXOES.md §4 da skill relatorio-comercial,
// duplicação já conhecida, não é acidente).
function limparSquad(squad: string | null): string | null {
  if (!squad) return squad;
  return squad.replace(/^(IMOV|VEIC)\s*-\s*SQUAD\s*/i, '').trim();
}

/** Pontos por ocorrência de cada Tipo Base, direto do PDF da campanha (seção 2). */
const PONTOS_POR_TIPO_BASE: Record<Exclude<TipoBase, ''>, number> = {
  'BASE -20': 1,
  'BASE 30+': 3,
  'BASE FOCO -100': 5,
  'BASE FOCO +100': 8,
  'TOP 20': 15,
};

/**
 * Pontos por atingimento de meta semanal — tabela do Ritmo de Estoque bate com o PDF da campanha.
 * A do Ritmo Financeiro NÃO bate com o PDF (que usa 18/16/12/10/8/5, igual à de Estoque) — usamos a
 * fórmula real da planilha (decisão do usuário, 2026-08-08: a planilha manda, o PDF está desatualizado
 * neste ponto). Ver ANALISE_RANKING_SEMANAL.md §5.1.
 */
function pontosRitmoEstoque(percentual: number): number {
  if (percentual >= 1.2) return 18;
  if (percentual >= 1.0) return 16;
  if (percentual >= 0.9) return 12;
  if (percentual >= 0.8) return 10;
  if (percentual >= 0.7) return 8;
  if (percentual >= 0.6) return 5;
  return 0;
}

function pontosRitmoFinanceiro(percentual: number): number {
  if (percentual >= 1.2) return 20;
  if (percentual >= 1.0) return 18;
  if (percentual >= 0.9) return 14;
  if (percentual >= 0.8) return 10;
  if (percentual >= 0.7) return 8;
  if (percentual >= 0.6) return 5;
  return 0;
}

export type LinhaRankingSemanal = {
  idVendedor: number;
  nome: string;
  squad: string | null;
  ciclo: Ciclo | null;
  supervisor: string | null;

  base20: number;
  pontosBase20: number;
  base30Mais: number;
  pontosBase30Mais: number;
  baseFoco100Menos: number;
  pontosBaseFoco100Menos: number;
  baseFoco100Mais: number;
  pontosBaseFoco100Mais: number;
  top20: number;
  pontosTop20: number;
  totalBases: number;

  estoque: number;
  pontosEstoque: number;
  percentualEstoque: number;
  financeiro: number;
  pontosFinanceiro: number;
  percentualFinanceiro: number;

  /** Soma de todos os pontos que já calculamos (colunas F,H,J,L,N,Q,T) — NÃO é a pontuação final da
   * campanha, que também soma tempo falado/acionamentos/fechamento de lead/redutores (ver campos abaixo,
   * todos null até o crm-internal ser integrado, Fase 2). */
  pontuacaoParcialAU: number;

  // Fase 2 (crm-internal) — colunas V em diante da planilha, ainda não implementadas.
  tempoFaladoMedioDiarioMinutos: number | null;
  pontosTempoFalado: number | null;
  acionamentosMediaDiaria: number | null;
  pontosAcionamentos: number | null;
  percentualFechamentoLead: number | null;
  pontosFechamentoLead: number | null;
  percentualCongCanc: number | null;
  pontosCongCanc: number | null;
  pontuacaoTotal: number | null;
  tier: 'ELITE' | 'ALTA_PERFORMANCE' | 'PERFORMANCE' | 'STANDARD' | 'NAO_APTO' | null;
};

/**
 * Semana da campanha (Sexta→Quinta, ver ANALISE_RANKING_SEMANAL.md §2) que contém `referencia`.
 * Se a semana ainda não fechou (referencia < quinta), retorna até `referencia` (semana em andamento),
 * não até a quinta futura.
 */
export function semanaCampanhaAtual(referencia = new Date()): { dataInicial: string; dataFinal: string } {
  const diaSemana = referencia.getDay(); // 0=domingo..6=sábado, sexta=5
  const diasDesdeSexta = (diaSemana - 5 + 7) % 7;
  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - diasDesdeSexta);

  const fimTeorico = new Date(inicio);
  fimTeorico.setDate(inicio.getDate() + 6);
  const fim = fimTeorico < referencia ? fimTeorico : referencia;

  return { dataInicial: inicio.toISOString().slice(0, 10), dataFinal: fim.toISOString().slice(0, 10) };
}

export type RankingSemanalData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  linhas: LinhaRankingSemanal[];
  squads: string[];
  supervisores: string[];
};

type RosterEntry = {
  idVendedor: number;
  nome: string;
  squadId: number | null;
  squad: string | null;
  supervisor: string | null;
  ciclo: Ciclo | null;
};

/** Mesma população/critério de "quadro comercial ativo" de /inside-sales-306090 (Convenia: não
 * desligado, gestor Jackson, cargo Vendedor, com supervisor vinculado no admin) — mas calculando o
 * Ciclo no formato '1°'/'2°'/'V' (igual /fila-leads e /inside-sales), não o 'ciclo1'/'ciclo2'/'ciclo3'
 * de is-306090, que é um conceito de negócio diferente (ciclo de validação 30/60/90 dias, não o ciclo
 * de experiência usado pra pontuação da campanha). */
async function buscarRoster(segmento: Segmento): Promise<Map<number, RosterEntry>> {
  const colaboradores = await listarColaboradores();
  const elegiveis = colaboradores.filter(
    (c) =>
      c.status !== 'Desligado' &&
      c.gestorNome === GESTOR_NOME &&
      c.cargo &&
      /vendedor/i.test(c.cargo) &&
      segmentoFromDepartamento(c.departamento) === segmento
  );

  const { porCpf, porNome } = await buscarDadosAdmin(elegiveis.map((c) => ({ cpf: c.cpf, nome: c.nome })));

  const roster = new Map<number, RosterEntry>();
  const hoje = new Date();
  for (const c of elegiveis) {
    const admin = (c.cpf && porCpf.get(c.cpf)) || porNome.get(normalizarNome(c.nome)) || null;
    if (!admin?.supervisorNome) continue; // fora do quadro comercial ativo, mesmo critério do admin PHP

    roster.set(admin.idVendedor, {
      idVendedor: admin.idVendedor,
      nome: c.nome,
      squadId: admin.squadId,
      squad: limparSquad(admin.squadNome),
      supervisor: admin.supervisorNome,
      ciclo: c.experiencePeriod ? calcularCiclo(c.experiencePeriod, hoje) : null,
    });
  }
  return roster;
}

export async function getRankingSemanalData(
  dataInicial: string,
  dataFinal: string,
  segmento: Segmento = 'imoveis'
): Promise<RankingSemanalData> {
  const [roster, filaLeadsData, estoqueSemanalData, metas] = await Promise.all([
    buscarRoster(segmento),
    getFilaLeadsData({ dataInicial, dataFinal, tipo: segmento === 'imoveis' ? 'I' : 'V' }),
    getEstoqueSemanalData(dataInicial, dataFinal, segmento),
    listarMetas(),
  ]);

  const metaPorSquadId = new Map(metas.map((m) => [m.squadId, m]));
  const estoquePorVendedor = new Map(estoqueSemanalData.linhas.map((l) => [l.idVendedor, l]));

  const contagemTipoBase = new Map<number, Record<Exclude<TipoBase, ''>, number>>();
  for (const linha of filaLeadsData.linhas) {
    if (!linha.tipoBase) continue;
    const contagem = contagemTipoBase.get(linha.idVendedor) ?? {
      'BASE -20': 0, 'BASE 30+': 0, 'BASE FOCO -100': 0, 'BASE FOCO +100': 0, 'TOP 20': 0,
    };
    contagem[linha.tipoBase as Exclude<TipoBase, ''>] += 1;
    contagemTipoBase.set(linha.idVendedor, contagem);
  }

  const linhas: LinhaRankingSemanal[] = Array.from(roster.values()).map((r) => {
    const contagem = contagemTipoBase.get(r.idVendedor) ?? {
      'BASE -20': 0, 'BASE 30+': 0, 'BASE FOCO -100': 0, 'BASE FOCO +100': 0, 'TOP 20': 0,
    };
    const base20 = contagem['BASE -20'];
    const base30Mais = contagem['BASE 30+'];
    const baseFoco100Menos = contagem['BASE FOCO -100'];
    const baseFoco100Mais = contagem['BASE FOCO +100'];
    const top20 = contagem['TOP 20'];

    const pontosBase20 = base20 * PONTOS_POR_TIPO_BASE['BASE -20'];
    const pontosBase30Mais = base30Mais * PONTOS_POR_TIPO_BASE['BASE 30+'];
    const pontosBaseFoco100Menos = baseFoco100Menos * PONTOS_POR_TIPO_BASE['BASE FOCO -100'];
    const pontosBaseFoco100Mais = baseFoco100Mais * PONTOS_POR_TIPO_BASE['BASE FOCO +100'];
    const pontosTop20 = top20 * PONTOS_POR_TIPO_BASE['TOP 20'];

    const estoqueLinha = estoquePorVendedor.get(r.idVendedor);
    const estoque = estoqueLinha?.qtdAnuncios ?? 0;
    const financeiro = estoqueLinha?.valorTotalAtivas ?? 0;

    // Meta é do SQUAD inteiro (não dividida por vendedor) — comportamento real da planilha, não erro
    // nosso (ver ANALISE_RANKING_SEMANAL.md §5.2). Sem squad/meta cadastrada, % e pontos ficam 0.
    const meta = r.squadId != null ? metaPorSquadId.get(r.squadId) : undefined;
    const percentualEstoque = meta && meta.metaEstoqueSemana > 0 ? estoque / meta.metaEstoqueSemana : 0;
    const percentualFinanceiro = meta && meta.metaFinanceiraSemana > 0 ? financeiro / meta.metaFinanceiraSemana : 0;
    const pontosEstoque = pontosRitmoEstoque(percentualEstoque);
    const pontosFinanceiro = pontosRitmoFinanceiro(percentualFinanceiro);

    const totalBases = base20 + base30Mais + baseFoco100Menos + baseFoco100Mais + top20;
    const pontuacaoParcialAU =
      pontosBase20 + pontosBase30Mais + pontosBaseFoco100Menos + pontosBaseFoco100Mais + pontosTop20 +
      pontosEstoque + pontosFinanceiro;

    return {
      idVendedor: r.idVendedor,
      nome: r.nome,
      squad: r.squad,
      ciclo: r.ciclo,
      supervisor: r.supervisor,
      base20, pontosBase20,
      base30Mais, pontosBase30Mais,
      baseFoco100Menos, pontosBaseFoco100Menos,
      baseFoco100Mais, pontosBaseFoco100Mais,
      top20, pontosTop20,
      totalBases,
      estoque, pontosEstoque, percentualEstoque,
      financeiro, pontosFinanceiro, percentualFinanceiro,
      pontuacaoParcialAU,
      tempoFaladoMedioDiarioMinutos: null,
      pontosTempoFalado: null,
      acionamentosMediaDiaria: null,
      pontosAcionamentos: null,
      percentualFechamentoLead: null,
      pontosFechamentoLead: null,
      percentualCongCanc: null,
      pontosCongCanc: null,
      pontuacaoTotal: null,
      tier: null,
    };
  });

  linhas.sort((a, b) => b.pontuacaoParcialAU - a.pontuacaoParcialAU);

  const squads = Array.from(new Set(linhas.map((l) => l.squad).filter((s): s is string => Boolean(s)))).sort();
  const supervisores = Array.from(new Set(linhas.map((l) => l.supervisor).filter((s): s is string => Boolean(s)))).sort();

  return {
    generatedAt: new Date().toISOString(),
    periodo: { dataInicial, dataFinal },
    linhas,
    squads,
    supervisores,
  };
}
