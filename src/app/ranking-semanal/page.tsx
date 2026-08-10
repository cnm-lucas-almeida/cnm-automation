'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Trophy, Download, ChevronLeft, ChevronRight, Home, Car,
  LayoutGrid, PackageSearch, Wallet, Info,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { RankingSemanalData, LinhaRankingSemanal } from '@/lib/ranking-semanal';
import { Select } from '@/components/ui/Select';
import { FilterPopover } from '@/components/ui/FilterPopover';

type Aba = 'analitico' | 'gerencial';
type SegmentoFiltro = 'imoveis' | 'veiculos';

// Reaproveitando a paleta categórica já validada em TAREFA_DASHBOARD_ASSINATURAS_PF.md (donut de
// planos) — ordem fixa por Tipo Base, não por ranking de quantidade.
const COR_TIPO_BASE: Record<string, string> = {
  'BASE -20': '#2a78d6',
  'BASE 30+': '#1baf7a',
  'BASE FOCO -100': '#eda100',
  'BASE FOCO +100': '#008300',
  'TOP 20': '#4a3aa7',
};
const COR_ESTOQUE = '#155DFC';
const COR_FINANCEIRO = '#CA3500';

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

function fmtData(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function semanaCampanhaAtualClient(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diasDesdeSexta = (diaSemana - 5 + 7) % 7;
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - diasDesdeSexta);
  const fimTeorico = new Date(inicio);
  fimTeorico.setDate(inicio.getDate() + 6);
  const fim = fimTeorico < hoje ? fimTeorico : hoje;
  return { dataInicial: inicio.toISOString().slice(0, 10), dataFinal: fim.toISOString().slice(0, 10) };
}

