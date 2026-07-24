import { getMetasPool } from '@/lib/db-metas';
import { listarColaboradores } from '@/lib/convenia';
import {
  segmentoFromDepartamento,
  buscarDadosAdmin,
  normalizarNome,
  GESTOR_NOME,
  type Segmento,
} from '@/lib/inside-sales';

export type HeadcountAtual = {
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  supervisoresImoveis: number;
  supervisoresVeiculos: number;
};

// Mesmo filtro do relatório /inside-sales (gestor + cargo "vendedor", sem desligados) — é a
// mesma equipe, então tem que ser exatamente a mesma fonte pra não divergir dos dois relatórios.
// É uma FOTO DE HOJE (Convenia não guarda histórico) — pra meses passados usar getHistoricoMensal.
export async function getHeadcountAtual(): Promise<HeadcountAtual> {
  const colaboradores = await listarColaboradores();
  const vendedores = colaboradores.filter(
    (c) => c.status !== 'Desligado' && c.gestorNome === GESTOR_NOME && c.cargo && /vendedor/i.test(c.cargo)
  );

  const { porCpf, porNome } = await buscarDadosAdmin(vendedores.map((v) => ({ cpf: v.cpf, nome: v.nome })));

  let vendedoresImoveis = 0;
  let vendedoresVeiculos = 0;
  const supervisoresPorSegmento: Record<Segmento, Set<string>> = { imoveis: new Set(), veiculos: new Set() };

  for (const v of vendedores) {
    const segmento = segmentoFromDepartamento(v.departamento);
    if (!segmento) continue;
    if (segmento === 'imoveis') vendedoresImoveis++;
    else vendedoresVeiculos++;

    const admin = (v.cpf && porCpf.get(v.cpf)) || porNome.get(normalizarNome(v.nome));
    if (admin?.supervisorNome) supervisoresPorSegmento[segmento].add(admin.supervisorNome);
  }

  return {
    vendedoresImoveis,
    vendedoresVeiculos,
    supervisoresImoveis: supervisoresPorSegmento.imoveis.size,
    supervisoresVeiculos: supervisoresPorSegmento.veiculos.size,
  };
}

// Headcount atual da empresa toda, por departamento (Convenia) — referência pro "quadro geral".
// Não entra na projeção de custo (não temos salário por setor), só mostra o tamanho de cada time
// hoje, pra deixar explícito o que fica fixo enquanto Vendedores/Supervisores Comerciais crescem.
export type SetorHeadcount = { departamento: string; headcount: number };

export async function getQuadroGeral(): Promise<SetorHeadcount[]> {
  const colaboradores = await listarColaboradores();
  const ativos = colaboradores.filter((c) => c.status !== 'Desligado');

  const porDepartamento = new Map<string, number>();
  for (const c of ativos) {
    const dep = c.departamento?.trim() || 'Sem departamento';
    porDepartamento.set(dep, (porDepartamento.get(dep) ?? 0) + 1);
  }

  return Array.from(porDepartamento.entries())
    .map(([departamento, headcount]) => ({ departamento, headcount }))
    .sort((a, b) => b.headcount - a.headcount);
}

// Referência de ativo imobilizado de TI (computadores/periféricos) — vem do próprio balancete já
// importado na DRE (dre_balancete_linha). É um valor contábil agregado (custo de aquisição menos
// depreciação acumulada), não um inventário por equipamento/pessoa.
export type AtivosTI = {
  competencia: string | null;
  custoAquisicao: number;
  depreciacaoAcumulada: number;
  valorLiquido: number;
};

