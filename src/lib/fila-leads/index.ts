import { getDbConnection } from '@/lib/db';
import { buscarIdsCidadesFoco } from '@/lib/cidades-foco';
import { listarColaboradores } from '@/lib/convenia';
import { calcularCiclo, type Ciclo } from '@/lib/inside-sales';

export type Conversao = 'Base' | 'Lead' | null;
export type TipoBase = '' | 'BASE -20' | 'BASE 30+' | 'BASE FOCO -100' | 'BASE FOCO +100' | 'TOP 20';

export type FilaLeadsRow = {
  idLink: number;
  idCliente: number;
  nomeFantasia: string;
  razaoSocial: string;
  tipoAnuncio: 'Imóvel' | 'Veículo';
  siglaUf: string | null;
  nomeCidade: string | null;
  bairro: string | null;
  idVendedor: number;
  nomeVendedor: string;
  statusLink: string;
  cadastroPv: string | null;
  criacaoLink: string | null;
  dataAssinatura: string | null;
  responsavel: string | null;
  nomeTipo: string | null;
  diasBonificados: number;
  planoAtivoNome: string | null;
  valorContrato: number;
  crmCadastro: string | null;
  crmContato: string | null;
  crmConversaoTitulo: string | null;
  crmDealFlow: 'INBOUND' | 'OUTBOUND' | null;
  top20: boolean;
  ciclo: Ciclo | null;
  conversao: Conversao;
  estoque: number | null;
  squad: string | null;
  cidadeFoco: boolean;
  tipoBase: TipoBase;
};

export type FilaLeadsFiltros = {
  dataInicial: string;
  dataFinal: string;
  busca?: string;
  statusLink?: string;
  tipo?: 'I' | 'V' | 'L';
  vendedorId?: number;
  squadId?: number;
};

export type FilaLeadsData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string };
  linhas: FilaLeadsRow[];
};

export type VendedorOption = { id: number; nome: string };
export type SquadOption = { id: number; nome: string };

const STATUS_LABELS: Record<string, string> = {
  '1': 'Pendente/Cliente',
  '2': 'Revisão/Cliente',
  '3': 'Assinado',
  '4': 'Reprovado',
  '5': 'Aprovação/Agendado',
};

function statusLabel(statusRaw: number | null, dataAgendamento: unknown): string {
  if (statusRaw === null) return 'Pendente/Interno';
  if (statusRaw === 2 && dataAgendamento) return 'Revisão/Agendado';
  return STATUS_LABELS[String(statusRaw)] ?? 'Desconhecido';
}

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function normalizarCpf(v: string | null): string | null {
  return v ? v.replace(/\D/g, '') : null;
}

function calcularTipoBase(input: { top20: boolean; conversao: Conversao; cidadeFoco: boolean; estoque: number | null }): TipoBase {
  if (input.top20) return 'TOP 20';
  if (input.conversao !== 'Base') return '';
  const estoque = input.estoque ?? 0;
  if (input.cidadeFoco) {
    return estoque < 100 ? 'BASE FOCO -100' : 'BASE FOCO +100';
  }
  return estoque <= 20 ? 'BASE -20' : 'BASE 30+';
}

