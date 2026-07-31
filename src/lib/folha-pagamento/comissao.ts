import { getDbConnection } from '@/lib/db';
import { normalizarNome } from './unimed';

// Lógica validada em docs/RH/LEVANTAMENTO_FOLHA_PAGAMENTO.md (seção 1 —
// Comissionamento) + investigação real do caso Alana Grazielle (perfil
// Atendente, comissão zerada indevidamente). O endpoint externo
// (api.chavesnamao.com.br) só decide quais contratos contam como "venda
// elegível do mês" para o perfil Vendedor — a regra de faixas progressivas e
// o fechamento continuam 100% em SQL/MySQL, nas mesmas tabelas que o admin
// PHP usa. Schema e regras confirmados via DESCRIBE + leitura do model real.

const PERFIL_VENDEDOR = 0;
const PERFIL_ATENDENTE = 3;

type Conexao = Awaited<ReturnType<typeof getDbConnection>>;

interface FaixaComissao {
  quantidade: string | number;
  comissao: number; // fração, ex.: 0.15 = 15%
}

interface Vendedor {
  id: number;
  perfil: number;
  comissaoPercentual: number;
  comissaoAtivo: boolean;
  faixasComissao: Record<string, FaixaComissao> | null;
}

export interface ResultadoComissao {
  vendedorEncontrado: boolean;
  perfil: number | null;
  comissao: number;
  fechado: boolean; // true = valor vem de tb_comissao_fechada (oficial); false = calculado on-the-fly (provisório)
  matchPorNome: boolean; // true = tb_vendedor.documento estava vazio, cruzamos por nome — conferir manualmente
}

const RESULTADO_VAZIO: ResultadoComissao = {
  vendedorEncontrado: false,
  perfil: null,
  comissao: 0,
  fechado: false,
  matchPorNome: false,
};

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

interface LinhaVendedorRaw {
  id: number;
  documento: string | null;
  nome: string;
  perfil: number;
  comissao_percentual: string;
  comissao_ativo: number;
  faixas_comissao: Record<string, FaixaComissao> | null;
  data_fim: string | Date | null;
}

// Reingresso/mudança de perfil cria uma linha NOVA em tb_vendedor em vez de
// atualizar a antiga — achado real com dados de produção: Alessandra Caroline
// do Nascimento Mitrut tem 4 linhas ativas (mesmo CPF), 3 delas de vínculos já
// encerrados (data_fim preenchido) e só a mais recente (readmissão em
// 2026-07-06) com data_fim em aberto — e essa mais recente veio com o CPF
// vazio no cadastro. `data_fim IS NULL` sozinho não serve como filtro geral
// (só 91 de 1097 vendedores ativos têm isso — a maioria tem data_fim
// preenchido mesmo empregada, provavelmente por outro motivo de negócio não
// relacionado a desligamento), mas serve como CRITÉRIO DE DESEMPATE quando o
// mesmo CPF aparece em mais de uma linha (confirmado: 20 CPFs nessa situação).
function linhaMaisAtual(a: LinhaVendedorRaw, b: LinhaVendedorRaw): LinhaVendedorRaw {
  const aAberto = a.data_fim === null;
  const bAberto = b.data_fim === null;
  if (aAberto !== bAberto) return aAberto ? a : b;
  if (a.data_fim && b.data_fim) {
    const diff = new Date(a.data_fim).getTime() - new Date(b.data_fim).getTime();
    if (diff !== 0) return diff > 0 ? a : b;
  }
  return a.id > b.id ? a : b;
}