export async function getAtivosTI(): Promise<AtivosTI> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT to_char(competencia, 'YYYY-MM-DD') AS competencia, classificacao, saldo_atual
     FROM dre_balancete_linha
     WHERE classificacao IN ('1.2.3.01.006', '1.2.3.05.006')
     ORDER BY competencia DESC
     LIMIT 2`
  );
  const custo = rows.find((r) => r.classificacao === '1.2.3.01.006');
  const deprec = rows.find((r) => r.classificacao === '1.2.3.05.006');
  const custoAquisicao = custo ? Number(custo.saldo_atual) : 0;
  const depreciacaoAcumulada = deprec ? Number(deprec.saldo_atual) : 0;
  return {
    competencia: custo?.competencia ?? null,
    custoAquisicao,
    depreciacaoAcumulada,
    valorLiquido: custoAquisicao + depreciacaoAcumulada,
  };
}

export type HistoricoMensal = {
  competencia: string; // 'YYYY-MM-DD'
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  backOfficeImoveis: number;
  backOfficeVeiculos: number;
  admitidos: number | null;
  desligamentos: number | null;
  observacao: string | null;
};

export async function getHistoricoMensal(competenciaInicio: string, competenciaFim: string): Promise<HistoricoMensal[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `SELECT to_char(competencia, 'YYYY-MM-DD') AS competencia, vendedores_imoveis, vendedores_veiculos,
            back_office_imoveis, back_office_veiculos, admitidos, desligamentos, observacao
     FROM quadro_comercial_historico_mensal
     WHERE competencia BETWEEN $1 AND $2
     ORDER BY competencia`,
    [competenciaInicio, competenciaFim]
  );
  return rows.map((r) => ({
    competencia: r.competencia,
    vendedoresImoveis: Number(r.vendedores_imoveis),
    vendedoresVeiculos: Number(r.vendedores_veiculos),
    backOfficeImoveis: Number(r.back_office_imoveis),
    backOfficeVeiculos: Number(r.back_office_veiculos),
    admitidos: r.admitidos != null ? Number(r.admitidos) : null,
    desligamentos: r.desligamentos != null ? Number(r.desligamentos) : null,
    observacao: r.observacao,
  }));
}

export async function salvarHistoricoMensal(input: {
  competencia: string;
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  backOfficeImoveis: number;
  backOfficeVeiculos: number;
  admitidos?: number | null;
  desligamentos?: number | null;
  observacao?: string | null;
}): Promise<HistoricoMensal> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO quadro_comercial_historico_mensal
       (competencia, vendedores_imoveis, vendedores_veiculos, back_office_imoveis, back_office_veiculos, admitidos, desligamentos, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (competencia) DO UPDATE SET
       vendedores_imoveis = EXCLUDED.vendedores_imoveis,
       vendedores_veiculos = EXCLUDED.vendedores_veiculos,
       back_office_imoveis = EXCLUDED.back_office_imoveis,
       back_office_veiculos = EXCLUDED.back_office_veiculos,
       admitidos = EXCLUDED.admitidos,
       desligamentos = EXCLUDED.desligamentos,
       observacao = EXCLUDED.observacao,
       updated_at = now()
     RETURNING to_char(competencia, 'YYYY-MM-DD') AS competencia, vendedores_imoveis, vendedores_veiculos,
               back_office_imoveis, back_office_veiculos, admitidos, desligamentos, observacao`,
    [
      input.competencia, input.vendedoresImoveis, input.vendedoresVeiculos,
      input.backOfficeImoveis, input.backOfficeVeiculos,
      input.admitidos ?? null, input.desligamentos ?? null, input.observacao ?? null,
    ]
  );
  const r = rows[0];
  return {
    competencia: r.competencia,
    vendedoresImoveis: Number(r.vendedores_imoveis),
    vendedoresVeiculos: Number(r.vendedores_veiculos),
    backOfficeImoveis: Number(r.back_office_imoveis),
    backOfficeVeiculos: Number(r.back_office_veiculos),
    admitidos: r.admitidos != null ? Number(r.admitidos) : null,
    desligamentos: r.desligamentos != null ? Number(r.desligamentos) : null,
    observacao: r.observacao,
  };
}

export type PremissasQuadro = {
  ano: number;
  headcountMetaImoveis: number;
  headcountMetaVeiculos: number;
  vendedoresPorSupervisorImoveis: number;
  vendedoresPorSupervisorVeiculos: number;
  turnoverMensalPct: number;
  custoMedioVendedor: number;
  custoMedioSupervisor: number;
};

// Defaults alinhados com docs/Projeção 12 meses - Vendedor Interno.pdf: meta ~120/25 (mantendo a
// proporção atual 52/11 aplicada a uma capacidade de 145) e turnover 14,1% ao mês.
const PREMISSAS_PADRAO: Omit<PremissasQuadro, 'ano'> = {
  headcountMetaImoveis: 120,
  headcountMetaVeiculos: 25,
  vendedoresPorSupervisorImoveis: 25,
  vendedoresPorSupervisorVeiculos: 20,
  turnoverMensalPct: 0.141,
  custoMedioVendedor: 0,
  custoMedioSupervisor: 0,
};