const QUERY = `
  SELECT
    glc.id AS id_link,
    glc.status AS status_raw,
    glc.data_assinatura,
    glc.data_aprovacao,
    glc.data_cadastro,
    glc.data_agendamento,
    cli.id AS id_cliente,
    cli.tipo_pessoa2,
    cli.nome,
    cli.nome_fantasia,
    cli.bairro_endereco,
    cli.id_cidade,
    cid.nome_cidade,
    uf.sigla_uf,
    coalesce(fc.valor_mensalidade, fcpc.valor_mensalidade) AS valor_contrato,
    su.name AS responsavel,
    fcpc.id_vendedor,
    fcpc.data_contrato AS data_contrato_pre_cadastro,
    fcpc.show_increase_data AS dias_bonificados,
    vnd.nome AS nome_vendedor,
    REPLACE(REPLACE(REPLACE(vnd.documento, '.', ''), '-', ''), '/', '') AS vendedor_cpf,
    fct.nome_tipo,
    tcp.data_contato AS data_contato_pj,
    tcp.data_insercao AS data_cadastro_contato_pj,
    tcp.deal_flow AS deal_flow_contato_pj,
    cc.title AS titulo_conversao,
    COALESCE(ipa.qtd_imoveis, vpa.qtd_veiculos) AS estoque,
    COALESCE(ipa.nome, vpa.nome) AS plano_ativo_nome,
    Ranked.rn AS ranking_estoque_vendedor,
    squad.name AS squad_nome
  FROM tb_gerencia_link_contrato glc
  INNER JOIN tb_pre_cadastro_alerta pca ON pca.id_pre_cadastro = glc.id_cliente AND pca.deleted = 0
  INNER JOIN tb_cliente cli ON cli.id = glc.id_cliente AND cli.deleted = 0
  LEFT JOIN tb_cidade cid ON cid.id = cli.id_cidade
  LEFT JOIN tb_uf uf ON uf.id = cid.id_uf
  LEFT JOIN tb_financeiro_contrato fc ON fc.id = glc.id_contrato
  LEFT JOIN tb_sys_user su ON su.id = pca.id_usuario_alterou
  INNER JOIN tb_financeiro_contrato_pre_cadastro fcpc
    ON fcpc.id_cliente = glc.id_cliente
    AND fcpc.id = (SELECT MAX(f2.id) FROM tb_financeiro_contrato_pre_cadastro f2 WHERE f2.id_cliente = glc.id_cliente)
  LEFT JOIN tb_financeiro_contrato_tipo fct ON fct.id = fcpc.tipo_contrato
  INNER JOIN tb_vendedor vnd ON vnd.id = fcpc.id_vendedor
  LEFT JOIN (
    SELECT id_crm, id_cliente FROM tb_contrato_conversao sub_cc
    WHERE created_at = (SELECT MAX(created_at) FROM tb_contrato_conversao WHERE sub_cc.id_cliente = id_cliente GROUP BY id_cliente)
    GROUP BY id_cliente
  ) tcc ON tcc.id_cliente = glc.id_cliente
  LEFT JOIN tb_contato_pj tcp ON tcp.id = tcc.id_crm
  LEFT JOIN crm_channel cc ON cc.id = tcp.conversion_id
  LEFT JOIN tb_imovel_plano_assinatura_cliente ipac ON ipac.id = (
    SELECT ipac2.id FROM tb_imovel_plano_assinatura_cliente ipac2
    WHERE ipac2.id_cliente = cli.id AND ipac2.deleted = 0
      AND (ipac2.data_termino_assinatura IS NULL OR ipac2.data_termino_assinatura > NOW())
    ORDER BY ipac2.id DESC LIMIT 1
  )
  LEFT JOIN tb_imovel_plano_assinatura ipa ON ipa.id = ipac.id_imovel_plano_assinatura
  LEFT JOIN tb_veiculo_plano_assinatura_cliente vpac ON vpac.id = (
    SELECT vpac2.id FROM tb_veiculo_plano_assinatura_cliente vpac2
    WHERE vpac2.id_cliente = cli.id AND vpac2.deleted = 0
      AND (vpac2.data_termino_assinatura IS NULL OR vpac2.data_termino_assinatura > NOW())
    ORDER BY vpac2.id DESC LIMIT 1
  )
  LEFT JOIN tb_veiculo_plano_assinatura vpa ON vpa.id = vpac.id_veiculo_plano_assinatura
  LEFT JOIN (
    SELECT id, id_vendedor, qtd_estoque_numerico,
      ROW_NUMBER() OVER (PARTITION BY id_vendedor ORDER BY qtd_estoque_numerico DESC) AS rn
    FROM tb_contato_pj
    WHERE deal_status IN ('QUALIFICATION', 'NEGOTIATION') AND id_vendedor IS NOT NULL
  ) Ranked ON Ranked.id = tcp.id
  LEFT JOIN crm_salesperson_allocation csa
    ON csa.salesperson_id = fcpc.id_vendedor
    AND csa.started_at <= COALESCE(DATE(glc.data_assinatura), CURDATE())
    AND (csa.finished_at IS NULL OR csa.finished_at >= COALESCE(DATE(glc.data_assinatura), CURDATE()))
  LEFT JOIN crm_squad squad ON squad.id = csa.squad_id
  WHERE glc.deleted = 0
    AND YEAR(glc.data_cadastro) >= 2022
    AND COALESCE(DATE(glc.data_assinatura), DATE(glc.data_cadastro)) BETWEEN ? AND ?
`;

