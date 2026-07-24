// Dados "crus" usados para montar o mock: nomes reais de campanha fornecidos pelo time,
// um por plataforma. Servem só para o protótipo — nada aqui vem de API real ainda.

// Google Ads — nomenclatura real da conta (pipe-delimitada, formato não 100% consistente).
export const GOOGLE_NOMES: string[] = [
  'BR | Trafego | Venda | MAX Cliques',
  'BR | Trafego | Aluguel | MAX Cliques',
  'BR | Cobertura | Concorrentes | IS',
  'SP | Estado | Venda | tROAS',
  'SP | Estado | Aluguel | tROAS',
  'PR | Estado | Venda | tROAS',
  'PR | Estado | PMAX | tROAS | RBRAND',
  'PR | Estado | Aluguel | tROAS',
  'SP | Estado | PMAX | tCPA',
  'SP | São Paulo | Venda | tROAS',
  'SP | São Paulo | Aluguel | tROAS',
  'SC | Estado | Venda | tROAS',
  'SC | Estado | PMAX | tROAS | RBRAND',
  'SC | Estado | Aluguel | tROAS',
  'PR | CWB | Venda | tROAS',
  'PR | CWB | Lançamentos | Imóveis | tROAS',
  'PR | CWB | Aluguel | tROAS',
  'RJ | Estado | PMAX | tROAS | RBRAND',
  'RJ | Estado | Venda | tROAS',
  'RJ | Estado | Aluguel | tROAS',
  'RS | Estado | PMAX | tROAS | RBRAND',
  'RS | Estado | Venda | tROAS',
  'RS | Estado | Aluguel | tROAS',
  'MG | Estado | Venda | tROAS',
  'MG | Estado | Aluguel | tROAS',
  'RJ | Rio de Janeiro | Venda | tROAS',
  'RJ | Rio de Janeiro | Aluguel | tROAS',
  'BA | Estado | Venda | tROAS',
  'BA | Estado | Aluguel | tROAS',
  'RS | POA | Venda | tROAS',
  'RS | POA | Aluguel | tROAS',
  'SC | Floripa | Venda | tROAS',
  'SC | Floripa | Aluguel | tROAS',
  'SP | Praia Grande | Venda | tROAS',
  'SP | Praia Grande | Aluguel | tROAS',
  'SP | São José dos Campos | Venda | tROAS',
  'SP | São José dos Campos | Aluguel | tROAS',
  'BA | Salvador | Venda | PMAX | tROAS',
  'BA | Salvador | Aluguel | tROAS',
  'MG | Belo Horizonte | Venda | PMAX | tROAS',
  'MG | Belo Horizonte | Aluguel | tROAS',
  'SP | Campinas | Venda | tROAS',
  'SP | Campinas | Aluguel | tROAS',
  'SP | Santos | Venda | tROAS',
  'SP | Santos | Aluguel | tROAS',
  'SP | Ribeirão Preto | Venda | tROAS',
  'SP | Ribeirão Preto | Aluguel | tROAS',
  'SP | Sorocaba | Venda | tROAS',
  'SP | Sorocaba | Aluguel | tROAS',
  'SC | Joinville | Venda | tROAS',
  'SC | Joinville | Aluguel | tROAS',
  'SP | Jundiaí | Venda | tROAS',
  'SP | Jundiaí | Aluguel | tROAS',
  'SP | Guarulhos | Venda | tROAS',
  'SP | Guarulhos | Aluguel | tROAS',
  'PR | Londrina | Venda | tROAS',
  'PR | Londrina | Aluguel | tROAS',
  'SP | Indaiatuba | Venda | tROAS',
  'SP | Indaiatuba | Aluguel | tROAS',
  'SP | São Bernardo do Campo | Venda | tROAS',
  'SP | São Bernardo do Campo | Aluguel | tROAS',
  'PB | Estado | Venda | tROAS',
  'CE | Estado | Venda | tROAS',
  'PB | João Pessoa | Venda | PMAX | tROAS',
  'PB | João Pessoa | Aluguel | tROAS',
  'PE | Estado | Venda | tROAS',
];

export interface CriteoRow {
  nome: string;
  objetivo: 'Aquisição' | 'Retenção';
  idCampanha: number;
  status: 'Ativo' | 'Rascunho' | 'Em pausa';
  orcamento: number;
  periodoOrcamento: 'Mensal' | 'Diário';
  ativado: boolean;
}

