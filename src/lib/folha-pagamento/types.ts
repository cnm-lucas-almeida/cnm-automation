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

  salarioBase: number; // Convenia, sem dissídio
  dissidioPercentual: number; // acumulado (5%/ano ÷ 12 × meses desde a admissão)
  overridePercentual: number; // extra de tabela de exceção (liderança), 0 se não houver
  salarioAtualizado: number; // salarioBase × (1 + dissidioPercentual + overridePercentual)

  comissao: number;
  dsrComissao: number;
  salMaisComissao: number;

  horasPositivas: number; // decimal, horas
  valorHora: number;
  horaExtra: number;
  heMais75: number;
  dsrHoraExtra: number;

  horasNegativas: number; // decimal, horas (atraso/saída antecipada — não inclui falta integral)
  salarioPorHora: number; // sem comissão
  descHorasFalta: number;

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