export async function getFilaLeadsData(filtros: FilaLeadsFiltros): Promise<FilaLeadsData> {
  const connection = await getDbConnection();
  try {
    const params: (string | number)[] = [filtros.dataInicial, filtros.dataFinal];
    let sql = QUERY;

    if (filtros.busca) {
      const termo = filtros.busca.trim();
      if (/^\d+$/.test(termo)) {
        sql += ` AND (cli.id = ? OR cli.cpfcnpj = ? OR cli.telefone_fixo = ? OR cli.telefone_celuar = ? OR cli.telefone_comercial = ?)`;
        params.push(termo, termo, termo, termo, termo);
      } else {
        sql += ` AND (cli.nome LIKE ? OR cli.nome_fantasia LIKE ? OR cli.email LIKE ?)`;
        const like = `%${termo}%`;
        params.push(like, like, like);
      }
    }
    if (filtros.statusLink) {
      if (filtros.statusLink === 'interno') {
        sql += ` AND glc.status IS NULL`;
      } else {
        sql += ` AND glc.status = ?`;
        params.push(filtros.statusLink);
      }
    }
    if (filtros.tipo === 'I') {
      sql += ` AND (cli.tipo_pessoa2 = 'CORRETOR' OR cli.tipo_pessoa2 = 'IMOB') AND fcpc.tipo_plano != 56`;
    } else if (filtros.tipo === 'V') {
      sql += ` AND (cli.tipo_pessoa2 = 'REVENDA_V' OR cli.tipo_pessoa2 = 'REVENDA_VF')`;
    } else if (filtros.tipo === 'L') {
      sql += ` AND fcpc.tipo_plano = 56`;
    }
    if (filtros.vendedorId) {
      sql += ` AND fcpc.id_vendedor = ?`;
      params.push(filtros.vendedorId);
    }
    if (filtros.squadId) {
      sql += ` AND squad.id = ?`;
      params.push(filtros.squadId);
    }

    sql += ` GROUP BY cli.id ORDER BY COALESCE(glc.data_assinatura, glc.data_cadastro) DESC`;

    const [rows] = await connection.query(sql, params);

    const [idsCidadesFoco, colaboradores] = await Promise.all([
      buscarIdsCidadesFoco(),
      listarColaboradores().catch(() => []),
    ]);
    const colaboradorPorCpf = new Map(colaboradores.map((c) => [c.cpf, c]));

    const linhas: FilaLeadsRow[] = (rows as any[]).map((r) => {
      const top20 = Number(r.ranking_estoque_vendedor) > 0 && Number(r.ranking_estoque_vendedor) <= 20;
      const dealFlow = (r.deal_flow_contato_pj as 'INBOUND' | 'OUTBOUND' | null) ?? null;
      const conversao: Conversao = dealFlow === 'OUTBOUND' ? 'Base' : dealFlow === 'INBOUND' ? 'Lead' : null;
      const estoque = r.estoque === null || r.estoque === undefined ? null : Number(r.estoque);
      const cidadeFoco = r.id_cidade != null && idsCidadesFoco.has(r.id_cidade);

      const colaborador = colaboradorPorCpf.get(normalizarCpf(r.vendedor_cpf) ?? '');
      const ciclo = colaborador?.experiencePeriod ? calcularCiclo(colaborador.experiencePeriod, new Date()) : null;

      return {
        idLink: r.id_link,
        idCliente: r.id_cliente,
        nomeFantasia: r.nome_fantasia,
        razaoSocial: r.nome,
        tipoAnuncio: r.tipo_pessoa2 === 'CORRETOR' || r.tipo_pessoa2 === 'IMOB' ? 'Imóvel' : 'Veículo',
        siglaUf: r.sigla_uf ?? null,
        nomeCidade: r.nome_cidade ?? null,
        bairro: r.bairro_endereco ?? null,
        idVendedor: r.id_vendedor,
        nomeVendedor: r.nome_vendedor,
        statusLink: statusLabel(r.status_raw, r.data_agendamento),
        cadastroPv: r.data_contrato_pre_cadastro,
        criacaoLink: r.data_aprovacao,
        dataAssinatura: r.data_assinatura,
        responsavel: r.responsavel ?? null,
        nomeTipo: r.nome_tipo ?? null,
        diasBonificados: toNum(r.dias_bonificados),
        planoAtivoNome: r.plano_ativo_nome ?? null,
        valorContrato: toNum(r.valor_contrato),
        crmCadastro: r.data_cadastro_contato_pj,
        crmContato: r.data_contato_pj,
        crmConversaoTitulo: r.titulo_conversao ?? null,
        crmDealFlow: dealFlow,
        top20,
        ciclo,
        conversao,
        estoque,
        squad: r.squad_nome ?? null,
        cidadeFoco,
        tipoBase: calcularTipoBase({ top20, conversao, cidadeFoco, estoque }),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      periodo: { dataInicial: filtros.dataInicial, dataFinal: filtros.dataFinal },
      linhas,
    };
  } finally {
    await connection.end();
  }
}

export async function listarVendedoresAdmin(): Promise<VendedorOption[]> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(
      `SELECT id, nome FROM tb_vendedor WHERE deleted = 0 AND data_fim IS NULL ORDER BY nome`
    );
    return (rows as any[]).map((r) => ({ id: r.id, nome: r.nome }));
  } finally {
    await connection.end();
  }
}

export async function listarSquadsAdmin(): Promise<SquadOption[]> {
  const connection = await getDbConnection();
  try {
    const [rows] = await connection.query(`SELECT id, name FROM crm_squad WHERE deleted = 0 AND ativo = 1 ORDER BY name`);
    return (rows as any[]).map((r) => ({ id: r.id, nome: r.name }));
  } finally {
    await connection.end();
  }
}
