import { getDbConnection } from '@/lib/db';

export type StatusToque = 'SENT' | 'DELIVERED' | 'READ';

export type CarrinhoToque = {
  orderId: string;
  cliente: string;
  numero: string | null;
  toque: number;
  disparadoEm: string;
  statusToque: StatusToque;
  segmento: string;
  anuncio: string | null;
  valorAnuncio: number | null;
  quartosImovel: number | null;
  anoVeiculo: number | null;
  valorPlano: number | null;
  statusPedido: string | null;
  abriuAnuncio: boolean;
  abriuEm: string | null;
  ordemPaga: boolean;
  pagoEm: string | null;
  virouAnunciante: boolean;
};

export type CarrinhoUnico = {
  orderId: string;
  cliente: string;
  numero: string | null;
  segmento: string;
  anuncio: string | null;
  valorAnuncio: number | null;
  valorPlano: number | null;
  statusPedido: string | null;
  totalToques: number;
  primeiroToqueEm: string;
  ultimoToqueEm: string;
  abriuAnuncio: boolean;
  abriuEm: string | null;
  ordemPaga: boolean;
  pagoEm: string | null;
  virouAnunciante: boolean;
};

export type FunilEtapa = { etapa: string; valor: number };
export type SeriePeriodoCarrinho = { periodo: string; toques: number; retornos: number; pagamentos: number };
// Saúde de envio do WhatsApp (Sleekflow) por toque — indicador operacional, não mede conversão do cliente.
export type SaudeToque = { toque: number; total: number; entregues: number; lidos: number };
// Retorno/pagamento por quantidade de toques recebidos (cadência) — mede se insistir mais toques compensa.
export type CadenciaResumo = { toques: string; total: number; retornaram: number; pagaram: number };
export type SegmentoResumo = { segmento: string; total: number; retornaram: number; pagaram: number; valorRecuperado: number };

export type CarrinhoData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  kpis: {
    totalCarrinhos: number;
    totalToques: number;
    retornaram: number;
    taxaRetorno: number;
    pagaram: number;
    taxaPagamento: number;
    valorRecuperado: number;
    ticketMedioRecuperado: number;
    virouAnunciante: number;
    taxaAnunciante: number;
  };
  funil: FunilEtapa[];
  seriePorDia: SeriePeriodoCarrinho[];
  seriePorMes: SeriePeriodoCarrinho[];
  saudeEnvio: SaudeToque[];
  porCadencia: CadenciaResumo[];
  porSegmento: SegmentoResumo[];
  toques: CarrinhoToque[];
  carrinhos: CarrinhoUnico[];
};