function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums truncate" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function AnaliticoTable({ linhas }: { linhas: LinhaRankingSemanal[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
            <th className="px-5 py-3 font-semibold">IS</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Squad</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Ciclo</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Supervisor</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Base -20</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Base 30+</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Foco -100</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Foco +100</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">20+</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Total Bases</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Estoque</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">%</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Financeiro</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Pts</th>
            <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">%</th>
            <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">Pontos (A-U)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map((l) => (
            <tr key={l.idVendedor} className="hover:bg-muted/50 transition-colors">
              <td className="px-5 py-2.5 font-medium whitespace-nowrap">{l.nome}</td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.squad ?? '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{l.ciclo ?? '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.supervisor ?? '—'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.base20}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosBase20}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.base30Mais}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosBase30Mais}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.baseFoco100Menos}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosBaseFoco100Menos}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.baseFoco100Mais}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosBaseFoco100Mais}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.top20}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosTop20}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{l.totalBases}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.estoque}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosEstoque}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(l.percentualEstoque)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoeda(l.financeiro)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{l.pontosFinanceiro}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(l.percentualFinanceiro)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums font-bold text-primary">{l.pontuacaoParcialAU}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisaoGerencial({ data }: { data: RankingSemanalData }) {
  const { linhas } = data;

  const porSquad = useMemo(() => {
    const mapa = new Map<string, { squad: string; qtd: number; somaEstoque: number; somaFinanceiro: number }>();
    for (const l of linhas) {
      const nome = l.squad ?? 'Sem squad';
      const entry = mapa.get(nome) ?? { squad: nome, qtd: 0, somaEstoque: 0, somaFinanceiro: 0 };
      entry.qtd += 1;
      entry.somaEstoque += l.percentualEstoque;
      entry.somaFinanceiro += l.percentualFinanceiro;
      mapa.set(nome, entry);
    }
    return Array.from(mapa.values())
      .map((s) => ({ squad: s.squad, mediaEstoque: s.somaEstoque / s.qtd, mediaFinanceiro: s.somaFinanceiro / s.qtd }))
      .sort((a, b) => b.mediaFinanceiro - a.mediaFinanceiro);
  }, [linhas]);

  const distribuicaoTipoBase = useMemo(() => {
    const totais = { 'BASE -20': 0, 'BASE 30+': 0, 'BASE FOCO -100': 0, 'BASE FOCO +100': 0, 'TOP 20': 0 };
    for (const l of linhas) {
      totais['BASE -20'] += l.base20;
      totais['BASE 30+'] += l.base30Mais;
      totais['BASE FOCO -100'] += l.baseFoco100Menos;
      totais['BASE FOCO +100'] += l.baseFoco100Mais;
      totais['TOP 20'] += l.top20;
    }
    return Object.entries(totais).map(([tipo, qtd]) => ({ tipo, qtd }));
  }, [linhas]);

  const top10 = useMemo(() => linhas.slice(0, 10), [linhas]);

  const totalVendedores = linhas.length;
  const totalBasesSemana = linhas.reduce((s, l) => s + l.totalBases, 0);
  const squadDestaque = porSquad[0]?.squad ?? '—';

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-warning-bg bg-warning-bg/40 px-4 py-3 text-xs text-warning">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <p>Pontuação parcial (colunas A-U) — ainda não inclui tempo falado, acionamentos, % fechamento de lead nem redutores (Fase 2, depende do crm-internal). Não é o tier final da campanha.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Vendedores na semana" value={totalVendedores} icon={Trophy} color="#323131" />
        <KpiCard title="Total de vendas Base" value={totalBasesSemana} icon={PackageSearch} color={COR_ESTOQUE} />
        <KpiCard title="Squad em destaque (financeiro)" value={squadDestaque} sub={porSquad[0] ? fmtPct(porSquad[0].mediaFinanceiro) : undefined} icon={Wallet} color={COR_FINANCEIRO} />
        <KpiCard title="Squads na semana" value={porSquad.length} icon={LayoutGrid} color="#872BFF" />
      </div>

      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Wallet size={15} className="text-primary" /> Ritmo médio por squad (% de atingimento da meta semanal)
        </h2>
        <ResponsiveContainer width="100%" height={Math.max(220, porSquad.length * 44)}>
          <BarChart data={porSquad} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="squad" width={140} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtPct(Number(v))} />
            <Legend formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
            <Bar dataKey="mediaEstoque" name="Estoque" fill={COR_ESTOQUE} radius={[0, 4, 4, 0]} />
            <Bar dataKey="mediaFinanceiro" name="Financeiro" fill={COR_FINANCEIRO} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <PackageSearch size={15} className="text-primary" /> Distribuição de vendas por Tipo Base
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={distribuicaoTipoBase}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="qtd" name="Vendas" radius={[4, 4, 0, 0]}>
              {distribuicaoTipoBase.map((d) => (
                <Cell key={d.tipo} fill={COR_TIPO_BASE[d.tipo]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Trophy size={15} className="text-primary" /> Top 10 — pontuação parcial (A-U)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">IS</th>
                <th className="px-3 py-2.5 font-semibold">Squad</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total Bases</th>
                <th className="px-5 py-2.5 font-semibold text-right">Pontos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {top10.map((l, i) => (
                <tr key={l.idVendedor} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{l.nome}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{l.squad ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.totalBases}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-bold text-primary">{l.pontuacaoParcialAU}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RankingSemanalPage() {
  const [{ dataInicial, dataFinal }, setPeriodo] = useState(semanaCampanhaAtualClient);
  const [segmento, setSegmento] = useState<SegmentoFiltro>('imoveis');
  const [squad, setSquad] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [aba, setAba] = useState<Aba>('analitico');

  const [dados, setDados] = useState<RankingSemanalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get('/api/ranking-semanal', { params: { dataInicial, dataFinal, segmento } });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [dataInicial, dataFinal, segmento]);

  useEffect(() => {
    setReloading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, segmento]);

  function irParaSemana(deltaDias: number) {
    setPeriodo((atual) => ({ dataInicial: addDias(atual.dataInicial, deltaDias), dataFinal: addDias(atual.dataFinal, deltaDias) }));
  }

  const linhasFiltradas = useMemo(() => {
    if (!dados) return [];
    return dados.linhas.filter((l) => (!squad || l.squad === squad) && (!supervisor || l.supervisor === supervisor));
  }, [dados, squad, supervisor]);

  const activeFilterCount = [squad, supervisor].filter(Boolean).length;

  function limparFiltros() {
    setSquad('');
    setSupervisor('');
  }

  function exportarCsv() {
    if (!dados) return;
    const header = [
      'IS', 'Squad', 'Ciclo', 'Supervisor', 'Base -20', 'Pontos', 'Base 30+', 'Pontos', 'Foco -100', 'Pontos',
      'Foco +100', 'Pontos', '20+', 'Pontos', 'Total Bases', 'Estoque', 'Pontos', '%', 'Financeiro', 'Pontos', '%', 'Pontos (A-U)',
    ];
    const linhasCsv = linhasFiltradas.map((l) => [
      l.nome, l.squad ?? '', l.ciclo ?? '', l.supervisor ?? '',
      l.base20, l.pontosBase20, l.base30Mais, l.pontosBase30Mais, l.baseFoco100Menos, l.pontosBaseFoco100Menos,
      l.baseFoco100Mais, l.pontosBaseFoco100Mais, l.top20, l.pontosTop20, l.totalBases,
      l.estoque, l.pontosEstoque, (l.percentualEstoque * 100).toFixed(1), l.financeiro.toFixed(2), l.pontosFinanceiro,
      (l.percentualFinanceiro * 100).toFixed(1), l.pontuacaoParcialAU,
    ]);
    const csv = [header, ...linhasCsv].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ranking-semanal-${dataInicial}-a-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando ranking semanal…</p>
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

  if (!dados) return null;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ranking Semanal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Campanha gamificada · semana Sexta a Quinta</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border px-1">
            <button onClick={() => irParaSemana(-7)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium px-1 tabular-nums">{fmtData(dataInicial)} – {fmtData(dataFinal)}</span>
            <button onClick={() => irParaSemana(7)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button onClick={() => setSegmento('imoveis')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${segmento === 'imoveis' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              <Home size={13} /> Imóveis
            </button>
            <button onClick={() => setSegmento('veiculos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${segmento === 'veiculos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              <Car size={13} /> Veículos
            </button>
          </div>
          <FilterPopover activeCount={activeFilterCount} onClear={limparFiltros}>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Squad</label>
              <Select value={squad} onChange={setSquad} className="w-full mt-1" placeholder="Todos os squads"
                options={[{ value: '', label: 'Todos os squads' }, ...dados.squads.map((s) => ({ value: s, label: s }))]} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supervisor</label>
              <Select value={supervisor} onChange={setSupervisor} className="w-full mt-1" placeholder="Todos os supervisores"
                options={[{ value: '', label: 'Todos os supervisores' }, ...dados.supervisores.map((s) => ({ value: s, label: s }))]} />
            </div>
          </FilterPopover>
          {aba === 'analitico' && (
            <button onClick={exportarCsv}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Download size={14} /> Exportar CSV
            </button>
          )}
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
        <button onClick={() => setAba('analitico')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${aba === 'analitico' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
          Analítico
        </button>
        <button onClick={() => setAba('gerencial')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${aba === 'gerencial' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
          Visão Gerencial
        </button>
      </div>

      {aba === 'analitico' ? (
        <div className="rounded-lg border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Trophy size={15} className="text-primary" /> Ranking por vendedor
            </h2>
            <span className="text-xs text-muted-foreground">{linhasFiltradas.length} vendedor(es)</span>
          </div>
          {linhasFiltradas.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum vendedor para este filtro.</div>
          ) : (
            <AnaliticoTable linhas={linhasFiltradas} />
          )}
        </div>
      ) : (
        <VisaoGerencial data={{ ...dados, linhas: linhasFiltradas }} />
      )}
    </div>
  );
}
