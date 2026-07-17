'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Users, TrendingUp, Wallet, Snowflake, XCircle,
  Download, X, Search, ChevronUp, ChevronDown, ChevronsUpDown, ShoppingCart,
  Maximize2, Minimize2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import type { VendasData, VendaContrato, RankingVendedor, Segmento } from '@/lib/vendas';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Granularidade = 'dia' | 'mes';
type SortCol = 'nome' | 'vendas' | 'valorTotal' | 'ativas' | 'ticketMedio';
type SortDir = 'asc' | 'desc';
type Preset = 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';
type SegmentoFiltro = 'todos' | 'imoveis' | 'veiculos';

const SEG_COLORS: Record<Segmento, string> = { imoveis: '#CA3500', veiculos: '#8A8386', outro: '#C9C5C6' };
const SEG_LABELS: Record<Segmento, string> = { imoveis: 'Imóveis', veiculos: 'Veículos', outro: 'Outros' };
const TOTAL_SLIDES = 3;

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtDiaLabel(periodo: string) {
  const [, m, d] = periodo.split('-');
  return `${d}/${m}`;
}

function fmtMesLabel(periodo: string) {
  const [y, m] = periodo.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function diaKeyClient(d: string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function mesKeyClient(d: string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
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
  title, value, sub, icon: Icon, color, big,
}: {
  title: string; value: string | number; sub?: string; icon: any; color: string; big?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border ${big ? 'p-8' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-muted-foreground uppercase tracking-wider ${big ? 'text-sm' : 'text-[11px]'}`}>{title}</p>
          <p className={`font-bold mt-1 tabular-nums ${big ? 'text-5xl' : 'text-2xl'}`} style={{ color }}>{value}</p>
          {sub && <p className={`text-muted-foreground mt-1 ${big ? 'text-base' : 'text-xs'}`}>{sub}</p>}
        </div>
        <Icon size={big ? 32 : 20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
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
      <p className="font-semibold mb-1">{granularidade === 'dia' ? fmtData(d.periodo) : fmtMesLabel(d.periodo)}</p>
      <p>Vendas: <span className="font-semibold tabular-nums">{d.qtdVendas}</span></p>
      <p>Valor: <span className="font-semibold tabular-nums">{fmtMoeda(d.valor)}</span></p>
    </div>
  );
}

function SegmentedTooltip({ active, payload, granularidade, segmentos }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = segmentos.reduce((s: number, seg: Segmento) => s + (d[seg] ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold mb-1">{granularidade === 'dia' ? fmtData(d.periodo) : fmtMesLabel(d.periodo)}</p>
      {segmentos.map((seg: Segmento) => (
        <p key={seg} style={{ color: SEG_COLORS[seg] }}>
          {SEG_LABELS[seg]}: <span className="font-semibold tabular-nums">{d[seg] ?? 0}</span>
        </p>
      ))}
      <p className="pt-1 mt-1 border-t border-border">Total: <span className="font-semibold tabular-nums">{total}</span></p>
    </div>
  );
}

function VendedorModal({
  vendedor, vendas, onClose,
}: { vendedor: RankingVendedor; vendas: VendaContrato[]; onClose: () => void }) {
  const contratos = useMemo(
    () => vendas.filter((v) => v.idVendedor === vendedor.idVendedor).sort((a, b) => a.dataContrato.localeCompare(b.dataContrato)),
    [vendas, vendedor.idVendedor]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-[95vw] xl:max-w-6xl max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold">{vendedor.nome}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vendedor.squadNome ?? 'Sem squad'} · {vendedor.treinadorNome ? `treinador: ${vendedor.treinadorNome}` : 'sem treinador'} · {contratos.length} contrato(s) no período
            </p>
          </div>
          <button onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted border-b border-border">
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wider text-left">
                <th className="px-6 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold text-right">Data contrato</th>
                <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                <th className="px-6 py-2.5 font-semibold text-center">Paga</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contratos.map((c) => (
                <tr key={c.idContrato} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-2.5">
                    <div className="font-medium">{c.nomeFantasia}</div>
                    <div className="text-xs text-muted-foreground">#{c.idContrato}{c.lancamento ? ' · lançamento' : ''}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{fmtData(c.dataContrato)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums">{fmtMoeda(c.valor)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {c.status === 'ativa' && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">Ativa</span>}
                    {c.status === 'congelada' && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">Congelada</span>}
                    {c.status === 'cancelada' && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">Cancelada</span>}
                  </td>
                  <td className="px-6 py-2.5 text-center">
                    {c.paga
                      ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">Sim</span>
                      : <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">Não</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function VendasPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [segmento, setSegmento] = useState<SegmentoFiltro>('todos');

  const [dados, setDados] = useState<VendasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('vendas');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalVendedor, setModalVendedor] = useState<RankingVendedor | null>(null);

  const [apresentacao, setApresentacao] = useState(false);
  const [slideAtual, setSlideAtual] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDados = useCallback(async (di: string, df: string, seg: SegmentoFiltro) => {
    setError(null);
    try {
      const res = await axios.get('/api/vendas', { params: { dataInicial: di, dataFinal: df, segmento: seg } });
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
    fetchDados(dataInicial, dataFinal, segmento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, segmento]);

  // Modo apresentação: acompanha o estado de fullscreen (ex.: usuário aperta Esc) e mantém os dados atualizados sozinho.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setApresentacao(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!apresentacao) return;
    const id = setInterval(() => {
      fetchDados(dataInicial, dataFinal, segmento);
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [apresentacao, dataInicial, dataFinal, segmento, fetchDados]);

  // Troca automática de slide (KPIs/evolução → squads → ranking por segmento) a cada 10s.
  useEffect(() => {
    if (!apresentacao) return;
    const id = setInterval(() => {
      setSlideAtual((s) => (s + 1) % TOTAL_SLIDES);
    }, 10 * 1000);
    return () => clearInterval(id);
  }, [apresentacao]);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Auto-inicia o modo apresentação quando aberto via ?apresentacao=1 (usado pela tela /apresentacao)
  useEffect(() => {
    if (loading) return;
    if (!apresentacao && new URLSearchParams(window.location.search).get('apresentacao') === '1') {
      setApresentacao(true);
      setSlideAtual(0);
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function toggleApresentacao() {
    if (apresentacao) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setApresentacao(false);
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setApresentacao(true);
      setSlideAtual(0);
    }
  }

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
  }

  const serie = useMemo(() => {
    if (!dados) return [];
    return granularidade === 'dia' ? dados.seriePorDia : dados.seriePorMes;
  }, [dados, granularidade]);

  const serieSegmentada = useMemo(() => {
    if (!dados) return [];
    const map = new Map<string, Record<Segmento, number> & { periodo: string }>();
    for (const v of dados.vendas) {
      const key = granularidade === 'dia' ? diaKeyClient(v.dataContrato) : mesKeyClient(v.dataContrato);
      const entry = map.get(key) ?? { periodo: key, imoveis: 0, veiculos: 0, outro: 0 };
      entry[v.segmento] += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [dados, granularidade]);

  const segmentosPresentes = useMemo(() => {
    return (['imoveis', 'veiculos', 'outro'] as Segmento[]).filter((seg) => serieSegmentada.some((d) => d[seg] > 0));
  }, [serieSegmentada]);

  const rankingPorSegmento = useMemo(() => {
    if (!dados) return { imoveis: [], veiculos: [] } as Record<'imoveis' | 'veiculos', { idVendedor: number; nome: string; vendas: number }[]>;
    const build = (seg: 'imoveis' | 'veiculos') => {
      const map = new Map<number, { idVendedor: number; nome: string; vendas: number }>();
      for (const v of dados.vendas) {
        if (v.segmento !== seg) continue;
        const entry = map.get(v.idVendedor) ?? { idVendedor: v.idVendedor, nome: v.vendedorNome, vendas: 0 };
        entry.vendas += 1;
        map.set(v.idVendedor, entry);
      }
      return Array.from(map.values()).sort((a, b) => b.vendas - a.vendas).slice(0, 10);
    };
    return { imoveis: build('imoveis'), veiculos: build('veiculos') };
  }, [dados]);

  const vendedoresFiltrados = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    let lista = dados.rankingVendedores;
    if (termo) {
      lista = lista.filter((v) =>
        v.nome.toLowerCase().includes(termo) ||
        (v.squadNome ?? '').toLowerCase().includes(termo)
      );
    }
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'nome') v = a.nome.localeCompare(b.nome);
      else if (sortCol === 'vendas') v = a.vendas - b.vendas;
      else if (sortCol === 'valorTotal') v = a.valorTotal - b.valorTotal;
      else if (sortCol === 'ativas') v = a.ativas - b.ativas;
      else v = a.ticketMedio - b.ticketMedio;
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, busca, sortCol, sortDir]);

  function exportarCsv() {
    if (!dados) return;
    const header = ['Vendedor', 'Squad', 'Treinador', 'Vendas', 'Ativas', 'Pagas', 'Congeladas', 'Canceladas', 'Valor Total', 'Valor Ativas', 'Ticket Médio'];
    const linhas = vendedoresFiltrados.map((v) => [
      v.nome, v.squadNome ?? '', v.treinadorNome ?? '', v.vendas, v.ativas, v.pagas, v.congeladas, v.canceladas,
      v.valorTotal.toFixed(2), v.valorAtivas.toFixed(2), v.ticketMedio.toFixed(2),
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-vendas-${dataInicial}-a-${dataFinal}.csv`;
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
        <p className="text-sm font-medium">Carregando vendas do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(dataInicial, dataFinal, segmento); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div ref={containerRef}
      className={`mx-auto transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''} ${apresentacao ? 'max-w-none bg-background p-10 h-screen flex flex-col gap-5 overflow-hidden' : 'max-w-[1800px] p-6 space-y-5'}`}>

      {/* Header */}
      <div className={`flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 ${apresentacao ? 'shrink-0' : ''}`}>
        <div>
          <h1 className={apresentacao ? 'text-4xl font-bold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>Relatório de Vendas</h1>
          <p className={`text-muted-foreground mt-0.5 flex items-center gap-2 ${apresentacao ? 'text-base' : 'text-sm'}`}>
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
        {apresentacao ? (
          <button onClick={toggleApresentacao}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Minimize2 size={14} /> Sair da apresentação
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={preset}
              onChange={(v) => aplicarPreset(v as Preset)}
              className="min-w-[170px]"
              options={[
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
            <Select
              value={segmento}
              onChange={(v) => setSegmento(v as SegmentoFiltro)}
              className="min-w-[150px]"
              options={[
                { value: 'todos', label: 'Todos os segmentos' },
                { value: 'imoveis', label: 'Imóveis' },
                { value: 'veiculos', label: 'Veículos' },
              ]}
            />
            <button onClick={exportarCsv}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal, segmento); }}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw size={14} /> Atualizar
            </button>
            <button onClick={toggleApresentacao}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Maximize2 size={14} /> Modo apresentação
            </button>
          </div>
        )}
      </div>

      {/* Indicador de slides (modo apresentação) */}
      {apresentacao && (
        <div className="flex items-center justify-center gap-2 shrink-0">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all duration-300 ${slideAtual === i ? 'w-10 bg-primary' : 'w-2 bg-border'}`} />
          ))}
        </div>
      )}

      {/* Slide 1: KPIs + Evolução de vendas */}
      {(!apresentacao || slideAtual === 0) && (
        <>
          <div className={`grid grid-cols-2 lg:grid-cols-4 ${apresentacao ? 'gap-6 shrink-0' : 'gap-3'}`}>
            <KpiCard big={apresentacao} title="Total de vendas" value={dados.kpis.totalVendas.toLocaleString('pt-BR')}
              sub={`ticket médio ${fmtMoeda(dados.kpis.ticketMedio)}`}
              icon={ShoppingCart} color="#323131" />
            <KpiCard big={apresentacao} title="Valor total" value={fmtMoeda(dados.kpis.valorTotal)}
              sub={`ativas: ${fmtMoeda(dados.kpis.valorAtivas)}`}
              icon={Wallet} color="#1E7A34" />
            <KpiCard big={apresentacao} title="Vendas ativas" value={dados.kpis.ativas.toLocaleString('pt-BR')}
              sub={`${dados.kpis.pagas} pagas · ${dados.kpis.pendentes} pendentes`}
              icon={TrendingUp} color="#1E7A34" />
            <KpiCard big={apresentacao} title="Congeladas / Canceladas" value={`${dados.kpis.congeladas} / ${dados.kpis.canceladas}`}
              sub="no período selecionado"
              icon={dados.kpis.canceladas > 0 ? XCircle : Snowflake} color="#CA3500" />
          </div>

          <div className={`rounded-lg border border-border ${apresentacao ? 'p-8 flex-1 min-h-0 flex flex-col' : 'p-5'}`}>
            <div className={`flex items-center justify-between mb-4 ${apresentacao ? 'shrink-0' : ''}`}>
              <h2 className={`font-semibold flex items-center gap-2 ${apresentacao ? 'text-lg' : 'text-sm'}`}>
                <TrendingUp size={apresentacao ? 20 : 16} className="text-primary" /> Evolução de vendas
              </h2>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button onClick={() => setGranularidade('dia')}
                  className={`rounded font-medium transition-colors ${apresentacao ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs'} ${granularidade === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Por dia
                </button>
                <button onClick={() => setGranularidade('mes')}
                  className={`rounded font-medium transition-colors ${apresentacao ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs'} ${granularidade === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Por mês
                </button>
              </div>
            </div>
            <div className={apresentacao ? 'flex-1 min-h-0' : ''}>
              <ResponsiveContainer width="100%" height={apresentacao ? '100%' : 260}>
                {apresentacao ? (
                  <BarChart data={serieSegmentada} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                    <XAxis
                      dataKey="periodo"
                      tickFormatter={granularidade === 'dia' ? fmtDiaLabel : fmtMesLabel}
                      tick={{ fontSize: 13 }}
                      interval={granularidade === 'dia' ? Math.max(0, Math.floor(serieSegmentada.length / 20)) : 0}
                    />
                    <YAxis tick={{ fontSize: 13 }} />
                    <Tooltip content={<SegmentedTooltip granularidade={granularidade} segmentos={segmentosPresentes} />} />
                    <Legend wrapperStyle={{ fontSize: 14 }} formatter={(value: string) => SEG_LABELS[value as Segmento] ?? value} />
                    {segmentosPresentes.map((seg) => (
                      <Bar key={seg} dataKey={seg} name={seg} stackId="vendas" fill={SEG_COLORS[seg]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                ) : (
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
                    <Bar dataKey="qtdVendas" name="Vendas" fill="#CA3500" radius={[2, 2, 0, 0]}>
                      {serie.length <= 45 && (
                        <LabelList dataKey="qtdVendas" position="top" style={{ fontSize: 10, fill: '#6F686B' }} />
                      )}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Slide 2: Ranking squads */}
      {(!apresentacao || slideAtual === 1) && dados.rankingSquads.length > 0 && (
        <div className={`rounded-lg border border-border ${apresentacao ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
          <div className={`px-5 py-4 border-b border-border flex items-center justify-between ${apresentacao ? 'shrink-0' : ''}`}>
            <h2 className={`font-semibold flex items-center gap-2 ${apresentacao ? 'text-lg' : 'text-sm'}`}>
              <Users size={apresentacao ? 20 : 15} className="text-primary" /> Vendas por squad
            </h2>
            <span className={`text-muted-foreground ${apresentacao ? 'text-sm' : 'text-xs'}`}>{dados.rankingSquads.length} squad(s)</span>
          </div>
          <div className={`overflow-x-auto ${apresentacao ? 'flex-1 min-h-0 overflow-y-auto flex flex-col justify-center' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-muted-foreground uppercase tracking-wider border-b border-border ${apresentacao ? 'text-sm' : 'text-[11px]'}`}>
                  <th className={`px-5 font-semibold ${apresentacao ? 'py-4' : 'py-2.5'}`}>Squad</th>
                  <th className={`px-4 font-semibold text-right ${apresentacao ? 'py-4' : 'py-2.5'}`}>Vendas</th>
                  <th className={`px-4 font-semibold text-right ${apresentacao ? 'py-4' : 'py-2.5'}`}>Ativas</th>
                  <th className={`px-4 font-semibold text-right ${apresentacao ? 'py-4' : 'py-2.5'}`}>Congeladas</th>
                  <th className={`px-4 font-semibold text-right ${apresentacao ? 'py-4' : 'py-2.5'}`}>Canceladas</th>
                  <th className={`px-5 font-semibold text-right ${apresentacao ? 'py-4' : 'py-2.5'}`}>Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dados.rankingSquads.map((s) => (
                  <tr key={s.squadNome} className={`hover:bg-muted/50 transition-colors ${apresentacao ? 'text-base' : ''}`}>
                    <td className={`px-5 font-medium ${apresentacao ? 'py-4' : 'py-2.5'}`}>{s.squadNome}</td>
                    <td className={`px-4 text-right tabular-nums ${apresentacao ? 'py-4' : 'py-2.5 text-xs'}`}>{s.vendas}</td>
                    <td className={`px-4 text-right tabular-nums text-success ${apresentacao ? 'py-4' : 'py-2.5 text-xs'}`}>{s.ativas}</td>
                    <td className={`px-4 text-right tabular-nums text-warning ${apresentacao ? 'py-4' : 'py-2.5 text-xs'}`}>{s.congeladas}</td>
                    <td className={`px-4 text-right tabular-nums text-muted-foreground ${apresentacao ? 'py-4' : 'py-2.5 text-xs'}`}>{s.canceladas}</td>
                    <td className={`px-5 text-right tabular-nums font-semibold ${apresentacao ? 'py-4' : 'py-2.5 text-xs'}`}>{fmtMoeda(s.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide 3: Top 10 vendedores por segmento */}
      {apresentacao && slideAtual === 2 && (
        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
          {(['imoveis', 'veiculos'] as const).map((seg) => (
            <div key={seg} className="rounded-lg border border-border p-8 flex flex-col">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 shrink-0">
                <Users size={20} className="text-primary" /> Top 10 vendedores · {SEG_LABELS[seg]}
              </h2>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingPorSegmento[seg]} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 13 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" width={230} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="vendas" name="Vendas" fill={SEG_COLORS[seg]} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="vendas" position="right" style={{ fontSize: 13, fill: '#323131' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ranking vendedores (apenas no modo normal) */}
      {!apresentacao && (
        <div className="rounded-lg border border-border">
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
              <Users size={15} className="text-primary" /> Vendas por vendedor
            </h2>
            <div className="relative flex-1 min-w-[220px] max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por vendedor ou squad…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <span className="text-xs text-muted-foreground">{vendedoresFiltrados.length} vendedor(es)</span>
          </div>

          {vendedoresFiltrados.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum vendedor encontrado para este filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                    <SortTh col="nome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Vendedor</SortTh>
                    <SortTh col="vendas" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Vendas</SortTh>
                    <SortTh col="ativas" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Ativas</SortTh>
                    <th className="px-4 py-3 font-semibold text-right">Pagas</th>
                    <th className="px-4 py-3 font-semibold text-right">Congeladas</th>
                    <th className="px-4 py-3 font-semibold text-right">Canceladas</th>
                    <SortTh col="valorTotal" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Valor total</SortTh>
                    <SortTh col="ticketMedio" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5 text-right">Ticket médio</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vendedoresFiltrados.map((v) => (
                    <tr key={v.idVendedor} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setModalVendedor(v)}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{v.nome}</div>
                        <div className="text-xs text-muted-foreground">{v.squadNome ?? 'Sem squad'}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{v.vendas}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-success">{v.ativas}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{v.pagas}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-warning">{v.congeladas}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{v.canceladas}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(v.valorTotal)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-xs">{fmtMoeda(v.ticketMedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalVendedor && (
        <VendedorModal vendedor={modalVendedor} vendas={dados.vendas} onClose={() => setModalVendedor(null)} />
      )}
    </div>
  );
}