// tb_vendedor.documento é opcional no cadastro do admin (nenhum perfil exige
// no formulário) — 13/41 atendentes e 93/977 vendedores ativos estão sem CPF
// cadastrado. Agrupamos por NOME primeiro (não por CPF) porque um reingresso
// pode ter CPF vazio na linha nova mesmo já tendo CPF preenchido numa linha
// antiga do mesmo grupo — usamos o CPF de qualquer linha do grupo, aplicado
// à linha mais atual escolhida por linhaMaisAtual.
async function buscarTodosVendedoresAtivos(conn: Conexao) {
  const [rows] = await conn.query(
    `SELECT id, documento, nome, perfil, comissao_percentual, comissao_ativo, faixas_comissao, data_fim
     FROM tb_vendedor
     WHERE deleted = 0 AND comissao_ativo = 1`
  );

  const porNomeGrupo = new Map<string, LinhaVendedorRaw[]>();
  for (const v of rows as LinhaVendedorRaw[]) {
    const chave = normalizarNome(v.nome ?? '');
    const lista = porNomeGrupo.get(chave) ?? [];
    lista.push(v);
    porNomeGrupo.set(chave, lista);
  }

  const porDocumento = new Map<string, Vendedor & { nome: string }>();
  const porNomeNormalizado = new Map<string, Vendedor & { nome: string }>();

  for (const [nomeChave, linhas] of porNomeGrupo) {
    const atual = linhas.reduce(linhaMaisAtual);
    const vendedor = {
      id: atual.id,
      nome: atual.nome,
      perfil: atual.perfil,
      comissaoPercentual: parseFloat(atual.comissao_percentual ?? '0'),
      comissaoAtivo: atual.comissao_ativo === 1,
      faixasComissao: atual.faixas_comissao ?? null,
    };

    const cpfDoGrupo = linhas.map((l) => normalizarCpf(l.documento ?? '')).find((d) => d);
    if (cpfDoGrupo) porDocumento.set(cpfDoGrupo, vendedor);
    porNomeNormalizado.set(nomeChave, vendedor);
  }

  return { porDocumento, porNomeNormalizado };
}

function encontrarVendedor(
  mapas: Awaited<ReturnType<typeof buscarTodosVendedoresAtivos>>,
  cpf: string,
  nome: string
): { vendedor: (Vendedor & { nome: string }) | null; matchPorNome: boolean } {
  const porDoc = mapas.porDocumento.get(normalizarCpf(cpf));
  if (porDoc) return { vendedor: porDoc, matchPorNome: false };

  // Fallback por nome só quando nenhuma linha do grupo tinha CPF cadastrado.
  const porNome = mapas.porNomeNormalizado.get(normalizarNome(nome));
  if (porNome) return { vendedor: porNome, matchPorNome: true };
  return { vendedor: null, matchPorNome: false };
}

