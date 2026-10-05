import type { ProgressoConvenia } from '@/lib/convenia';

// Linha consolidada da folha — uma por colaborador/competência. Nomes seguem a
// planilha manual atual (docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md) pra facilitar
// a comparação lado a lado durante a validação com o RH.
export interface FolhaColaborador {
  cpf: string;
  nome: string;
  admissao: string | null; // ISO date
  cargo: string | null;
  dpto: string | null;

  salarioBase: number; // Convenia — já inclui o reajuste da convenção (consolidado pelo RH em 2026-08)
  overridePercentual: number; // extra de tabela de exceção (liderança), 0 se não houver
  salarioAtualizado: number; // salarioBase × (1 + overridePercentual)

  comissao: number; // valor em vigor: o editado pelo RH, se houver, senão o calculado
  comissaoCalculada: number; // o que o comissionamento calculou, pra referência quando o RH editou
  dsrComissao: number;
  salMaisComissao: number;

  jornadaMensal: number; // horas/mês contratadas no Convenia — é o divisor de valorHora e salarioPorHora
  jornadaAusente: boolean; // cadastro sem work_period no Convenia: caiu no fallback de 200h, conferir

  horasPositivas: number; // decimal, horas (bruto do ponto, só conferência)
  valorHora: number;
  horaExtra: number; // saldo positivo × valorHora (zero se o saldo do mês for negativo)
  heMais75: number; // horaExtra × 1,75 — é o que entra na folha
  dsrHoraExtra: number; // heMais75 ÷ dias úteis × dias de descanso

  horasNegativas: number;
  saldoHoras: number; // horasPositivas − horasNegativas
  valorSaldo: number; // com sinal: saldo ≥ 0 → heMais75; saldo < 0 → −descHorasFalta
  salarioPorHora: number; // sem comissão
  descHorasFalta: number; // |saldo negativo| × salarioPorHora (zero se o saldo do mês for positivo)

  faltaQtd: number; // nº de faltas integrais não justificadas no mês
  faltaDatas: string[]; // ISO dates
  dsrPerdidosQtd: number; // 1 por falta integral
  dsrValor: number; // faltaQtd × (salarioAtualizado ÷ 25)

  descontoUnimed: number;
  descontoOdonto: number;
  consignado: number;

  observacoes: string | null; // manual
  sitepd: string | null; // manual
  valeAlimentacao: number | null; // sem fonte automatizada ainda
  valeTransporte: number | null; // sem fonte automatizada ainda

  // Pendências de cruzamento — usado pra sinalizar linhas que precisam de
  // conferência manual antes do fechamento (ver KPI "Pendências" na tela).
  secullumEncontrado: boolean;
  comissaoMatchPorNome: boolean; // tb_vendedor.documento vazio — cruzado por nome, não por CPF
  horasEditadasManualmente: boolean; // Horas +/- foram sobrescritas pelo RH, não vêm do Secullum
  comissaoEditadaManualmente: boolean; // Comissão foi sobrescrita pelo RH, não vem do comissionamento
  erro: string | null;
}

export interface OverrideSalario {
  id: number;
  cpf: string;
  nome: string;
  percentual: number; // ex.: 0.40 = +40%
  motivo: string;
  vigenciaInicio: string; // ISO date
  vigenciaFim: string | null;
}

export interface DiaExcecao {
  id: number;
  data: string; // ISO date
  motivo: string;
}

// Feriado cadastrado pelo RH além dos nacionais (municipal, ponte). Conta como
// dia de descanso no DSR — ver calendario.ts.
export interface Feriado {
  id: number;
  data: string; // ISO date
  descricao: string;
}

export interface UnimedEvento {
  competencia: string; // "YYYY-MM"
  nomeBeneficiario: string;
  valorEventos: number;
}

export interface OdontoCertificado {
  competencia: string;
  certificado: string;
  cpfTitular: string | null;
  nomeTitular: string;
  dependentesQtd: number;
  valorUnitario: number;
}

export interface ConsignadoRegistro {
  competencia: string;
  cpf: string;
  nome: string | null;
  valorTotal: number;
  contratosQtd: number;
}

export interface FolhaPagamentoResultado {
  ano: number;
  mes: number;
  colaboradores: FolhaColaborador[];
  colaboradoresSemCpf: number; // não dá pra cruzar Secullum/comissão/Odonto/Consignado sem CPF
  // Divisor e multiplicador do DSR do mês cheio (÷ diasUteis × diasDescanso),
  // já com os feriados cadastrados — mostrado na tela pra conferência do RH.
  dias: { totalDias: number; diasUteis: number; diasDescanso: number; feriados: string[] };
}

// Segunda fase do fechamento (Secullum + fórmulas por colaborador) — bem mais
// rápida que a busca de salário no Convenia, mas ainda assim leva alguns
// segundos com ~150 pessoas. Exposta pra tela mostrar progresso de verdade.
export interface ProgressoCalculo {
  total: number;
  atual: number;
}

// Shape exato do GET /api/folha-pagamento/progresso — as duas fases do
// fechamento (busca de salário no Convenia + cálculo por colaborador).
export interface ProgressoFechamento {
  convenia: ProgressoConvenia;
  calculo: ProgressoCalculo;
}
