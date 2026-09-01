import { listarColaboradoresComSalario, listarColaboradores, buscarSalario } from '@/lib/convenia';
import { calcularSalarioAtualizado } from './salario';
import { buscarComissoesDoMes } from './comissao';
import { calcularHorasMes } from './horas';
import { calcularDiasMes, calcularDiasPeriodo, type DiasMes } from './calendario';
import { listarOverrides, buscarDiasExcecaoDoMes } from './overrides';
import { buscarUnimedDoMes, normalizarNome } from './unimed';
import { buscarOdontoDoMes } from './odonto';
import { buscarConsignadoDoMes } from './consignado';
import { buscarCamposManuaisDoMes } from './manual';
import { buscarValeDoMes } from './vale';
import type { FolhaColaborador, OverrideSalario, FolhaPagamentoResultado, ProgressoCalculo } from './types';

export * from './types';

async function mapComConcorrencia<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;
  async function worker() {
    while (indice < items.length) {
      const atual = indice++;
      resultados[atual] = await fn(items[atual]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return resultados;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Admissão dentro do mês corrente: DSR (comissão, hora extra, falta) é
// calculado sobre os dias do período efetivamente trabalhado, não o mês
// cheio — validado contra caso real (Jarbas Dias Da Silva, admitido
// 15/06/2026): planilha usa ÷14×2 pro período 15→30/06, e
// calcularDiasPeriodo(2026,6,15,30) devolve exatamente diasUteis=14,
// diasDescanso=2. Admissão em mês anterior usa o mês cheio normalmente.
function diasReferencia(ano: number, mes: number, diasMesCompleto: DiasMes, dataAdmissao: string | null): DiasMes {
  if (!dataAdmissao) return diasMesCompleto;
  const admissao = new Date(dataAdmissao);
  const dentroDoMes = admissao.getUTCFullYear() === ano && admissao.getUTCMonth() + 1 === mes;
  if (!dentroDoMes) return diasMesCompleto;
  return calcularDiasPeriodo(ano, mes, admissao.getUTCDate(), ultimoDiaDoMes(ano, mes));
}

function overridePercentualVigente(overrides: OverrideSalario[], cpf: string, ano: number, mes: number): number {
  const referencia = `${ano}-${String(mes).padStart(2, '0')}-01`;
  return overrides
    .filter((o) => o.cpf === cpf && o.vigenciaInicio <= referencia && (!o.vigenciaFim || o.vigenciaFim >= referencia))
    .reduce((soma, o) => soma + o.percentual, 0);
}

let progressoCalculo: ProgressoCalculo = { total: 0, atual: 0 };

export function obterProgressoCalculo(): ProgressoCalculo {
  return { ...progressoCalculo };
}

// Regra de resolução das colunas que vêm de import (Postgres), isolada aqui
// porque é usada em dois lugares: no fechamento completo (montarLinha) e no
// refresh rápido depois de um upload (getDescontosImportados). Se as duas
// divergirem, a tela passa a mostrar um valor depois do import e outro depois
// do recálculo — por isso a regra mora num lugar só.
const centavos = (n: number) => Math.round(n * 100) / 100;

function resolverImportados(
  nome: string,
  cpf: string,
  unimedMap: Map<string, number>,
  odontoMap: Map<string, number>,
  consignadoMap: Map<string, number>,
  manual: { valeAlimentacao: number | null; valeTransporte: number | null } | undefined,
  valeMap: Awaited<ReturnType<typeof buscarValeDoMes>>
) {
  // VA/VT vêm da planilha de acompanhamento da empresa (cruzada por nome, sem
  // CPF disponível ali); edição manual continua valendo como correção pontual
  // por cima. Unimed também cruza por nome; Odonto e Consignado, por CPF.
  const vale = valeMap.get(normalizarNome(nome));
  return {
    descontoUnimed: centavos(unimedMap.get(normalizarNome(nome)) ?? 0),
    descontoOdonto: centavos(odontoMap.get(cpf) ?? 0),
    consignado: centavos(consignadoMap.get(cpf) ?? 0),
    valeAlimentacao: manual?.valeAlimentacao ?? (vale ? vale.va : null),
    valeTransporte: manual?.valeTransporte ?? (vale ? vale.vt : null),
  };
}

// Só as colunas que vêm de import, sem tocar no Convenia (salário), no
// Secullum (horas) nem na comissão. Serve o refresh depois de um upload: o
// fechamento inteiro leva ~5 min só por causa das ~156 buscas de salário no
// Convenia, e nenhum dos 4 imports depende disso.
export interface DescontosImportados {
  cpf: string;
  descontoUnimed: number;
  descontoOdonto: number;
  consignado: number;
  valeAlimentacao: number | null;
  valeTransporte: number | null;
}

export async function getDescontosImportados(ano: number, mes: number): Promise<DescontosImportados[]> {
  const [colaboradores, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap] = await Promise.all([
    listarColaboradores(), // lista simples: 2 requisições paginadas, sem o detalhe de salário
    buscarUnimedDoMes(ano, mes),
    buscarOdontoDoMes(ano, mes),
    buscarConsignadoDoMes(ano, mes),
    buscarCamposManuaisDoMes(ano, mes),
    buscarValeDoMes(ano, mes),
  ]);

  return colaboradores
    .filter((c): c is typeof c & { cpf: string } => !!c.cpf)
    .map((c) => ({
      cpf: c.cpf,
      ...resolverImportados(c.nome, c.cpf, unimedMap, odontoMap, consignadoMap, manuaisMap.get(c.cpf), valeMap),
    }));
}

export async function getFolhaPagamento(ano: number, mes: number, forceRefreshConvenia = false): Promise<FolhaPagamentoResultado> {
  progressoCalculo = { total: 0, atual: 0 };

  const [colaboradoresConvenia, diasExcecao, overrides, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap] = await Promise.all([
    listarColaboradoresComSalario(forceRefreshConvenia),
    buscarDiasExcecaoDoMes(ano, mes),
    listarOverrides(),
    buscarUnimedDoMes(ano, mes),
    buscarOdontoDoMes(ano, mes),
    buscarConsignadoDoMes(ano, mes),
    buscarCamposManuaisDoMes(ano, mes),
    buscarValeDoMes(ano, mes),
  ]);

  // "Em férias" continua na folha (salário normal, só não bate ponto) — só
  // status de desligamento/afastamento de fato (Demitido, Aviso Prévio etc.)
  // fica de fora.
  const ativos = colaboradoresConvenia.filter((c) => c.status === 'Ativo' || c.status === 'Em férias');
  const paraComissao = ativos
    .filter((c): c is typeof c & { cpf: string } => !!c.cpf)
    .map((c) => ({ cpf: c.cpf, nome: c.nome }));
  const comissoes = await buscarComissoesDoMes(paraComissao, ano, mes);
  const diasMes = calcularDiasMes(ano, mes);

  const colaboradoresSemCpf = ativos.filter((c) => !c.cpf).length;

  progressoCalculo = { total: ativos.length, atual: 0 };
  const linhas = await mapComConcorrencia(ativos, 8, async (c): Promise<FolhaColaborador | null> => {
    if (!c.cpf) return null;

    try {
      const linha = await montarLinha(c, ano, mes, diasExcecao, overrides, comissoes, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap, diasMes);
      progressoCalculo = { ...progressoCalculo, atual: progressoCalculo.atual + 1 };
      return linha;
    } catch (err: any) {
      progressoCalculo = { ...progressoCalculo, atual: progressoCalculo.atual + 1 };
      // Um colaborador com erro (ex.: instabilidade momentânea numa fonte
      // externa) não pode travar o fechamento dos outros ~150. Aparece na
      // tela como pendência a conferir manualmente, não trava o resto.
      return {
        cpf: c.cpf,
        nome: c.nome,
        admissao: c.dataAdmissao,
        cargo: c.cargo,
        dpto: c.departamento,
        salarioBase: c.salario,
        overridePercentual: 0,
        salarioAtualizado: c.salario,
        comissao: 0,
        dsrComissao: 0,
        salMaisComissao: c.salario,
        horasPositivas: 0,
        valorHora: 0,
        horaExtra: 0,
        heMais75: 0,
        dsrHoraExtra: 0,
        horasNegativas: 0,
        salarioPorHora: 0,
        descHorasFalta: 0,
        faltaQtd: 0,
        faltaDatas: [],
        dsrPerdidosQtd: 0,
        dsrValor: 0,
        descontoUnimed: 0,
        descontoOdonto: 0,
        consignado: 0,
        observacoes: null,
        sitepd: null,
        valeAlimentacao: null,
        valeTransporte: null,
        secullumEncontrado: false,
        comissaoMatchPorNome: false,
        horasEditadasManualmente: false,
        erro: err?.message ?? 'Erro desconhecido ao calcular esta linha.',
      };
    }
  });

  const colaboradores = linhas.filter((l): l is FolhaColaborador => l !== null).sort((a, b) => a.nome.localeCompare(b.nome));

  return { ano, mes, colaboradores, colaboradoresSemCpf };
}

async function montarLinha(
  c: Awaited<ReturnType<typeof listarColaboradoresComSalario>>[number],
  ano: number,
  mes: number,
  diasExcecao: Set<string>,
  overrides: OverrideSalario[],
  comissoes: Awaited<ReturnType<typeof buscarComissoesDoMes>>,
  unimedMap: Map<string, number>,
  odontoMap: Map<string, number>,
  consignadoMap: Map<string, number>,
  manuaisMap: Map<string, Awaited<ReturnType<typeof buscarCamposManuaisDoMes>> extends Map<string, infer V> ? V : never>,
  valeMap: Awaited<ReturnType<typeof buscarValeDoMes>>,
  diasMes: ReturnType<typeof calcularDiasMes>
): Promise<FolhaColaborador> {
  const cpf = c.cpf!;
  const overridePercentual = overridePercentualVigente(overrides, cpf, ano, mes);
  const { salarioBase, salarioAtualizado } = calcularSalarioAtualizado(c.salario, overridePercentual);

  const horas = await calcularHorasMes(cpf, ano, mes, diasExcecao, c.dataAdmissao);
  const manual = manuaisMap.get(cpf);
  // RH controla exceções de hora editando direto (Copa e afins), não por uma
  // lista automática de dias-exceção — o valor manual, quando existe, prevalece.
  const horasPositivas = manual?.horasPositivasOverride ?? horas.horasPositivas;
  const horasNegativas = manual?.horasNegativasOverride ?? horas.horasNegativas;

  const comissaoResultado = comissoes.get(cpf) ?? {
    comissao: 0, fechado: false, perfil: null, vendedorEncontrado: false, matchPorNome: false,
  };
  const comissao = comissaoResultado.comissao;

  const dias = diasReferencia(ano, mes, diasMes, c.dataAdmissao);

  const salMaisComissao = salarioAtualizado + comissao;
  const valorHora = salMaisComissao / 200;
  const horaExtra = horasPositivas * valorHora;
  const heMais75 = horaExtra * 1.75;
  const dsrHoraExtra = dias.diasUteis > 0 ? (heMais75 / dias.diasUteis) * dias.diasDescanso : 0;
  const dsrComissao = dias.diasUteis > 0 ? (comissao / dias.diasUteis) * dias.diasDescanso : 0;

  const salarioPorHora = salarioAtualizado / 200;
  const descHorasFalta = horasNegativas * salarioPorHora;
  // RH pode corrigir o nº de faltas detectado no Secullum (ex.: falta
  // justificada depois do fechamento) — o valor manual, quando existe, prevalece.
  const faltaQtd = manual?.faltaQtdOverride ?? horas.faltaQtd;
  const dsrValor = dias.diasUteis > 0 ? faltaQtd * (salarioAtualizado / dias.diasUteis) : 0;

  const { descontoUnimed, descontoOdonto, consignado, valeAlimentacao, valeTransporte } =
    resolverImportados(c.nome, cpf, unimedMap, odontoMap, consignadoMap, manual, valeMap);

  return {
    cpf,
    nome: c.nome,
    admissao: c.dataAdmissao,
    cargo: c.cargo,
    dpto: c.departamento,

    salarioBase,
    overridePercentual,
    salarioAtualizado: Math.round(salarioAtualizado * 100) / 100,

    comissao: Math.round(comissao * 100) / 100,
    dsrComissao: Math.round(dsrComissao * 100) / 100,
    salMaisComissao: Math.round(salMaisComissao * 100) / 100,

    horasPositivas,
    valorHora: Math.round(valorHora * 100) / 100,
    horaExtra: Math.round(horaExtra * 100) / 100,
    heMais75: Math.round(heMais75 * 100) / 100,
    dsrHoraExtra: Math.round(dsrHoraExtra * 100) / 100,

    horasNegativas,
    salarioPorHora: Math.round(salarioPorHora * 100) / 100,
    descHorasFalta: Math.round(descHorasFalta * 100) / 100,

    faltaQtd,
    faltaDatas: horas.faltaDatas,
    dsrPerdidosQtd: faltaQtd,
    dsrValor: Math.round(dsrValor * 100) / 100,

    descontoUnimed,
    descontoOdonto,
    consignado,

    observacoes: manual?.observacoes ?? null,
    sitepd: manual?.sitepd ?? null,
    valeAlimentacao,
    valeTransporte,

    secullumEncontrado: horas.encontradoNoSecullum,
    comissaoMatchPorNome: comissaoResultado.matchPorNome,
    horasEditadasManualmente: manual?.horasPositivasOverride != null || manual?.horasNegativasOverride != null,
    erro: null,
  };
}

// Recalcula só 1 colaborador — usado depois de uma edição manual (ex.: Horas
// +/-) pra atualizar a linha na tela sem esperar o fechamento inteiro de novo
// (que leva minutos por causa do rate limit do Convenia). Como é só 1 pessoa,
// a chamada de salário ao Convenia não esbarra nesse limite.
export async function getFolhaColaborador(cpf: string, ano: number, mes: number): Promise<FolhaColaborador | null> {
  const colaboradores = await listarColaboradores();
  const colaborador = colaboradores.find((c) => c.cpf === cpf.replace(/\D/g, ''));
  if (!colaborador) return null;

  const [salario, diasExcecao, overrides, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap, comissoes] = await Promise.all([
    buscarSalario(colaborador.id),
    buscarDiasExcecaoDoMes(ano, mes),
    listarOverrides(),
    buscarUnimedDoMes(ano, mes),
    buscarOdontoDoMes(ano, mes),
    buscarConsignadoDoMes(ano, mes),
    buscarCamposManuaisDoMes(ano, mes),
    buscarValeDoMes(ano, mes),
    buscarComissoesDoMes([{ cpf: colaborador.cpf!, nome: colaborador.nome }], ano, mes),
  ]);

  const diasMes = calcularDiasMes(ano, mes);
  return montarLinha(
    { ...colaborador, salario },
    ano,
    mes,
    diasExcecao,
    overrides,
    comissoes,
    unimedMap,
    odontoMap,
    consignadoMap,
    manuaisMap,
    valeMap,
    diasMes
  );
}
