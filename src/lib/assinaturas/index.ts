import { getDbConnection } from '@/lib/db';

const BASE_URL = 'https://www.chavesnamao.com.br';

export type Segmento = 'VEHICLE' | 'REALTY';

export type AssinaturaPF = {
  segment: Segmento;
  subscriptionId: number;
  isSubscriptionActive: boolean;
  createdAt: string;
  customerId: number;
  clienteNome: string;
  clienteEmail: string;
  clienteMobile: string | null;
  clienteBairro: string | null;
  clienteCidade: string | null;
  clienteUf: string | null;
  clienteCpfCnpj: string | null;
  clienteTipoPessoa: string | null;
  clienteCongelado: boolean;
  clienteDeletado: boolean;
  suspenso: boolean;
  planId: number;
  planName: string;
  planPrice: number;
  adId: number;
  adUrl: string;
  adStatus: string;
  subscriptionStartedAt: string | null;
  subscriptionEndedAt: string | null;
  paymentMethod: string | null;
  payedAt: string | null;
  /** Verificação automática antifraude (Procob) — dispara por regras de risco (ex: valor alto),
   * não significa fraude confirmada. */
  verificacaoAntifraude: {
    sinalizada: boolean;
    sinalizadaEm: string | null;
    motivos: string[];
    procobNome: string | null;
    procobDocumento: string | null;
    procobEndereco: string | null;
    outrosClientesIds: number[] | null;
    outroAdId: number | null;
    ip: string | null;
  };
};

export type SeriePeriodo = { periodo: string; qtd: number; valor: number };
export type RankingPlano = { planName: string; qtd: number; valor: number };
export type Breakdown = { chave: string; qtd: number; valor: number };

export type AssinaturasFiltros = {
  segment?: Segmento;
  adStatus?: string;
};

export type AssinaturasData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  kpis: {
    totalAssinaturas: number;
    valorTotal: number;
    ticketMedio: number;
    imoveis: number;
    veiculos: number;
    comVerificacaoAntifraude: number;
  };
  hoje: { qtd: number; valor: number };
  esteMes: { qtd: number; valor: number };
  seriePorDia: SeriePeriodo[];
  seriePorMes: SeriePeriodo[];
  rankingPlanos: RankingPlano[];
  porFormaPagamento: Breakdown[];
  porStatusAnuncio: Breakdown[];
  assinaturas: AssinaturaPF[];
};

