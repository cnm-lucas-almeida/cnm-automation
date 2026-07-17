import { getDbConnection } from '@/lib/db';
import { listarNFSePorPeriodo } from '@/lib/omie';

const NFSE_BUFFER_DIAS = 30;

export type PagamentoNfse = {
  idPagamento: number;
  grupoPagamento: string | null;
  dataPagamento: string;
  valor: number;
  formaPagamento: string;
  idEmpresa: number | null;
  empresaNome: string | null;
  idCliente: number;
  clienteNome: string;
  cpfCnpj: string | null;
  tipoPessoa: string | null;
  temNfsAdmin: boolean;
  nfsConfirmadaOmie: boolean;
  nfseOmie: { numero: string; valor: number; dataEmissao: string | null } | null;
};

export type NfseVerificacaoData = {
  generatedAt: string;
  periodo: { dataInicial: string; dataFinal: string; dataFinalBuscaOmie: string };
  kpis: {
    totalPagamentos: number;
    valorTotal: number;
    qtdConfirmadosOmie: number;
    valorConfirmadoOmie: number;
    qtdSemNota: number;
    valorSemNota: number;
    qtdDivergentes: number;
  };
  pagamentosSemNota: PagamentoNfse[];
  pagamentosDivergentes: PagamentoNfse[];
};

const QUERY_PAGAMENTOS = `
  SELECT
    p.id AS id_pagamento,
    p.grupo_pagamento,
    p.data_pagamento,
    p.valor,
    p.forma_pagamento,
    p.id_empresa,
    e.razao_social AS empresa_nome,
    p.id_cliente,
    cl.nome_fantasia,
    cl.nome,
    cl.cpfcnpj,
    cl.tipo_pessoa,
    p.id_nfs
  FROM tb_pagamento p
  INNER JOIN tb_cliente cl ON cl.id = p.id_cliente
  LEFT JOIN tb_empresa e ON e.id = p.id_empresa
  WHERE p.deleted = 0
    AND p.estorno = 0
    AND p.data_pagamento BETWEEN ? AND ?
  ORDER BY p.data_pagamento ASC
`;

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

function isoParaDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function dataBRParaIso(dataBR: string): string | null {
  const partes = dataBR?.split('/');
  if (!partes || partes.length !== 3) return null;
  const [d, m, y] = partes;
  return `${y}-${m}-${d}`;
}

function somaDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function menorData(a: string, b: string): string {
  return a < b ? a : b;
}

export async function getNfseVerificacaoData(dataInicial: string, dataFinal: string): Promise<NfseVerificacaoData> {
  const connection = await getDbConnection();
  let pagamentosRows: any[];
  try {
    const [rows] = await connection.query(QUERY_PAGAMENTOS, [`${dataInicial} 00:00:00`, `${dataFinal} 23:59:59`]);
    pagamentosRows = rows as any[];
  } finally {
    await connection.end();
  }

  // NFS-e costuma ser emitida alguns dias depois do pagamento (fluxo de faturamento da OS),
  // então a busca na Omie estende a janela para além da data final do período consultado —
  // nunca além de hoje, já que não existe nota emitida no futuro.
  const hoje = new Date().toISOString().slice(0, 10);
  const dataFinalBuscaOmie = menorData(somaDias(dataFinal, NFSE_BUFFER_DIAS), hoje);

  const nfseResponse = await listarNFSePorPeriodo(isoParaDataBR(dataInicial), isoParaDataBR(dataFinalBuscaOmie));
  const nfseList: any[] = nfseResponse?.nfseEncontradas ?? [];

  // A Omie não filtra ListarNFSEs por documento do destinatário, então o casamento é feito
  // aqui em memória, por CPF/CNPJ (sem pontuação) e apenas para NFS-e com status "Faturada".
  const nfsePorDocumento = new Map<string, any[]>();
  for (const nfse of nfseList) {
    const cabecalho = nfse?.Cabecalho ?? {};
    if (cabecalho.cStatusNFSe !== 'F') continue;
    const documento = somenteDigitos(cabecalho.cCNPJDestinatario || cabecalho.cCPFDestinatario);
    if (!documento) continue;
    const lista = nfsePorDocumento.get(documento) ?? [];
    lista.push(nfse);
    nfsePorDocumento.set(documento, lista);
  }

  const pagamentos: PagamentoNfse[] = pagamentosRows.map((r) => {
    const documentoCliente = somenteDigitos(r.cpfcnpj);
    const nfsesDoCliente = documentoCliente ? nfsePorDocumento.get(documentoCliente) ?? [] : [];
    const nfseEncontrada = nfsesDoCliente[0]?.Cabecalho ?? null;
    const emissaoEncontrada = nfsesDoCliente[0]?.Emissao?.cDataEmissao ?? null;

    return {
      idPagamento: r.id_pagamento,
      grupoPagamento: r.grupo_pagamento,
      dataPagamento: r.data_pagamento,
      valor: toNum(r.valor),
      formaPagamento: r.forma_pagamento ?? 'outro',
      idEmpresa: r.id_empresa,
      empresaNome: r.empresa_nome,
      idCliente: r.id_cliente,
      clienteNome: r.nome_fantasia || r.nome,
      cpfCnpj: r.cpfcnpj,
      tipoPessoa: r.tipo_pessoa,
      temNfsAdmin: r.id_nfs !== null,
      nfsConfirmadaOmie: nfsesDoCliente.length > 0,
      nfseOmie: nfseEncontrada ? {
        numero: String(nfseEncontrada.nNumeroNFSe),
        valor: toNum(nfseEncontrada.nValorNFSe),
        dataEmissao: emissaoEncontrada ? dataBRParaIso(emissaoEncontrada) : null,
      } : null,
    };
  });

  const confirmados = pagamentos.filter((p) => p.nfsConfirmadaOmie);
  const semNota = pagamentos.filter((p) => !p.nfsConfirmadaOmie);
  const divergentes = pagamentos.filter((p) => p.temNfsAdmin !== p.nfsConfirmadaOmie);

  return {
    generatedAt: new Date().toISOString(),
    periodo: { dataInicial, dataFinal, dataFinalBuscaOmie },
    kpis: {
      totalPagamentos: pagamentos.length,
      valorTotal: pagamentos.reduce((s, p) => s + p.valor, 0),
      qtdConfirmadosOmie: confirmados.length,
      valorConfirmadoOmie: confirmados.reduce((s, p) => s + p.valor, 0),
      qtdSemNota: semNota.length,
      valorSemNota: semNota.reduce((s, p) => s + p.valor, 0),
      qtdDivergentes: divergentes.length,
    },
    pagamentosSemNota: semNota,
    pagamentosDivergentes: divergentes,
  };
}