export async function getPremissasQuadro(ano: number): Promise<PremissasQuadro> {
  const pool = getMetasPool();
  const { rows } = await pool.query(`SELECT * FROM quadro_comercial_premissa WHERE ano = $1`, [ano]);
  if (!rows[0]) return { ano, ...PREMISSAS_PADRAO };
  const r = rows[0];
  return {
    ano,
    headcountMetaImoveis: Number(r.headcount_meta_imoveis),
    headcountMetaVeiculos: Number(r.headcount_meta_veiculos),
    vendedoresPorSupervisorImoveis: Number(r.vendedores_por_supervisor_imoveis),
    vendedoresPorSupervisorVeiculos: Number(r.vendedores_por_supervisor_veiculos),
    turnoverMensalPct: Number(r.turnover_mensal_pct),
    custoMedioVendedor: Number(r.custo_medio_vendedor),
    custoMedioSupervisor: Number(r.custo_medio_supervisor),
  };
}

export async function salvarPremissasQuadro(input: PremissasQuadro): Promise<PremissasQuadro> {
  const pool = getMetasPool();
  await pool.query(
    `INSERT INTO quadro_comercial_premissa
       (ano, headcount_meta_imoveis, headcount_meta_veiculos, vendedores_por_supervisor_imoveis,
        vendedores_por_supervisor_veiculos, turnover_mensal_pct, custo_medio_vendedor, custo_medio_supervisor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (ano) DO UPDATE SET
       headcount_meta_imoveis = EXCLUDED.headcount_meta_imoveis,
       headcount_meta_veiculos = EXCLUDED.headcount_meta_veiculos,
       vendedores_por_supervisor_imoveis = EXCLUDED.vendedores_por_supervisor_imoveis,
       vendedores_por_supervisor_veiculos = EXCLUDED.vendedores_por_supervisor_veiculos,
       turnover_mensal_pct = EXCLUDED.turnover_mensal_pct,
       custo_medio_vendedor = EXCLUDED.custo_medio_vendedor,
       custo_medio_supervisor = EXCLUDED.custo_medio_supervisor,
       updated_at = now()`,
    [
      input.ano, input.headcountMetaImoveis, input.headcountMetaVeiculos,
      input.vendedoresPorSupervisorImoveis, input.vendedoresPorSupervisorVeiculos,
      input.turnoverMensalPct, input.custoMedioVendedor, input.custoMedioSupervisor,
    ]
  );
  return input;
}

export type MesQuadro = {
  competencia: string; // 'YYYY-MM'
  tipo: 'real' | 'atual' | 'projetado';
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  backOfficeImoveis: number | null;
  backOfficeVeiculos: number | null;
  supervisoresImoveis: number | null;
  supervisoresVeiculos: number | null;
  admitidos: number | null;
  desligamentos: number | null;
  contratacoesNecessarias: number | null;
  custoTotal: number | null;
};

export type ProjecaoQuadro = {
  headcountAtual: HeadcountAtual;
  premissas: PremissasQuadro;
  meses: MesQuadro[];
};

