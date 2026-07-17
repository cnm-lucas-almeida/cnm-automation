'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingUp, Wallet, Undo2, FileWarning, Download, Landmark,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import type { PagamentosData } from '@/lib/pagamentos';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Granularidade = 'dia' | 'mes';
type Metrica = 'valor' | 'quantidade';
type Preset = 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';

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

function fmtFormaPagamento(f: string) {
  const map: Record<string, string> = { boleto: 'Boleto', cartao: 'Cartão', pix: 'Pix', deposito: 'Depósito' };
  return map[f] ?? (f.charAt(0).toUpperCase() + f.slice(1));
}

// Cor fixa por forma de pagamento (identidade, não por posição no ranking)
const FORMA_COLORS: Record<string, string> = {
  pix: '#155DFC',
  boleto: '#D08700',
  cartao: '#872BFF',
  deposito: '#00A63E',
};
const FORMA_COLOR_FALLBACK = '#6F686B';
function corForma(f: string) {
  return FORMA_COLORS[f] ?? FORMA_COLOR_FALLBACK;
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

function CustomTooltip({ active, payload, granularidade, metrica }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <p className="font-semibold mb-1.5">{granularidade === 'dia' ? fmtData(d.periodo) : fmtMesLabel(d.periodo)}</p>
      <div className="space-y-1">
        {payload.slice().reverse().map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums">
              {metrica === 'valor' ? fmtMoeda(Number(p.value)) : p.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-border/80 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{metrica === 'valor' ? fmtMoeda(total) : total}</span>
      </div>
      {d.valorEstornado > 0 && (
        <p className="mt-1.5 pt-1.5 border-t border-border/80 text-destructive">
          Estornado: <span className="font-semibold tabular-nums">{fmtMoeda(d.valorEstornado)}</span>
        </p>
      )}
    </div>
  );
}

export default function PagamentosPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [metrica, setMetrica] = useState<Metrica>('valor');

  const [dados, setDados] = useState<PagamentosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDados = useCallback(async (di: string, df: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/pagamentos', { params: { dataInicial: di, dataFinal: df } });
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

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== 'personalizado') {
      const { dataInicial: di, dataFinal: df } = presetParaDatas(p);
      setDataInicial(di);
      setDataFinal(df);
    }
  }

  const serie = useMemo(() => {
    if (!dados) return [];
    return granularidade === 'dia' ? dados.seriePorDia : dados.seriePorMes;
  }, [dados, granularidade]);

  // Formas ordenadas por relevância (maior volume primeiro = base da pilha)
  const formas = useMemo(
    () => (dados ? dados.rankingFormaPagamento.map((f) => f.formaPagamento) : []),
    [dados]
  );

  const serieFlat = useMemo(() => serie.map((s) => {
    const obj: Record<string, any> = { ...s };
    for (const forma of formas) {
      obj[`valor_${forma}`] = s.porForma[forma]?.valor ?? 0;
      obj[`qtd_${forma}`] = s.porForma[forma]?.qtd ?? 0;
    }
    return obj;
  }), [serie, formas]);

  const renderTotalLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = serieFlat[index];
    if (!item) return null;
    const total = metrica === 'valor' ? item.valorRecebido : item.qtdPagamentos;
    if (!total) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="#6F686B">
        {metrica === 'valor' ? fmtMoeda(total) : total}
      </text>
    );
  };

  function exportarCsv() {
    if (!dados) return;
    const header = ['Pagamento', 'Cliente', 'Data', 'Forma', 'Valor', 'Estorno', 'NFS-e'];
    const linhas = dados.pagamentos.map((p) => [
      p.idPagamento, p.clienteNome, fmtData(p.dataPagamento), fmtFormaPagamento(p.formaPagamento),
      p.valor.toFixed(2), p.estorno ? 'Sim' : 'Não', p.temNfs ? 'Sim' : 'Não',
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-pagamentos-${dataInicial}-a-${dataFinal}.csv`;
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
        <p className="text-sm font-medium">Carregando pagamentos do período…</p>
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
    <div className={`max-w-[1800px] mx-auto p-6 space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatório de Pagamentos</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
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
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Total de pagamentos" value={dados.kpis.totalPagamentos.toLocaleString('pt-BR')}
          sub={`ticket médio ${fmtMoeda(dados.kpis.ticketMedio)}`}
          icon={Landmark} color="#323131" />
        <KpiCard title="Valor recebido" value={fmtMoeda(dados.kpis.valorRecebido)}
          sub={`líquido: ${fmtMoeda(dados.kpis.valorLiquido)}`}
          icon={Wallet} color="#1E7A34" />
        <KpiCard title="Estornos" value={dados.kpis.qtdEstornos.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorEstornado)}
          icon={Undo2} color="#CA3500" />
        <KpiCard title="Sem NFS-e" value={dados.kpis.qtdSemNfs.toLocaleString('pt-BR')}
          sub={`${dados.kpis.qtdComNfs.toLocaleString('pt-BR')} com NFS-e emitida`}
          icon={FileWarning} color="#B8860B" />
      </div>

      {/* Evolução */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Evolução de pagamentos
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button onClick={() => setMetrica('valor')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metrica === 'valor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Valor
              </button>
              <button onClick={() => setMetrica('quantidade')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metrica === 'quantidade' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Quantidade
              </button>
            </div>
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
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={serieFlat} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis
              dataKey="periodo"
              tickFormatter={granularidade === 'dia' ? fmtDiaLabel : fmtMesLabel}
              tick={{ fontSize: 10 }}
              interval={granularidade === 'dia' ? Math.max(0, Math.floor(serie.length / 20)) : 0}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={metrica === 'valor' ? (v) => `${(v / 1000).toFixed(0)}k` : undefined} />
            <Tooltip content={<CustomTooltip granularidade={granularidade} metrica={metrica} />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
              formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
            />
            {formas.map((forma, i) => {
              const isTopo = i === formas.length - 1;
              return (
                <Bar
                  key={forma}
                  dataKey={metrica === 'valor' ? `valor_${forma}` : `qtd_${forma}`}
                  name={fmtFormaPagamento(forma)}
                  stackId="forma"
                  fill={corForma(forma)}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  radius={isTopo ? [2, 2, 0, 0] : 0}
                  minPointSize={isTopo ? 1 : undefined}
                >
                  {isTopo && serieFlat.length <= 45 && <LabelList content={renderTotalLabel} />}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ranking forma de pagamento */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Wallet size={15} className="text-primary" /> Por forma de pagamento
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Forma</th>
                <th className="px-4 py-2.5 font-semibold text-right">Qtd</th>
                <th className="px-4 py-2.5 font-semibold text-right">Recebido</th>
                <th className="px-5 py-2.5 font-semibold text-right">Estornado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dados.rankingFormaPagamento.map((f) => (
                <tr key={f.formaPagamento} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{fmtFormaPagamento(f.formaPagamento)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">{f.qtdPagamentos}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs text-success">{fmtMoeda(f.valorRecebido)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-xs text-destructive">{f.valorEstornado > 0 ? fmtMoeda(f.valorEstornado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
