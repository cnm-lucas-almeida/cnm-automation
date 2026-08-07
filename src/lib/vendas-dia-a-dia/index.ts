import { getDbConnection } from '@/lib/db';
import { listarColaboradores } from '@/lib/convenia';
import { buscarDadosAdmin, normalizarNome, GESTOR_NOME, segmentoFromDepartamento, type Segmento } from '@/lib/inside-sales';

const CACHE_TTL = 15 * 60 * 1000;

export type DiaVendas = { data: string; total: number; ativas: number };

export type VendasDiaADiaRow = {
  nome: string;
  segmento: Segmento | null;
  squad: string | null;
  supervisor: string | null;
  porDia: DiaVendas[];
  totalMes: number;
  totalAtivas: number;
  diasZerados: number;
  congelados: number;
  cancelados: number;
};

export type SemanaColunas = { dias: string[] };

export type VendasDiaADiaData = {
  generatedAt: string;
  competencia: string; // YYYY-MM
  diasUteis: string[];
  semanas: SemanaColunas[];
  linhas: VendasDiaADiaRow[];
  squads: string[];
  supervisores: string[];
};

function ultimoDiaMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function diasUteisDoMes(ano: number, mes: number): string[] {
  const ultimoDia = ultimoDiaMes(ano, mes);
  const dias: string[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const date = new Date(Date.UTC(ano, mes - 1, d));
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) dias.push(date.toISOString().slice(0, 10));
  }
  return dias;
}