const QUERY = `
  SELECT
    cr.order_id                       AS order_id,
    c.nome                            AS cliente,
    cr.phone_e164                     AS numero,
    t.touch_number                    AS toque,
    t.sent_at                         AS disparado_em,
    t.status                          AS status_toque,
    CASE WHEN cr.returned_at IS NOT NULL THEN 'SIM' ELSE 'nao' END AS abriu_anuncio,
    cr.returned_at                    AS abriu_em,
    cr.segment                        AS tipo,
    COALESCE(i.titulo, v.titulo)      AS anuncio,
    COALESCE(i.valor_imovel, v.valor) AS valor_anuncio,
    i.qtd_quartos                     AS quartos_imovel,
    v.ano_modelo                      AS ano_veiculo,
    o.amount                          AS valor_plano,
    o.status                          AS status_pedido,
    CASE WHEN EXISTS (
        SELECT 1 FROM tb_pagamento p
         WHERE p.order_id = CONVERT(cr.order_id USING utf8mb3)
           AND p.data_pagamento IS NOT NULL AND p.deleted = 0 AND p.estorno = 0
    ) THEN 'SIM' ELSE 'nao' END       AS order_paga,
    (SELECT MAX(p.data_pagamento) FROM tb_pagamento p
       WHERE p.order_id = CONVERT(cr.order_id USING utf8mb3)
         AND p.data_pagamento IS NOT NULL AND p.deleted = 0 AND p.estorno = 0) AS pago_em,
    CASE WHEN (i.ativo = 1 AND i.deleted = 0)
           OR (v.ativo = 1 AND v.deleted = 0)
         THEN 'SIM' ELSE 'nao' END     AS virou_anunciante
  FROM cart_recovery_touch t
  JOIN cart_recovery cr ON cr.id = t.cart_recovery_id
  JOIN tb_cliente c ON c.id = cr.customer_id
  LEFT JOIN pf_order o  ON o.id  = CONVERT(cr.order_id USING utf8mb3)
  LEFT JOIN pf_realty_advertise ra ON ra.order_id = CONVERT(cr.order_id USING utf8mb3) AND ra.deleted_at IS NULL
  LEFT JOIN tb_imovel  i ON i.id = ra.realty_id
  LEFT JOIN pf_vehicle_advertise va ON va.order_id = CONVERT(cr.order_id USING utf8mb3) AND va.deleted_at IS NULL
  LEFT JOIN tb_veiculo v ON v.id = va.vehicle_id
  WHERE t.status IN ('SENT','DELIVERED','READ')
    AND t.sent_at >= ?
    AND t.sent_at <  ?
  ORDER BY t.sent_at DESC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return new Date(v as string | Date).toISOString();
}

function diaKey(d: string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function mesKey(d: string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function proximoDiaIso(dataIso: string): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getCarrinhoData(dataInicial: string, dataFinal: string): Promise<CarrinhoData> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(QUERY, [`${dataInicial} 00:00:00`, `${proximoDiaIso(dataFinal)} 00:00:00`]);

    const toques: CarrinhoToque[] = (rows as any[]).map((r) => ({
      orderId: String(r.order_id),
      cliente: r.cliente,
      numero: r.numero,
      toque: Number(r.toque),
      disparadoEm: toIso(r.disparado_em)!,
      statusToque: r.status_toque,
      segmento: r.tipo ?? 'outro',
      anuncio: r.anuncio,
      valorAnuncio: r.valor_anuncio === null ? null : toNum(r.valor_anuncio),
      quartosImovel: r.quartos_imovel === null ? null : Number(r.quartos_imovel),
      anoVeiculo: r.ano_veiculo === null ? null : Number(r.ano_veiculo),
      valorPlano: r.valor_plano === null ? null : toNum(r.valor_plano),
      statusPedido: r.status_pedido,
      abriuAnuncio: r.abriu_anuncio === 'SIM',
      abriuEm: toIso(r.abriu_em),
      ordemPaga: r.order_paga === 'SIM',
      pagoEm: toIso(r.pago_em),
      virouAnunciante: r.virou_anunciante === 'SIM',
    }));

    // Dedup por carrinho (order_id): retorno/pagamento/anunciante são propriedades do carrinho,
    // não do toque — repetem em toda linha do mesmo pedido.
    const carrinhoMap = new Map<string, CarrinhoUnico>();
    for (const t of toques) {
      const existente = carrinhoMap.get(t.orderId);
      if (!existente) {
        carrinhoMap.set(t.orderId, {
          orderId: t.orderId,
          cliente: t.cliente,
          numero: t.numero,
          segmento: t.segmento,
          anuncio: t.anuncio,
          valorAnuncio: t.valorAnuncio,
          valorPlano: t.valorPlano,
          statusPedido: t.statusPedido,
          totalToques: 1,
          primeiroToqueEm: t.disparadoEm,
          ultimoToqueEm: t.disparadoEm,
          abriuAnuncio: t.abriuAnuncio,
          abriuEm: t.abriuEm,
          ordemPaga: t.ordemPaga,
          pagoEm: t.pagoEm,
          virouAnunciante: t.virouAnunciante,
        });
      } else {
        existente.totalToques += 1;
        if (t.disparadoEm < existente.primeiroToqueEm) existente.primeiroToqueEm = t.disparadoEm;
        if (t.disparadoEm > existente.ultimoToqueEm) existente.ultimoToqueEm = t.disparadoEm;
      }
    }
    const carrinhos = Array.from(carrinhoMap.values());

    const totalCarrinhos = carrinhos.length;
    const retornaramCarrinhos = carrinhos.filter((c) => c.abriuAnuncio).length;
    const pagaramCarrinhos = carrinhos.filter((c) => c.ordemPaga).length;
    const anuncianteCarrinhos = carrinhos.filter((c) => c.virouAnunciante).length;
    const valorRecuperado = carrinhos.filter((c) => c.ordemPaga).reduce((s, c) => s + (c.valorPlano ?? 0), 0);

    const funil: FunilEtapa[] = [
      { etapa: 'Disparado', valor: totalCarrinhos },
      { etapa: 'Retornou', valor: retornaramCarrinhos },
      { etapa: 'Pagou', valor: pagaramCarrinhos },
      { etapa: 'Virou anunciante', valor: anuncianteCarrinhos },
    ];

    const diaMap = new Map<string, { toques: number; retornos: number; pagamentos: number }>();
    const mesMap = new Map<string, { toques: number; retornos: number; pagamentos: number }>();
    const bump = (map: Map<string, { toques: number; retornos: number; pagamentos: number }>, key: string, campo: 'toques' | 'retornos' | 'pagamentos') => {
      const entry = map.get(key) ?? { toques: 0, retornos: 0, pagamentos: 0 };
      entry[campo] += 1;
      map.set(key, entry);
    };
    for (const t of toques) {
      bump(diaMap, diaKey(t.disparadoEm), 'toques');
      bump(mesMap, mesKey(t.disparadoEm), 'toques');
    }
    for (const c of carrinhos) {
      if (c.abriuAnuncio && c.abriuEm) {
        bump(diaMap, diaKey(c.abriuEm), 'retornos');
        bump(mesMap, mesKey(c.abriuEm), 'retornos');
      }
      if (c.ordemPaga && c.pagoEm) {
        bump(diaMap, diaKey(c.pagoEm), 'pagamentos');
        bump(mesMap, mesKey(c.pagoEm), 'pagamentos');
      }
    }
    const seriePorDia = Array.from(diaMap.entries()).map(([periodo, v]) => ({ periodo, ...v })).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const seriePorMes = Array.from(mesMap.entries()).map(([periodo, v]) => ({ periodo, ...v })).sort((a, b) => a.periodo.localeCompare(b.periodo));

    // Saúde de envio (Sleekflow): SENT/DELIVERED/READ é status de infraestrutura de mensageria,
    // não indica se o cliente voltou — isso é medido separadamente por abriu_anuncio (ver porCadencia).
    const toqueMap = new Map<number, { total: number; entregues: number; lidos: number }>();
    for (const t of toques) {
      const entry = toqueMap.get(t.toque) ?? { total: 0, entregues: 0, lidos: 0 };
      entry.total += 1;
      if (t.statusToque !== 'SENT') entry.entregues += 1;
      if (t.statusToque === 'READ') entry.lidos += 1;
      toqueMap.set(t.toque, entry);
    }
    const saudeEnvio = Array.from(toqueMap.entries()).map(([toque, v]) => ({ toque, ...v })).sort((a, b) => a.toque - b.toque);

    // Cadência: entre os carrinhos que receberam N toques, quantos voltaram a ver o anúncio / pagaram.
    // Responde se insistir com mais toques (2º, 3º...) realmente compensa.
    const cadenciaMap = new Map<string, { total: number; retornaram: number; pagaram: number }>();
    for (const c of carrinhos) {
      const bucket = c.totalToques >= 4 ? '4+ toques' : `${c.totalToques} toque${c.totalToques > 1 ? 's' : ''}`;
      const entry = cadenciaMap.get(bucket) ?? { total: 0, retornaram: 0, pagaram: 0 };
      entry.total += 1;
      if (c.abriuAnuncio) entry.retornaram += 1;
      if (c.ordemPaga) entry.pagaram += 1;
      cadenciaMap.set(bucket, entry);
    }
    const ordemCadencia = ['1 toque', '2 toques', '3 toques', '4+ toques'];
    const porCadencia = ordemCadencia
      .filter((toques) => cadenciaMap.has(toques))
      .map((toques) => ({ toques, ...cadenciaMap.get(toques)! }));

    const segMap = new Map<string, { total: number; retornaram: number; pagaram: number; valorRecuperado: number }>();
    for (const c of carrinhos) {
      const entry = segMap.get(c.segmento) ?? { total: 0, retornaram: 0, pagaram: 0, valorRecuperado: 0 };
      entry.total += 1;
      if (c.abriuAnuncio) entry.retornaram += 1;
      if (c.ordemPaga) { entry.pagaram += 1; entry.valorRecuperado += c.valorPlano ?? 0; }
      segMap.set(c.segmento, entry);
    }
    const porSegmento = Array.from(segMap.entries()).map(([segmento, v]) => ({ segmento, ...v })).sort((a, b) => b.total - a.total);

    const data: CarrinhoData = {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial, dataFinal },
      kpis: {
        totalCarrinhos,
        totalToques: toques.length,
        retornaram: retornaramCarrinhos,
        taxaRetorno: totalCarrinhos > 0 ? retornaramCarrinhos / totalCarrinhos : 0,
        pagaram: pagaramCarrinhos,
        taxaPagamento: totalCarrinhos > 0 ? pagaramCarrinhos / totalCarrinhos : 0,
        valorRecuperado,
        ticketMedioRecuperado: pagaramCarrinhos > 0 ? valorRecuperado / pagaramCarrinhos : 0,
        virouAnunciante: anuncianteCarrinhos,
        taxaAnunciante: totalCarrinhos > 0 ? anuncianteCarrinhos / totalCarrinhos : 0,
      },
      funil,
      seriePorDia,
      seriePorMes,
      saudeEnvio,
      porCadencia,
      porSegmento,
      toques,
      carrinhos,
    };

    return data;
  } finally {
    await connection.end();
  }
}
