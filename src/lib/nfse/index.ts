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
  numeroNfsAdmin: string | null;
  statusNfsAdmin: string | null;
  nfseOmie: { numero: string; valor: number; dataEmissao: string | null } | null;
};

export type NotaOmie = {
  numero: string;
  valor: number;
  dataEmissao: string | null;
  documento: string;
  destinatario: string | null;
  vinculadaNoAdmin: boolean;
  idPagamentoVinculado: number | null;
};

export type GrupoDuplicado = {
  documento: string;
  destinatario: string | null;
  valor: number;
  notas: NotaOmie[];
};

export type ResumoDia = {
  dia: string;
  qtdPagamentos: number;
  valorPagamentos: number;
  qtdConfirmados: number;
  qtdSemNota: number;
  valorSemNota: number;
  percentualCobertura: number;
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
    qtdNotasOmie: number;
    qtdNotasNaoVinculadas: number;
    valorNotasNaoVinculadas: number;
    qtdNotasDuplicadas: number;
  };
  pagamentosSemNota: PagamentoNfse[];
  pagamentosDivergentes: PagamentoNfse[];
  notasNaoVinculadas: NotaOmie[];
  notasDuplicadas: GrupoDuplicado[];
  resumoPorDia: ResumoDia[];
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
    p.id_nfs,
    n.numero_nfs,
    n.status AS nfs_status
  FROM tb_pagamento p
  INNER JOIN tb_cliente cl ON cl.id = p.id_cliente
  LEFT JOIN tb_empresa e ON e.id = p.id_empresa
  LEFT JOIN tb_nfs n ON n.id = p.id_nfs
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

