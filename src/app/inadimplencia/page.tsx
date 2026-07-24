'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Users, TrendingDown, TrendingUp,
  Wallet, Gift, ShieldAlert, Download, X, Search, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DashboardData, CasoBonificado, ContratoDetalhe, VendedorRanking, EvolucaoMes } from '@/lib/inadimplencia';
import { Select } from '@/components/ui/Select';

type Segmento = 'todos' | 'critico' | 'recuperavel';
type SortCol = 'clienteNome' | 'ultimoContratoCliente' | 'valorRealNaoPago' | 'comissao' | 'totalContratosLifetime';
type SortDir = 'asc' | 'desc';

type Agregados = {
  kpis: DashboardData['kpis'];
  segmentacao: DashboardData['segmentacao'];
  evolucaoMensal: EvolucaoMes[];
  rankingVendedores: VendedorRanking[];
};

type ClienteAgregado = {
  idCliente: number;
  clienteNome: string;
  cpfCnpj: string | null;
  email: string;
  segmento: 'critico' | 'recuperavel';
  reincidente: boolean;
  temContratoAtivo: boolean;
  qtdCasosCliente: number;
  totalContratosLifetime: number;
  totalRecebidoLifetime: number;
  ultimoContratoCliente: string;
  valorRealNaoPago: number;
  comissaoTotal: number;
  temComissaoEstimada: boolean;
  vendedoresNomes: string[];
  idsContratoNoPadrao: number[];
};

// Agrupa os contratos "no padrão" por cliente — 1 linha por cliente na tabela principal,
// somando os valores de todos os contratos dele. O vendedor por contrato só aparece no modal.
function agruparPorCliente(casos: CasoBonificado[]): ClienteAgregado[] {
  const map = new Map<number, ClienteAgregado>();
  for (const c of casos) {
    const entry = map.get(c.idCliente) ?? {
      idCliente: c.idCliente,
      clienteNome: c.clienteNome,
      cpfCnpj: c.cpfCnpj,
      email: c.email,
      segmento: c.segmento,
      reincidente: c.reincidente,
      temContratoAtivo: c.temContratoAtivo,
      qtdCasosCliente: c.qtdCasosCliente,
      totalContratosLifetime: c.totalContratosLifetime,
      totalRecebidoLifetime: c.totalRecebidoLifetime,
      ultimoContratoCliente: c.ultimoContratoCliente,
      valorRealNaoPago: 0,
      comissaoTotal: 0,
      temComissaoEstimada: false,
      vendedoresNomes: [],
      idsContratoNoPadrao: [],
    };
    entry.valorRealNaoPago += c.valorRealNaoPago;
    entry.comissaoTotal += comissaoDoCaso(c);
    if (c.comissaoReal === null) entry.temComissaoEstimada = true;
    if (c.vendedorNome && !entry.vendedoresNomes.includes(c.vendedorNome)) entry.vendedoresNomes.push(c.vendedorNome);
    entry.idsContratoNoPadrao.push(c.idContrato);
    map.set(c.idCliente, entry);
  }
  return Array.from(map.values());
}

function anoDe(dataIso: string) {
  return String(new Date(dataIso).getUTCFullYear());
}

