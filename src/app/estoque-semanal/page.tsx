'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, LayoutGrid, Home, Car, Download, ChevronUp, ChevronDown, ChevronsUpDown, Boxes,
} from 'lucide-react';
import type { EstoqueSemanalData, LinhaEstoqueSemanal } from '@/lib/estoque-semanal';
import type { FiltrosVendas } from '@/lib/vendas';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { FilterPopover } from '@/components/ui/FilterPopover';

const SEGMENTO_TABS = [
  { value: 'todos' as const, label: 'Geral', icon: LayoutGrid },
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

type Preset = 'este_mes' | 'semana_atual' | 'mes_passado' | 'personalizado';
type SortCol = 'nome' | 'totalVendas' | 'valorTotal';
type SortDir = 'asc' | 'desc';

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function primeiroDiaSemana(d: Date): string {
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia; // volta pra segunda-feira
  const inicio = new Date(d);
  inicio.setDate(d.getDate() + diff);
  return inicio.toISOString().slice(0, 10);
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (preset === 'semana_atual') return { dataInicial: primeiroDiaSemana(hoje), dataFinal: isoHoje() };
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: ultimoDia.toISOString().slice(0, 10) };
  }
  return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
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
      className={`py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? 'px-3'}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (dir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : <ChevronsUpDown size={11} className="opacity-40" />}
      </span>
    </th>
  );
}

export default function EstoqueSemanalPage() {
  const [preset, setPreset] = useState<Preset>('semana_atual');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('semana_atual').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('semana_atual').dataFinal);
  const [segmento, setSegmento] = useState<'todos' | 'imoveis' | 'veiculos'>('todos');
  const [squad, setSquad] = useState('');
  const [treinador, setTreinador] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('totalVendas');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [filtrosDisponiveis, setFiltrosDisponiveis] = useState<FiltrosVendas>({ squads: [], treinadores: [] });
  const [dados, setDados] = useState<EstoqueSemanalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/vendas/filtros').then((res) => setFiltrosDisponiveis(res.data)).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get('/api/estoque-semanal', {
        params: { dataInicial, dataFinal, segmento, squad: squad || undefined, treinador: treinador || undefined },
      });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [dataInicial, dataFinal, segmento, squad, treinador]);

  useEffect(() => {
    setReloading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, segmento, squad, treinador]);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== 'personalizado') {
      const { dataInicial: di, dataFinal: df } = presetParaDatas(p);
      setDataInicial(di);
      setDataFinal(df);
    }
  }

  function onSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const linhas = dados?.linhas ?? [];
  const activeFilterCount = [squad, treinador].filter(Boolean).length;

  const linhasOrdenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'nome') cmp = a.nome.localeCompare(b.nome);
      else if (sortCol === 'totalVendas') cmp = a.totalVendas - b.totalVendas;
      else if (sortCol === 'valorTotal') cmp = a.valorTotal - b.valorTotal;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [linhas, sortCol, sortDir]);

  function limparFiltros() {
    setSquad('');
    setTreinador('');
  }

  function exportarCsv() {
    if (!dados) return;
    const header = [
      'Nome', 'Squad', 'Treinador', 'Total Vendas', 'Total Cong', 'Total Canc', 'Total Ativa', 'Total Pagas',
      'Não Pagas', 'Total Pend', 'Valor Total', 'Valor Total Ativas', 'Valor Pg', 'Valor Pend', 'Valor Cong',
      'Valor Canc', 'Ticket Médio', 'Ticket Médio Ativas', 'Maior Venda', 'Menor Venda', 'Qtd Anun',
    ];
    const linhasCsv = linhasOrdenadas.map((l) => [
      l.nome, l.squadNome ?? '', l.treinadorNome ?? '', l.totalVendas, l.totalCongeladas, l.totalCanceladas,
      l.totalAtivas, l.totalPagas, l.naoPagas, l.totalPendentes, l.valorTotal.toFixed(2), l.valorTotalAtivas.toFixed(2),
      l.valorPago.toFixed(2), l.valorPendente.toFixed(2), l.valorCongelado.toFixed(2), l.valorCancelado.toFixed(2),
      l.ticketMedio.toFixed(2), l.ticketMedioAtivas.toFixed(2), l.maiorVenda.toFixed(2), l.menorVenda.toFixed(2), l.qtdAnuncios,
    ]);
    const csv = [header, ...linhasCsv].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque-semanal-${dataInicial}-a-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando estoque por vendedor…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); carregar(); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque Semanal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {linhas.length} vendedor(es) · {fmtData(dataInicial)} a {fmtData(dataFinal)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={preset}
            onChange={(v) => aplicarPreset(v as Preset)}
            className="min-w-[160px]"
            options={[
              { value: 'semana_atual', label: 'Esta semana' },
              { value: 'este_mes', label: 'Este mês' },
              { value: 'mes_passado', label: 'Mês passado' },
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
          <SegmentTabs value={segmento} onChange={setSegmento} options={SEGMENTO_TABS} />
          <FilterPopover activeCount={activeFilterCount} onClear={limparFiltros}>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Squad</label>
              <Select
                value={squad}
                onChange={setSquad}
                className="w-full mt-1"
                placeholder="Todos os squads"
                options={[{ value: '', label: 'Todos os squads' }, ...filtrosDisponiveis.squads.map((s) => ({ value: s, label: s }))]}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Treinador</label>
              <Select
                value={treinador}
                onChange={setTreinador}
                className="w-full mt-1"
                placeholder="Todos os treinadores"
                options={[{ value: '', label: 'Todos os treinadores' }, ...filtrosDisponiveis.treinadores.map((t) => ({ value: t, label: t }))]}
              />
            </div>
          </FilterPopover>
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Boxes size={15} className="text-primary" /> Resumo por vendedor
          </h2>
        </div>

        {linhas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma venda no período/filtro selecionado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="nome" current={sortCol} dir={sortDir} onSort={onSort} className="px-5 py-3">Vendedor</SortTh>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Squad</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Treinador</th>
                  <SortTh col="totalVendas" current={sortCol} dir={sortDir} onSort={onSort} className="px-3 py-3 text-right">Vendas</SortTh>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Cong</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Canc</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Ativa</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pagas</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Não Pagas</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pend</th>
                  <SortTh col="valorTotal" current={sortCol} dir={sortDir} onSort={onSort} className="px-3 py-3 text-right">Valor Total</SortTh>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Valor Ativas</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Valor Pago</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Valor Pend</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Valor Cong</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Valor Canc</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Ticket Médio</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Ticket Ativas</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Maior Venda</th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Menor Venda</th>
                  <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">Qtd Anún</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasOrdenadas.map((l) => (
                  <tr key={l.idVendedor} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-2.5 font-medium whitespace-nowrap">{l.nome}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.squadNome ?? '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.treinadorNome ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{l.totalVendas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.totalCongeladas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.totalCanceladas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-success font-semibold">{l.totalAtivas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.totalPagas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warning">{l.naoPagas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.totalPendentes}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtMoeda(l.valorTotal)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.valorTotalAtivas)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-success">{fmtMoeda(l.valorPago)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.valorPendente)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.valorCongelado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.valorCancelado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.ticketMedio)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.ticketMedioAtivas)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.maiorVenda)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoeda(l.menorVenda)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{l.qtdAnuncios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