// O driver do MySQL devolve DATETIME como Date, e o restante do fluxo trabalha com
// texto ISO. Normaliza os dois casos para YYYY-MM-DD usando o fuso local, que e o
// mesmo em que a data foi gravada (converter para UTC deslocaria o dia).
function chaveDia(valor: unknown): string {
  if (valor instanceof Date) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  return String(valor ?? '').slice(0, 10);
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

  // O numero da NFS-e da Omie (nNumeroNFSe) e o mesmo gravado em tb_nfs.numero_nfs
  // quando a nota e vinculada no Admin. Esse e o casamento exato entre os dois lados,
  // sem heuristica de valor ou data.
  const idPagamentoPorNumeroNfs = new Map<string, number>();
  for (const r of pagamentosRows) {
    const numero = r.numero_nfs === null || r.numero_nfs === undefined ? null : String(r.numero_nfs);
    if (numero) idPagamentoPorNumeroNfs.set(numero, r.id_pagamento);
  }

  const pagamentos: PagamentoNfse[] = pagamentosRows.map((r) => {
    const numeroAdmin = r.numero_nfs === null || r.numero_nfs === undefined ? null : String(r.numero_nfs);
    const documentoCliente = somenteDigitos(r.cpfcnpj);
    const nfsesDoCliente = documentoCliente ? nfsePorDocumento.get(documentoCliente) ?? [] : [];

    // Confirmada = existe na Omie a MESMA nota que o Admin diz estar vinculada.
    const notaNaOmie = numeroAdmin
      ? nfsesDoCliente.find((nfse) => String(nfse?.Cabecalho?.nNumeroNFSe) === numeroAdmin) ?? null
      : null;
    const cabecalho = notaNaOmie?.Cabecalho ?? null;
    const emissao = notaNaOmie?.Emissao?.cDataEmissao ?? null;

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
      nfsConfirmadaOmie: cabecalho !== null,
      numeroNfsAdmin: numeroAdmin,
      statusNfsAdmin: r.nfs_status ?? null,
      nfseOmie: cabecalho ? {
        numero: String(cabecalho.nNumeroNFSe),
        valor: toNum(cabecalho.nValorNFSe),
        dataEmissao: emissao ? dataBRParaIso(emissao) : null,
      } : null,
    };
  });

  // Lado inverso: notas que existem na Omie e o Admin nao conhece.
  const notasOmie: NotaOmie[] = [];
  for (const [documento, lista] of nfsePorDocumento) {
    for (const nfse of lista) {
      const cabecalho = nfse?.Cabecalho ?? {};
      const numero = String(cabecalho.nNumeroNFSe);
      const idPagamentoVinculado = idPagamentoPorNumeroNfs.get(numero) ?? null;
      const emissao = nfse?.Emissao?.cDataEmissao ?? null;
      notasOmie.push({
        numero,
        valor: toNum(cabecalho.nValorNFSe),
        dataEmissao: emissao ? dataBRParaIso(emissao) : null,
        documento,
        destinatario: cabecalho.cRazaoSocialDestinatario ?? cabecalho.cNomeDestinatario ?? null,
        vinculadaNoAdmin: idPagamentoVinculado !== null,
        idPagamentoVinculado,
      });
    }
  }

  const notasNaoVinculadas = notasOmie.filter((n) => !n.vinculadaNoAdmin);

  // Duplicidade: mais de uma NFS-e faturada para o mesmo destinatario e mesmo valor.
  const porDocumentoValor = new Map<string, NotaOmie[]>();
  for (const nota of notasOmie) {
    const chave = `${nota.documento}|${nota.valor.toFixed(2)}`;
    const lista = porDocumentoValor.get(chave) ?? [];
    lista.push(nota);
    porDocumentoValor.set(chave, lista);
  }
  const notasDuplicadas: GrupoDuplicado[] = [];
  for (const lista of porDocumentoValor.values()) {
    if (lista.length < 2) continue;
    notasDuplicadas.push({
      documento: lista[0].documento,
      destinatario: lista[0].destinatario,
      valor: lista[0].valor,
      notas: lista.slice().sort((a, b) => (a.dataEmissao ?? '').localeCompare(b.dataEmissao ?? '')),
    });
  }
  notasDuplicadas.sort((a, b) => b.notas.length - a.notas.length || b.valor - a.valor);

  const confirmados = pagamentos.filter((p) => p.nfsConfirmadaOmie);
  const semNota = pagamentos.filter((p) => !p.nfsConfirmadaOmie);
  const divergentes = pagamentos.filter((p) => p.temNfsAdmin !== p.nfsConfirmadaOmie);

  // Fechamento por dia do periodo: serve de relatorio diario/semanal/mensal,
  // conforme o intervalo escolhido no filtro.
  const acumuladoPorDia = new Map<string, ResumoDia>();
  for (const p of pagamentos) {
    const dia = chaveDia(p.dataPagamento);
    const atual = acumuladoPorDia.get(dia) ?? {
      dia,
      qtdPagamentos: 0,
      valorPagamentos: 0,
      qtdConfirmados: 0,
      qtdSemNota: 0,
      valorSemNota: 0,
      percentualCobertura: 0,
    };
    atual.qtdPagamentos += 1;
    atual.valorPagamentos += p.valor;
    if (p.nfsConfirmadaOmie) {
      atual.qtdConfirmados += 1;
    } else {
      atual.qtdSemNota += 1;
      atual.valorSemNota += p.valor;
    }
    acumuladoPorDia.set(dia, atual);
  }
  const resumoPorDia = Array.from(acumuladoPorDia.values())
    .map((r) => ({
      ...r,
      percentualCobertura: r.qtdPagamentos > 0
        ? Math.round((r.qtdConfirmados / r.qtdPagamentos) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

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
      qtdNotasOmie: notasOmie.length,
      qtdNotasNaoVinculadas: notasNaoVinculadas.length,
      valorNotasNaoVinculadas: notasNaoVinculadas.reduce((s, n) => s + n.valor, 0),
      qtdNotasDuplicadas: notasDuplicadas.reduce((s, g) => s + g.notas.length, 0),
    },
    pagamentosSemNota: semNota,
    pagamentosDivergentes: divergentes,
    notasNaoVinculadas,
    notasDuplicadas,
    resumoPorDia,
  };
}
