'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingDown, Wallet, ShoppingCart, Undo2, Megaphone, Repeat2,
  Download, Search, ChevronUp, ChevronDown, ChevronsUpDown, Maximize2, Minimize2,
} from 'lucide-react';
import {
  BarChart, Bar, ComposedChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import type { CarrinhoData, CarrinhoUnico } from '@/lib/carrinho';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Granularidade = 'dia' | 'mes';
type SortCol = 'cliente' | 'valorAnuncio' | 'valorPlano' | 'totalToques' | 'primeiroToqueEm';
type SortDir = 'asc' | 'desc';
type Preset = 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';

const TOTAL_SLIDES = 3;
const SEG_FALLBACK_PALETTE = ['#1E7A34', '#C9A227', '#5B6EE1'];
const FUNIL_CORES = ['#CA3500', '#D6572A', '#E27954', '#EE9B7E', '#F9BDA8'];

function corSegmento(seg: string, idx: number): string {
  const s = seg.toLowerCase();
  if (s.includes('imov') || s.includes('realty') || s === 'imob' || s === 'corretor') return '#CA3500';
  if (s.includes('veic') || s.includes('vehicle') || s.startsWith('revenda')) return '#8A8386';
  return SEG_FALLBACK_PALETTE[idx % SEG_FALLBACK_PALETTE.length];
}

function labelSegmento(seg: string): string {
  const s = seg.toLowerCase();
  if (s.includes('imov') || s.includes('realty') || s === 'imob' || s === 'corretor') return 'Imóveis';
  if (s.includes('veic') || s.includes('vehicle') || s.startsWith('revenda')) return 'Veículos';
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPercent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function safeDiv(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

function fmtData(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtDataHora(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
          <p className={`font-bold mt-1 tabular-nums truncate ${big ? 'text-4xl' : 'text-2xl'}`} style={{ color }} title={String(value)}>{value}</p>
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

function EvolucaoTooltip({ active, payload, granularidade }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold mb-1">{granularidade === 'dia' ? fmtData(d.periodo) : fmtMesLabel(d.periodo)}</p>
      <p>Toques enviados: <span className="font-semibold tabular-nums">{d.toques}</span></p>
      <p>Retornaram: <span className="font-semibold tabular-nums">{d.retornos}</span></p>
      <p>Pagaram: <span className="font-semibold tabular-nums">{d.pagamentos}</span></p>
    </div>
  );
}

function FunilTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold mb-1">{d.etapa}</p>
      <p>Carrinhos: <span className="font-semibold tabular-nums">{d.valor}</span> ({fmtPercent(d.percentual)})</p>
    </div>
  );
}

function Badge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">Sim</span>
    : <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">Não</span>;
}

export default function CarrinhoPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');

  const [dados, setDados] = useState<CarrinhoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('primeiroToqueEm');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [apresentacao, setApresentacao] = useState(false);
  const [slideAtual, setSlideAtual] = useState(0);
  const [slideEpoch, setSlideEpoch] = useState(0);
  const [slidesPausados, setSlidesPausados] = useState(false);
  const [embutido, setEmbutido] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Quando embutido no iframe da tela /apresentacao, quem controla a saída da apresentação é o
  // botão "Sair da apresentação" da barra do orquestrador — mostrar um segundo botão aqui dentro
  // só duplicaria a ação e confundiria o usuário.
  useEffect(() => {
    setEmbutido(window.self !== window.top);
  }, []);

  const fetchDados = useCallback(async (di: string, df: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/carrinho', { params: { dataInicial: di, dataFinal: df } });
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
    fetchDados(dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal]);

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
      fetchDados(dataInicial, dataFinal);
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [apresentacao, dataInicial, dataFinal, fetchDados]);

  // Reinicia a contagem (slideEpoch) sempre que a tela /apresentacao avisa que este relatório
  // acabou de virar o ativo, senão o ciclo de slides continua rodando escondido em segundo plano
  // e pode já estar quase voltando pro slide 1 assim que o relatório reaparece.
  useEffect(() => {
    if (!apresentacao || slidesPausados) return;
    const id = setInterval(() => {
      setSlideAtual((s) => (s + 1) % TOTAL_SLIDES);
    }, 10 * 1000);
    return () => clearInterval(id);
  }, [apresentacao, slideEpoch, slidesPausados]);

  // Escuta os avisos enviados pela tela /apresentacao (postMessage) quando este relatório é
  // embutido em iframe: "ativar" reinicia o ciclo de slides ao virar o relatório em exibição, e
  // "pausar" congela/retoma a troca automática junto com a pausa da apresentação.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'apresentacao:ativar') {
        setSlideAtual(0);
        setSlideEpoch((v) => v + 1);
      } else if (e.data?.type === 'apresentacao:pausar') {
        setSlidesPausados(Boolean(e.data.pausado));
      } else if (e.data?.type === 'apresentacao:slide') {
        const passo = e.data.direcao === 'anterior' ? -1 : 1;
        setSlideAtual((s) => (s + passo + TOTAL_SLIDES) % TOTAL_SLIDES);
        setSlideEpoch((v) => v + 1);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Auto-inicia o modo apresentação quando aberto via ?apresentacao=1 (usado pela tela /apresentacao).
  // Quando embutido num iframe (window.self !== window.top), quem controla o fullscreen é a página
  // pai (/apresentacao) — pedir fullscreen aqui dentro também causaria um fullscreen aninhado que
  // faz o navegador cancelar o fullscreen do pai a cada troca de relatório.
  useEffect(() => {
    if (loading) return;
    if (!apresentacao && new URLSearchParams(window.location.search).get('apresentacao') === '1') {
      setApresentacao(true);
      setSlideAtual(0);
      if (window.self === window.top) {
        containerRef.current?.requestFullscreen?.().catch(() => {});
      }
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

  const serieEvolucao = useMemo(() => {
    if (!dados) return [];
    return granularidade === 'dia' ? dados.seriePorDia : dados.seriePorMes;
  }, [dados, granularidade]);

  const porCadenciaPercentual = useMemo(() => {
    if (!dados) return [];
    return dados.porCadencia.map((c) => ({
      toques: c.toques,
      taxaRetorno: safeDiv(c.retornaram, c.total) * 100,
      taxaPagamento: safeDiv(c.pagaram, c.total) * 100,
    }));
  }, [dados]);

  const funilComPercentual = useMemo(() => {
    if (!dados || dados.funil.length === 0) return [];
    const base = dados.funil[0].valor || 1;
    return dados.funil.map((f, i) => {
      const percentual = f.valor / base;
      return { ...f, percentual, rotulo: `${f.valor} (${fmtPercent(percentual)})`, fill: FUNIL_CORES[i] ?? '#CA3500' };
    });
  }, [dados]);

  function valorRanking(c: CarrinhoUnico): number {
    return c.valorAnuncio ?? c.valorPlano ?? 0;
  }

  const rankingRecuperados = useMemo(() => {
    if (!dados) return [];
    return dados.carrinhos.filter((c) => c.ordemPaga).sort((a, b) => (b.valorPlano ?? 0) - (a.valorPlano ?? 0)).slice(0, 10);
  }, [dados]);

  const rankingPerdidos = useMemo(() => {
    if (!dados) return [];
    return dados.carrinhos.filter((c) => !c.ordemPaga).sort((a, b) => valorRanking(b) - valorRanking(a)).slice(0, 10);
  }, [dados]);

  const carrinhosFiltrados = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    let lista = dados.carrinhos;
    if (termo) {
      lista = lista.filter((c) =>
        c.cliente.toLowerCase().includes(termo) ||
        (c.numero ?? '').toLowerCase().includes(termo) ||
        (c.anuncio ?? '').toLowerCase().includes(termo)
      );
    }
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'cliente') v = a.cliente.localeCompare(b.cliente);
      else if (sortCol === 'valorAnuncio') v = valorRanking(a) - valorRanking(b);
      else if (sortCol === 'valorPlano') v = (a.valorPlano ?? 0) - (b.valorPlano ?? 0);
      else if (sortCol === 'totalToques') v = a.totalToques - b.totalToques;
      else v = a.primeiroToqueEm.localeCompare(b.primeiroToqueEm);
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, busca, sortCol, sortDir]);

  function exportarCsv() {
    if (!dados) return;
    const header = ['Cliente', 'Número', 'Segmento', 'Anúncio', 'Valor anúncio', 'Valor plano', 'Toques', 'Primeiro toque', 'Retornou', 'Pagou', 'Virou anunciante'];
    const linhas = carrinhosFiltrados.map((c) => [
      c.cliente, c.numero ?? '', labelSegmento(c.segmento), c.anuncio ?? '',
      (c.valorAnuncio ?? 0).toFixed(2), (c.valorPlano ?? 0).toFixed(2), c.totalToques,
      c.primeiroToqueEm, c.abriuAnuncio ? 'Sim' : 'Não', c.ordemPaga ? 'Sim' : 'Não', c.virouAnunciante ? 'Sim' : 'Não',
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abandono-carrinho-${dataInicial}-a-${dataFinal}.csv`;
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
        <p className="text-sm font-medium">Carregando dados de abandono de carrinho…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(dataInicial, dataFinal); }}
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
          <h1 className={apresentacao ? 'text-4xl font-bold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>Abandono de Carrinho</h1>
          <p className={`text-muted-foreground mt-0.5 flex items-center gap-2 ${apresentacao ? 'text-base' : 'text-sm'}`}>
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
        {apresentacao ? (
          !embutido && (
            <button onClick={toggleApresentacao}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Minimize2 size={14} /> Sair da apresentação
            </button>
          )
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
            <button onClick={exportarCsv}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal); }}
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

      {/* Slide 1: KPIs + Funil de recuperação */}
      {(!apresentacao || slideAtual === 0) && (
        <>
          <div className={`grid grid-cols-2 lg:grid-cols-4 ${apresentacao ? 'gap-6 shrink-0' : 'gap-3'}`}>
            <KpiCard big={apresentacao} title="Carrinhos abandonados" value={dados.kpis.totalCarrinhos.toLocaleString('pt-BR')}
              sub={`${dados.kpis.totalToques} mensagens disparadas`}
              icon={ShoppingCart} color="#323131" />
            <KpiCard big={apresentacao} title="Taxa de retorno" value={fmtPercent(dados.kpis.taxaRetorno)}
              sub={`${dados.kpis.retornaram} voltaram a ver o anúncio`}
              icon={Undo2} color="#1E7A34" />
            <KpiCard big={apresentacao} title="Taxa de pagamento" value={fmtPercent(dados.kpis.taxaPagamento)}
              sub={`${fmtMoeda(dados.kpis.valorRecuperado)} recuperados`}
              icon={Wallet} color="#1E7A34" />
            <KpiCard big={apresentacao} title="Virou anunciante" value={fmtPercent(dados.kpis.taxaAnunciante)}
              sub={`${dados.kpis.virouAnunciante} anúncios foram ao ar`}
              icon={Megaphone} color="#CA3500" />
          </div>

          <div className={`rounded-lg border border-border ${apresentacao ? 'p-8 flex-1 min-h-0 flex flex-col' : 'p-5'}`}>
            <h2 className={`font-semibold flex items-center gap-2 mb-4 ${apresentacao ? 'text-lg shrink-0' : 'text-sm'}`}>
              <TrendingDown size={apresentacao ? 20 : 16} className="text-primary" /> Funil de recuperação
            </h2>
            <div className={apresentacao ? 'flex-1 min-h-0' : ''}>
              <ResponsiveContainer width="100%" height={apresentacao ? '100%' : 280}>
                <BarChart data={funilComPercentual} margin={{ top: 24, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                  <XAxis dataKey="etapa" tick={{ fontSize: apresentacao ? 13 : 11 }} />
                  <YAxis tick={{ fontSize: apresentacao ? 13 : 11 }} allowDecimals={false} />
                  <Tooltip content={<FunilTooltip />} />
                  <Bar dataKey="valor" name="Carrinhos" radius={[4, 4, 0, 0]}>
                    {funilComPercentual.map((entry) => (
                      <Cell key={entry.etapa} fill={entry.fill} />
                    ))}
                    <LabelList dataKey="rotulo" position="top" style={{ fontSize: apresentacao ? 13 : 11, fill: '#323131', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Slide 2: Evolução temporal + comparativo por segmento */}
      {(!apresentacao || slideAtual === 1) && (
        <>
          <div className={`rounded-lg border border-border ${apresentacao ? 'p-8 flex-1 min-h-0 flex flex-col' : 'p-5'}`}>
            <div className={`flex items-center justify-between mb-4 ${apresentacao ? 'shrink-0' : ''}`}>
              <h2 className={`font-semibold flex items-center gap-2 ${apresentacao ? 'text-lg' : 'text-sm'}`}>
                <TrendingDown size={apresentacao ? 20 : 16} className="text-primary" /> Evolução no período
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
              <ResponsiveContainer width="100%" height={apresentacao ? '100%' : 280}>
                <ComposedChart data={serieEvolucao} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                  <XAxis
                    dataKey="periodo"
                    tickFormatter={granularidade === 'dia' ? fmtDiaLabel : fmtMesLabel}
                    tick={{ fontSize: apresentacao ? 13 : 10 }}
                    interval={granularidade === 'dia' ? Math.max(0, Math.floor(serieEvolucao.length / 20)) : 0}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: apresentacao ? 13 : 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: apresentacao ? 13 : 11 }} />
                  <Tooltip content={<EvolucaoTooltip granularidade={granularidade} />} />
                  <Legend wrapperStyle={{ fontSize: apresentacao ? 14 : 12 }} />
                  <Bar yAxisId="left" dataKey="toques" name="Toques enviados" fill="#D8D5D6" radius={[2, 2, 0, 0]} />
                  <Line yAxisId="right" dataKey="retornos" name="Retornaram" stroke="#8A8386" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" dataKey="pagamentos" name="Pagaram" stroke="#CA3500" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`grid ${apresentacao ? 'shrink-0 gap-6' : 'gap-3'}`} style={{ gridTemplateColumns: `repeat(${Math.max(dados.porSegmento.length, 1)}, minmax(0, 1fr))` }}>
            {dados.porSegmento.map((s, i) => (
              <div key={s.segmento} className={`rounded-lg border border-border ${apresentacao ? 'p-6' : 'p-4'}`}>
                <p className={`font-semibold uppercase tracking-wider mb-2 ${apresentacao ? 'text-sm' : 'text-[11px]'}`} style={{ color: corSegmento(s.segmento, i) }}>
                  {labelSegmento(s.segmento)}
                </p>
                <div className={`grid grid-cols-3 gap-2 ${apresentacao ? 'text-base' : 'text-sm'}`}>
                  <div>
                    <p className={`text-muted-foreground ${apresentacao ? 'text-sm' : 'text-[11px]'}`}>Carrinhos</p>
                    <p className="font-bold tabular-nums">{s.total}</p>
                  </div>
                  <div>
                    <p className={`text-muted-foreground ${apresentacao ? 'text-sm' : 'text-[11px]'}`}>Retorno</p>
                    <p className="font-bold tabular-nums">{fmtPercent(s.total > 0 ? s.retornaram / s.total : 0)}</p>
                  </div>
                  <div>
                    <p className={`text-muted-foreground ${apresentacao ? 'text-sm' : 'text-[11px]'}`}>Pagamento</p>
                    <p className="font-bold tabular-nums">{fmtPercent(s.total > 0 ? s.pagaram / s.total : 0)}</p>
                  </div>
                </div>
                <p className={`text-muted-foreground mt-2 ${apresentacao ? 'text-sm' : 'text-xs'}`}>{fmtMoeda(s.valorRecuperado)} recuperados</p>
              </div>
            ))}
          </div>

          {!apresentacao && (
            <div className="rounded-lg border border-border p-5">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
                <Repeat2 size={16} className="text-primary" /> Retorno por cadência
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Dos carrinhos que receberam 1, 2, 3 ou mais toques, quantos voltaram a ver o anúncio e quantos pagaram — mostra se insistir com mais toques compensa.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porCadenciaPercentual} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                  <XAxis dataKey="toques" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="taxaRetorno" name="Voltou a ver o anúncio" fill="#8A8386" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="taxaPagamento" name="Pagou" fill="#CA3500" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
                Saúde de envio (Sleekflow): {dados.saudeEnvio.reduce((s, t) => s + t.total, 0)} mensagens enviadas ·{' '}
                {fmtPercent(safeDiv(dados.saudeEnvio.reduce((s, t) => s + t.entregues, 0), dados.saudeEnvio.reduce((s, t) => s + t.total, 0)))} com confirmação de entrega ·{' '}
                {fmtPercent(safeDiv(dados.saudeEnvio.reduce((s, t) => s + t.lidos, 0), dados.saudeEnvio.reduce((s, t) => s + t.total, 0)))} lidas
                <span className="block mt-0.5">(indicador operacional de infraestrutura de mensageria — não mede se o cliente voltou)</span>
              </p>
            </div>
          )}
        </>
      )}

      {/* Slide 3: Ranking de carrinhos recuperados x perdidos (apenas apresentação) */}
      {apresentacao && slideAtual === 2 && (
        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
          <div className="rounded-lg border border-border p-8 flex flex-col">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 shrink-0">
              <Wallet size={20} className="text-primary" /> Top 10 recuperados
            </h2>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingRecuperados} layout="vertical" margin={{ top: 0, right: 150, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={(v) => fmtMoeda(v)} />
                  <YAxis type="category" dataKey="cliente" width={230} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => fmtMoeda(Number(v))} />
                  <Bar dataKey="valorPlano" name="Valor pago" fill="#1E7A34" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="valorPlano" position="right" formatter={(v: any) => fmtMoeda(Number(v))} style={{ fontSize: 12, fill: '#323131', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border border-border p-8 flex flex-col">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 shrink-0">
              <TrendingDown size={20} className="text-primary" /> Top 10 perdidos
            </h2>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingPerdidos.map((c) => ({ ...c, valor: valorRanking(c) }))} layout="vertical" margin={{ top: 0, right: 150, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={(v) => fmtMoeda(v)} />
                  <YAxis type="category" dataKey="cliente" width={230} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => fmtMoeda(Number(v))} />
                  <Bar dataKey="valor" name="Valor do anúncio" fill="#CA3500" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="valor" position="right" formatter={(v: any) => fmtMoeda(Number(v))} style={{ fontSize: 12, fill: '#323131', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Rankings compactos + tabela detalhada (apenas modo normal) */}
      {!apresentacao && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Wallet size={15} className="text-primary" /> Maiores carrinhos recuperados
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {rankingRecuperados.length === 0 ? (
                      <tr><td className="px-5 py-6 text-center text-muted-foreground text-xs">Nenhum carrinho pago no período.</td></tr>
                    ) : rankingRecuperados.map((c) => (
                      <tr key={c.orderId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="font-medium">{c.cliente}</div>
                          <div className="text-xs text-muted-foreground">{c.anuncio ?? '—'}</div>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-xs text-success">{fmtMoeda(c.valorPlano ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg border border-border">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingDown size={15} className="text-primary" /> Maiores carrinhos perdidos
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {rankingPerdidos.length === 0 ? (
                      <tr><td className="px-5 py-6 text-center text-muted-foreground text-xs">Nenhum carrinho perdido no período.</td></tr>
                    ) : rankingPerdidos.map((c) => (
                      <tr key={c.orderId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="font-medium">{c.cliente}</div>
                          <div className="text-xs text-muted-foreground">{c.anuncio ?? '—'} · {c.numero ?? 'sem telefone'}</div>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-xs text-destructive">{fmtMoeda(valorRanking(c))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
                <ShoppingCart size={15} className="text-primary" /> Carrinhos no período
              </h2>
              <div className="relative flex-1 min-w-[220px] max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por cliente, telefone ou anúncio…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <span className="text-xs text-muted-foreground">{carrinhosFiltrados.length} carrinho(s)</span>
            </div>

            {carrinhosFiltrados.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum carrinho encontrado para este filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <SortTh col="cliente" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Cliente</SortTh>
                      <th className="px-4 py-3 font-semibold">Anúncio</th>
                      <SortTh col="valorAnuncio" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Valor anúncio</SortTh>
                      <SortTh col="valorPlano" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Valor plano</SortTh>
                      <SortTh col="totalToques" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-center">Toques</SortTh>
                      <SortTh col="primeiroToqueEm" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">1º toque</SortTh>
                      <th className="px-4 py-3 font-semibold text-center">Retornou</th>
                      <th className="px-4 py-3 font-semibold text-center">Pagou</th>
                      <th className="px-5 py-3 font-semibold text-center">Anunciante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {carrinhosFiltrados.map((c) => (
                      <tr key={c.orderId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium">{c.cliente}</div>
                          <div className="text-xs text-muted-foreground">{c.numero ?? '—'} · {labelSegmento(c.segmento)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.anuncio ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{c.valorAnuncio !== null ? fmtMoeda(c.valorAnuncio) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{c.valorPlano !== null ? fmtMoeda(c.valorPlano) : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-xs">{c.totalToques}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtDataHora(c.primeiroToqueEm)}</td>
                        <td className="px-4 py-3 text-center"><Badge ok={c.abriuAnuncio} /></td>
                        <td className="px-4 py-3 text-center"><Badge ok={c.ordemPaga} /></td>
                        <td className="px-5 py-3 text-center"><Badge ok={c.virouAnunciante} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
