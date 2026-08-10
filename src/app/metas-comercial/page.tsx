'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Wallet, ShoppingCart, Boxes, Users, Home, Car, Info,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetasComercialData, RollupMetrica, TendenciaMes, Segmento } from '@/lib/metas-comercial';
import { SegmentTabs } from '@/components/ui/SegmentTabs';

type Resposta = MetasComercialData & { tendenciaMensal: TendenciaMes[] | null };

const SEGMENTO_TABS = [
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v: number, casas = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.slice(0, 7).split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`;
}

function pct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

function corPercentual(v: number | null): string {
  if (v == null) return 'text-muted-foreground';
  if (v >= 100) return 'text-success';
  if (v >= 70) return 'text-warning';
  return 'text-destructive';
}

function MetricaCard({
  title, icon: Icon, metrica, fmt,
}: { title: string; icon: any; metrica: RollupMetrica; fmt: (v: number) => string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">{title}</p>
          <p className="font-bold mt-1 tabular-nums text-2xl">{fmt(metrica.realizado)}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Meta: {metrica.meta != null ? fmt(metrica.meta) : 'não cadastrada'}
          </p>
        </div>
        <Icon size={20} className="opacity-60 flex-shrink-0 mt-1 text-primary" />
      </div>
      <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Atingido</p>
          <p className={`font-semibold tabular-nums ${corPercentual(metrica.percentualAtingido)}`}>{pct(metrica.percentualAtingido)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Média/dia útil</p>
          <p className="font-semibold tabular-nums">{fmt(metrica.mediaRealizadaDia)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Ritmo diário necessário</p>
          <p className="font-semibold tabular-nums">{metrica.ritmoDiarioNecessario != null ? fmt(metrica.ritmoDiarioNecessario) : 'mês encerrado'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Projeção (mantendo ritmo)</p>
          <p className="font-semibold tabular-nums">{fmt(metrica.projecaoMantendoRitmo)}</p>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ title, dados, fmt }: { title: string; dados: { mes: string; realizado: number; meta: number | null }[]; fmt: (v: number) => string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={dados} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={0} />
          <Tooltip formatter={(v) => fmt(Number(v) || 0)} />
          <Bar dataKey="realizado" name="Realizado" fill="#CA3500" radius={[2, 2, 0, 0]} />
          <Line dataKey="meta" name="Meta" stroke="#CA3500" strokeOpacity={0.5} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MetasComercialPage() {
  const [segmento, setSegmento] = useState<Segmento>('imoveis');
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await axios.get<Resposta>('/api/metas-comercial', { params: { segmento, mes, tendencia: 1 } });
      setDados(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [segmento, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando painel de metas…</p>
      </div>
    );
  }

  if (error || !dados) {
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

  const tendenciaFinanceiro = (dados.tendenciaMensal ?? []).map((t) => ({ mes: fmtMes(t.mesReferencia), realizado: t.financeiro.realizado, meta: t.financeiro.meta }));
  const tendenciaPv = (dados.tendenciaMensal ?? []).map((t) => ({ mes: fmtMes(t.mesReferencia), realizado: t.pv.realizado, meta: t.pv.meta }));
  const tendenciaEstoque = (dados.tendenciaMensal ?? []).map((t) => ({ mes: fmtMes(t.mesReferencia), realizado: t.estoque.realizado, meta: t.estoque.meta }));

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel de Metas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comercial · {dados.statusMes === 'atual' ? 'Mês em andamento' : dados.statusMes === 'passado' ? 'Mês encerrado' : 'Mês futuro'} · {fmtMes(dados.mesReferencia)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => { setReloading(true); setMes(e.target.value); }}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <SegmentTabs value={segmento} onChange={(v) => { setReloading(true); setSegmento(v); }} options={SEGMENTO_TABS} />
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs vertical */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricaCard title="Financeiro" icon={Wallet} metrica={dados.vertical.financeiro} fmt={fmtMoeda} />
        <MetricaCard title="PV" icon={ShoppingCart} metrica={dados.vertical.pv} fmt={(v) => fmtNum(v)} />
        <MetricaCard title="Estoque" icon={Boxes} metrica={dados.vertical.estoque} fmt={(v) => fmtNum(v)} />
        <div className="rounded-lg border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">Headcount</p>
              <p className="font-bold mt-1 tabular-nums text-2xl">{dados.vertical.headcountAtual}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Ideal: {dados.vertical.headcountIdeal != null ? fmtNum(dados.vertical.headcountIdeal) : 'não cadastrado'}
              </p>
            </div>
            <Users size={20} className="opacity-60 flex-shrink-0 mt-1 text-primary" />
          </div>
        </div>
      </div>

      {/* Squads */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Squads — {fmtMes(dados.mesReferencia)}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-3 font-semibold">Squad</th>
                <th className="px-4 py-3 font-semibold text-right">Financeiro (real. / meta)</th>
                <th className="px-4 py-3 font-semibold text-right">% Fin.</th>
                <th className="px-4 py-3 font-semibold text-right">PV (real. / meta)</th>
                <th className="px-4 py-3 font-semibold text-right">% PV</th>
                <th className="px-4 py-3 font-semibold text-right">Estoque (real. / meta)</th>
                <th className="px-5 py-3 font-semibold text-right">% Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dados.squads.map((s) => (
                <tr key={s.squadId} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 font-medium">{s.squadNome}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {fmtMoeda(s.financeiro.realizado)} <span className="text-muted-foreground">/ {s.financeiro.meta != null ? fmtMoeda(s.financeiro.meta) : '—'}</span>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${corPercentual(s.financeiro.percentualAtingido)}`}>{pct(s.financeiro.percentualAtingido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {fmtNum(s.pv.realizado)} <span className="text-muted-foreground">/ {s.pv.meta != null ? fmtNum(s.pv.meta) : '—'}</span>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${corPercentual(s.pv.percentualAtingido)}`}>{pct(s.pv.percentualAtingido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {fmtNum(s.estoque.realizado)} <span className="text-muted-foreground">/ {s.estoque.meta != null ? fmtNum(s.estoque.meta) : '—'}</span>
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold ${corPercentual(s.estoque.percentualAtingido)}`}>{pct(s.estoque.percentualAtingido)}</td>
                </tr>
              ))}
              {dados.squads.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">Nenhum squad ativo para este segmento.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tendência mensal */}
      {dados.tendenciaMensal && dados.tendenciaMensal.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TrendChart title="Tendência — Financeiro" dados={tendenciaFinanceiro} fmt={fmtMoeda} />
          <TrendChart title="Tendência — PV" dados={tendenciaPv} fmt={(v) => fmtNum(v)} />
          <TrendChart title="Tendência — Estoque" dados={tendenciaEstoque} fmt={(v) => fmtNum(v)} />
        </div>
      )}

      {/* Bloco macro */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Macro do mês (cadastro manual)</h2>
        </div>
        {!dados.macro ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dado macro cadastrado para {fmtMes(dados.mesReferencia)}. Preencha em{' '}
            <a href="/configuracoes/comercial/metas-macro" className="text-primary underline">Configurações · Comercial · Metas Macro</a>.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
            <div><p className="text-muted-foreground">Faturamento total</p><p className="font-semibold tabular-nums mt-0.5">{fmtMoeda(dados.macro.faturamentoTotal)}</p></div>
            <div><p className="text-muted-foreground">Clientes ativos</p><p className="font-semibold tabular-nums mt-0.5">{fmtNum(dados.macro.clientesAtivos)}</p></div>
            <div><p className="text-muted-foreground">Estoque usados</p><p className="font-semibold tabular-nums mt-0.5">{fmtNum(dados.macro.estoqueUsados)}</p></div>
            <div><p className="text-muted-foreground">Ficha de lançamento</p><p className="font-semibold tabular-nums mt-0.5">{fmtNum(dados.macro.fichaLancamento)}</p></div>
            <div><p className="text-muted-foreground">Vendidas</p><p className="font-semibold tabular-nums mt-0.5">{fmtNum(dados.macro.vendidas)}</p></div>
            <div><p className="text-muted-foreground">Cancelamentos (PV / R$)</p><p className="font-semibold tabular-nums mt-0.5">{fmtNum(dados.macro.cancelamentosPv)} / {fmtMoeda(dados.macro.cancelamentosValor)}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
