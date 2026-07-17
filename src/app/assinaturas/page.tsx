'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingUp, Wallet, CalendarDays, CalendarRange,
  Download, X, Search, ChevronUp, ChevronDown, ChevronsUpDown, Home, Car, ShieldAlert, ExternalLink, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import type { AssinaturasData, AssinaturaPF, Segmento } from '@/lib/assinaturas';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Granularidade = 'dia' | 'mes';
type SortCol = 'createdAt' | 'clienteNome' | 'planPrice' | 'adStatus';
type SortDir = 'asc' | 'desc';
type Preset = 'hoje' | 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';
type HoraModo = 'media' | 'dia';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  EXPIRED: 'Expirado',
  REJECTED: 'Rejeitado',
  UNDER_REVIEW: 'Em revisão',
  PENDING_APPROVAL: 'Aguardando aprovação',
  PENDING_PAYMENT: 'Aguardando pagamento',
  INACTIVE: 'Inativo',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-success-bg text-success',
  EXPIRED: 'bg-muted text-muted-foreground',
  REJECTED: 'bg-destructive/10 text-destructive',
  UNDER_REVIEW: 'bg-warning-bg text-warning',
  PENDING_APPROVAL: 'bg-warning-bg text-warning',
  PENDING_PAYMENT: 'bg-warning-bg text-warning',
  INACTIVE: 'bg-muted text-muted-foreground',
};

// Paleta categórica validada (8 matizes, ordem fixa CVD-safe) — ver skill de dataviz.
const PLANO_CORES = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];

/** Ordena por duração (extraída do nome do plano) pra cor seguir a identidade do plano, não seu rank por quantidade. */
function planoOrdemKey(nome: string) {
  const m = nome.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TZ_BR = 'America/Sao_Paulo';

/** Só pra strings de data pura 'YYYY-MM-DD' (sem horário) — força UTC pra não deslocar o dia. */
function fmtData(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

/** Pra timestamps reais (createdAt etc): sempre no fuso de Brasília, independente do fuso do navegador. */
function fmtDataBR(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ_BR });
}

function fmtDataHora(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ_BR });
}

/** Extrai ano/mês/dia/hora/dia-da-semana de um timestamp real no fuso de Brasília, independente do fuso do servidor/navegador. */
function brParts(d: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date(d));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: Number(get('hour')) % 24,
    weekday: get('weekday') as 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat',
  };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function diaSemanaAbrev(periodo: string) {
  const [y, m, d] = periodo.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function fmtDiaLabel(periodo: string) {
  const [, m, d] = periodo.split('-');
  return `${d}/${m} (${diaSemanaAbrev(periodo)})`;
}

/** Mesma convenção de dia usada nas séries vindas da API (fuso de Brasília), pra bucketar por hora/dia da semana sem divergir do resto da página. */
function diaKeyCliente(d: string): string {
  const { year, month, day } = brParts(d);
  return `${year}-${month}-${day}`;
}

function fmtHoraLabel(h: number) {
  return `${String(h).padStart(2, '0')}h`;
}

function fmtMesLabel(periodo: string) {
  const [y, m] = periodo.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (preset === 'hoje') {
    return { dataInicial: isoHoje(), dataFinal: isoHoje() };
  }
  if (preset === 'este_mes') {
    return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
  }
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: ultimoDia.toISOString().slice(0, 10) };
  }
  if (preset === 'este_ano') {
    return { dataInicial: `${hoje.getFullYear()}-01-01`, dataFinal: isoHoje() };
  }
  return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
}

function KpiCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol; current: SortCol; dir: SortDir;
  onSort: (col: SortCol) => void; children: React.ReactNode; className?: string;
}) {
  const active = current === col;
  return (
    <th onClick={() => onSort(col)}
      className={`py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors ${className ?? 'px-4'}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? dir === 'asc' ? <ChevronUp size={11} className="text-primary" /> : <ChevronDown size={11} className="text-primary" />
          : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  );
}

function CustomTooltip({ active, payload, granularidade }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{granularidade === 'dia' ? `${fmtData(d.periodo)} (${diaSemanaAbrev(d.periodo)})` : fmtMesLabel(d.periodo)}</p>
      <p>Assinaturas: <span className="font-semibold tabular-nums">{d.qtd}</span></p>
      <p>Valor: <span className="font-semibold tabular-nums">{fmtMoeda(d.valor)}</span></p>
    </div>
  );
}

function HoraTooltip({ active, payload, media }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{fmtHoraLabel(d.hora)}</p>
      <p>Assinaturas: <span className="font-semibold tabular-nums">{media ? d.qtd.toFixed(1) : d.qtd}</span></p>
      <p>Valor: <span className="font-semibold tabular-nums">{fmtMoeda(d.valor)}</span></p>
    </div>
  );
}

function SemanaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{d.label}</p>
      <p>Média: <span className="font-semibold tabular-nums">{d.media.toFixed(1)} assinatura(s)/dia</span></p>
      <p>Valor médio: <span className="font-semibold tabular-nums">{fmtMoeda(d.mediaValor)}</span></p>
    </div>
  );
}

function PlanoTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? (d.qtd / total) * 100 : 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{d.planName}</p>
      <p>Assinaturas: <span className="font-semibold tabular-nums">{d.qtd}</span> ({pct.toFixed(0)}%)</p>
      <p>Valor: <span className="font-semibold tabular-nums">{fmtMoeda(d.valor)}</span></p>
    </div>
  );
}

function BreakdownList({ title, items }: { title: string; items: { chave: string; qtd: number; valor: number }[] }) {
  const total = items.reduce((s, i) => s + i.qtd, 0) || 1;
  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
        {items.map((item) => (
          <div key={item.chave}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{STATUS_LABEL[item.chave] ?? item.chave}</span>
              <span className="text-muted-foreground tabular-nums">{item.qtd} · {fmtMoeda(item.valor)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${(item.qtd / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificacaoModal({ assinatura, onClose }: { assinatura: AssinaturaPF; onClose: () => void }) {
  const v = assinatura.verificacaoAntifraude;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><ShieldAlert size={16} className="text-warning" /> Verificação antifraude</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Anúncio #{assinatura.adId} · {assinatura.clienteNome}</p>
          </div>
          <button onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-3 text-sm">
          <p className="text-xs text-muted-foreground -mt-1">
            Verificação automática de risco (Procob), disparada por regra de negócio. Não indica fraude confirmada.
          </p>
          <div>
            <span className="text-muted-foreground text-xs">Motivo(s) do disparo</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {v.motivos.length > 0
                ? v.motivos.map((m, i) => (
                  <span key={i} className="inline-block text-[10px] font-medium px-2 py-1 rounded bg-warning-bg text-warning">{m}</span>
                ))
                : <span className="text-xs">—</span>}
            </div>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Verificado em</span><span className="font-medium">{fmtDataHora(v.sinalizadaEm)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Nome (Procob)</span><span className="font-medium">{v.procobNome || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Documento</span><span className="font-medium">{v.procobDocumento || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Endereço</span><span className="font-medium text-right">{v.procobEndereco || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IP do cliente</span><span className="font-medium">{v.ip || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Outro anúncio ligado</span><span className="font-medium">{v.outroAdId ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Outros clientes ligados</span><span className="font-medium">{v.outrosClientesIds?.join(', ') || '—'}</span></div>
        </div>
      </div>
    </div>
  );
}

export default function AssinaturasPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [segmento, setSegmento] = useState<'' | Segmento>('');
  const [adStatus, setAdStatus] = useState('');

  const [dados, setDados] = useState<AssinaturasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [somenteVerificacao, setSomenteVerificacao] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalVerificacao, setModalVerificacao] = useState<AssinaturaPF | null>(null);
  const [page, setPage] = useState(1);
  const [horaModo, setHoraModo] = useState<HoraModo>('media');
  const [diaSelecionadoHora, setDiaSelecionadoHora] = useState<string | null>(null);
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState<Set<number>>(new Set());

  const fetchDados = useCallback(async (di: string, df: string, seg: string, status: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/assinaturas', {
        params: { dataInicial: di, dataFinal: df, segment: seg || undefined, adStatus: status || undefined },
      });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    setReloading(true);
    setPage(1);
    fetchDados(dataInicial, dataFinal, segmento, adStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, segmento, adStatus]);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== 'personalizado') {
      const { dataInicial: di, dataFinal: df } = presetParaDatas(p);
      setDataInicial(di);
      setDataFinal(df);
    }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  }

  const serie = useMemo(() => {
    if (!dados) return [];
    return granularidade === 'dia' ? dados.seriePorDia : dados.seriePorMes;
  }, [dados, granularidade]);

  const diasNoPeriodo = useMemo(() => {
    if (!dados) return 1;
    const di = new Date(`${dados.periodo.dataInicial}T00:00:00Z`).getTime();
    const df = new Date(`${dados.periodo.dataFinal}T00:00:00Z`).getTime();
    return Math.max(1, Math.round((df - di) / 86400000) + 1);
  }, [dados]);

  const diaEfetivoHora = diaSelecionadoHora
    ?? (dados && dados.seriePorDia.length > 0 ? dados.seriePorDia[dados.seriePorDia.length - 1].periodo : null);

  const serieHora = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hora) => ({ hora, qtd: 0, valor: 0 }));
    if (!dados) return buckets;
    if (horaModo === 'dia') {
      if (!diaEfetivoHora) return buckets;
      for (const a of dados.assinaturas) {
        if (diaKeyCliente(a.createdAt) === diaEfetivoHora) {
          const h = brParts(a.createdAt).hour;
          buckets[h].qtd += 1;
          buckets[h].valor += a.planPrice;
        }
      }
      return buckets;
    }
    for (const a of dados.assinaturas) {
      const h = brParts(a.createdAt).hour;
      buckets[h].qtd += 1;
      buckets[h].valor += a.planPrice;
    }
    return buckets.map((b) => ({ ...b, qtd: b.qtd / diasNoPeriodo, valor: b.valor / diasNoPeriodo }));
  }, [dados, horaModo, diaEfetivoHora, diasNoPeriodo]);

  const serieSemana = useMemo(() => {
    const buckets = DIAS_SEMANA.map((label, idx) => ({ idx, label, qtd: 0, valor: 0, dias: 0 }));
    if (!dados) return buckets.map((b) => ({ ...b, media: 0, mediaValor: 0 }));
    const di = new Date(`${dados.periodo.dataInicial}T00:00:00Z`).getTime();
    const df = new Date(`${dados.periodo.dataFinal}T00:00:00Z`).getTime();
    for (let t = di; t <= df; t += 86400000) {
      buckets[new Date(t).getUTCDay()].dias += 1;
    }
    for (const a of dados.assinaturas) {
      const wd = WEEKDAY_INDEX[brParts(a.createdAt).weekday];
      buckets[wd].qtd += 1;
      buckets[wd].valor += a.planPrice;
    }
    return buckets.map((b) => ({
      ...b,
      media: b.dias > 0 ? b.qtd / b.dias : 0,
      mediaValor: b.dias > 0 ? b.valor / b.dias : 0,
    }));
  }, [dados]);

  function toggleDiaSemana(idx: number) {
    setDiasSemanaSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const resumoSemanaSelecionada = useMemo(() => {
    if (diasSemanaSelecionados.size === 0) return null;
    const selecionados = serieSemana.filter((b) => diasSemanaSelecionados.has(b.idx));
    return {
      labels: selecionados.map((b) => b.label).join(' + '),
      media: selecionados.reduce((s, b) => s + b.media, 0),
      valor: selecionados.reduce((s, b) => s + b.mediaValor, 0),
    };
  }, [diasSemanaSelecionados, serieSemana]);

  const planoColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!dados) return map;
    const nomes = Array.from(new Set(dados.rankingPlanos.map((p) => p.planName))).sort(
      (a, b) => planoOrdemKey(a) - planoOrdemKey(b)
    );
    nomes.forEach((nome, i) => map.set(nome, PLANO_CORES[i % PLANO_CORES.length]));
    return map;
  }, [dados]);

  const totalPlanos = dados?.rankingPlanos.reduce((s, p) => s + p.qtd, 0) ?? 0;

  const assinaturasFiltradas = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    let lista = dados.assinaturas;
    if (somenteVerificacao) lista = lista.filter((a) => a.verificacaoAntifraude.sinalizada);
    if (termo) {
      lista = lista.filter((a) =>
        a.clienteNome.toLowerCase().includes(termo) ||
        a.clienteEmail.toLowerCase().includes(termo) ||
        String(a.adId).includes(termo) ||
        (a.clienteCpfCnpj ?? '').includes(termo)
      );
    }
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'createdAt') v = a.createdAt.localeCompare(b.createdAt);
      else if (sortCol === 'clienteNome') v = a.clienteNome.localeCompare(b.clienteNome);
      else if (sortCol === 'planPrice') v = a.planPrice - b.planPrice;
      else v = a.adStatus.localeCompare(b.adStatus);
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, busca, somenteVerificacao, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(assinaturasFiltradas.length / PAGE_SIZE));
  const assinaturasPaginadas = assinaturasFiltradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportarCsv() {
    if (!dados) return;
    const header = ['Data', 'Cliente', 'E-mail', 'CPF/CNPJ', 'Cidade', 'UF', 'Segmento', 'Plano', 'Valor', 'Pagamento', 'Status anúncio', 'Anúncio ID', 'Link anúncio', 'Verificação antifraude', 'Motivo(s)'];
    const linhas = assinaturasFiltradas.map((a) => [
      fmtDataBR(a.createdAt), a.clienteNome, a.clienteEmail, a.clienteCpfCnpj ?? '', a.clienteCidade ?? '', a.clienteUf ?? '',
      a.segment === 'VEHICLE' ? 'Veículo' : 'Imóvel', a.planName, a.planPrice.toFixed(2), a.paymentMethod ?? '',
      STATUS_LABEL[a.adStatus] ?? a.adStatus, a.adId, a.adUrl, a.verificacaoAntifraude.sinalizada ? 'Sim' : 'Não',
      a.verificacaoAntifraude.motivos.join(' | '),
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-assinaturas-pf-${dataInicial}-a-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando assinaturas do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(dataInicial, dataFinal, segmento, adStatus); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className={`max-w-[2200px] mx-auto p-6 space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assinaturas PF</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={segmento}
            onChange={(v) => setSegmento(v as '' | Segmento)}
            className="min-w-[140px]"
            options={[
              { value: '', label: 'Todos segmentos' },
              { value: 'REALTY', label: 'Imóvel' },
              { value: 'VEHICLE', label: 'Veículo' },
            ]}
          />
          <Select
            value={adStatus}
            onChange={setAdStatus}
            className="min-w-[170px]"
            options={[
              { value: '', label: 'Todos os status' },
              ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            value={preset}
            onChange={(v) => aplicarPreset(v as Preset)}
            className="min-w-[150px]"
            options={[
              { value: 'hoje', label: 'Hoje' },
              { value: 'este_mes', label: 'Este mês' },
              { value: 'mes_passado', label: 'Mês passado' },
              { value: 'este_ano', label: 'Este ano' },
              { value: 'personalizado', label: 'Personalizado' },
            ]}
          />
          {preset === 'personalizado' && (
            <>
              <DatePicker value={dataInicial} onChange={setDataInicial} placeholder="Data inicial" maxDate={dataFinal} />
              <span className="text-muted-foreground text-xs">até</span>
              <DatePicker value={dataFinal} onChange={setDataFinal} placeholder="Data final" minDate={dataInicial} />
            </>
          )}
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal, segmento, adStatus); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Assinaturas hoje" value={dados.hoje.qtd.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.hoje.valor)}
          icon={CalendarDays} color="#323131" />
        <KpiCard title="Assinaturas este mês" value={dados.esteMes.qtd.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.esteMes.valor)}
          icon={CalendarRange} color="#323131" />
        <KpiCard title="Total no período" value={dados.kpis.totalAssinaturas.toLocaleString('pt-BR')}
          sub={`${fmtMoeda(dados.kpis.valorTotal)} · ${dados.kpis.imoveis} imóveis / ${dados.kpis.veiculos} veículos`}
          icon={Wallet} color="#1E7A34" />
        <KpiCard title="Ticket médio" value={fmtMoeda(dados.kpis.ticketMedio)}
          sub={dados.kpis.comVerificacaoAntifraude > 0 ? `${dados.kpis.comVerificacaoAntifraude} com verificação antifraude` : 'sem verificações antifraude'}
          icon={dados.kpis.comVerificacaoAntifraude > 0 ? ShieldAlert : TrendingUp} color={dados.kpis.comVerificacaoAntifraude > 0 ? '#CA8A04' : '#1E7A34'} />
      </div>

      {/* Evolução */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Evolução de assinaturas
          </h2>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button onClick={() => setGranularidade('dia')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              Por dia
            </button>
            <button onClick={() => setGranularidade('mes')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              Por mês
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={serie} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis
              dataKey="periodo"
              tickFormatter={granularidade === 'dia' ? fmtDiaLabel : fmtMesLabel}
              tick={{ fontSize: 10 }}
              interval={granularidade === 'dia' ? Math.max(0, Math.floor(serie.length / 20)) : 0}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip granularidade={granularidade} />} />
            <Bar
              dataKey="qtd" name="Assinaturas" fill="#CA3500" radius={[2, 2, 0, 0]}
              cursor={granularidade === 'dia' ? 'pointer' : undefined}
              onClick={(entry: any) => {
                if (granularidade !== 'dia') return;
                const periodo = entry?.payload?.periodo ?? entry?.periodo;
                if (periodo) { setHoraModo('dia'); setDiaSelecionadoHora(periodo); }
              }}
            >
              {serie.length <= 45 && (
                <LabelList dataKey="qtd" position="top" style={{ fontSize: 10, fill: '#6F686B' }} />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {granularidade === 'dia' && (
          <p className="text-[11px] text-muted-foreground mt-2">Clique numa barra para ver a evolução por horário daquele dia.</p>
        )}
      </div>

      {/* Evolução por horário + Padrão por dia da semana */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock size={16} className="text-primary" /> Evolução por horário
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {horaModo === 'dia' && dados.seriePorDia.length > 0 && (
                <Select
                  value={diaEfetivoHora ?? ''}
                  onChange={setDiaSelecionadoHora}
                  className="min-w-[160px]"
                  options={dados.seriePorDia.map((s) => ({ value: s.periodo, label: fmtDiaLabel(s.periodo) })).reverse()}
                />
              )}
              <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                <button onClick={() => setHoraModo('media')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${horaModo === 'media' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Média do período
                </button>
                <button onClick={() => setHoraModo('dia')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${horaModo === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Dia específico
                </button>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={serieHora} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="horaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#323131" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#323131" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
              <XAxis dataKey="hora" tickFormatter={fmtHoraLabel} tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<HoraTooltip media={horaModo === 'media'} />} />
              <Area type="monotone" dataKey="qtd" name="Assinaturas" stroke="#323131" strokeWidth={2}
                fill="url(#horaGradient)" dot={{ r: 2, fill: '#323131' }} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-2">
            {horaModo === 'media'
              ? `Média de assinaturas por hora, considerando os ${diasNoPeriodo} dia(s) do período selecionado.`
              : diaEfetivoHora ? `Assinaturas hora a hora em ${fmtDiaLabel(diaEfetivoHora)}.` : 'Selecione um dia.'}
          </p>
        </div>

        <div className="rounded-lg border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarRange size={16} className="text-primary" /> Padrão por dia da semana
            </h2>
            {diasSemanaSelecionados.size > 0 && (
              <button onClick={() => setDiasSemanaSelecionados(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Limpar seleção
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serieSemana} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<SemanaTooltip />} />
              <Bar dataKey="media" name="Média" radius={[2, 2, 0, 0]} cursor="pointer"
                onClick={(entry: any) => { const idx = entry?.payload?.idx; if (idx !== undefined) toggleDiaSemana(idx); }}>
                {serieSemana.map((b) => (
                  <Cell key={b.idx} fill={
                    diasSemanaSelecionados.size === 0 ? '#E49A7F'
                      : diasSemanaSelecionados.has(b.idx) ? '#CA3500' : '#E4E1E1'
                  } />
                ))}
                <LabelList dataKey="media" position="top" formatter={(v: any) => Number(v).toFixed(1)} style={{ fontSize: 10, fill: '#6F686B' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-2">
            {resumoSemanaSelecionada
              ? `${resumoSemanaSelecionada.labels}: média combinada de ${resumoSemanaSelecionada.media.toFixed(1)} assinatura(s)/dia · ${fmtMoeda(resumoSemanaSelecionada.valor)}.`
              : 'Clique num dia da semana para comparar (ex: selecione Seg, Ter e Qua).'}
          </p>
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownList title="Por status do anúncio" items={dados.porStatusAnuncio} />
        <BreakdownList title="Por forma de pagamento" items={dados.porFormaPagamento} />

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Divisão de planos vendidos</h2>
          {dados.rankingPlanos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados no período.</p>
          ) : (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={130} height={130} className="flex-shrink-0">
                <PieChart>
                  <Pie
                    data={dados.rankingPlanos} dataKey="qtd" nameKey="planName" cx="50%" cy="50%"
                    innerRadius={38} outerRadius={62} paddingAngle={2}
                  >
                    {dados.rankingPlanos.map((p) => (
                      <Cell key={p.planName} fill={planoColorMap.get(p.planName)} stroke="var(--card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<PlanoTooltip total={totalPlanos} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 min-w-0 space-y-2">
                {dados.rankingPlanos.map((p) => (
                  <div key={p.planName} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: planoColorMap.get(p.planName) }} />
                      <span className="truncate font-medium">{p.planName}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums flex-shrink-0">
                      {p.qtd} · {totalPlanos > 0 ? ((p.qtd / totalPlanos) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
            {segmento === 'VEHICLE' ? <Car size={15} className="text-primary" /> : <Home size={15} className="text-primary" />} Assinaturas
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={somenteVerificacao} onChange={(e) => { setSomenteVerificacao(e.target.checked); setPage(1); }} />
            Somente com verificação antifraude
          </label>
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              placeholder="Buscar por nome, e-mail, CPF ou ID do anúncio…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-xs text-muted-foreground">{assinaturasFiltradas.length} assinatura(s)</span>
        </div>

        {assinaturasFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma assinatura encontrada para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="createdAt" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Data</SortTh>
                  <SortTh col="clienteNome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">Cliente</SortTh>
                  <th className="px-4 py-3 font-semibold">Cidade/UF</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <SortTh col="planPrice" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Valor</SortTh>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <SortTh col="adStatus" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-center">Status</SortTh>
                  <th className="px-4 py-3 font-semibold text-center">Anúncio</th>
                  <th className="px-5 py-3 font-semibold text-center">Antifraude</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assinaturasPaginadas.map((a) => (
                  <tr key={a.subscriptionId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtDataHora(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-1.5">
                        {a.segment === 'VEHICLE' ? <Car size={12} className="text-muted-foreground flex-shrink-0" /> : <Home size={12} className="text-muted-foreground flex-shrink-0" />}
                        {a.clienteNome}
                        {a.clienteCongelado && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning-bg text-warning">Congelado</span>}
                        {a.clienteDeletado && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Excluído</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{a.clienteEmail}{a.clienteCpfCnpj ? ` · ${a.clienteCpfCnpj}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{a.clienteCidade ? `${a.clienteCidade}/${a.clienteUf ?? ''}` : '—'}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{a.planName}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs whitespace-nowrap">{fmtMoeda(a.planPrice)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{a.paymentMethod ?? '—'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_BADGE[a.adStatus] ?? 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABEL[a.adStatus] ?? a.adStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a href={a.adUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        #{a.adId} <ExternalLink size={11} />
                      </a>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {a.verificacaoAntifraude.sinalizada ? (
                        <button onClick={() => setModalVerificacao(a)}
                          title={a.verificacaoAntifraude.motivos.join(' | ')}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning hover:opacity-80 transition-opacity">
                          <ShieldAlert size={11} /> Ver
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40 hover:bg-muted transition-colors">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40 hover:bg-muted transition-colors">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {modalVerificacao && (
        <VerificacaoModal assinatura={modalVerificacao} onClose={() => setModalVerificacao(null)} />
      )}
    </div>
  );
}
