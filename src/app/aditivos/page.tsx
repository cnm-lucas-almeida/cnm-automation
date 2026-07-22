'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Download, Search, ArrowUp, ArrowDown, ArrowUpDown,
  TrendingUp, TrendingDown, Scale, Boxes, Columns3, ExternalLink, ChevronDown, ChevronUp,
  LayoutGrid, Home, Car, CheckCircle2, Clock,
} from 'lucide-react';
import type { AditivosData, Movimentacao, Segmento } from '@/lib/aditivos';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

type SegmentoFiltro = Segmento | 'todos';
type Visao = 'efetivados' | 'agendados';

const SEGMENTO_TABS = [
  { value: 'todos' as const, label: 'Geral', icon: LayoutGrid },
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

const VISAO_TABS = [
  { value: 'efetivados' as const, label: 'Efetivados', icon: CheckCircle2 },
  { value: 'agendados' as const, label: 'Agendados', icon: Clock },
];
type SortCol = 'data' | 'cliente' | 'impacto' | 'estoque';
type SortDir = 'asc' | 'desc';

const COLUNAS_OPCIONAIS = [
  { key: 'criacao', label: 'Criado em' },
  { key: 'estoque', label: 'Estoque (Δ anúncios)' },
  { key: 'vendedor', label: 'Vendedor' },
] as const;
type ColunaOpcional = typeof COLUNAS_OPCIONAIS[number]['key'];

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
          <p className="text-2xl font-bold mt-1 tabular-nums truncate" style={{ color }} title={String(value)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: 'UPGRADE' | 'DOWNGRADE' }) {
  if (tipo === 'UPGRADE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success">
        <ArrowUp size={11} /> Upgrade
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
      <ArrowDown size={11} /> Downgrade
    </span>
  );
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol; current: SortCol; dir: SortDir; onSort: (col: SortCol) => void; children: React.ReactNode; className?: string;
}) {
  const active = current === col;
  return (
    <th className={`py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ''}`} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  );
}

function planoTexto(nome: string | null, qtd: number | null, destaque: number | null) {
  if (!nome && qtd === null) return '—';
  if (!nome) return `${qtd} anúncios`;
  return `${nome}${destaque !== null ? ` (${destaque} destaque${destaque === 1 ? '' : 's'})` : ''}`;
}

