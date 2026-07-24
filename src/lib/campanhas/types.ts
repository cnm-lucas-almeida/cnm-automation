export type Plataforma = 'google' | 'criteo' | 'bing' | 'trovit';
export type Transacao = 'Venda' | 'Aluguel' | 'Concorrentes' | 'PMAX' | 'Lançamentos' | 'Outro';
export type StatusCampanha = 'ativa' | 'pausada' | 'rascunho';

export interface Campanha {
  id: string;
  plataforma: Plataforma;
  nomeCampanha: string;
  tipoCampanha: string;
  uf: string | null;
  localidade: string;
  transacao: Transacao | null;
  utm: string;
  habitantes: number | null;
  status: StatusCampanha;
  isPlaceholder?: boolean;
  extras?: Record<string, string | number | null>;
}

export interface DailyMetric {
  data: string; // ISO yyyy-MM-dd
  leads: number;
  cliques: number;
  investimentoTotal: number;
  faturamento: number;
}

export interface CampanhaComSerie {
  campanha: Campanha;
  serie: DailyMetric[];
}

export const PLATAFORMAS: { value: Plataforma; label: string; logo: string }[] = [
  { value: 'google', label: 'Google Ads', logo: '/google_ads_logo_icon_169088.webp' },
  { value: 'criteo', label: 'Criteo', logo: '/Criteo-Logo-Orange.png' },
  { value: 'bing', label: 'Bing', logo: '/Microsoft_Advertising_Logo.png' },
  { value: 'trovit', label: 'Trovit', logo: '/Trovit_logo.svg.webp' },
];
