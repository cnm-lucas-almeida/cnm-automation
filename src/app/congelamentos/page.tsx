'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingUp, Wallet, Package, Clock, Download, X, Search,
  Home, Car, LayoutGrid, DollarSign, Info, AlertTriangle, Unlock, Snowflake, Repeat, XCircle,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, BarChart, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import type {
  CongelamentosData, Congelamento, Vertical, DescongelamentosData, Descongelamento, Origem,
} from '@/lib/congelamentos';
import { Select } from '@/components/ui/Select';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { ComparativoCell } from '@/components/ui/ComparativoCell';
import { formatCurrencyBRL, formatNumberBR, formatPercent } from '@/lib/format';

type Aba = 'congelamentos' | 'descongelamentos';

const ABA_TABS = [
  { value: 'congelamentos' as const, label: 'Congelamentos', icon: Snowflake },
  { value: 'descongelamentos' as const, label: 'Descongelamentos', icon: Unlock },
];

const VERTICAL_TABS = [
  { value: '' as const, label: 'Geral', icon: LayoutGrid },
  { value: 'imovel' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculo' as const, label: 'Veículos', icon: Car },
];

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Mesma paleta categórica validada usada em src/lib/assinaturas (8 matizes, CVD-safe) — reaproveitada aqui.
const CORES = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];

const RESULTADO_LABEL: Record<string, string> = {
  Ativo: 'Ativo',
  Cancelado: 'Cancelado',
  'Contrato não encontrado': 'Não encontrado',
};

const RESULTADO_BADGE: Record<string, string> = {
  Ativo: 'bg-success-bg text-success',
  Cancelado: 'bg-destructive/10 text-destructive',
  'Contrato não encontrado': 'bg-muted text-muted-foreground',
};

type Granularidade = 'dia' | 'mes';
type Metrica = 'quantidade' | 'valor';
type Direcao = 'positiva' | 'negativa' | 'neutra';