export default function AditivosPage() {
  const [visao, setVisao] = useState<Visao>('efetivados');
  const [dataInicial, setDataInicial] = useState(() => primeiroDiaMes(new Date()));
  const [dataFinal, setDataFinal] = useState(() => isoHoje());
  const [segmento, setSegmento] = useState<SegmentoFiltro>('todos');

  const [dados, setDados] = useState<AditivosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('data');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [colunasVisiveis, setColunasVisiveis] = useState<Record<ColunaOpcional, boolean>>({
    criacao: true, estoque: true, vendedor: false,
  });
  const [colunasAbertas, setColunasAbertas] = useState(false);
  const colunasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (colunasRef.current && !colunasRef.current.contains(e.target as Node)) setColunasAbertas(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, []);

  const fetchDados = useCallback(async (v: Visao, di: string, df: string, seg: SegmentoFiltro) => {
    setError(null);
    try {
      const res = v === 'efetivados'
        ? await axios.get('/api/aditivos', { params: { dataInicial: di, dataFinal: df, segmento: seg } })
        : await axios.get('/api/aditivos/agendados', { params: { segmento: seg } });
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
    fetchDados(visao, dataInicial, dataFinal, segmento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao, dataInicial, dataFinal, segmento]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  }

  const movimentacoesFiltradas = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    let lista = dados.movimentacoes;
    if (termo) {
      lista = lista.filter((m) =>
        m.clienteNome.toLowerCase().includes(termo) ||
        (m.cidade ?? '').toLowerCase().includes(termo) ||
        (m.motivo ?? '').toLowerCase().includes(termo) ||
        (m.vendedorNome ?? '').toLowerCase().includes(termo)
      );
    }
    return [...lista].sort((a: Movimentacao, b: Movimentacao) => {
      let v = 0;
      if (sortCol === 'data') v = new Date(a.dataAditivo).getTime() - new Date(b.dataAditivo).getTime();
      else if (sortCol === 'cliente') v = a.clienteNome.localeCompare(b.clienteNome);
      else if (sortCol === 'impacto') v = a.impacto - b.impacto;
      else v = (a.diferencaAnuncios ?? 0) - (b.diferencaAnuncios ?? 0);
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, busca, sortCol, sortDir]);

  function exportarCsv() {
    if (!dados) return;
    const colData = visao === 'efetivados' ? 'Data' : 'Previsto para';
    const header = [colData, 'Tipo', 'Cliente', 'Cidade/UF', 'De (Plano)', 'Para (Plano)', 'Impacto', 'Δ Anúncios', 'Motivo', 'Vendedor'];
    const linhas = movimentacoesFiltradas.map((m) => [
      fmtData(m.dataAditivo), m.tipo, m.clienteNome, [m.cidade, m.uf].filter(Boolean).join('/'),
      planoTexto(m.planoAntigoNome, m.planoAntigoQtd, m.planoAntigoDestaque),
      planoTexto(m.planoNovoNome, m.planoNovoQtd, m.planoNovoDestaque),
      m.impacto.toFixed(2), m.diferencaAnuncios ?? '', (m.motivo ?? '').replace(/\s+/g, ' ').trim(), m.vendedorNome ?? '',
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = visao === 'efetivados'
      ? `movimentacoes-aditivo-efetivados-${dataInicial}-a-${dataFinal}.csv`
      : `movimentacoes-aditivo-agendados.csv`;
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
        <p className="text-sm font-medium">Carregando movimentações do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(visao, dataInicial, dataFinal, segmento); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className={`max-w-[1800px] mx-auto p-6 space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimentações de Aditivo</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            {visao === 'efetivados' ? (
              <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
            ) : (
              <span>· já solicitados, ainda não em vigor</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentTabs value={visao} onChange={setVisao} options={VISAO_TABS} />
          <SegmentTabs value={segmento} onChange={setSegmento} options={SEGMENTO_TABS} />
          {visao === 'efetivados' && (
            <DateRangePicker dataInicial={dataInicial} dataFinal={dataFinal} onChange={(di, df) => { setDataInicial(di); setDataFinal(df); }} />
          )}
          <button onClick={() => { setReloading(true); fetchDados(visao, dataInicial, dataFinal, segmento); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard title={visao === 'efetivados' ? 'Total upgrades' : 'Upgrades agendados'} value={fmtMoeda(dados.kpis.totalUpgrade)}
          sub={`${dados.kpis.qtdUpgrades} movimentação(ões) · ticket médio ${fmtMoeda(dados.kpis.ticketMedioUpgrade)}`}
          icon={TrendingUp} color="#1E7A34" />
        <KpiCard title={visao === 'efetivados' ? 'Total downgrades' : 'Downgrades agendados'} value={fmtMoeda(dados.kpis.totalDowngrade)}
          sub={`${dados.kpis.qtdDowngrades} movimentação(ões) · ticket médio ${fmtMoeda(dados.kpis.ticketMedioDowngrade)}`}
          icon={TrendingDown} color="#CA3500" />
        <KpiCard title="Resultado líquido" value={fmtMoeda(dados.kpis.resultadoLiquido)}
          sub={visao === 'efetivados' ? 'upgrades − downgrades, no período' : 'upgrades − downgrades, previstos'}
          icon={Scale} color={dados.kpis.resultadoLiquido >= 0 ? '#1E7A34' : '#CA3500'} />
        <KpiCard title="Volume de movimentações" value={`${dados.kpis.volumeTotal >= 0 ? '+' : ''}${dados.kpis.volumeTotal}`}
          sub={`up: +${dados.kpis.qtdUpgrades} · down: -${dados.kpis.qtdDowngrades}`}
          icon={ArrowUpDown} color="#323131" />
        <KpiCard title="Variação de estoque (anúncios)" value={`${dados.kpis.variacaoEstoque >= 0 ? '+' : ''}${dados.kpis.variacaoEstoque}`}
          sub={`ganho: +${dados.kpis.estoqueGanho} · perda: -${dados.kpis.estoquePerdido}`}
          icon={Boxes} color="#323131" />
        <KpiCard title="Ticket médio (up − down)" value={fmtMoeda(dados.kpis.ticketMedioUpgrade - dados.kpis.ticketMedioDowngrade)}
          sub={`up: ${fmtMoeda(dados.kpis.ticketMedioUpgrade)} · down: ${fmtMoeda(dados.kpis.ticketMedioDowngrade)}`}
          icon={Scale} color="#323131" />
      </div>

      {/* Tabela de movimentações */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
            <ArrowUpDown size={15} className="text-primary" /> Movimentações
          </h2>
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, cidade, vendedor…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="relative" ref={colunasRef}>
            <button onClick={() => setColunasAbertas((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Columns3 size={14} /> Colunas {colunasAbertas ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {colunasAbertas && (
              <div className="absolute right-0 mt-1 w-56 rounded-lg border border-border bg-card shadow-lg z-10 p-2">
                {COLUNAS_OPCIONAIS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={colunasVisiveis[c.key]}
                      onChange={(e) => setColunasVisiveis((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <span className="text-xs text-muted-foreground">{movimentacoesFiltradas.length} movimentação(ões)</span>
        </div>

        {movimentacoesFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma movimentação encontrada para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  {colunasVisiveis.criacao && <th className="px-5 py-3 font-semibold whitespace-nowrap">Criado em</th>}
                  <SortTh col="data" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">{visao === 'efetivados' ? 'Data' : 'Previsto para'}</SortTh>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <SortTh col="cliente" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">Cliente</SortTh>
                  <th className="px-4 py-3 font-semibold">De (plano)</th>
                  <th className="px-4 py-3 font-semibold">Para (plano)</th>
                  <SortTh col="impacto" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Impacto</SortTh>
                  {colunasVisiveis.estoque && (
                    <SortTh col="estoque" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Δ Anúncios</SortTh>
                  )}
                  {colunasVisiveis.vendedor && <th className="px-4 py-3 font-semibold">Vendedor</th>}
                  <th className="px-5 py-3 font-semibold text-center">Contrato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movimentacoesFiltradas.map((m) => {
                  return (
                    <tr key={m.id} className="hover:bg-muted/50 transition-colors align-top">
                      {colunasVisiveis.criacao && (
                        <td className="px-5 py-3 whitespace-nowrap">{m.dataCriacao ? fmtData(m.dataCriacao) : '—'}</td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">{fmtData(m.dataAditivo)}</td>
                      <td className="px-4 py-3"><TipoBadge tipo={m.tipo} /></td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.clienteNome}</div>
                        <div className="text-xs text-muted-foreground">
                          {[m.cidade, m.uf].filter(Boolean).join(' - ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px]">
                        {planoTexto(m.planoAntigoNome, m.planoAntigoQtd, m.planoAntigoDestaque)}
                        <div className="tabular-nums">{fmtMoeda(m.valorAntigo)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[180px]">
                        {planoTexto(m.planoNovoNome, m.planoNovoQtd, m.planoNovoDestaque)}
                        <div className="tabular-nums font-medium">{fmtMoeda(m.valorNovo)}</div>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${m.impacto >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {m.impacto >= 0 ? '+' : ''}{fmtMoeda(m.impacto)}
                      </td>
                      {colunasVisiveis.estoque && (
                        <td className={`px-4 py-3 text-right tabular-nums ${m.diferencaAnuncios === null ? 'text-muted-foreground' : m.diferencaAnuncios >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {m.diferencaAnuncios === null ? '—' : `${m.diferencaAnuncios >= 0 ? '+' : ''}${m.diferencaAnuncios}`}
                        </td>
                      )}
                      {colunasVisiveis.vendedor && <td className="px-4 py-3 text-xs">{m.vendedorNome ?? '—'}</td>}
                      <td className="px-5 py-3 text-center">
                        <a href={m.linkAdmin} target="_blank" rel="noopener noreferrer" className="inline-flex text-muted-foreground hover:text-primary transition-colors">
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