// Monta o calendário Jan-Dez do ano pedido: meses já passados usam o histórico real (digitado a
// partir do relatório de RH — ver quadro_comercial_historico_mensal), o mês corrente usa o
// headcount AO VIVO (Convenia), e os meses futuros são projetados com crescimento linear rumo à
// meta configurada + turnover sobre o headcount de cada mês (por isso o volume de contratações
// tende a subir mês a mês conforme o quadro cresce, igual a "observação importante" do PDF
// original previu). Back Office fica fixo no último valor real conhecido — o plano da área
// Comercial é não ampliar esse time.
export async function getProjecaoQuadro(ano: number): Promise<ProjecaoQuadro> {
  const headcountAtual = await getHeadcountAtual();
  const premissas = await getPremissasQuadro(ano);
  const historico = await getHistoricoMensal(`${ano}-01-01`, `${ano}-12-01`);
  const historicoPorMes = new Map(historico.map((h) => [h.competencia.slice(0, 7), h]));

  const hoje = new Date();
  const mesAtualIndex = hoje.getFullYear() === ano ? hoje.getMonth() + 1 : (ano < hoje.getFullYear() ? 13 : 0);

  const ultimoHistorico = historico[historico.length - 1];
  const backOfficeImoveisFixo = ultimoHistorico?.backOfficeImoveis ?? 0;
  const backOfficeVeiculosFixo = ultimoHistorico?.backOfficeVeiculos ?? 0;

  const mesesRestantes = Math.max(0, 12 - mesAtualIndex);
  const crescimentoMensalImoveis = mesesRestantes > 0
    ? (premissas.headcountMetaImoveis - headcountAtual.vendedoresImoveis) / mesesRestantes : 0;
  const crescimentoMensalVeiculos = mesesRestantes > 0
    ? (premissas.headcountMetaVeiculos - headcountAtual.vendedoresVeiculos) / mesesRestantes : 0;

  let imoveis = headcountAtual.vendedoresImoveis;
  let veiculos = headcountAtual.vendedoresVeiculos;
  const meses: MesQuadro[] = [];

  for (let mes = 1; mes <= 12; mes++) {
    const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

    if (mes < mesAtualIndex) {
      const h = historicoPorMes.get(competencia);
      meses.push({
        competencia,
        tipo: 'real',
        vendedoresImoveis: h?.vendedoresImoveis ?? 0,
        vendedoresVeiculos: h?.vendedoresVeiculos ?? 0,
        backOfficeImoveis: h?.backOfficeImoveis ?? null,
        backOfficeVeiculos: h?.backOfficeVeiculos ?? null,
        supervisoresImoveis: null,
        supervisoresVeiculos: null,
        admitidos: h?.admitidos ?? null,
        desligamentos: h?.desligamentos ?? null,
        contratacoesNecessarias: null,
        custoTotal: null,
      });
      continue;
    }

    const ehMesAtual = mes === mesAtualIndex;
    if (!ehMesAtual) {
      const turnoverImoveis = imoveis * premissas.turnoverMensalPct;
      const turnoverVeiculos = veiculos * premissas.turnoverMensalPct;
      const contratacoesImoveis = Math.max(0, turnoverImoveis + crescimentoMensalImoveis);
      const contratacoesVeiculos = Math.max(0, turnoverVeiculos + crescimentoMensalVeiculos);
      imoveis = Math.max(0, imoveis + crescimentoMensalImoveis);
      veiculos = Math.max(0, veiculos + crescimentoMensalVeiculos);

      const supervisoresImoveis = premissas.vendedoresPorSupervisorImoveis > 0
        ? Math.ceil(imoveis / premissas.vendedoresPorSupervisorImoveis) : 0;
      const supervisoresVeiculos = premissas.vendedoresPorSupervisorVeiculos > 0
        ? Math.ceil(veiculos / premissas.vendedoresPorSupervisorVeiculos) : 0;
      const custoTotal =
        (imoveis + veiculos) * premissas.custoMedioVendedor +
        (supervisoresImoveis + supervisoresVeiculos) * premissas.custoMedioSupervisor;

      meses.push({
        competencia,
        tipo: 'projetado',
        vendedoresImoveis: imoveis,
        vendedoresVeiculos: veiculos,
        backOfficeImoveis: backOfficeImoveisFixo,
        backOfficeVeiculos: backOfficeVeiculosFixo,
        supervisoresImoveis,
        supervisoresVeiculos,
        admitidos: null,
        desligamentos: null,
        contratacoesNecessarias: contratacoesImoveis + contratacoesVeiculos,
        custoTotal,
      });
    } else {
      const supervisoresImoveis = premissas.vendedoresPorSupervisorImoveis > 0
        ? Math.ceil(imoveis / premissas.vendedoresPorSupervisorImoveis) : 0;
      const supervisoresVeiculos = premissas.vendedoresPorSupervisorVeiculos > 0
        ? Math.ceil(veiculos / premissas.vendedoresPorSupervisorVeiculos) : 0;
      const custoTotal =
        (imoveis + veiculos) * premissas.custoMedioVendedor +
        (supervisoresImoveis + supervisoresVeiculos) * premissas.custoMedioSupervisor;

      meses.push({
        competencia,
        tipo: 'atual',
        vendedoresImoveis: imoveis,
        vendedoresVeiculos: veiculos,
        backOfficeImoveis: backOfficeImoveisFixo,
        backOfficeVeiculos: backOfficeVeiculosFixo,
        supervisoresImoveis,
        supervisoresVeiculos,
        admitidos: null,
        desligamentos: null,
        contratacoesNecessarias: null,
        custoTotal,
      });
    }
  }

  return { headcountAtual, premissas, meses };
}