async function buscarComissaoFechada(conn: Conexao, idVendedor: number, ano: number, mes: number): Promise<number | null> {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(cd.valor_base_comissao * cf.comissao_vendedor_momento), 0) AS total,
            COUNT(*) AS qtd
     FROM tb_comissao_fechada cf
     JOIN tb_comissao_detalhamento cd ON cd.id_comissao_fechada = cf.id
     WHERE cf.id_vendedor = ?
       AND cf.mes_referencia = ?
       AND cf.ano_referencia = ?
       AND (cd.excecao IS NULL OR cd.excecao = 0)`,
    [idVendedor, mes, ano]
  );
  const linha = (rows as any[])[0];
  if (!linha || Number(linha.qtd) === 0) return null;
  return parseFloat(linha.total);
}

// Regra vigente desde 2024-02-29 para Vendedor: contrato criado no mês, ativo,
// não cancelado, ainda não presente em nenhum fechamento anterior. Atendente
// usa a mesma base, mas só conta venda com indicação de cliente registrada no
// contrato (application/models/vendedor_model.php:1242-1246) — atendente não
// comissiona sobre venda "própria", só sobre indicação. Base de comissão é
// valor_mensalidade_original − desconto_adimplencia_original, não
// valor_mensalidade (que pode ter sido corrigido depois da venda — validado:
// 17 de 1365 contratos de um mês real divergem entre os dois campos).
async function buscarVendasElegiveis(conn: Conexao, idVendedor: number, ano: number, mes: number, perfil: number): Promise<number[]> {
  const filtroIndicacao = perfil === PERFIL_ATENDENTE ? 'AND fc.id_cliente_indicacao IS NOT NULL' : '';
  const [rows] = await conn.query(
    `SELECT (fc.valor_mensalidade_original - COALESCE(fc.desconto_adimplencia_original, 0)) AS valor_base
     FROM tb_financeiro_contrato fc
     JOIN tb_cliente c ON c.id = fc.id_cliente
     WHERE fc.id_vendedor = ?
       AND c.deleted = 0 AND fc.deleted = 0
       AND fc.valor_mensalidade > 0.01
       AND YEAR(fc.data_contrato) = ? AND MONTH(fc.data_contrato) = ?
       ${filtroIndicacao}
       AND fc.id NOT IN (
         SELECT cd.id_contrato
         FROM tb_comissao_detalhamento cd
         JOIN tb_comissao_fechada cf ON cf.id = cd.id_comissao_fechada
         WHERE cf.id_vendedor = ?
       )`,
    [idVendedor, ano, mes, idVendedor]
  );
  return (rows as any[]).map((r) => parseFloat(r.valor_base));
}

// Aditivos (upgrade de contrato existente) — segunda fonte de comissão,
// aplicável a todo perfil exceto Vendedor (application/models/vendedor_model.php:1317-1319,
// getComissionamentoAditivosByIdVendedor). Só comissiona sobre o INCREMENTO de
// valor causado pelo aditivo, e o mês de referência é o da PAGAMENTO da
// mensalidade vinculada ao aditivo — não o mês em que o aditivo foi criado
// (validado byte a byte contra o admin: caso real com aditivo criado em 01/07
// mas pago em 27/07 só contou na comissão de julho por causa dessa regra).
async function buscarAditivosElegiveis(conn: Conexao, idVendedor: number, ano: number, mes: number): Promise<number[]> {
  // Importante: GROUP BY + HAVING num único nível, sem embrulhar em subquery
  // com WHERE externo — testado e confirmado que a versão aninhada (subquery
  // "AS p" + WHERE fora) devolve 0 linhas mesmo com dados válidos (MySQL não
  // reaproveita a linha materializada do GROUP BY da mesma forma). Validado
  // byte a byte contra o admin com essa exata estrutura.
  const [rows] = await conn.query(
    `SELECT
       fca.id AS id_contrato_aditivo,
       (
         (fca.novo_valor_mensalidade - COALESCE(fca.novo_desconto_adimplencia, 0))
         - IF(
             (SELECT (novo_valor_mensalidade - COALESCE(novo_desconto_adimplencia, 0))
              FROM tb_financeiro_contrato_aditivo
              WHERE id_contrato = fc.id AND id < fca.id AND novo_valor_mensalidade > 0 AND deleted = 0
              ORDER BY id DESC LIMIT 1) > 0,
             (SELECT (novo_valor_mensalidade - COALESCE(novo_desconto_adimplencia, 0))
              FROM tb_financeiro_contrato_aditivo
              WHERE id_contrato = fc.id AND id < fca.id AND novo_valor_mensalidade > 0 AND deleted = 0
              ORDER BY id DESC LIMIT 1),
             (fca.antigo_valor_mensalidade - COALESCE(fca.antigo_desconto_adimplencia, 0))
           )
       ) AS base,
       fm.data_pagamento
     FROM tb_financeiro_contrato fc
       INNER JOIN tb_financeiro_contrato_aditivo fca ON fca.id_contrato = fc.id AND fca.deleted = 0
       LEFT JOIN tb_financeiro_mensalidade fm ON fm.id_contrato = fc.id AND fm.deleted = 0
         AND fm.data_pagamento >= fca.data_cadastro AND fm.bonificado = 0
       LEFT JOIN tb_pagamento pg ON pg.id_mensalidade_cliente = fm.id
     WHERE fca.id_vendedor = ?
       AND fca.data_cadastro >= '2022-03-31'
       AND fca.id NOT IN (
         SELECT cd.id_contrato_aditivo
         FROM tb_comissao_detalhamento cd
         JOIN tb_comissao_fechada cf ON cf.id = cd.id_comissao_fechada
         WHERE cf.id_vendedor = ? AND cd.id_contrato_aditivo IS NOT NULL
       )
     GROUP BY fca.id
     HAVING YEAR(data_pagamento) = ? AND MONTH(data_pagamento) = ? AND base > 0`,
    [idVendedor, idVendedor, ano, mes]
  );
  return (rows as any[]).map((r) => parseFloat(r.base));
}

// Cascata "<=" de baixo pra cima, primeira faixa que bate — não ">=" (bug real
// encontrado com dados de produção: Alessandra Aparecida Severino, 38 vendas,
// faixas {9→10%, 19→15%, 999→20%}. A versão ">=" dava 15% [ao passar de 19,
// nunca chegava nos 999 pra pegar 20%]; a versão certa (application/models/
// vendedor_model.php:704-713, "$totalVendas <= faixa.quantidade") dá 20%,
// batendo exatamente com o admin: R$ 28.249,00 base × 20% = R$ 5.649,80). Se
// nenhuma faixa cobrir o total (caso não previsto no legado), mantém o
// percentual base do vendedor.
function percentualPorFaixa(faixas: Record<string, FaixaComissao> | null, totalVendas: number, percentualPadrao: number): number {
  if (!faixas) return percentualPadrao;
  const ordenadas = Object.values(faixas).sort((a, b) => Number(a.quantidade) - Number(b.quantidade));
  for (const faixa of ordenadas) {
    if (totalVendas <= Number(faixa.quantidade)) return faixa.comissao;
  }
  return percentualPadrao;
}

// Prioriza o valor já fechado (oficial) no mês; se ainda não fechou, calcula
// on-the-fly a partir das vendas + aditivos elegíveis (provisório). Cálculo
// aberto só para Vendedor e Atendente — os demais perfis (Supervisor/
// Treinador/SDR/Representante Comercial) têm regra de hierarquia/ciclo
// semanal fora do escopo desta v1 e dependem do fechamento existir no admin
// (ver armadilhas no levantamento). A faixa de percentual é decidida só pela
// quantidade de vendas (application/models/vendedor_model.php:699) — aditivos
// não contam pra escolha da faixa, só recebem o mesmo percentual depois.
function calcularAberto(vendas: number[], aditivos: number[], vendedor: Vendedor): number {
  const percentual = percentualPorFaixa(vendedor.faixasComissao, vendas.length, vendedor.comissaoPercentual);
  const base = [...vendas, ...aditivos].reduce((soma, valor) => soma + valor, 0);
  return Math.round(base * percentual * 100) / 100;
}

export async function buscarComissoesDoMes(
  colaboradores: { cpf: string; nome: string }[],
  ano: number,
  mes: number
): Promise<Map<string, ResultadoComissao>> {
  const conn = await getDbConnection();
  const resultado = new Map<string, ResultadoComissao>();
  try {
    const mapas = await buscarTodosVendedoresAtivos(conn);

    for (const c of colaboradores) {
      const { vendedor, matchPorNome } = encontrarVendedor(mapas, c.cpf, c.nome);
      if (!vendedor) {
        resultado.set(c.cpf, RESULTADO_VAZIO);
        continue;
      }

      const fechado = await buscarComissaoFechada(conn, vendedor.id, ano, mes);
      if (fechado !== null) {
        resultado.set(c.cpf, { vendedorEncontrado: true, perfil: vendedor.perfil, comissao: fechado, fechado: true, matchPorNome });
        continue;
      }

      if (vendedor.perfil !== PERFIL_VENDEDOR && vendedor.perfil !== PERFIL_ATENDENTE) {
        resultado.set(c.cpf, { vendedorEncontrado: true, perfil: vendedor.perfil, comissao: 0, fechado: false, matchPorNome });
        continue;
      }

      const vendas = await buscarVendasElegiveis(conn, vendedor.id, ano, mes, vendedor.perfil);
      // Vendedor não tem componente de aditivo (a função equivalente no admin
      // retorna null pra esse perfil — a comissão dele vem só de vendas).
      const aditivos = vendedor.perfil === PERFIL_ATENDENTE ? await buscarAditivosElegiveis(conn, vendedor.id, ano, mes) : [];
      const comissao = calcularAberto(vendas, aditivos, vendedor);
      resultado.set(c.cpf, { vendedorEncontrado: true, perfil: vendedor.perfil, comissao, fechado: false, matchPorNome });
    }
  } finally {
    await conn.end();
  }
  return resultado;
}
