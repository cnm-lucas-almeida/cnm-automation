'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingUp, TrendingDown, Wallet, ShoppingCart, Users, Download, Search,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import type { ComissoesData, FechamentoComissao } from '@/lib/comissoes';
import { PERFIL_LABEL, type TipoFechamento } from '@/lib/comissoes/constants';
import { Select } from '@/components/ui/Select';

type Preset = 'este_mes' | 'ultimos_3_meses' | 'ultimos_6_meses' | 'ultimos_12_meses' | 'este_ano' | 'ano_passado';
type SortCol = 'periodo' | 'vendedorNome' | 'perfilNome' | 'valorPago' | 'tipoFechamento';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

const TIPO_LABEL: Record<TipoFechamento, string> = {
  MENSAL: 'Mensal',
  SEMANAL: 'Semanal',
  RESCISAO: 'Rescisão',
};

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function periodoAtualStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function somaMeses(periodo: string, delta: number): string {
  const [ano, mes] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtMesLabel(periodo: string) {
  const [y, m] = periodo.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function presetParaPeriodo(preset: Preset): { periodoInicial: string; periodoFinal: string } {
  const atual = periodoAtualStr();
  const anoAtual = new Date().getFullYear();
  if (preset === 'este_mes') return { periodoInicial: atual, periodoFinal: atual };
  if (preset === 'ultimos_3_meses') return { periodoInicial: somaMeses(atual, -2), periodoFinal: atual };
  if (preset === 'ultimos_6_meses') return { periodoInicial: somaMeses(atual, -5), periodoFinal: atual };
  if (preset === 'ultimos_12_meses') return { periodoInicial: somaMeses(atual, -11), periodoFinal: atual };
  if (preset === 'este_ano') return { periodoInicial: `${anoAtual}-01`, periodoFinal: atual };
  return { periodoInicial: `${anoAtual - 1}-01`, periodoFinal: `${anoAtual - 1}-12` };
}

function KpiCard({
  title, value, sub, icon: Icon, color,
}: { title: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">{title}</p>
          <p className="font-bold mt-1 tabular-nums text-2xl" style={{ color }}>{value}</p>
          {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
        </div>
        <Icon size={20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol; current: SortCol; dir: SortDir; onSort: (col: SortCol) => void; children: React.ReactNode; className?: string;
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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{fmtMesLabel(d.periodo)}{d.emAndamento ? ' (em andamento)' : ''}</p>
      <p>Comissão fechada: <span className="font-semibold tabular-nums">{fmtMoeda(d.valor)}</span></p>
      {d.estimado > 0 && (
        <p>Estimativa em aberto: <span className="font-semibold tabular-nums">{fmtMoeda(d.estimado)}</span></p>
      )}
      <p>Faturamento (base): <span className="font-semibold tabular-nums">{fmtMoeda(d.faturamento)}</span></p>
      <p>Fechamentos: <span className="font-semibold tabular-nums">{d.qtd}</span></p>
    </div>
  );
}

function BreakdownList({
  title, items, labelFor,
}: { title: string; items: { chave: string; qtd: number; valor: number }[]; labelFor?: (chave: string) => string }) {
  const total = items.reduce((s, i) => s + i.valor, 0) || 1;
  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="font-semibold mb-4 text-sm">{title}</h2>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
        {items.map((item) => (
          <div key={item.chave}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-medium">{labelFor ? labelFor(item.chave) : item.chave}</span>
              <span className="text-muted-foreground tabular-nums">{item.qtd} · {fmtMoeda(item.valor)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${(item.valor / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComissoesPage() {
  const [preset, setPreset] = useState<Preset>('ultimos_12_meses');
  const [periodoInicial, setPeriodoInicial] = useState(() => presetParaPeriodo('ultimos_12_meses').periodoInicial);
  const [periodoFinal, setPeriodoFinal] = useState(() => presetParaPeriodo('ultimos_12_meses').periodoFinal);
  const [perfil, setPerfil] = useState('');
  const [tipoFechamento, setTipoFechamento] = useState('');

  const [dados, setDados] = useState<ComissoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('periodo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const fetchDados = useCallback(async (pi: string, pf: string, perf: string, tipo: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/comissoes', {
        params: { periodoInicial: pi, periodoFinal: pf, perfil: perf || undefined, tipoFechamento: tipo || undefined },
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
    fetchDados(periodoInicial, periodoFinal, perfil, tipoFechamento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoInicial, periodoFinal, perfil, tipoFechamento]);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    const { periodoInicial: pi, periodoFinal: pf } = presetParaPeriodo(p);
    setPeriodoInicial(pi);
    setPeriodoFinal(pf);
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  }

  const fechamentosFiltrados = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    let lista = dados.fechamentos;
    if (termo) lista = lista.filter((f) => f.vendedorNome.toLowerCase().includes(termo));
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'periodo') {
        v = `${a.anoReferencia}-${String(a.mesReferencia).padStart(2, '0')}`.localeCompare(
          `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, '0')}`
        );
      } else if (sortCol === 'vendedorNome') v = a.vendedorNome.localeCompare(b.vendedorNome);
      else if (sortCol === 'perfilNome') v = a.perfilNome.localeCompare(b.perfilNome);
      else if (sortCol === 'tipoFechamento') v = a.tipoFechamento.localeCompare(b.tipoFechamento);
      else v = a.valorPago - b.valorPago;
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, busca, sortCol, sortDir]);

  const serieComAndamento = useMemo(() => {
    if (!dados) return [];
    const periodoAtual = `${dados.mesEmAndamento.anoReferencia}-${String(dados.mesEmAndamento.mesReferencia).padStart(2, '0')}`;
    const serie = dados.seriePorMes.map((s) => ({ ...s, estimado: 0, emAndamento: s.periodo === periodoAtual }));
    const idx = serie.findIndex((s) => s.periodo === periodoAtual);
    if (idx >= 0) {
      serie[idx] = {
        ...serie[idx],
        estimado: dados.mesEmAndamento.totalEstimado,
        faturamento: serie[idx].faturamento + dados.mesEmAndamento.totalFaturamentoEstimado,
      };
    } else {
      serie.push({
        periodo: periodoAtual, valor: 0, qtd: 0,
        estimado: dados.mesEmAndamento.totalEstimado,
        faturamento: dados.mesEmAndamento.totalFaturamentoEstimado,
        emAndamento: true,
      });
    }
    // "zero" é uma barra transparente empilhada por cima só pra ancorar o LabelList do total —
    // um LabelList preso direto na barra "estimado" some nos meses em que ela vale 0 (mesmo padrão
    // documentado em src/app/vendas/page.tsx). O valor não pode ser exatamente 0: no Recharts 3,
    // uma série empilhada com valor 0 numa linha vira um ponto nulo e a barra (e o LabelList) some
    // por completo naquele ponto — daí o epsilon, visualmente 0 mas mantém a série "viva".
    return serie.map((s) => ({ ...s, total: s.valor + s.estimado, zero: 0.0001 }));
  }, [dados]);

  const totalPages = Math.max(1, Math.ceil(fechamentosFiltrados.length / PAGE_SIZE));
  const fechamentosPaginados = fechamentosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportarCsv() {
    if (!dados) return;
    const header = ['Período', 'Vendedor', 'Perfil', 'Tipo de fechamento', 'Data do fechamento', 'Vendas', 'Aditivos', 'Valor pago'];
    const linhas = fechamentosFiltrados.map((f: FechamentoComissao) => [
      `${String(f.mesReferencia).padStart(2, '0')}/${f.anoReferencia}`,
      f.vendedorNome,
      f.perfilNome,
      TIPO_LABEL[f.tipoFechamento],
      f.dataFechamento ? new Date(f.dataFechamento).toLocaleDateString('pt-BR') : '',
      f.qtdVendas,
      f.qtdAditivos,
      f.valorPago.toFixed(2),
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-comissoes-${periodoInicial}-a-${periodoFinal}.csv`;
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
        <p className="text-sm font-medium">Carregando comissões do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(periodoInicial, periodoFinal, perfil, tipoFechamento); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const variacao = dados.kpis.variacaoPct;

  return (
    <div className={`mx-auto space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comissões — Análise Geral</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtMesLabel(periodoInicial)} a {fmtMesLabel(periodoFinal)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={perfil}
            onChange={setPerfil}
            className="min-w-[170px]"
            options={[
              { value: '', label: 'Todos os perfis' },
              ...Object.entries(PERFIL_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            value={tipoFechamento}
            onChange={setTipoFechamento}
            className="min-w-[160px]"
            options={[
              { value: '', label: 'Todos os tipos' },
              ...Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            value={preset}
            onChange={(v) => aplicarPreset(v as Preset)}
            className="min-w-[160px]"
            options={[
              { value: 'este_mes', label: 'Este mês' },
              { value: 'ultimos_3_meses', label: 'Últimos 3 meses' },
              { value: 'ultimos_6_meses', label: 'Últimos 6 meses' },
              { value: 'ultimos_12_meses', label: 'Últimos 12 meses' },
              { value: 'este_ano', label: 'Este ano' },
              { value: 'ano_passado', label: 'Ano passado' },
            ]}
          />
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => { setReloading(true); fetchDados(periodoInicial, periodoFinal, perfil, tipoFechamento); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Total pago no período" value={fmtMoeda(dados.kpis.totalPago)}
          sub={variacao !== null ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(1)}% vs. período anterior` : 'sem período anterior p/ comparar'}
          icon={variacao !== null && variacao < 0 ? TrendingDown : Wallet}
          color={variacao !== null && variacao < 0 ? '#CA8A04' : '#1E7A34'} />
        <KpiCard title="Vendas" value={dados.kpis.totalVendas.toLocaleString('pt-BR')}
          icon={ShoppingCart} color="#323131" />
        <KpiCard title="Ticket médio por fechamento" value={fmtMoeda(dados.kpis.ticketMedio)}
          icon={TrendingUp} color="#323131" />
        <KpiCard title="Vendedores no ranking" value={dados.ranking.length.toLocaleString('pt-BR')}
          sub="com comissão paga no período" icon={Users} color="#323131" />
      </div>

      {/* Evolução mensal (inclui o mês em andamento como estimativa, ainda não fechado) */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Evolução mensal
          </h2>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#CA3500]" /> Fechado</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#CA3500] opacity-40" /> Em andamento (estimado)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-[#323131]" /> Faturamento (base)</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={serieComAndamento} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis dataKey="periodo" tickFormatter={fmtMesLabel} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="comissao" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="faturamento" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="comissao" dataKey="valor" name="Fechado" stackId="comissao" fill="#CA3500" radius={[2, 2, 0, 0]} />
            <Bar yAxisId="comissao" dataKey="estimado" name="Em andamento (estimado)" stackId="comissao" fill="#CA3500" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
            {/* Barra transparente só pra ancorar o rótulo do total — presa direto na barra "estimado"
                ela sumiria nos meses em que estimado = 0 (mesmo padrão de src/app/vendas/page.tsx). */}
            <Bar yAxisId="comissao" dataKey="zero" stackId="comissao" fill="transparent" isAnimationActive={false}>
              {serieComAndamento.length <= 24 && (
                <LabelList dataKey="total" position="top" formatter={(v: any) => fmtMoeda(Number(v))} style={{ fontSize: 9, fill: '#6F686B' }} />
              )}
            </Bar>
            <Line yAxisId="faturamento" type="monotone" dataKey="faturamento" name="Faturamento (base)"
              stroke="#323131" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdowns + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownList title="Por perfil" items={dados.porPerfil} />
        <BreakdownList title="Por tipo de fechamento" items={dados.porTipoFechamento} labelFor={(c) => TIPO_LABEL[c as TipoFechamento] ?? c} />
        <div className="rounded-lg border border-border p-5">
          <h2 className="font-semibold mb-4 text-sm">Ranking de vendedores</h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {dados.ranking.length === 0 && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
            {dados.ranking.map((v, i) => (
              <div key={v.idVendedor} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-muted-foreground tabular-nums flex-shrink-0">{i + 1}º</span>
                  <span className="truncate font-medium">{v.nome}</span>
                </span>
                <span className="text-muted-foreground tabular-nums flex-shrink-0">{fmtMoeda(v.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de fechamentos */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold mr-auto">Fechamentos de comissão</h2>
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              placeholder="Buscar por vendedor…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-xs text-muted-foreground">{fechamentosFiltrados.length} fechamento(s)</span>
        </div>

        {fechamentosFiltrados.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum fechamento encontrado para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="periodo" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Período</SortTh>
                  <SortTh col="vendedorNome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">Vendedor</SortTh>
                  <SortTh col="perfilNome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">Perfil</SortTh>
                  <SortTh col="tipoFechamento" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4">Tipo</SortTh>
                  <th className="px-4 py-3 font-semibold text-right">Vendas</th>
                  <th className="px-4 py-3 font-semibold text-right">Aditivos</th>
                  <SortTh col="valorPago" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5 text-right">Valor pago</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fechamentosPaginados.map((f) => (
                  <tr key={f.idComissaoFechada} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {String(f.mesReferencia).padStart(2, '0')}/{f.anoReferencia}
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{f.vendedorNome}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{f.perfilNome}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{TIPO_LABEL[f.tipoFechamento] ?? f.tipoFechamento}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{f.qtdVendas}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{f.qtdAditivos}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-xs whitespace-nowrap">{fmtMoeda(f.valorPago)}</td>
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
    </div>
  );
}
