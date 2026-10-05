import { listarColaboradoresComSalario, listarColaboradores, buscarSalario } from '@/lib/convenia';
import { calcularSalarioAtualizado } from './salario';
import { buscarComissoesDoMes } from './comissao';
import { calcularHorasMes } from './horas';
import { calcularDiasMes, calcularDiasPeriodo, type DiasMes } from './calendario';
import { listarOverrides, buscarDiasExcecaoDoMes } from './overrides';
import { buscarFeriadosDoMes } from './feriados';
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
function diasReferencia(ano: number, mes: number, diasMesCompleto: DiasMes, dataAdmissao: string | null, feriadosExtras: Set<string>): DiasMes {
  if (!dataAdmissao) return diasMesCompleto;
  const admissao = new Date(dataAdmissao);
  const dentroDoMes = admissao.getUTCFullYear() === ano && admissao.getUTCMonth() + 1 === mes;
  if (!dentroDoMes) return diasMesCompleto;
  return calcularDiasPeriodo(ano, mes, admissao.getUTCDate(), ultimoDiaDoMes(ano, mes), feriadosExtras);
}

function overridePercentualVigente(overrides: OverrideSalario[], cpf: string, ano: number, mes: number): number {
  const referencia = `${ano}-${String(mes).padStart(2, '0')}-01`;
  return overrides
    .filter((o) => o.cpf === cpf && o.vigenciaInicio <= referencia && (!o.vigenciaFim || o.vigenciaFim >= referencia))
    .reduce((soma, o) => soma + o.percentual, 0);
}

// Fallback para cadastro sem `work_period` no Convenia (4 pessoas em
// 01/09/2026, todas com cargo de CLT integral). A linha vira pendência a
// conferir em vez de assumir em silêncio — ver `jornadaAusente`.
const JORNADA_MENSAL_PADRAO = 200;