// Criteo — campanhas reais fornecidas pelo time (gasto atual não usado como fonte:
// as métricas comparáveis do painel são geradas pelo mock generator a partir do status/orçamento).
export const CRITEO_ROWS: CriteoRow[] = [
  { nome: 'VIDEO - SP', objetivo: 'Aquisição', idCampanha: 860039, status: 'Ativo', orcamento: 3000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'Ampla | Search Ads', objetivo: 'Aquisição', idCampanha: 842057, status: 'Rascunho', orcamento: 300, periodoOrcamento: 'Diário', ativado: true },
  { nome: 'VENDA - BCO - RETARGETING', objetivo: 'Retenção', idCampanha: 361045, status: 'Ativo', orcamento: 150700, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'ALUGUEL - BCO - RETARGETING', objetivo: 'Retenção', idCampanha: 361047, status: 'Ativo', orcamento: 87900, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - BCO - PROSPECT - SP - VENDAS', objetivo: 'Aquisição', idCampanha: 450700, status: 'Ativo', orcamento: 90000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - CPC - AMPLA - SITES', objetivo: 'Aquisição', idCampanha: 774734, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - SC - VENDAS', objetivo: 'Aquisição', idCampanha: 815414, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: true },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - RS - VENDAS', objetivo: 'Aquisição', idCampanha: 815415, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: true },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - RJ - VENDAS', objetivo: 'Aquisição', idCampanha: 815416, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: true },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - MG - VENDAS', objetivo: 'Aquisição', idCampanha: 815417, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - SC - VENDAS', objetivo: 'Aquisição', idCampanha: 815419, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - RJ - VENDAS', objetivo: 'Aquisição', idCampanha: 815421, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: false },
  { nome: 'UPPER FUNNEL - BO - PROSPECT - RS - VENDAS', objetivo: 'Aquisição', idCampanha: 815424, status: 'Em pausa', orcamento: 15000, periodoOrcamento: 'Mensal', ativado: false },
];

export interface BingRow {
  nome: string;
  uf: string | null;
  status: 'ativa' | 'pausada';
  orcamentoDia: number;
  impressoes: number;
  cliques: number;
  ctr: number; // fração, ex 0.1161
  cpc: number;
  custo: number;
  conversoes: number;
}

// Bing — amostra representativa da conta real (a conta hoje tem ~20+ campanhas de veículos
// pausadas e zeradas, herdadas de um uso antigo/compartilhado da conta; aqui ficam só a campanha
// ativa com números reais, as 3 de imóveis pausadas e algumas genéricas pausadas, para não poluir
// o protótipo com dezenas de linhas duplicadas e zeradas — ver nota no plano sobre confirmar com o time).
export const BING_ROWS: BingRow[] = [
  { nome: 'BR | Branding | MAX cliques', uf: 'BR', status: 'ativa', orcamentoDia: 59.2, impressoes: 3162, cliques: 367, ctr: 0.1161, cpc: 0.23, custo: 82.64, conversoes: 31 },
  { nome: '[IMÓVEIS] SC - Floripa - Head', uf: 'SC', status: 'pausada', orcamentoDia: 80, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, custo: 0, conversoes: 0 },
  { nome: '[IMÓVEIS] SC - BC - Head', uf: 'SC', status: 'pausada', orcamentoDia: 80, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, custo: 0, conversoes: 0 },
  { nome: 'Imóveis - SC - Itajaí - Head', uf: 'SC', status: 'pausada', orcamentoDia: 80, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, custo: 0, conversoes: 0 },
  { nome: 'Veículos - Top', uf: null, status: 'pausada', orcamentoDia: 80, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, custo: 0, conversoes: 0 },
  { nome: 'Geral - Concorrência', uf: null, status: 'pausada', orcamentoDia: 80, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, custo: 0, conversoes: 0 },
];

// Trovit — sem dados reais fornecidos ainda; placeholders genéricos até termos os nomes reais.
export const TROVIT_NOMES: string[] = [
  'BR | Venda',
  'BR | Aluguel',
  'SP | Venda',
  'RJ | Venda',
  'MG | Aluguel',
];