function mesKey(dataIso: string) {
  const d = new Date(dataIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Espelha a agregação feita em src/lib/inadimplencia (server) para poder recalcular tudo
// no cliente quando o usuário filtra por ano do último contrato — sem precisar de outra chamada à API.
function computeAggregates(casos: CasoBonificado[]): Agregados {
  const clientesUnicos = new Set(casos.map((c) => c.idCliente));
  const clientesCriticos = new Set(casos.filter((c) => c.segmento === 'critico').map((c) => c.idCliente));
  const clientesReincidentes = new Set(casos.filter((c) => c.reincidente).map((c) => c.idCliente));

  const valorNaoRecebido = casos.reduce((s, c) => s + c.valorRealNaoPago, 0);
  const valorBonificadoConsumido = casos.reduce((s, c) => s + c.valorBonificado, 0);
  const comissaoRealTotal = casos.reduce((s, c) => s + (c.comissaoReal ?? 0), 0);
  const comissaoEstimadaTotal = casos.reduce((s, c) => s + c.comissaoEstimada, 0);

  const evolucaoMap = new Map<string, { qtdContratos: number; valorPerdido: number }>();
  for (const c of casos) {
    const key = mesKey(c.dataContrato);
    const entry = evolucaoMap.get(key) ?? { qtdContratos: 0, valorPerdido: 0 };
    entry.qtdContratos += 1;
    entry.valorPerdido += c.valorRealNaoPago + (c.comissaoReal ?? c.comissaoEstimada);
    evolucaoMap.set(key, entry);
  }
  const evolucaoMensal = Array.from(evolucaoMap.entries())
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const vendedorMap = new Map<number, VendedorRanking>();
  for (const c of casos) {
    if (c.idVendedor === null) continue;
    const entry = vendedorMap.get(c.idVendedor) ?? {
      idVendedor: c.idVendedor,
      nome: c.vendedorNome ?? `Vendedor #${c.idVendedor}`,
      qtdContratos: 0,
      qtdClientes: 0,
      valorNaoRecebido: 0,
      comissaoReal: 0,
      comissaoEstimada: 0,
    };
    entry.qtdContratos += 1;
    entry.valorNaoRecebido += c.valorRealNaoPago;
    entry.comissaoReal += c.comissaoReal ?? 0;
    entry.comissaoEstimada += c.comissaoEstimada;
    vendedorMap.set(c.idVendedor, entry);
  }
  for (const [idVendedor, entry] of vendedorMap) {
    entry.qtdClientes = new Set(casos.filter((c) => c.idVendedor === idVendedor).map((c) => c.idCliente)).size;
  }
  const rankingVendedores = Array.from(vendedorMap.values()).sort(
    (a, b) => b.comissaoReal + b.comissaoEstimada - (a.comissaoReal + a.comissaoEstimada)
  );

  return {
    kpis: {
      totalContratos: casos.length,
      totalClientes: clientesUnicos.size,
      totalReincidentes: clientesReincidentes.size,
      valorNaoRecebido,
      valorBonificadoConsumido,
      comissaoRealTotal,
      comissaoEstimadaTotal,
      prejuizoConfirmado: valorNaoRecebido + comissaoRealTotal,
      prejuizoEstimadoAdicional: comissaoEstimadaTotal,
    },
    segmentacao: {
      criticos: clientesCriticos.size,
      recuperaveis: clientesUnicos.size - clientesCriticos.size,
    },
    evolucaoMensal,
    rankingVendedores,
  };
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtMes(mes: string) {
  const [y, m] = mes.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function comissaoDoCaso(c: CasoBonificado) {
  return c.comissaoReal ?? c.comissaoEstimada;
}

function KpiCard({
  title, value, sub, icon: Icon, color, borderColor,
}: {
  title: string; value: string | number; sub?: string;
  icon: any; color: string; borderColor: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color: borderColor }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol; current: SortCol | null; dir: SortDir;
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{fmtMes(d.mes)}</p>
      <p>Contratos: <span className="font-semibold tabular-nums">{d.qtdContratos}</span></p>
      <p>Prejuízo: <span className="font-semibold tabular-nums">{fmtMoeda(d.valorPerdido)}</span></p>
    </div>
  );
}

function ClienteModal({
  cliente, onClose,
}: { cliente: ClienteAgregado; onClose: () => void }) {
  const [contratos, setContratos] = useState<ContratoDetalhe[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios.get(`/api/inadimplencia/cliente/${cliente.idCliente}`)
      .then((res) => { if (!cancelled) setContratos(res.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cliente.idCliente]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-[95vw] xl:max-w-7xl max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold">{cliente.clienteNome}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              ID {cliente.idCliente} · {cliente.cpfCnpj} · {cliente.email} · linha do tempo de contratos
            </p>
          </div>
          <button onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 size={18} className="animate-spin" /> Carregando contratos…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">{error}</div>
          ) : !contratos || contratos.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum contrato encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b border-border">
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider text-left">
                  <th className="px-6 py-2.5 font-semibold">Contrato</th>
                  <th className="px-3 py-2.5 font-semibold">Vendedor</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Data</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Cancelado</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Dias no ar</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Bonificadas</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Cobradas</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Pagas (real)</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contratos.map((c) => (
                  <tr key={c.idContrato} className={`hover:bg-muted/50 transition-colors ${c.totalRecebidoContrato === 0 ? 'bg-destructive/5' : ''}`}>
                    <td className="px-6 py-2.5 font-mono text-xs">#{c.idContrato}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.vendedorNome ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{fmtData(c.dataContrato)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums">{fmtMoeda(c.valorContrato)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {c.cancelado
                        ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">Sim</span>
                        : <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">Não</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs"
                      title={c.dataInicioVeiculacao
                        ? `Veiculado de ${fmtData(c.dataInicioVeiculacao)} até ${c.dataCongelamento ? `${fmtData(c.dataCongelamento)} (congelamento por inadimplência)` : c.dataCancelamento ? `${fmtData(c.dataCancelamento)} (cancelamento, sem registro de congelamento)` : 'hoje'}`
                        : 'Nunca chegou a ser veiculado'}>
                      {c.diasNoAr !== null ? `${c.diasNoAr}d` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {c.mensalidadesBonificadas > 0 ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-launches-bg text-launches">{c.mensalidadesBonificadas} grátis</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{c.mensalidadesCobradas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold">
                      {c.mensalidadesPagasReais}{c.mensalidadesCobradas > 0 && ` / ${c.mensalidadesCobradas}`}
                    </td>
                    <td className={`px-6 py-2.5 text-right tabular-nums font-semibold text-xs ${c.totalRecebidoContrato === 0 ? 'text-destructive' : 'text-success'}`}>
                      {fmtMoeda(c.totalRecebidoContrato)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function InadimplenciaPage() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [somenteReincidentes, setSomenteReincidentes] = useState(false);
  const [contratoAtivoFiltro, setContratoAtivoFiltro] = useState<'todos' | 'sim' | 'nao'>('todos');
  const [somenteComEstimativa, setSomenteComEstimativa] = useState(false);
  const [anoUltimoContrato, setAnoUltimoContrato] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('valorRealNaoPago');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [modalCliente, setModalCliente] = useState<ClienteAgregado | null>(null);

  const fetchDados = useCallback(async (force = false) => {
    if (dados) setReloading(true); else setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/inadimplencia/dashboard${force ? '?refresh=1' : ''}`);
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  }

  const anosDisponiveis = useMemo(() => {
    if (!dados) return [];
    const anos = new Set(dados.casos.map((c) => anoDe(c.ultimoContratoCliente)));
    return Array.from(anos).sort((a, b) => Number(b) - Number(a));
  }, [dados]);

  // Filtro global: clientes cujo ÚLTIMO contrato (de qualquer tipo, não só o bonificado) caiu nesse ano.
  // Mostra se o padrão ainda está acontecendo agora ou se é coisa antiga — recalcula todo o dashboard, não só a tabela.
  const casosBase = useMemo(() => {
    if (!dados) return [];
    if (!anoUltimoContrato) return dados.casos;
    return dados.casos.filter((c) => anoDe(c.ultimoContratoCliente) === anoUltimoContrato);
  }, [dados, anoUltimoContrato]);

  const agregados = useMemo(() => computeAggregates(casosBase), [casosBase]);

  const clientesAgregados = useMemo(() => agruparPorCliente(casosBase), [casosBase]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = clientesAgregados;
    if (segmento !== 'todos') lista = lista.filter((c) => c.segmento === segmento);
    if (somenteReincidentes) lista = lista.filter((c) => c.reincidente);
    if (contratoAtivoFiltro !== 'todos') lista = lista.filter((c) => c.temContratoAtivo === (contratoAtivoFiltro === 'sim'));
    if (somenteComEstimativa) lista = lista.filter((c) => c.temComissaoEstimada);
    if (termo) {
      lista = lista.filter((c) =>
        c.clienteNome.toLowerCase().includes(termo) ||
        (c.cpfCnpj ?? '').toLowerCase().includes(termo) ||
        c.vendedoresNomes.some((v) => v.toLowerCase().includes(termo))
      );
    }
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'clienteNome') {
        v = a.clienteNome.localeCompare(b.clienteNome);
      } else if (sortCol === 'ultimoContratoCliente') {
        v = new Date(a.ultimoContratoCliente).getTime() - new Date(b.ultimoContratoCliente).getTime();
      } else if (sortCol === 'comissao') {
        v = a.comissaoTotal - b.comissaoTotal;
      } else if (sortCol === 'valorRealNaoPago') {
        v = a.valorRealNaoPago - b.valorRealNaoPago;
      } else {
        v = a.totalContratosLifetime - b.totalContratosLifetime;
      }
      return sortDir === 'asc' ? v : -v;
    });
  }, [clientesAgregados, busca, segmento, somenteReincidentes, contratoAtivoFiltro, somenteComEstimativa, sortCol, sortDir]);

  const totalClientesComEstimativa = useMemo(
    () => clientesAgregados.filter((c) => c.temComissaoEstimada).length,
    [clientesAgregados]
  );

  const totalPages = Math.max(1, Math.ceil(clientesFiltrados.length / PAGE_SIZE));
  const paginaAtual = clientesFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportarCsv() {
    const header = ['Cliente', 'CPF/CNPJ', 'Vendedores', 'Último Contrato', 'Segmento', 'Contrato Ativo', 'Reincidente', 'Vezes no padrão', 'Contratos (vida toda)', 'Valor Não Recebido', 'Comissão', 'Comissão tem Estimativa'];
    const linhas = clientesFiltrados.map((c) => [
      c.clienteNome, c.cpfCnpj ?? '', c.vendedoresNomes.join('; '), fmtData(c.ultimoContratoCliente),
      c.segmento === 'critico' ? 'Crítico' : 'Recuperável',
      c.temContratoAtivo ? 'Sim' : 'Não',
      c.reincidente ? 'Sim' : 'Não',
      c.qtdCasosCliente,
      c.totalContratosLifetime,
      c.valorRealNaoPago.toFixed(2),
      c.comissaoTotal.toFixed(2),
      c.temComissaoEstimada ? 'Sim' : 'Não',
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inadimplencia-bonificado-${new Date().toISOString().slice(0, 10)}.csv`;
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
        <p className="text-sm font-medium">Analisando contratos, mensalidades e comissões…</p>
        <p className="text-xs">Isso pode levar alguns segundos na primeira carga.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => fetchDados()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const pctCriticos = agregados.kpis.totalClientes > 0
    ? Math.round((agregados.segmentacao.criticos / agregados.kpis.totalClientes) * 100)
    : 0;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inadimplência — Padrão Bonificado</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· contratos com período bonificado consumido e nenhuma mensalidade real paga</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={anoUltimoContrato}
            onChange={(v) => { setAnoUltimoContrato(v); setPage(1); }}
            className="min-w-[220px]"
            placeholder="Último contrato do cliente"
            options={[
              { value: '', label: 'Último contrato: todos os anos' },
              ...anosDisponiveis.map((a) => ({ value: a, label: `Último contrato em ${a}` })),
            ]}
          />
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => fetchDados(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {anoUltimoContrato && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-foreground flex items-center justify-between">
          <span>
            Mostrando apenas clientes cujo <strong>último contrato (de qualquer tipo) foi em {anoUltimoContrato}</strong> — ou seja, o relacionamento com eles ainda está "quente".
          </span>
          <button onClick={() => setAnoUltimoContrato('')} className="text-primary font-medium hover:underline flex items-center gap-1">
            <X size={12} /> limpar filtro
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard title="Contratos no padrão" value={agregados.kpis.totalContratos.toLocaleString('pt-BR')}
          sub={`${agregados.kpis.totalClientes.toLocaleString('pt-BR')} clientes únicos (um cliente pode ter mais de 1 contrato)`}
          icon={Gift} color="#323131" borderColor="#6F686B" />
        <KpiCard title="Receita nunca recebida" value={fmtMoeda(agregados.kpis.valorNaoRecebido)}
          sub="mensalidades reais geradas e não pagas"
          icon={TrendingDown} color="#CA3500" borderColor="#FF6900" />
        <KpiCard title="Comissão confirmada paga" value={fmtMoeda(agregados.kpis.comissaoRealTotal)}
          sub="já fechada em folha, sobre contratos zerados"
          icon={ShieldAlert} color="#CA3500" borderColor="#FF6900" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 lg:col-span-2">
          <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider">Prejuízo confirmado</p>
          <p className="text-3xl font-bold mt-1 tabular-nums text-destructive">{fmtMoeda(agregados.kpis.prejuizoConfirmado)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            = receita não recebida ({fmtMoeda(agregados.kpis.valorNaoRecebido)}) + comissão já paga ({fmtMoeda(agregados.kpis.comissaoRealTotal)}), fonte: tb_comissao_detalhamento. Não inclui estimativas.
          </p>
        </div>
        <button
          onClick={() => { setSomenteComEstimativa((v) => !v); setPage(1); }}
          className={`text-left rounded-lg border p-5 transition-colors ${somenteComEstimativa ? 'border-warning bg-warning-bg/40' : 'border-border hover:bg-muted/40'}`}>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sem fechamento de comissão ainda</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-warning">{totalClientesComEstimativa.toLocaleString('pt-BR')} cliente(s)</p>
          <p className="text-xs text-muted-foreground mt-1">
            não entram no prejuízo confirmado — clique pra ver na tabela abaixo
          </p>
        </button>
      </div>

      {/* Segmentação */}
      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Wallet size={15} className="text-primary" /> Segmentação de clientes afetados
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          os {agregados.kpis.totalClientes.toLocaleString('pt-BR')} clientes únicos do padrão bonificado, divididos em 2 grupos que somam o total — clique num card para filtrar a tabela abaixo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => { setSegmento(segmento === 'critico' ? 'todos' : 'critico'); setPage(1); }}
            className={`text-left rounded-lg border p-4 transition-colors ${segmento === 'critico' ? 'border-destructive bg-destructive/5' : 'border-border hover:bg-muted/40'}`}>
            <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Crítico</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{agregados.segmentacao.criticos.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground mt-1">nunca pagaram nenhum real, em nenhum contrato ({pctCriticos}% do total)</p>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-destructive/20">
              <span className="font-semibold text-foreground">{agregados.kpis.totalReincidentes.toLocaleString('pt-BR')}</span> desses são <span className="font-semibold">reincidentes</span> — 3+ contratos na vida toda, sem pagar nenhum
            </p>
          </button>
          <button onClick={() => { setSegmento(segmento === 'recuperavel' ? 'todos' : 'recuperavel'); setPage(1); }}
            className={`text-left rounded-lg border p-4 transition-colors ${segmento === 'recuperavel' ? 'border-warning bg-warning-bg/40' : 'border-border hover:bg-muted/40'}`}>
            <p className="text-xs font-semibold text-warning uppercase tracking-wider">Recuperável</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{agregados.segmentacao.recuperaveis.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground mt-1">pagaram algo em outro contrato — vale contato de cobrança</p>
          </button>
        </div>
      </div>

      {/* Evolução mensal + Ranking vendedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Evolução mensal (por data do contrato)
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={agregados.evolucaoMensal.map((m) => ({ ...m, mesLabel: fmtMes(m.mes) }))}
              margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(agregados.evolucaoMensal.length / 12))} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qtdContratos" name="Contratos" fill="#CA3500" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users size={15} className="text-primary" /> Ranking por vendedor
            </h2>
            <span className="text-xs text-muted-foreground">{agregados.rankingVendedores.length} vendedor(es)</span>
          </div>
          <div className="overflow-y-auto max-h-[240px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b border-border">
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider text-left">
                  <th className="px-5 py-2.5 font-semibold">Vendedor</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Contratos</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agregados.rankingVendedores.slice(0, 20).map((v) => (
                  <tr key={v.idVendedor} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-2.5 font-medium">{v.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{v.qtdContratos}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-xs text-destructive">
                      {fmtMoeda(v.comissaoReal + v.comissaoEstimada)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Filtros + Tabela principal */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              placeholder="Buscar por cliente, CPF/CNPJ ou vendedor(es)…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Select
            value={segmento}
            onChange={(v) => { setSegmento(v as Segmento); setPage(1); }}
            className="min-w-[160px]"
            options={[
              { value: 'todos', label: 'Todos os segmentos' },
              { value: 'critico', label: 'Somente críticos' },
              { value: 'recuperavel', label: 'Somente recuperáveis' },
            ]}
          />
          <Select
            value={contratoAtivoFiltro}
            onChange={(v) => { setContratoAtivoFiltro(v as 'todos' | 'sim' | 'nao'); setPage(1); }}
            className="min-w-[190px]"
            options={[
              { value: 'todos', label: 'Contrato ativo: todos' },
              { value: 'sim', label: 'Só com contrato ativo' },
              { value: 'nao', label: 'Só sem contrato ativo' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={somenteReincidentes}
              onChange={(e) => { setSomenteReincidentes(e.target.checked); setPage(1); }}
              className="rounded border-border" />
            Somente reincidentes (3+)
          </label>
          <span className="text-xs text-muted-foreground ml-auto">{clientesFiltrados.length.toLocaleString('pt-BR')} cliente(s)</span>
        </div>

        {paginaAtual.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum cliente encontrado para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="clienteNome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Cliente</SortTh>
                  <SortTh col="ultimoContratoCliente" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Último contrato</SortTh>
                  <th className="px-4 py-3 font-semibold text-center">Segmento</th>
                  <th className="px-4 py-3 font-semibold text-center">Contrato ativo</th>
                  <SortTh col="totalContratosLifetime" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-center">No padrão / Total</SortTh>
                  <SortTh col="valorRealNaoPago" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Não recebido</SortTh>
                  <SortTh col="comissao" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5 text-right">Comissão</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginaAtual.map((c) => (
                  <tr key={c.idCliente} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setModalCliente(c)}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.clienteNome}</div>
                      <div className="text-xs text-muted-foreground">{c.cpfCnpj}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">{fmtData(c.ultimoContratoCliente)}</td>
                    <td className="px-4 py-3 text-center">
                      <div>
                        {c.segmento === 'critico' ? (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-destructive/10 text-destructive">Crítico</span>
                        ) : (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">Recuperável</span>
                        )}
                        {c.reincidente && (
                          <span className="ml-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-launches-bg text-launches" title={`${c.totalContratosLifetime} contratos na vida toda, nunca pagou nenhum`}>
                            Reincidente ({c.totalContratosLifetime}x)
                          </span>
                        )}
                      </div>
                      {c.segmento === 'recuperavel' && (
                        <p className="text-[10px] text-muted-foreground mt-1">já pagou {fmtMoeda(c.totalRecebidoLifetime)} no total</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" title={c.temContratoAtivo ? 'Cliente tem pelo menos 1 contrato não cancelado hoje' : 'Todos os contratos deste cliente estão cancelados'}>
                      {c.temContratoAtivo ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">Sim</span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-xs" title={`${c.qtdCasosCliente} de ${c.totalContratosLifetime} contratos deste cliente estão no padrão bonificado-sem-pagamento`}>
                      <span className={c.qtdCasosCliente === c.totalContratosLifetime ? 'font-semibold' : ''}>{c.qtdCasosCliente}</span>
                      <span className="text-muted-foreground"> / {c.totalContratosLifetime}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs text-destructive">{fmtMoeda(c.valorRealNaoPago)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs">
                      <span className={c.temComissaoEstimada ? 'text-warning' : 'text-destructive font-semibold'}>
                        {fmtMoeda(c.comissaoTotal)}
                      </span>
                      {c.temComissaoEstimada && <span className="ml-1 text-[9px] text-muted-foreground">(parte est.)</span>}
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

      {modalCliente && <ClienteModal cliente={modalCliente} onClose={() => setModalCliente(null)} />}
    </div>
  );
}