// Divisor do salário-dia. Constante por definição legal/convenção — não é o
// número de dias do mês nem os dias úteis.
const DIAS_SALARIO_MES = 30;

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

  const [colaboradoresConvenia, diasExcecao, overrides, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap, feriadosExtras] = await Promise.all([
    listarColaboradoresComSalario(forceRefreshConvenia),
    buscarDiasExcecaoDoMes(ano, mes),
    listarOverrides(),
    buscarUnimedDoMes(ano, mes),
    buscarOdontoDoMes(ano, mes),
    buscarConsignadoDoMes(ano, mes),
    buscarCamposManuaisDoMes(ano, mes),
    buscarValeDoMes(ano, mes),
    buscarFeriadosDoMes(ano, mes),
  ]);

  // "Em férias" continua na folha (salário normal, só não bate ponto) — só
  // status de desligamento/afastamento de fato (Demitido, Aviso Prévio etc.)
  // fica de fora.
  //
  // O recorte por data de admissão existe porque a lista do Convenia é uma
  // foto do PRESENTE: sem ele, quem foi admitido depois do mês fechado entra
  // na folha desse mês. Caso real (01/09/2026, fechando agosto): 16 pessoas
  // admitidas em 01/09 estavam dentro do cálculo, inflando a folha em
  // R$ 35.066,80. Pedido do RH: incluir quem foi admitido até o último dia
  // da competência.
  const ultimoDiaCompetencia = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;
  const ativos = colaboradoresConvenia.filter(
    (c) =>
      (c.status === 'Ativo' || c.status === 'Em férias') &&
      (!c.dataAdmissao || c.dataAdmissao <= ultimoDiaCompetencia)
  );
  const paraComissao = ativos
    .filter((c): c is typeof c & { cpf: string } => !!c.cpf)
    .map((c) => ({ cpf: c.cpf, nome: c.nome }));
  const comissoes = await buscarComissoesDoMes(paraComissao, ano, mes);
  const diasMes = calcularDiasMes(ano, mes, feriadosExtras);

  const colaboradoresSemCpf = ativos.filter((c) => !c.cpf).length;

  progressoCalculo = { total: ativos.length, atual: 0 };
  const linhas = await mapComConcorrencia(ativos, 8, async (c): Promise<FolhaColaborador | null> => {
    if (!c.cpf) return null;

    try {
      const linha = await montarLinha(c, ano, mes, diasExcecao, overrides, comissoes, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap, diasMes, feriadosExtras);
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
        jornadaMensal: c.jornadaMensal ?? JORNADA_MENSAL_PADRAO,
        jornadaAusente: c.jornadaMensal == null,
        comissao: 0,
        comissaoCalculada: 0,
        dsrComissao: 0,
        salMaisComissao: c.salario,
        horasPositivas: 0,
        valorHora: 0,
        horaExtra: 0,
        heMais75: 0,
        dsrHoraExtra: 0,
        horasNegativas: 0,
        saldoHoras: 0,
        valorSaldo: 0,
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
        comissaoEditadaManualmente: false,
        erro: err?.message ?? 'Erro desconhecido ao calcular esta linha.',
      };
    }
  });

  const colaboradores = linhas.filter((l): l is FolhaColaborador => l !== null).sort((a, b) => a.nome.localeCompare(b.nome));

  return { ano, mes, colaboradores, colaboradoresSemCpf, dias: diasMes };
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
  diasMes: ReturnType<typeof calcularDiasMes>,
  feriadosExtras: Set<string>
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
  // RH pode sobrescrever a comissão do mês (ex.: ajuste acordado fora do
  // comissionamento). O valor editado entra em tudo que deriva da comissão:
  // DSR de comissão, Sal+Comissão e valor da hora (logo, hora extra também).
  const comissaoCalculada = comissaoResultado.comissao;
  const comissao = manual?.comissaoOverride ?? comissaoCalculada;

  const dias = diasReferencia(ano, mes, diasMes, c.dataAdmissao, feriadosExtras);

  // Divisor da hora = jornada mensal contratada, não 200 fixo. Medido em
  // 01/09/2026: 124 pessoas em 200h, 7 aprendizes em 86h, 3 estagiários em
  // 80h e 2 em 100h. Com 200 chumbado, a hora de um aprendiz saía 2,3x
  // subavaliada — errando hora extra e desconto de falta. "Estagiário" tem
  // duas jornadas diferentes, então não dá pra deduzir por cargo: é o campo
  // do cadastro, pessoa a pessoa.
  const jornadaAusente = c.jornadaMensal == null;
  const jornadaMensal = c.jornadaMensal ?? JORNADA_MENSAL_PADRAO;

  const salMaisComissao = salarioAtualizado + comissao;
  const valorHora = salMaisComissao / jornadaMensal;
  const salarioPorHora = salarioAtualizado / jornadaMensal;

  // Horas: TUDO sai do SALDO do mês (positivas − negativas), nunca das horas
  // brutas. Regra única definida pelo RH em 05/10/2026 (caso Alana, setembro:
  // +00:25, −01:25, saldo −01:00; a Lari esperava desconto de 1h × 2.137 ÷ 200
  // = R$ 10,68 e nenhuma hora extra; o sistema cobrava a 1h25 inteira,
  // R$ 15,17, e ainda pagava os 25 min como HE +75%, R$ 11,27).
  //
  // - Saldo positivo: é hora extra. horaExtra = saldo × valorHora (com
  //   comissão), heMais75 = horaExtra × 1,75, DSR de HE sobre o heMais75.
  //   Desconto de hora zero.
  // - Saldo negativo: é desconto. descHorasFalta = |saldo| × salarioPorHora
  //   (sem comissão, sem adicional). Hora extra e DSR de HE zero.
  //
  // Antes (01/09 a 05/10) só o DSR de HE usava o saldo — decisão do RH no caso
  // Jackson ("muda só o DSR, o resto deixa como está"), que ficou registrada
  // aqui como inconsistente. Agora o resto acompanhou. As colunas Horas +,
  // Horas − e Saldo continuam mostrando o bruto do ponto, para conferência.
  const saldoHoras = horasPositivas - horasNegativas;
  const saldoPositivo = Math.max(0, saldoHoras);
  const saldoNegativo = Math.max(0, -saldoHoras);

  const horaExtra = saldoPositivo * valorHora;
  const heMais75 = horaExtra * 1.75;
  const descHorasFalta = saldoNegativo * salarioPorHora;

  // Quanto o saldo vale em dinheiro, com sinal: o que entra (HE +75%) ou o que
  // sai (desconto). Conferido contra caso real: Alana, +1,02h e −0,95h → saldo
  // 0,07h → 0,07 × 14,56 × 1,75 = R$ 1,78.
  // Arredonda antes de trocar o sinal: Math.round(−1068,5) dá −1068 e
  // Math.round(1068,5) dá 1069, então sem isso a Alana aparecia com Valor
  // Saldo −10,68 e Desc. Falta 10,69 para a mesma 1 hora.
  const valorSaldo = saldoHoras >= 0 ? centavos(heMais75) : -centavos(descHorasFalta);

  // Saldo negativo não gera DSR negativo — sem hora extra líquida não há
  // repouso a remunerar. Caso Jackson (01/09): 8,37h − 1,60h = 6,77h →
  // R$ 175,17 ÷ 26 × 5 = R$ 33,69.
  const dsrHoraExtra = dias.diasUteis > 0 ? (heMais75 / dias.diasUteis) * dias.diasDescanso : 0;
  const dsrComissao = dias.diasUteis > 0 ? (comissao / dias.diasUteis) * dias.diasDescanso : 0;

  // RH pode corrigir o nº de faltas detectado no Secullum (ex.: falta
  // justificada depois do fechamento) — o valor manual, quando existe, prevalece.
  const faltaQtd = manual?.faltaQtdOverride ?? horas.faltaQtd;
  // DSR perdido por falta: o valor de cada DSR é o salário-dia, e o divisor é
  // SEMPRE 30 — independente de o mês ter 28, 30 ou 31 dias. Definido pelo RH
  // em 03/09/2026 a partir do caso Andréia Cristina (1 falta, salário
  // R$ 2.195,32): 2.195,32 ÷ 30 = R$ 73,18, e não ÷ 26 = R$ 84,44.
  //
  // O ÷ diasUteis que existia aqui não vinha da planilha: as colunas FALTA e
  // DSR de `Folha Junho Atualizada - Dissídio.xlsx` são TEXTO digitado à mão
  // ("1 (dia 05)", "1 + 1 (mês 05)") — nunca houve fórmula calculando esse
  // valor lá. Era inferência da engenharia reversa. Já o DSR da hora extra tem
  // fórmula viva (`=R3/25*5`) e por isso continua com dias úteis × descanso.
  const dsrValor = faltaQtd * (salarioAtualizado / DIAS_SALARIO_MES);

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
    comissaoCalculada: Math.round(comissaoCalculada * 100) / 100,
    dsrComissao: Math.round(dsrComissao * 100) / 100,
    salMaisComissao: Math.round(salMaisComissao * 100) / 100,

    jornadaMensal,
    jornadaAusente,

    horasPositivas,
    valorHora: Math.round(valorHora * 100) / 100,
    horaExtra: Math.round(horaExtra * 100) / 100,
    heMais75: Math.round(heMais75 * 100) / 100,
    dsrHoraExtra: Math.round(dsrHoraExtra * 100) / 100,

    horasNegativas,
    saldoHoras: Math.round(saldoHoras * 100) / 100,
    valorSaldo: Math.round(valorSaldo * 100) / 100,
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
    comissaoEditadaManualmente: manual?.comissaoOverride != null,
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

  const [detalhe, diasExcecao, overrides, unimedMap, odontoMap, consignadoMap, manuaisMap, valeMap, comissoes, feriadosExtras] = await Promise.all([
    buscarSalario(colaborador.id),
    buscarDiasExcecaoDoMes(ano, mes),
    listarOverrides(),
    buscarUnimedDoMes(ano, mes),
    buscarOdontoDoMes(ano, mes),
    buscarConsignadoDoMes(ano, mes),
    buscarCamposManuaisDoMes(ano, mes),
    buscarValeDoMes(ano, mes),
    buscarComissoesDoMes([{ cpf: colaborador.cpf!, nome: colaborador.nome }], ano, mes),
    buscarFeriadosDoMes(ano, mes),
  ]);

  const diasMes = calcularDiasMes(ano, mes, feriadosExtras);
  return montarLinha(
    { ...colaborador, salario: detalhe.salario, jornadaMensal: detalhe.jornadaMensal },
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
    diasMes,
    feriadosExtras
  );
}