// Blocos Seg-Sex, exatamente como as "TOTAL DA SEMANA N" da planilha original.
function agruparPorSemana(dias: string[]): SemanaColunas[] {
  const semanas: SemanaColunas[] = [];
  let atual: string[] = [];
  for (const dia of dias) {
    const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
    if (dow === 1 && atual.length > 0) {
      semanas.push({ dias: atual });
      atual = [];
    }
    atual.push(dia);
  }
  if (atual.length > 0) semanas.push({ dias: atual });
  return semanas;
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function limparSquad(squad: string | null): string | null {
  if (!squad) return squad;
  return squad.replace(/^(IMOV|VEIC)\s*-\s*SQUAD\s*/i, '').trim();
}

type LinhaBanco = { id_vendedor: number; dia: string; total: number; ativas: number; cancelados: number; congelados: number };

async function buscarVendasPorDia(idVendedores: number[], competenciaInicio: string, competenciaFim: string): Promise<Map<number, Map<string, LinhaBanco>>> {
  const map = new Map<number, Map<string, LinhaBanco>>();
  if (idVendedores.length === 0) return map;

  const connection = await getDbConnection();
  try {
    const placeholders = idVendedores.map(() => '?').join(',');
    const [rows] = await connection.query(
      `
      SELECT
        fc.id_vendedor,
        DATE_FORMAT(fc.data_contrato, '%Y-%m-%d') AS dia,
        COUNT(*) AS total,
        SUM(CASE WHEN fc.cancelado = 0 AND c.congelado = 0 THEN 1 ELSE 0 END) AS ativas,
        SUM(CASE WHEN fc.cancelado = 1 THEN 1 ELSE 0 END) AS cancelados,
        SUM(CASE WHEN fc.cancelado = 0 AND c.congelado = 1 THEN 1 ELSE 0 END) AS congelados
      FROM tb_financeiro_contrato fc
      INNER JOIN tb_cliente c ON c.id = fc.id_cliente
      WHERE fc.id_vendedor IN (${placeholders})
        AND fc.deleted = 0
        AND c.deleted = 0
        AND fc.valor_mensalidade_original > 0.01
        AND fc.data_contrato BETWEEN ? AND ?
      GROUP BY fc.id_vendedor, dia
      `,
      [...idVendedores, competenciaInicio, competenciaFim]
    );

    for (const r of rows as any[]) {
      const idVendedor = Number(r.id_vendedor);
      const porDia = map.get(idVendedor) ?? new Map<string, LinhaBanco>();
      porDia.set(r.dia, {
        id_vendedor: idVendedor,
        dia: r.dia,
        total: Number(r.total),
        ativas: Number(r.ativas),
        cancelados: Number(r.cancelados),
        congelados: Number(r.congelados),
      });
      map.set(idVendedor, porDia);
    }
    return map;
  } finally {
    await connection.end();
  }
}

let cache: { data: VendasDiaADiaData; key: string; ts: number } | null = null;

export async function getVendasDiaADiaData(competencia: string, forceRefresh = false): Promise<VendasDiaADiaData> {
  const now = Date.now();
  if (!forceRefresh && cache && cache.key === competencia && now - cache.ts < CACHE_TTL) return cache.data;

  const [ano, mes] = competencia.split('-').map(Number);
  const diasUteis = diasUteisDoMes(ano, mes);
  const semanas = agruparPorSemana(diasUteis);
  const competenciaInicio = `${competencia}-01`;
  const competenciaFim = `${competencia}-${String(ultimoDiaMes(ano, mes)).padStart(2, '0')}`;
  const hoje = hojeIso();

  const colaboradores = await listarColaboradores(forceRefresh);
  // Mesma população do relatório IS 30/60/90 — mesmo time (gestor Jackson, cargo Vendedor).
  const elegiveis = colaboradores.filter(
    (c) =>
      c.status !== 'Desligado' &&
      c.gestorNome === GESTOR_NOME &&
      c.cargo &&
      /vendedor/i.test(c.cargo) &&
      segmentoFromDepartamento(c.departamento) != null
  );

  const { porCpf, porNome } = await buscarDadosAdmin(elegiveis.map((c) => ({ cpf: c.cpf, nome: c.nome })));
  const admins = elegiveis.map((c) => (c.cpf && porCpf.get(c.cpf)) || porNome.get(normalizarNome(c.nome)) || null);
  const idVendedores = admins.filter((a): a is NonNullable<typeof a> => a != null).map((a) => a.idVendedor);

  const vendasPorVendedor = await buscarVendasPorDia(idVendedores, competenciaInicio, competenciaFim);

  const linhas: VendasDiaADiaRow[] = [];
  elegiveis.forEach((c, i) => {
    const admin = admins[i];
    if (!admin?.supervisorNome) return;

    const porVendedor = vendasPorVendedor.get(admin.idVendedor) ?? new Map<string, LinhaBanco>();
    let totalMes = 0;
    let totalAtivas = 0;
    let cancelados = 0;
    let congelados = 0;
    let diasZerados = 0;

    const porDia: DiaVendas[] = diasUteis.map((dia) => {
      const registro = porVendedor.get(dia);
      const total = registro?.total ?? 0;
      const ativas = registro?.ativas ?? 0;
      totalMes += total;
      totalAtivas += ativas;
      cancelados += registro?.cancelados ?? 0;
      congelados += registro?.congelados ?? 0;
      if (dia <= hoje && total === 0) diasZerados++;
      return { data: dia, total, ativas };
    });

    linhas.push({
      nome: c.nome,
      segmento: segmentoFromDepartamento(c.departamento),
      squad: limparSquad(admin.squadNome),
      supervisor: admin.supervisorNome,
      porDia,
      totalMes,
      totalAtivas,
      diasZerados,
      congelados,
      cancelados,
    });
  });

  linhas.sort((a, b) => a.nome.localeCompare(b.nome));

  const squads = Array.from(new Set(linhas.map((l) => l.squad).filter((s): s is string => Boolean(s)))).sort();
  const supervisores = Array.from(new Set(linhas.map((l) => l.supervisor).filter((s): s is string => Boolean(s)))).sort();

  const data: VendasDiaADiaData = {
    generatedAt: new Date().toISOString(),
    competencia,
    diasUteis,
    semanas,
    linhas,
    squads,
    supervisores,
  };

  cache = { data, key: competencia, ts: now };
  return data;
}