const PAGE_SIZE = 20;

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function somaDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fmtData(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function diaSemanaAbrev(periodo: string) {
  const [y, m, d] = periodo.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
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

/** Espelha o critério do dashboard de campanhas (src/lib/campanhas/aggregate.ts): a seta reflete o sinal
 * real da variação, a cor reflete se aquilo é bom ou ruim pro negócio. */
function calcularDelta(atual: number, anterior: number, melhorSeDiminuir: boolean | null): { variacaoPct: number | null; direcao: Direcao } {
  const variacaoPct = anterior !== 0 ? (atual - anterior) / anterior : null;
  if (melhorSeDiminuir === null || variacaoPct === null || variacaoPct === 0) return { variacaoPct, direcao: 'neutra' };
  const aumentou = variacaoPct > 0;
  return { variacaoPct, direcao: (melhorSeDiminuir ? !aumentou : aumentou) ? 'positiva' : 'negativa' };
}

function KpiCard({
  title, icon: Icon, atual, anterior, melhorSeDiminuir, formatador, sub,
}: {
  title: string; icon: any; atual: number; anterior: number; melhorSeDiminuir: boolean | null;
  formatador: (v: number) => string; sub?: string;
}) {
  const { variacaoPct, direcao } = calcularDelta(atual, anterior, melhorSeDiminuir);
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">{title}</p>
          <div className="mt-1">
            <ComparativoCell atual={atual} anterior={anterior} variacaoPct={variacaoPct} direcao={direcao} formatador={formatador} align="left" />
          </div>
          {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        </div>
        <Icon size={20} className="opacity-60 flex-shrink-0 mt-1 text-muted-foreground" />
      </div>
    </div>
  );
}

function DestaqueCard({
  icon: Icon, color, bg, title, destaque, detalhe,
}: { icon: any; color: string; bg: string; title: string; destaque: { nome: string; local: string } | null; detalhe: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <span className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${bg}`}>
        <Icon size={15} className={color} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        {destaque ? (
          <>
            <p className="text-sm font-semibold truncate">{destaque.nome}</p>
            <p className="text-xs text-muted-foreground">{detalhe} · {destaque.local}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">Sem dados no período.</p>
        )}
      </div>
    </div>
  );
}

function DonutCard({
  title, sub, items,
}: { title: string; sub: string; items: { chave: string; qtd: number }[] }) {
  const total = items.reduce((s, i) => s + i.qtd, 0);
  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="font-semibold text-sm">{title}</h2>
      <p className="text-xs text-muted-foreground mb-3">{sub}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem dados no período.</p>
      ) : (
        <div className="flex items-center gap-3">
          <ResponsiveContainer width={130} height={130} className="flex-shrink-0">
            <PieChart>
              <Pie data={items} dataKey="qtd" nameKey="chave" cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={2}>
                {items.map((it, i) => (
                  <Cell key={it.chave} fill={CORES[i % CORES.length]} stroke="var(--card)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any, _n: any, entry: any) => [`${v} (${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%)`, entry?.payload?.chave]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 min-w-0 space-y-2">
            {items.map((it, i) => (
              <div key={it.chave} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CORES[i % CORES.length] }} />
                  <span className="truncate font-medium">{it.chave}</span>
                </span>
                <span className="text-muted-foreground tabular-nums flex-shrink-0">
                  {it.qtd} · {total > 0 ? ((it.qtd / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparativoTooltip({ active, payload, metrica, label = 'Eventos' }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const fmt = (v: number) => (metrica === 'valor' ? formatCurrencyBRL(v) : formatNumberBR(v));
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{fmtData(d.periodo)} ({diaSemanaAbrev(d.periodo)})</p>
      <p>{label}: <span className="font-semibold tabular-nums">{fmt(metrica === 'valor' ? d.valorAtual : d.qtdAtual)}</span></p>
      <p className="text-muted-foreground">Período anterior: <span className="tabular-nums">{fmt(metrica === 'valor' ? d.valorAnterior : d.qtdAnterior)}</span></p>
    </div>
  );
}

function DetalheCongelamentoModal({ item, motivoLabel, onClose }: { item: Congelamento; motivoLabel: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold">{item.nomeFantasia || item.nomeCliente}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Cliente #{item.idCliente}{item.idContrato ? ` · Contrato #${item.idContrato}` : ''}</p>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Congelado em</span><span className="font-medium">{new Date(item.dataCongelamento).toLocaleString('pt-BR')}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            {item.dataDescongelamento ? (
              <span className="font-medium text-success">Descongelou em {new Date(item.dataDescongelamento).toLocaleString('pt-BR')}</span>
            ) : (
              <span className="font-medium">Ainda congelado</span>
            )}
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Vertical</span><span className="font-medium">{item.vertical === 'imovel' ? 'Imóveis' : item.vertical === 'veiculo' ? 'Veículos' : 'Não informado'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Plano</span><span className="font-medium text-right">{item.nomePlano ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Valor mensalidade</span><span className="font-medium">{formatCurrencyBRL(item.valorMensalidade)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Estoque (veículo/imóvel)</span><span className="font-medium">{item.estoqueVeiculo} / {item.estoqueImovel}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cidade/UF</span><span className="font-medium">{item.nomeCidade ? `${item.nomeCidade}/${item.siglaUf ?? ''}` : '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Dia de vencimento</span><span className="font-medium">{item.diaVencimento ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Motivo</span><span className="font-medium text-right">{motivoLabel ?? 'Não informado'}</span></div>
          {item.observacao && (
            <div>
              <span className="text-muted-foreground text-xs">Observação</span>
              <p className="text-sm mt-1">{item.observacao}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetalheDescongelamentoModal({ item, onClose }: { item: Descongelamento; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold">{item.nomeFantasia || item.nomeCliente}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Cliente #{item.idCliente}{item.idContrato ? ` · Contrato #${item.idContrato}` : ''}</p>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Congelou em</span><span className="font-medium">{new Date(item.dataCongelamento).toLocaleString('pt-BR')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Descongelou em</span><span className="font-medium">{new Date(item.dataDescongelamento).toLocaleString('pt-BR')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tempo congelado</span><span className="font-medium">{formatNumberBR(item.diasCongelado)} dias</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Origem</span><span className="font-medium">{item.origem === 'manual' ? 'Manual' : 'Automático'}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Resultado até hoje</span>
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${RESULTADO_BADGE[item.resultadoContrato === 'ativo' ? 'Ativo' : item.resultadoContrato === 'cancelado' ? 'Cancelado' : 'Contrato não encontrado']}`}>
              {item.resultadoContrato === 'ativo' ? 'Ativo' : item.resultadoContrato === 'cancelado' ? 'Cancelado' : 'Não encontrado'}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Já voltou a congelar?</span><span className="font-medium">{item.jaVoltouACongelar ? 'Sim' : 'Não (por enquanto)'}</span></div>
          {item.temSnapshot ? (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Vertical</span><span className="font-medium">{item.vertical === 'imovel' ? 'Imóveis' : item.vertical === 'veiculo' ? 'Veículos' : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Plano</span><span className="font-medium text-right">{item.nomePlano ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor mensalidade</span><span className="font-medium">{item.valorMensalidade != null ? formatCurrencyBRL(item.valorMensalidade) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cidade/UF</span><span className="font-medium">{item.nomeCidade ? `${item.nomeCidade}/${item.siglaUf ?? ''}` : '—'}</span></div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">Esse congelamento aconteceu antes de 23/07/2026 — não tem snapshot de valor/plano/estoque disponível.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CongelamentosPage() {
  const [aba, setAba] = useState<Aba>('congelamentos');
  const [dataInicial, setDataInicial] = useState(() => somaDiasIso(isoHoje(), -6));
  const [dataFinal, setDataFinal] = useState(() => isoHoje());
  const [uf, setUf] = useState('');
  const [cidade, setCidade] = useState('');
  const [cidadeInput, setCidadeInput] = useState('');
  const [vertical, setVertical] = useState<'' | Vertical>('');
  const [motivo, setMotivo] = useState('');
  const [origem, setOrigem] = useState<'' | Origem>('');

  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [metrica, setMetrica] = useState<Metrica>('quantidade');

  const [dadosCongelamentos, setDadosCongelamentos] = useState<CongelamentosData | null>(null);
  const [dadosDescongelamentos, setDadosDescongelamentos] = useState<DescongelamentosData | null>(null);
  const [reloading, setReloading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [modalItem, setModalItem] = useState<Congelamento | null>(null);
  const [modalDescongelamento, setModalDescongelamento] = useState<Descongelamento | null>(null);

  const fetchCongelamentos = useCallback(async (di: string, df: string, ufF: string, cidadeF: string, verticalF: string, motivoF: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/congelamentos', {
        params: { dataInicial: di, dataFinal: df, uf: ufF || undefined, cidade: cidadeF || undefined, vertical: verticalF || undefined, motivo: motivoF || undefined },
      });
      setDadosCongelamentos(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  const fetchDescongelamentos = useCallback(async (di: string, df: string, ufF: string, cidadeF: string, verticalF: string, origemF: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/congelamentos/descongelamentos', {
        params: { dataInicial: di, dataFinal: df, uf: ufF || undefined, cidade: cidadeF || undefined, vertical: verticalF || undefined, origem: origemF || undefined },
      });
      setDadosDescongelamentos(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  const refazerFetch = useCallback(() => {
    setReloading(true);
    const promessa = aba === 'congelamentos'
      ? fetchCongelamentos(dataInicial, dataFinal, uf, cidade, vertical, motivo)
      : fetchDescongelamentos(dataInicial, dataFinal, uf, cidade, vertical, origem);
    promessa.finally(() => setReloading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, dataInicial, dataFinal, uf, cidade, vertical, motivo, origem]);

  useEffect(() => {
    setPage(1);
    refazerFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, dataInicial, dataFinal, uf, cidade, vertical, motivo, origem]);

  const motivoLabelPorId = useMemo(() => {
    const map = new Map<number, string>();
    dadosCongelamentos?.motivosDisponiveis.forEach((m) => map.set(m.id, m.reason));
    return map;
  }, [dadosCongelamentos]);

  const linhasCongelamentosFiltradas = useMemo(() => {
    if (!dadosCongelamentos) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return dadosCongelamentos.linhas;
    return dadosCongelamentos.linhas.filter((l) =>
      (l.nomeFantasia ?? '').toLowerCase().includes(termo) ||
      (l.nomeCliente ?? '').toLowerCase().includes(termo) ||
      String(l.idCliente).includes(termo)
    );
  }, [dadosCongelamentos, busca]);

  const linhasDescongelamentosFiltradas = useMemo(() => {
    if (!dadosDescongelamentos) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return dadosDescongelamentos.linhas;
    return dadosDescongelamentos.linhas.filter((l) =>
      (l.nomeFantasia ?? '').toLowerCase().includes(termo) ||
      (l.nomeCliente ?? '').toLowerCase().includes(termo) ||
      String(l.idCliente).includes(termo)
    );
  }, [dadosDescongelamentos, busca]);

  const linhasFiltradas: (Congelamento | Descongelamento)[] = aba === 'congelamentos' ? linhasCongelamentosFiltradas : linhasDescongelamentosFiltradas;
  const totalPages = Math.max(1, Math.ceil(linhasFiltradas.length / PAGE_SIZE));
  const linhasPaginadas = linhasFiltradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportarCsvCongelamentos() {
    if (!dadosCongelamentos) return;
    const header = ['Vertical', 'Data Congelamento', 'Status', 'Data Descongelamento', 'Cliente', 'Cidade', 'UF', 'Plano', 'Valor', 'Vencimento', 'Motivo', 'Observação'];
    const linhasCsv = linhasCongelamentosFiltradas.map((l) => [
      l.vertical === 'imovel' ? 'Imóveis' : l.vertical === 'veiculo' ? 'Veículos' : 'Não informado',
      new Date(l.dataCongelamento).toLocaleString('pt-BR'),
      l.dataDescongelamento ? 'Descongelou' : 'Ainda congelado',
      l.dataDescongelamento ? new Date(l.dataDescongelamento).toLocaleString('pt-BR') : '',
      l.nomeFantasia ?? l.nomeCliente ?? '',
      l.nomeCidade ?? '',
      l.siglaUf ?? '',
      l.nomePlano ?? '',
      l.valorMensalidade.toFixed(2),
      l.diaVencimento ?? '',
      l.idMotivo ? motivoLabelPorId.get(l.idMotivo) ?? '' : '',
      l.observacao ?? '',
    ]);
    baixarCsv(header, linhasCsv, `relatorio-congelamentos-${dataInicial}-a-${dataFinal}.csv`);
  }

  function exportarCsvDescongelamentos() {
    if (!dadosDescongelamentos) return;
    const header = ['Vertical', 'Data Congelamento', 'Data Descongelamento', 'Tempo Congelado (dias)', 'Origem', 'Resultado', 'Cliente', 'Cidade', 'UF', 'Plano', 'Valor'];
    const linhasCsv = linhasDescongelamentosFiltradas.map((l) => [
      l.vertical === 'imovel' ? 'Imóveis' : l.vertical === 'veiculo' ? 'Veículos' : 'Não informado',
      new Date(l.dataCongelamento).toLocaleString('pt-BR'),
      new Date(l.dataDescongelamento).toLocaleString('pt-BR'),
      l.diasCongelado,
      l.origem === 'manual' ? 'Manual' : 'Automático',
      l.resultadoContrato === 'ativo' ? 'Ativo' : l.resultadoContrato === 'cancelado' ? 'Cancelado' : 'Não encontrado',
      l.nomeFantasia ?? l.nomeCliente ?? '',
      l.nomeCidade ?? '',
      l.siglaUf ?? '',
      l.nomePlano ?? '',
      l.valorMensalidade != null ? l.valorMensalidade.toFixed(2) : '',
    ]);
    baixarCsv(header, linhasCsv, `relatorio-descongelamentos-${dataInicial}-a-${dataFinal}.csv`);
  }

  function baixarCsv(header: string[], linhas: (string | number)[][], nomeArquivo: string) {
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dadosAtivos = aba === 'congelamentos' ? dadosCongelamentos : dadosDescongelamentos;
  const updatedAt = dadosAtivos?.generatedAt
    ? new Date(dadosAtivos.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (!dadosAtivos && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando {aba === 'congelamentos' ? 'congelamentos' : 'descongelamentos'} do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={refazerFetch}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dadosAtivos) return null;

  return (
    <div className={`mx-auto space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{aba === 'congelamentos' ? 'Congelamentos' : 'Descongelamentos'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dadosAtivos.periodo.dataInicial)} a {fmtData(dadosAtivos.periodo.dataFinal)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentTabs value={aba} onChange={(v) => setAba(v as Aba)} options={ABA_TABS} />
          <SegmentTabs value={vertical} onChange={(v) => setVertical(v as '' | Vertical)} options={VERTICAL_TABS} />
          <Select value={uf} onChange={setUf} className="min-w-[130px]"
            options={[{ value: '', label: 'Todas UFs' }, ...UFS.map((s) => ({ value: s, label: s }))]} />
          <input
            value={cidadeInput}
            onChange={(e) => setCidadeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setCidade(cidadeInput.trim()); }}
            onBlur={() => setCidade(cidadeInput.trim())}
            placeholder="Cidade (exata)"
            className="px-4 py-2.5 text-sm border border-border rounded-lg bg-card min-w-[150px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {aba === 'congelamentos' ? (
            <Select value={motivo} onChange={setMotivo} className="min-w-[170px]"
              options={[{ value: '', label: 'Todos os motivos' }, ...(dadosCongelamentos?.motivosDisponiveis.map((m) => ({ value: String(m.id), label: m.reason })) ?? [])]} />
          ) : (
            <Select value={origem} onChange={(v) => setOrigem(v as '' | Origem)} className="min-w-[150px]"
              options={[{ value: '', label: 'Toda origem' }, { value: 'manual', label: 'Manual' }, { value: 'automatico', label: 'Automático' }]} />
          )}
          <DateRangePicker dataInicial={dataInicial} dataFinal={dataFinal} onChange={(di, df) => { setDataInicial(di); setDataFinal(df); }} />
          <button onClick={aba === 'congelamentos' ? exportarCsvCongelamentos : exportarCsvDescongelamentos}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {aba === 'descongelamentos' && (uf || cidade || vertical) && dadosDescongelamentos && (
        <p className="text-xs text-muted-foreground">
          Atenção: filtrar por UF/cidade/vertical aqui reduz bastante a base — a maioria dos descongelamentos atuais é de
          congelamentos antigos, sem esse dado (ver cobertura abaixo).
        </p>
      )}

      {aba === 'congelamentos' && dadosCongelamentos && (
        <CongelamentosView
          dados={dadosCongelamentos}
          granularidade={granularidade} setGranularidade={setGranularidade}
          metrica={metrica} setMetrica={setMetrica}
        />
      )}

      {aba === 'descongelamentos' && dadosDescongelamentos && (
        <DescongelamentosView
          dados={dadosDescongelamentos}
          granularidade={granularidade} setGranularidade={setGranularidade}
        />
      )}

      {/* Tabela (compartilhada, colunas mudam por aba) */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold mr-auto">{aba === 'congelamentos' ? 'Congelamentos' : 'Descongelamentos'}</h2>
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              placeholder="Buscar cliente…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-xs text-muted-foreground">{linhasFiltradas.length} registro(s)</span>
        </div>

        {linhasFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum registro encontrado para este filtro.</div>
        ) : aba === 'congelamentos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-3 font-semibold">Vertical</th>
                  <th className="px-4 py-3 font-semibold">Data Ref.</th>
                  <th className="px-4 py-3 font-semibold">Cliente / Local</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold text-right">Valor</th>
                  <th className="px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-5 py-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(linhasPaginadas as Congelamento[]).map((l) => (
                  <tr key={l.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {l.vertical === 'veiculo' ? <Car size={12} className="text-muted-foreground" /> : <Home size={12} className="text-muted-foreground" />}
                        {l.vertical === 'imovel' ? 'Imóveis' : l.vertical === 'veiculo' ? 'Veículos' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtData(l.dataCongelamento)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-1.5">
                        #{l.idCliente} {l.nomeFantasia || l.nomeCliente}
                        {l.dataDescongelamento && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-success-bg text-success">
                            <Unlock size={9} /> Descongelou
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{l.nomeCidade ? `${l.nomeCidade} - ${l.siglaUf ?? ''}` : '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{l.nomePlano ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs whitespace-nowrap">{formatCurrencyBRL(l.valorMensalidade)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{l.diaVencimento ? `Dia ${l.diaVencimento}` : '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setModalItem(l)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Info size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-3 font-semibold">Descongelou em</th>
                  <th className="px-4 py-3 font-semibold">Cliente / Local</th>
                  <th className="px-4 py-3 font-semibold text-right">Tempo congelado</th>
                  <th className="px-4 py-3 font-semibold">Plano / Valor</th>
                  <th className="px-4 py-3 font-semibold">Origem</th>
                  <th className="px-4 py-3 font-semibold text-center">Resultado</th>
                  <th className="px-5 py-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(linhasPaginadas as Descongelamento[]).map((l) => {
                  const resultadoChave = l.resultadoContrato === 'ativo' ? 'Ativo' : l.resultadoContrato === 'cancelado' ? 'Cancelado' : 'Contrato não encontrado';
                  return (
                    <tr key={l.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtData(l.dataDescongelamento)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-1.5">
                          #{l.idCliente} {l.nomeFantasia || l.nomeCliente}
                          {l.jaVoltouACongelar && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning-bg text-warning">
                              <Repeat size={9} /> Voltou a congelar
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{l.nomeCidade ? `${l.nomeCidade} - ${l.siglaUf ?? ''}` : '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">{formatNumberBR(l.diasCongelado)} dias</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {l.temSnapshot ? `${l.nomePlano ?? '—'} · ${l.valorMensalidade != null ? formatCurrencyBRL(l.valorMensalidade) : '—'}` : (
                          <span className="text-muted-foreground italic">sem dado</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{l.origem === 'manual' ? 'Manual' : 'Automático'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${RESULTADO_BADGE[resultadoChave]}`}>
                          {RESULTADO_LABEL[resultadoChave]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => setModalDescongelamento(l)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Info size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

      {modalItem && (
        <DetalheCongelamentoModal item={modalItem} motivoLabel={modalItem.idMotivo ? motivoLabelPorId.get(modalItem.idMotivo) ?? null : null} onClose={() => setModalItem(null)} />
      )}
      {modalDescongelamento && (
        <DetalheDescongelamentoModal item={modalDescongelamento} onClose={() => setModalDescongelamento(null)} />
      )}
    </div>
  );
}

function CongelamentosView({
  dados, granularidade, setGranularidade, metrica, setMetrica,
}: {
  dados: CongelamentosData;
  granularidade: Granularidade; setGranularidade: (g: Granularidade) => void;
  metrica: Metrica; setMetrica: (m: Metrica) => void;
}) {
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Congelamentos" icon={TrendingUp} atual={dados.kpis.congelamentos.atual} anterior={dados.kpis.congelamentos.anterior}
          melhorSeDiminuir={true} formatador={(v) => formatNumberBR(v)} />
        <KpiCard title="Receita congelada" icon={DollarSign} atual={dados.kpis.receita.atual} anterior={dados.kpis.receita.anterior}
          melhorSeDiminuir={null} formatador={formatCurrencyBRL} />
        <KpiCard title="Estoque congelado" icon={Package} atual={dados.kpis.estoque.atual} anterior={dados.kpis.estoque.anterior}
          melhorSeDiminuir={true} formatador={(v) => formatNumberBR(v)} />
        <KpiCard title="Ticket médio" icon={Wallet} atual={dados.kpis.ticketMedio.atual} anterior={dados.kpis.ticketMedio.anterior}
          melhorSeDiminuir={true} formatador={formatCurrencyBRL} />
      </div>

      {/* Série no tempo + Destaques */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 rounded-lg border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" /> Congelamentos no Tempo
            </h2>
            <div className="flex items-center gap-2">
              <Select value={metrica} onChange={(v) => setMetrica(v as Metrica)} className="min-w-[120px]"
                options={[{ value: 'quantidade', label: 'Quantidade' }, { value: 'valor', label: 'Valor' }]} />
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button onClick={() => setGranularidade('dia')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Diário
                </button>
                <button onClick={() => setGranularidade('mes')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Mensal
                </button>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            {granularidade === 'dia' ? (
              <ComposedChart data={dados.serieComparativoPorDia} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                <XAxis dataKey="periodo" tickFormatter={fmtDiaLabel} tick={{ fontSize: 10 }}
                  interval={Math.max(0, Math.floor(dados.serieComparativoPorDia.length / 20))} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ComparativoTooltip metrica={metrica} label="Congelamentos" />} />
                <Bar dataKey={metrica === 'quantidade' ? 'qtdAtual' : 'valorAtual'} name="Congelamentos" fill="#CA3500" radius={[2, 2, 0, 0]}>
                  {dados.serieComparativoPorDia.length <= 45 && (
                    <LabelList dataKey={metrica === 'quantidade' ? 'qtdAtual' : 'valorAtual'} position="top"
                      formatter={(v: any) => (metrica === 'valor' ? formatNumberBR(Number(v), { notation: 'compact' }) : v)}
                      style={{ fontSize: 10, fill: '#6F686B' }} />
                  )}
                </Bar>
                <Line type="monotone" dataKey={metrica === 'quantidade' ? 'qtdAnterior' : 'valorAnterior'} name="Período anterior"
                  stroke="#6F686B" strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 2, fill: '#6F686B' }} />
              </ComposedChart>
            ) : (
              <BarChart data={dados.seriePorMes} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                <XAxis dataKey="periodo" tickFormatter={fmtMesLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => (metrica === 'valor' ? formatCurrencyBRL(Number(v)) : v)} labelFormatter={(l: any) => fmtMesLabel(String(l))} />
                <Bar dataKey={metrica === 'quantidade' ? 'qtd' : 'valor'} name="Congelamentos" fill="#CA3500" radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-2">Linha tracejada = período anterior (mesmo nº de dias, imediatamente antes).</p>
        </div>

        <div className="rounded-lg border border-border p-5 flex flex-col">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-primary" /> Destaques de Atenção
          </h2>
          <div className="flex-1 flex flex-col justify-center gap-3 py-2">
            <DestaqueCard icon={DollarSign} color="text-destructive" bg="bg-destructive/10" title="Maior receita congelada"
              destaque={dados.destaques.maiorReceita} detalhe={dados.destaques.maiorReceita ? formatCurrencyBRL(dados.destaques.maiorReceita.valorMensalidade as number) + ' / mês' : ''} />
            <DestaqueCard icon={Package} color="text-warning" bg="bg-warning-bg" title="Maior estoque congelado"
              destaque={dados.destaques.maiorEstoque} detalhe={dados.destaques.maiorEstoque ? `${dados.destaques.maiorEstoque.estoqueTotal} anúncio(s)` : ''} />
            <DestaqueCard icon={Clock} color="text-info" bg="bg-info-bg" title="Cliente mais antigo congelado"
              destaque={dados.destaques.maisAntigo} detalhe={dados.destaques.maisAntigo?.dataCadastroContrato
                ? `desde ${fmtData(String(dados.destaques.maisAntigo.dataCadastroContrato))}` : ''} />
          </div>
        </div>
      </div>

      {/* Donuts + UF */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DonutCard title="Por Vencimento" sub="Distribuição dos congelamentos por dia de vencimento" items={dados.porVencimento} />
        <DonutCard title="Perfil de Cliente" sub="Distribuição por vertical do cliente congelado" items={dados.porPerfilCliente} />
        <div className="rounded-lg border border-border p-5">
          <h2 className="font-semibold text-sm">Congelamentos por UF</h2>
          <p className="text-xs text-muted-foreground mb-3">Distribuição geográfica dos congelamentos (top 7 + Outros)</p>
          {dados.porUf.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sem dados no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dados.porUf} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="chave" tick={{ fontSize: 11 }} width={50} />
                <Tooltip />
                <Bar dataKey="qtd" name="Congelamentos" fill="#2a78d6" radius={[0, 3, 3, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}

function DescongelamentosView({
  dados, granularidade, setGranularidade,
}: {
  dados: DescongelamentosData;
  granularidade: Granularidade; setGranularidade: (g: Granularidade) => void;
}) {
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Descongelamentos" icon={Unlock} atual={dados.kpis.descongelamentos.atual} anterior={dados.kpis.descongelamentos.anterior}
          melhorSeDiminuir={false} formatador={(v) => formatNumberBR(v)} />
        <KpiCard title="Tempo médio congelado" icon={Clock} atual={dados.kpis.tempoMedioCongeladoDias.atual} anterior={dados.kpis.tempoMedioCongeladoDias.anterior}
          melhorSeDiminuir={null} formatador={(v) => `${formatNumberBR(v, { maximumFractionDigits: 0 })} dias`} />
        <KpiCard title="Cancelou depois" icon={XCircle} atual={dados.kpis.taxaCancelamentoPos.atual} anterior={dados.kpis.taxaCancelamentoPos.anterior}
          melhorSeDiminuir={true} formatador={(v) => formatPercent(v)} />
        <KpiCard title="Voltou a congelar" icon={Repeat} atual={dados.kpis.taxaRecorrencia.atual} anterior={dados.kpis.taxaRecorrencia.anterior}
          melhorSeDiminuir={true} formatador={(v) => formatPercent(v)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Receita reativada: <span className="font-medium text-foreground">{formatCurrencyBRL(dados.receitaReativada)}</span> · Estoque
        reativado: <span className="font-medium text-foreground">{formatNumberBR(dados.estoqueReativado)}</span> — baseado em{' '}
        {dados.coberturaSnapshot.comDado} de {dados.coberturaSnapshot.total} descongelamentos com dado de valor disponível
        (congelamentos antigos ainda não têm esse snapshot).
      </p>

      {/* Série no tempo + Destaques */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 rounded-lg border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Unlock size={16} className="text-primary" /> Descongelamentos no Tempo
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button onClick={() => setGranularidade('dia')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Diário
              </button>
              <button onClick={() => setGranularidade('mes')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Mensal
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            {granularidade === 'dia' ? (
              <ComposedChart data={dados.serieComparativoPorDia} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                <XAxis dataKey="periodo" tickFormatter={fmtDiaLabel} tick={{ fontSize: 10 }}
                  interval={Math.max(0, Math.floor(dados.serieComparativoPorDia.length / 20))} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ComparativoTooltip metrica="quantidade" label="Descongelamentos" />} />
                <Bar dataKey="qtdAtual" name="Descongelamentos" fill="#1baf7a" radius={[2, 2, 0, 0]}>
                  {dados.serieComparativoPorDia.length <= 45 && (
                    <LabelList dataKey="qtdAtual" position="top" style={{ fontSize: 10, fill: '#6F686B' }} />
                  )}
                </Bar>
                <Line type="monotone" dataKey="qtdAnterior" name="Período anterior"
                  stroke="#6F686B" strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 2, fill: '#6F686B' }} />
              </ComposedChart>
            ) : (
              <BarChart data={dados.seriePorMes} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
                <XAxis dataKey="periodo" tickFormatter={fmtMesLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(l: any) => fmtMesLabel(String(l))} />
                <Bar dataKey="qtd" name="Descongelamentos" fill="#1baf7a" radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-2">Linha tracejada = período anterior (mesmo nº de dias, imediatamente antes).</p>
        </div>

        <div className="rounded-lg border border-border p-5 flex flex-col">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-primary" /> Destaques de Atenção
          </h2>
          <div className="flex-1 flex flex-col justify-center gap-3 py-2">
            <DestaqueCard icon={Clock} color="text-warning" bg="bg-warning-bg" title="Mais tempo congelado antes de descongelar"
              destaque={dados.destaques.maiorTempoCongelado} detalhe={dados.destaques.maiorTempoCongelado ? `${formatNumberBR(dados.destaques.maiorTempoCongelado.diasCongelado as number)} dias congelado` : ''} />
            <DestaqueCard icon={Repeat} color="text-destructive" bg="bg-destructive/10" title="Reincidente mais recente"
              destaque={dados.destaques.reincidenteRecente} detalhe={dados.destaques.reincidenteRecente ? `descongelou em ${fmtData(String(dados.destaques.reincidenteRecente.dataDescongelamento))}, já voltou a congelar` : ''} />
            {!dados.destaques.maiorTempoCongelado && !dados.destaques.reincidenteRecente && (
              <p className="text-xs text-muted-foreground text-center">Sem destaques no período.</p>
            )}
          </div>
        </div>
      </div>

      {/* Donuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DonutCard title="Origem" sub="Manual (admin) vs. automático (cron de cobrança)" items={dados.porOrigem} />
        <DonutCard title="Resultado até hoje" sub="Estado atual do contrato de quem descongelou" items={dados.porResultado} />
      </div>
    </>
  );
}
