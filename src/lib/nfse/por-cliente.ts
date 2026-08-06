import { getDbConnection } from '@/lib/db';
import { consultarCodigoClienteOmie, listarNFSePorCliente } from '@/lib/omie';

export type NotaCliente = {
  numero: string;
  valor: number;
  dataEmissao: string | null;
  numeroOs: string | null;
  codVerificacao: string | null;
  duplicada: boolean;
};

export type ClienteNfse = {
  id: number;
  nome: string;
  cpfCnpj: string | null;
  codigoOmie: number | null;
  notas: NotaCliente[];
  totalNotas: number;
  qtdDuplicadas: number;
  aviso: string | null;
};

export type ConsultaPorClienteResult = {
  termo: string;
  clientes: ClienteNfse[];
};

function somenteDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

function dataBRParaIso(dataBR: string | null | undefined): string | null {
  const partes = dataBR?.split('/');
  if (!partes || partes.length !== 3) return null;
  const [d, m, y] = partes;
  return `${y}-${m}-${d}`;
}

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

type ClienteRow = { id: number; nome: string; nome_fantasia: string | null; cpfcnpj: string | null };

// Aceita CPF/CNPJ (com ou sem pontuacao), id numerico do cliente ou parte do nome.
async function buscarClientes(termo: string): Promise<ClienteRow[]> {
  const conn = await getDbConnection();
  try {
    const digitos = somenteDigitos(termo);
    if (digitos.length >= 11) {
      const [rows] = await conn.query(
        `SELECT id, nome, nome_fantasia, cpfcnpj FROM tb_cliente
         WHERE REPLACE(REPLACE(REPLACE(cpfcnpj,'.',''),'-',''),'/','') = ?
         LIMIT 20`,
        [digitos],
      );
      return rows as ClienteRow[];
    }
    if (/^\d+$/.test(termo.trim())) {
      const [rows] = await conn.query(
        `SELECT id, nome, nome_fantasia, cpfcnpj FROM tb_cliente WHERE id = ? LIMIT 1`,
        [Number(termo.trim())],
      );
      return rows as ClienteRow[];
    }
    const [rows] = await conn.query(
      `SELECT id, nome, nome_fantasia, cpfcnpj FROM tb_cliente
       WHERE nome LIKE ? OR nome_fantasia LIKE ? LIMIT 20`,
      [`%${termo}%`, `%${termo}%`],
    );
    return rows as ClienteRow[];
  } finally {
    await conn.end();
  }
}

function detectarDuplicadas(notas: NotaCliente[]): number {
  // Suspeita de duplicidade: mesmo valor no mesmo mes de emissao. Duas notas de
  // meses diferentes com o mesmo valor sao mensalidades normais, nao duplicata.
  const grupos = new Map<string, NotaCliente[]>();
  for (const nota of notas) {
    const mes = (nota.dataEmissao ?? '').slice(0, 7);
    const chave = `${nota.valor.toFixed(2)}|${mes}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(nota);
    grupos.set(chave, lista);
  }
  let qtd = 0;
  for (const lista of grupos.values()) {
    if (lista.length > 1) {
      for (const nota of lista) nota.duplicada = true;
      qtd += lista.length;
    }
  }
  return qtd;
}

export async function consultarNfsePorCliente(termo: string): Promise<ConsultaPorClienteResult> {
  const clientesDb = await buscarClientes(termo);
  const clientes: ClienteNfse[] = [];

  for (const c of clientesDb) {
    const base: ClienteNfse = {
      id: c.id,
      nome: c.nome_fantasia || c.nome,
      cpfCnpj: c.cpfcnpj,
      codigoOmie: null,
      notas: [],
      totalNotas: 0,
      qtdDuplicadas: 0,
      aviso: null,
    };

    // Falha do Omie em UM cliente vira aviso na linha dele, sem derrubar a
    // consulta inteira (a tela sempre renderiza).
    try {
      const codigoOmie = await consultarCodigoClienteOmie(c.id);
      if (!codigoOmie) {
        base.aviso = 'Cliente ainda não sincronizado na Omie (sem notas emitidas por aqui).';
        clientes.push(base);
        continue;
      }
      base.codigoOmie = codigoOmie;

      type NfseOmie = {
        Cabecalho?: {
          nNumeroNFSe?: number | string;
          nValorNFSe?: number | string;
          cNumeroOS?: number | string;
          cCodigoVerificacao?: string;
        };
        Emissao?: { cDataEmissao?: string };
      };
      const resposta = await listarNFSePorCliente(codigoOmie);
      const encontradas: NfseOmie[] = resposta?.nfseEncontradas ?? [];
      const notas: NotaCliente[] = encontradas.map((nfse) => {
        const cabecalho = nfse?.Cabecalho ?? {};
        return {
          numero: String(cabecalho.nNumeroNFSe ?? ''),
          valor: toNum(cabecalho.nValorNFSe),
          dataEmissao: dataBRParaIso(nfse?.Emissao?.cDataEmissao),
          numeroOs: cabecalho.cNumeroOS ? String(cabecalho.cNumeroOS) : null,
          codVerificacao: cabecalho.cCodigoVerificacao ?? null,
          duplicada: false,
        };
      });

      notas.sort((a, b) => (b.dataEmissao ?? '').localeCompare(a.dataEmissao ?? ''));
      base.qtdDuplicadas = detectarDuplicadas(notas);
      base.notas = notas;
      base.totalNotas = notas.length;
    } catch (error) {
      base.aviso = error instanceof Error ? error.message : 'Falha ao consultar NFS-e na Omie.';
    }
    clientes.push(base);
  }

  return { termo, clientes };
}
