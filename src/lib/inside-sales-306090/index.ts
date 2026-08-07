import { getDbConnection } from '@/lib/db';
import { listarColaboradores } from '@/lib/convenia';
import { buscarDadosAdmin, normalizarNome, GESTOR_NOME, segmentoFromDepartamento, type Segmento } from '@/lib/inside-sales';

const CACHE_TTL = 15 * 60 * 1000;
const CYCLE_DURATION_DAYS = 30;

const CYCLE_GOALS = {
  1: { vendas: 10, financeiro: 3000 },
  2: { vendas: 15, financeiro: 4500 },
  3: { vendas: 20, financeiro: 6000 },
} as const;

const META_PV_90_DIAS = 45;
const META_FINANCEIRO_90_DIAS = 13500;

export type CicloStatus = 'ciclo1' | 'ciclo2' | 'ciclo3' | 'validado';

export type CicloPerformance = {
  vendas: number;
  metaVendas: number;
  metaPercentual: number;
  financeiro: number;
  metaFinanceiro: number;
  inicio: string;
  fim: string;
};

export type InsideSales306090Row = {
  nome: string;
  segmento: Segmento | null;
  cargo: string | null;
  squad: string | null;
  supervisor: string | null;
  dataAdmissao: string;
  cicloAtual: CicloStatus;
  diasRestantesCiclo: number;
  validadoEm: string | null;
  validacaoRh45: string | null;
  diasFaltantesValidacao45: number | null;
  validacaoRh90: string | null;
  diasFaltantesValidacao90: number | null;
  ciclo1: CicloPerformance;
  ciclo2: CicloPerformance;
  ciclo3: CicloPerformance;
  pvTotal90Dias: number;
  valorTotal90Dias: number;
  metaGeralPvPercentual: number;
  metaGeralFinanceiroPercentual: number;
  mediaPvPeriodo: number;
  mediaValorPeriodo: number;
  roiPeriodo: number;
};

export type InsideSales306090Data = {
  generatedAt: string;
  linhas: InsideSales306090Row[];
  squads: string[];
  supervisores: string[];
  stats: { total: number; ciclo1: number; ciclo2: number; ciclo3: number; validado: number };
};

function addDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(deIso: string, ateIso: string): number {
  const de = new Date(`${deIso}T00:00:00Z`).getTime();
  const ate = new Date(`${ateIso}T00:00:00Z`).getTime();
  return Math.round((ate - de) / (1000 * 60 * 60 * 24));
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Squads no admin vêm com prefixo "IMOV - SQUAD "/"VEIC - SQUAD " — removido só na exibição.
function limparSquad(squad: string | null): string | null {
  if (!squad) return squad;
  return squad.replace(/^(IMOV|VEIC)\s*-\s*SQUAD\s*/i, '').trim();
}

type VendaRow = { data_contrato: string; valor: number };

// Mesmos filtros da tela "Indicadores Comerciais" do admin (relatorio_indicadores_comerciais):
// não cancelado, cliente não congelado, valor > 0.01. Reflete o status ATUAL do contrato — para
// quem já validou há tempo, contratos cancelados depois da validação não entram mais na contagem
// (diverge do valor congelado historicamente na planilha manual, o que é esperado).
async function buscarVendasPorVendedor(idVendedores: number[], dataMinima: string): Promise<Map<number, VendaRow[]>> {
  const map = new Map<number, VendaRow[]>();
  if (idVendedores.length === 0) return map;

  const connection = await getDbConnection();
  try {
    const placeholders = idVendedores.map(() => '?').join(',');
    const [rows] = await connection.query(
      `
      SELECT fc.id_vendedor, DATE_FORMAT(fc.data_contrato, '%Y-%m-%d') AS data_contrato, fc.valor_mensalidade_original AS valor
      FROM tb_financeiro_contrato fc
      INNER JOIN tb_cliente c ON c.id = fc.id_cliente
      WHERE fc.id_vendedor IN (${placeholders})
        AND fc.deleted = 0
        AND fc.cancelado = 0
        AND c.deleted = 0
        AND c.congelado = 0
        AND fc.valor_mensalidade_original > 0.01
        AND fc.data_contrato >= ?
      `,
      [...idVendedores, dataMinima]
    );

    for (const r of rows as any[]) {
      const idVendedor = Number(r.id_vendedor);
      const entry = map.get(idVendedor) ?? [];
      entry.push({ data_contrato: String(r.data_contrato).slice(0, 10), valor: Number(r.valor) });
      map.set(idVendedor, entry);
    }
    return map;
  } finally {
    await connection.end();
  }
}

function calcularCiclo(vendas: VendaRow[], inicio: string, fim: string, cicloNumero: 1 | 2 | 3): CicloPerformance {
  const meta = CYCLE_GOALS[cicloNumero];
  const doCiclo = vendas.filter((v) => v.data_contrato >= inicio && v.data_contrato <= fim);
  const qtd = doCiclo.length;
  const financeiro = doCiclo.reduce((s, v) => s + v.valor, 0);
  return {
    vendas: qtd,
    metaVendas: meta.vendas,
    metaPercentual: (qtd / meta.vendas) * 100,
    financeiro,
    metaFinanceiro: meta.financeiro,
    inicio,
    fim,
  };
}

let cache: { data: InsideSales306090Data; ts: number } | null = null;

export async function getInsideSales306090Data(forceRefresh = false): Promise<InsideSales306090Data> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL) return cache.data;

  const colaboradores = await listarColaboradores(forceRefresh);
  const elegiveis = colaboradores.filter(
    (c) =>
      c.status !== 'Desligado' &&
      c.gestorNome === GESTOR_NOME &&
      c.cargo &&
      /vendedor/i.test(c.cargo) &&
      segmentoFromDepartamento(c.departamento) != null &&
      c.dataAdmissao
  );

  const { porCpf, porNome } = await buscarDadosAdmin(elegiveis.map((c) => ({ cpf: c.cpf, nome: c.nome })));
  const admins = elegiveis.map((c) => (c.cpf && porCpf.get(c.cpf)) || porNome.get(normalizarNome(c.nome)) || null);
  const idVendedores = admins.filter((a): a is NonNullable<typeof a> => a != null).map((a) => a.idVendedor);

  const dataMinima = elegiveis.reduce(
    (min, c) => (c.dataAdmissao! < min ? c.dataAdmissao! : min),
    elegiveis[0]?.dataAdmissao ?? hojeIso()
  );
  const vendasPorVendedor = await buscarVendasPorVendedor(idVendedores, dataMinima);

  const hoje = hojeIso();
  const linhas: InsideSales306090Row[] = [];

  elegiveis.forEach((c, i) => {
    const admin = admins[i];
    // Sem supervisor vinculado no admin = fora do quadro comercial ativo (mesmo critério do admin PHP).
    if (!admin?.supervisorNome) return;

    const dataAdmissao = c.dataAdmissao!;
    const fimCiclo1 = addDias(dataAdmissao, CYCLE_DURATION_DAYS - 1);
    const fimCiclo2 = addDias(dataAdmissao, CYCLE_DURATION_DAYS * 2 - 1);
    const fimCiclo3 = addDias(dataAdmissao, CYCLE_DURATION_DAYS * 3 - 1);
    const inicioCiclo2 = addDias(fimCiclo1, 1);
    const inicioCiclo3 = addDias(fimCiclo2, 1);

    let cicloAtual: CicloStatus;
    let diasRestantesCiclo: number;
    if (hoje <= fimCiclo1) {
      cicloAtual = 'ciclo1';
      diasRestantesCiclo = diasEntre(hoje, fimCiclo1);
    } else if (hoje <= fimCiclo2) {
      cicloAtual = 'ciclo2';
      diasRestantesCiclo = diasEntre(hoje, fimCiclo2);
    } else if (hoje <= fimCiclo3) {
      cicloAtual = 'ciclo3';
      diasRestantesCiclo = diasEntre(hoje, fimCiclo3);
    } else {
      cicloAtual = 'validado';
      diasRestantesCiclo = 0;
    }

    const vendas = vendasPorVendedor.get(admin.idVendedor) ?? [];
    const ciclo1 = calcularCiclo(vendas, dataAdmissao, fimCiclo1, 1);
    const ciclo2 = calcularCiclo(vendas, inicioCiclo2, fimCiclo2, 2);
    const ciclo3 = calcularCiclo(vendas, inicioCiclo3, fimCiclo3, 3);

    const pvTotal90Dias = ciclo1.vendas + ciclo2.vendas + ciclo3.vendas;
    const valorTotal90Dias = ciclo1.financeiro + ciclo2.financeiro + ciclo3.financeiro;
    const mediaPvPeriodo = pvTotal90Dias / 3;
    const mediaValorPeriodo = valorTotal90Dias / 3;

    const validacaoRh45 = c.experiencePeriod?.firstEnd ?? null;
    const validacaoRh90 = c.experiencePeriod?.secondEnd ?? null;

    linhas.push({
      nome: c.nome,
      segmento: segmentoFromDepartamento(c.departamento),
      cargo: c.cargo,
      squad: limparSquad(admin.squadNome),
      supervisor: admin.supervisorNome,
      dataAdmissao,
      cicloAtual,
      diasRestantesCiclo,
      validadoEm: cicloAtual === 'validado' ? fimCiclo3 : null,
      validacaoRh45,
      diasFaltantesValidacao45: validacaoRh45 ? diasEntre(hoje, validacaoRh45) : null,
      validacaoRh90,
      diasFaltantesValidacao90: validacaoRh90 ? diasEntre(hoje, validacaoRh90) : null,
      ciclo1,
      ciclo2,
      ciclo3,
      pvTotal90Dias,
      valorTotal90Dias,
      metaGeralPvPercentual: (pvTotal90Dias / META_PV_90_DIAS) * 100,
      metaGeralFinanceiroPercentual: (valorTotal90Dias / META_FINANCEIRO_90_DIAS) * 100,
      mediaPvPeriodo,
      mediaValorPeriodo,
      roiPeriodo: (mediaValorPeriodo / CYCLE_GOALS[1].financeiro - 1) * 100,
    });
  });

  linhas.sort((a, b) => a.nome.localeCompare(b.nome));

  const stats = {
    total: linhas.length,
    ciclo1: linhas.filter((l) => l.cicloAtual === 'ciclo1').length,
    ciclo2: linhas.filter((l) => l.cicloAtual === 'ciclo2').length,
    ciclo3: linhas.filter((l) => l.cicloAtual === 'ciclo3').length,
    validado: linhas.filter((l) => l.cicloAtual === 'validado').length,
  };

  const squads = Array.from(new Set(linhas.map((l) => l.squad).filter((s): s is string => Boolean(s)))).sort();
  const supervisores = Array.from(new Set(linhas.map((l) => l.supervisor).filter((s): s is string => Boolean(s)))).sort();

  const data: InsideSales306090Data = {
    generatedAt: new Date().toISOString(),
    linhas,
    squads,
    supervisores,
    stats,
  };

  cache = { data, ts: now };
  return data;
}