const QUERY = `
  SELECT
    vw.segment,
    vw.subscription_id,
    vw.is_subscription_active,
    vw.created_at,
    vw.customer_id,
    vw.name,
    vw.email,
    vw.mobile,
    vw.address_neighborhood,
    vw.suspended,
    vw.plan_id,
    vw.plan_name,
    vw.plan_price,
    vw.ad_id,
    vw.subscription_started_at,
    vw.subscription_ended_at,
    vw.payment_method,
    vw.payed_at,
    vw.ad_status,
    c.cpfcnpj,
    c.tipo_pessoa,
    c.congelado AS cliente_congelado,
    c.deleted AS cliente_deletado,
    cid.nome_cidade,
    uf.sigla_uf,
    far.reason,
    far.procob_info,
    far.other_customers_ids,
    far.other_ad_id,
    far.customer_ip AS fraude_ip,
    far.created_at AS fraude_reportada_em
  FROM vw_pf_purchase vw
  LEFT JOIN tb_cliente c ON c.id = vw.customer_id
  LEFT JOIN tb_cidade cid ON cid.id = vw.address_city_id
  LEFT JOIN tb_uf uf ON uf.id = cid.id_uf
  LEFT JOIN fraud_ad_report far ON far.id = (
    SELECT MAX(f2.id) FROM fraud_ad_report f2 WHERE f2.ad_id = vw.ad_id
  )
  WHERE vw.created_at BETWEEN ? AND ?
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

const TZ = 'America/Sao_Paulo';

/**
 * created_at é TIMESTAMP (sessão MySQL em Brazil/East), então o instante já é correto —
 * mas bucketar por getUTC* pegaria o dia em UTC, não o dia real em horário de Brasília
 * (ex: 12/07 21h BRT vira 13/07 00h UTC). Por isso extraímos ano/mês/dia explicitamente
 * no fuso de Brasília, independente do fuso do servidor Node.
 */
function diaKey(d: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(d));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function mesKey(d: string | Date): string {
  const [year, month] = diaKey(d).split('-');
  return `${year}-${month}`;
}

function montaAdUrl(segment: Segmento, adId: number): string {
  return segment === 'VEHICLE'
    ? `${BASE_URL}/veiculo/x/${adId}/`
    : `${BASE_URL}/imovel/x/id-${adId}/`;
}

export async function getAssinaturasData(
  dataInicial: string,
  dataFinal: string,
  filtros: AssinaturasFiltros = {}
): Promise<AssinaturasData> {
  const connection = await getDbConnection();
  try {
    // Filtros de segmento/status também se aplicam aos KPIs "hoje"/"este mês" abaixo — monta uma vez, reusa nas 3 queries.
    function filtroSql(prefix: string): string {
      let sql = '';
      if (filtros.segment) sql += ` AND ${prefix}segment = ?`;
      if (filtros.adStatus) {
        // ad_status usa collation utf8mb4_0900_ai_ci, diferente da collation da conexão
        // (utf8mb4_unicode_ci) — sem o COLLATE explícito o MySQL lança "Illegal mix of collations".
        sql += ` AND ${prefix}ad_status = ? COLLATE utf8mb4_unicode_ci`;
      }
      return sql;
    }
    const filtroParams: (string | number)[] = [];
    if (filtros.segment) filtroParams.push(filtros.segment);
    if (filtros.adStatus) filtroParams.push(filtros.adStatus);

    const params: (string | number)[] = [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`, ...filtroParams];
    const query = `${QUERY}${filtroSql('vw.')} ORDER BY vw.created_at DESC`;

    const [rows] = await connection.query(query, params);

    const assinaturas: AssinaturaPF[] = (rows as any[]).map((r) => {
      const segment: Segmento = r.segment;
      const procobInfo = r.procob_info as { nome?: string; documento?: string; endereco?: string } | null;
      const outrosClientesIds = r.other_customers_ids as number[] | null;
      const motivos = (r.reason as string[] | null) ?? [];

      return {
        segment,
        subscriptionId: r.subscription_id,
        isSubscriptionActive: Boolean(r.is_subscription_active),
        createdAt: r.created_at,
        customerId: r.customer_id,
        clienteNome: r.name,
        clienteEmail: r.email,
        clienteMobile: r.mobile,
        clienteBairro: r.address_neighborhood || null,
        clienteCidade: r.nome_cidade || null,
        clienteUf: r.sigla_uf || null,
        clienteCpfCnpj: r.cpfcnpj || null,
        clienteTipoPessoa: r.tipo_pessoa || null,
        clienteCongelado: Boolean(r.cliente_congelado),
        clienteDeletado: Boolean(r.cliente_deletado),
        suspenso: Boolean(r.suspended),
        planId: r.plan_id,
        planName: r.plan_name,
        planPrice: toNum(r.plan_price),
        adId: r.ad_id,
        adUrl: montaAdUrl(segment, r.ad_id),
        adStatus: r.ad_status,
        subscriptionStartedAt: r.subscription_started_at,
        subscriptionEndedAt: r.subscription_ended_at,
        paymentMethod: r.payment_method,
        payedAt: r.payed_at,
        verificacaoAntifraude: {
          sinalizada: r.fraude_reportada_em != null,
          sinalizadaEm: r.fraude_reportada_em,
          motivos,
          procobNome: procobInfo?.nome || null,
          procobDocumento: procobInfo?.documento || null,
          procobEndereco: procobInfo?.endereco || null,
          outrosClientesIds,
          outroAdId: r.other_ad_id,
          ip: r.fraude_ip || null,
        },
      };
    });

    const diaMap = new Map<string, { qtd: number; valor: number }>();
    const mesMap = new Map<string, { qtd: number; valor: number }>();
    const planoMap = new Map<string, RankingPlano>();
    const pagamentoMap = new Map<string, Breakdown>();
    const statusMap = new Map<string, Breakdown>();

    for (const a of assinaturas) {
      const dKey = diaKey(a.createdAt);
      const mKey = mesKey(a.createdAt);
      const dEntry = diaMap.get(dKey) ?? { qtd: 0, valor: 0 };
      dEntry.qtd += 1;
      dEntry.valor += a.planPrice;
      diaMap.set(dKey, dEntry);
      const mEntry = mesMap.get(mKey) ?? { qtd: 0, valor: 0 };
      mEntry.qtd += 1;
      mEntry.valor += a.planPrice;
      mesMap.set(mKey, mEntry);

      const planoEntry = planoMap.get(a.planName) ?? { planName: a.planName, qtd: 0, valor: 0 };
      planoEntry.qtd += 1;
      planoEntry.valor += a.planPrice;
      planoMap.set(a.planName, planoEntry);

      const metodo = a.paymentMethod || 'não informado';
      const pagamentoEntry = pagamentoMap.get(metodo) ?? { chave: metodo, qtd: 0, valor: 0 };
      pagamentoEntry.qtd += 1;
      pagamentoEntry.valor += a.planPrice;
      pagamentoMap.set(metodo, pagamentoEntry);

      const statusEntry = statusMap.get(a.adStatus) ?? { chave: a.adStatus, qtd: 0, valor: 0 };
      statusEntry.qtd += 1;
      statusEntry.valor += a.planPrice;
      statusMap.set(a.adStatus, statusEntry);
    }

    const seriePorDia = Array.from(diaMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const seriePorMes = Array.from(mesMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const rankingPlanos = Array.from(planoMap.values()).sort((a, b) => b.qtd - a.qtd);
    // exclui formas de pagamento sem valor (ex: "BO" com R$0,00) — registro sem sentido de negócio pra esse breakdown
    const porFormaPagamento = Array.from(pagamentoMap.values()).filter((p) => p.valor > 0).sort((a, b) => b.qtd - a.qtd);
    const porStatusAnuncio = Array.from(statusMap.values()).sort((a, b) => b.qtd - a.qtd);

    const totalAssinaturas = assinaturas.length;
    const valorTotal = assinaturas.reduce((s, a) => s + a.planPrice, 0);
    const imoveis = assinaturas.filter((a) => a.segment === 'REALTY').length;
    const veiculos = assinaturas.filter((a) => a.segment === 'VEHICLE').length;
    const comVerificacaoAntifraude = assinaturas.filter((a) => a.verificacaoAntifraude.sinalizada).length;

    const [hojeRows] = await connection.query(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(plan_price),0) AS valor FROM vw_pf_purchase WHERE DATE(created_at) = CURDATE()${filtroSql('')}`,
      filtroParams
    );
    const [mesRows] = await connection.query(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(plan_price),0) AS valor FROM vw_pf_purchase WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01 00:00:00')${filtroSql('')}`,
      filtroParams
    );
    const hoje = { qtd: toNum((hojeRows as any[])[0]?.qtd), valor: toNum((hojeRows as any[])[0]?.valor) };
    const esteMes = { qtd: toNum((mesRows as any[])[0]?.qtd), valor: toNum((mesRows as any[])[0]?.valor) };

    const data: AssinaturasData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      kpis: {
        totalAssinaturas,
        valorTotal,
        ticketMedio: totalAssinaturas > 0 ? valorTotal / totalAssinaturas : 0,
        imoveis,
        veiculos,
        comVerificacaoAntifraude,
      },
      hoje,
      esteMes,
      seriePorDia,
      seriePorMes,
      rankingPlanos,
      porFormaPagamento,
      porStatusAnuncio,
      assinaturas,
    };

    return data;
  } finally {
    await connection.end();
  }
}
