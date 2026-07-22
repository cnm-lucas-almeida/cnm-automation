'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Users, Search, ChevronUp, ChevronDown, ChevronsUpDown, Info,
  LayoutGrid, Home, Car,
} from 'lucide-react';
import type { InsideSalesData, InsideSalesRow, Segmento } from '@/lib/inside-sales';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { SegmentTabs } from '@/components/ui/SegmentTabs';

const SEGMENTO_TABS = [
  { value: 'todos' as const, label: 'Geral', icon: LayoutGrid },
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

type SortCol =
  | 'nome' | 'qtdPvAtiva' | 'bases' | 'baseMeta' | 'metaQtdPvAtiva'
  | 'financeiroTotal' | 'financeiroPercentual'
  | 'percentualMetaDiariaBatida' | 'mediaPvPorDia' | 'ticketMedioPorPlano'
  | 'estoqueTotal' | 'estoqueTotalPercentual' | 'percentualMetaEstoqueDiariaBatida';
type SortDir = 'asc' | 'desc';
type Preset = 'este_mes' | 'mes_passado' | 'personalizado';
type Aba = 'todos' | Segmento;

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtNum(v: number | null, casas = 0): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtMoeda(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: ultimoDia.toISOString().slice(0, 10) };
  }
  return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
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

const DESCRICOES: Record<string, string> = {
  nome: 'Nome do colaborador na Convenia, filtrado por gestor = Jackson Savi Alberti e cargo contendo "Vendedor". Abaixo do nome, o cargo exato.',
  squad: 'Squad do vendedor no admin (crm_squad), vinculado a partir da Convenia por CPF ou, se o CPF não estiver cadastrado, por nome. "—" quando não há vínculo encontrado.',
  ciclo: 'Baseado no período de experiência da Convenia: 1° até o fim do 1º período, 2° até o fim do 2º período, V (efetivo) depois disso ou quando não há período de experiência cadastrado.',
  qtdPvAtiva: 'Quantidade de vendas ativas no período (não canceladas, não congeladas) — mesmo cálculo do Relatório de Vendas: total de contratos menos congeladas menos canceladas (motivo de cancelamento ≠ 16).',
  mediaPvPorDia: 'Qtd PV ativa dividida pelos dias úteis já decorridos dentro do período selecionado (de dataInicial até dataFinal, contando seg-sex).',
  bases: 'Quantidade de links de contrato (tb_gerencia_link_contrato) com Deal Flow = OUTBOUND cadastrados no período, vinculados ao vendedor pelo cadastro mais recente do cliente.',
  baseMeta: 'Bases dividido pelos dias úteis do mês inteiro (segunda a sexta, considerando o mês da data inicial do período).',
  metaQtdPvAtiva: 'Qtd PV ativa dividida por 20 (padrão fixo de dias úteis por mês).',
  metaFinanceiro: 'Meta financeira mensal do squad, cadastrada em Configurações > Comercial > Metas. Calculada como meta financeira diária × 20.',
  financeiroTotal: 'Soma do valor de todos os contratos do vendedor no período (valor_mensalidade_original) — igual ao campo "Valor Total" do relatório de vendas do admin. Inclui ativos, congelados e cancelados.',
  faltaMetaFinanceiro: 'Financeiro total menos Meta financeiro. Negativo (vermelho) = ainda falta atingir a meta; positivo/zero (verde) = meta batida ou superada.',
  financeiroPercentual: 'Financeiro total dividido pela Meta financeiro, em %.',
  percentualMetaDiariaBatida: 'Financeiro total dividido por (meta financeira diária × dias úteis do mês), em %. Por enquanto não desconta dias de férias/afastamento.',
  ticketMedioPorPlano: 'Financeiro total dividido pela Qtd PV ativa — ticket médio por venda ativa.',
  metaEstoqueTotal: 'Meta de estoque mensal do squad, cadastrada em Configurações > Comercial > Metas. Calculada como meta de estoque diária × 20.',
  estoqueTotal: 'Soma da capacidade de anúncios (qtd_imoveis ou qtd_veiculos do plano ativo do cliente) de todos os contratos do vendedor no período — mesmo cálculo do campo "QTDE ANUN" do relatório de vendas do admin.',
  faltaMetaEstoqueTotal: 'Estoque total menos Meta estoque total. Negativo (vermelho) = ainda falta atingir a meta; positivo/zero (verde) = meta batida ou superada.',
  estoqueTotalPercentual: 'Estoque total dividido pela Meta estoque total, em %.',
  percentualMetaEstoqueDiariaBatida: 'Estoque total dividido por (meta de estoque diária × dias úteis do mês), em %.',
};

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function atualizarPosicao() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const largura = 260;
    setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - largura - 8) });
  }

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); atualizarPosicao(); setOpen((o) => !o); }}
        onMouseEnter={() => { atualizarPosicao(); setOpen(true); }}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground/50 hover:text-primary transition-colors normal-case"
      >
        <Info size={11} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 260 }}
          className="z-50 rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-[11px] normal-case font-normal text-foreground leading-snug"
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}

function HeaderLabel({ label, info }: { label: string; info: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoTooltip text={info} />
    </span>
  );
}

function CicloBadge({ ciclo }: { ciclo: InsideSalesRow['ciclo'] }) {
  if (ciclo === 'V') {
    return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">V</span>;
  }
  return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">{ciclo}</span>;
}

export default function InsideSalesPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [aba, setAba] = useState<Aba>('todos');

  const [dados, setDados] = useState<InsideSalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [supervisorFiltro, setSupervisorFiltro] = useState<string>('todos');
  const [sortCol, setSortCol] = useState<SortCol>('nome');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchDados = useCallback(async (di: string, df: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/inside-sales', { params: { dataInicial: di, dataFinal: df } });
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

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'nome' ? 'asc' : 'desc'); }
  }

  const linhasPorSegmento = useMemo(() => {
    if (!dados) return [];
    return aba === 'todos' ? dados.linhas : dados.linhas.filter((l) => l.segmento === aba);
  }, [dados, aba]);

  const supervisoresDisponiveis = useMemo(() => {
    const nomes = new Set(linhasPorSegmento.map((l) => l.supervisor).filter((s): s is string => Boolean(s)));
    return [...nomes].sort((a, b) => a.localeCompare(b));
  }, [linhasPorSegmento]);

  const linhasFiltradas = useMemo(() => {
    let lista = linhasPorSegmento;
    if (supervisorFiltro !== 'todos') lista = lista.filter((l) => l.supervisor === supervisorFiltro);
    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter((l) =>
        l.nome.toLowerCase().includes(termo) ||
        (l.squad ?? '').toLowerCase().includes(termo)
      );
    }
    return [...lista].sort((a, b) => {
      let v = 0;
      if (sortCol === 'nome') v = a.nome.localeCompare(b.nome);
      else if (sortCol === 'qtdPvAtiva') v = (a.qtdPvAtiva ?? -1) - (b.qtdPvAtiva ?? -1);
      else if (sortCol === 'bases') v = (a.bases ?? -1) - (b.bases ?? -1);
      else if (sortCol === 'baseMeta') v = (a.baseMeta ?? -1) - (b.baseMeta ?? -1);
      else if (sortCol === 'metaQtdPvAtiva') v = (a.metaQtdPvAtiva ?? -1) - (b.metaQtdPvAtiva ?? -1);
      else if (sortCol === 'financeiroTotal') v = (a.financeiroTotal ?? -1) - (b.financeiroTotal ?? -1);
      else if (sortCol === 'financeiroPercentual') v = (a.financeiroPercentual ?? -1) - (b.financeiroPercentual ?? -1);
      else if (sortCol === 'percentualMetaDiariaBatida') v = a.percentualMetaDiariaBatida - b.percentualMetaDiariaBatida;
      else if (sortCol === 'mediaPvPorDia') v = (a.mediaPvPorDia ?? -1) - (b.mediaPvPorDia ?? -1);
      else if (sortCol === 'ticketMedioPorPlano') v = a.ticketMedioPorPlano - b.ticketMedioPorPlano;
      else if (sortCol === 'estoqueTotal') v = (a.estoqueTotal ?? -1) - (b.estoqueTotal ?? -1);
      else if (sortCol === 'estoqueTotalPercentual') v = (a.estoqueTotalPercentual ?? -1) - (b.estoqueTotalPercentual ?? -1);
      else v = a.percentualMetaEstoqueDiariaBatida - b.percentualMetaEstoqueDiariaBatida;
      return sortDir === 'asc' ? v : -v;
    });
  }, [linhasPorSegmento, supervisorFiltro, busca, sortCol, sortDir]);

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando métricas de Inside Sales…</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Métricas de Inside Sales</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)} · {dados.diasUteisNoMes} dias úteis no mês</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentTabs
            value={aba}
            onChange={(v) => { setAba(v); setSupervisorFiltro('todos'); }}
            options={SEGMENTO_TABS}
          />
          <Select
            value={preset}
            onChange={(v) => aplicarPreset(v as Preset)}
            className="min-w-[170px]"
            options={[
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
          <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
            <Users size={15} className="text-primary" /> Inside Sales
          </h2>
          <Select
            value={supervisorFiltro}
            onChange={setSupervisorFiltro}
            className="min-w-[200px]"
            options={[
              { value: 'todos', label: 'Todos os supervisores' },
              ...supervisoresDisponiveis.map((s) => ({ value: s, label: s })),
            ]}
          />
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou squad…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-xs text-muted-foreground">{linhasFiltradas.length} IS</span>
        </div>

        {linhasFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum Inside Sales encontrado para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[3200px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="nome" current={sortCol} dir={sortDir} onSort={toggleSort} className="sticky left-0 z-20 bg-card px-5 w-[220px] min-w-[220px]"><HeaderLabel label="IS" info={DESCRICOES.nome} /></SortTh>
                  <th className="sticky left-[220px] z-20 bg-card px-4 py-3 font-semibold w-[200px] min-w-[200px]"><HeaderLabel label="Squad" info={DESCRICOES.squad} /></th>
                  <th className="px-4 py-3 font-semibold text-center"><HeaderLabel label="Ciclo" info={DESCRICOES.ciclo} /></th>
                  <SortTh col="qtdPvAtiva" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Qtd PV ativa" info={DESCRICOES.qtdPvAtiva} /></SortTh>
                  <SortTh col="mediaPvPorDia" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Média PV/dia" info={DESCRICOES.mediaPvPorDia} /></SortTh>
                  <SortTh col="bases" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Bases" info={DESCRICOES.bases} /></SortTh>
                  <SortTh col="baseMeta" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Base/Meta" info={DESCRICOES.baseMeta} /></SortTh>
                  <SortTh col="metaQtdPvAtiva" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Meta Qtd PV ativa" info={DESCRICOES.metaQtdPvAtiva} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Meta financeiro" info={DESCRICOES.metaFinanceiro} /></th>
                  <SortTh col="financeiroTotal" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Financeiro total" info={DESCRICOES.financeiroTotal} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Falta meta financeiro" info={DESCRICOES.faltaMetaFinanceiro} /></th>
                  <SortTh col="financeiroPercentual" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Financeiro %" info={DESCRICOES.financeiroPercentual} /></SortTh>
                  <SortTh col="percentualMetaDiariaBatida" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="% Meta diária batida" info={DESCRICOES.percentualMetaDiariaBatida} /></SortTh>
                  <SortTh col="ticketMedioPorPlano" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Ticket médio / plano" info={DESCRICOES.ticketMedioPorPlano} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Meta estoque total" info={DESCRICOES.metaEstoqueTotal} /></th>
                  <SortTh col="estoqueTotal" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Estoque total" info={DESCRICOES.estoqueTotal} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Falta meta estoque total" info={DESCRICOES.faltaMetaEstoqueTotal} /></th>
                  <SortTh col="estoqueTotalPercentual" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Estoque total %" info={DESCRICOES.estoqueTotalPercentual} /></SortTh>
                  <SortTh col="percentualMetaEstoqueDiariaBatida" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5 text-right"><HeaderLabel label="% Meta estoque diária batida" info={DESCRICOES.percentualMetaEstoqueDiariaBatida} /></SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasFiltradas.map((l) => (
                  <tr key={l.nome} className="group hover:bg-muted/50 transition-colors">
                    <td className="sticky left-0 z-10 bg-card group-hover:bg-muted px-5 py-3 w-[220px] min-w-[220px]">
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">{l.cargo}</div>
                    </td>
                    <td className="sticky left-[220px] z-10 bg-card group-hover:bg-muted px-4 py-3 text-xs w-[200px] min-w-[200px]">{l.squad ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><CicloBadge ciclo={l.ciclo} /></td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtNum(l.qtdPvAtiva)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtNum(l.mediaPvPorDia, 2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(l.bases)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(l.baseMeta, 2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(l.metaQtdPvAtiva, 2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoeda(l.metaFinanceiro)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(l.financeiroTotal)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${l.faltaMetaFinanceiro !== null && l.faltaMetaFinanceiro >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {fmtMoeda(l.faltaMetaFinanceiro)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${l.financeiroPercentual !== null && l.financeiroPercentual >= 100 ? 'text-success' : 'text-warning'}`}>
                      {l.financeiroPercentual !== null ? `${fmtNum(l.financeiroPercentual, 1)}%` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${l.percentualMetaDiariaBatida >= 100 ? 'text-success' : 'text-warning'}`}>
                      {fmtNum(l.percentualMetaDiariaBatida, 1)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtMoeda(l.ticketMedioPorPlano)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtNum(l.metaEstoqueTotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtNum(l.estoqueTotal)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${l.faltaMetaEstoqueTotal !== null && l.faltaMetaEstoqueTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {fmtNum(l.faltaMetaEstoqueTotal)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${l.estoqueTotalPercentual !== null && l.estoqueTotalPercentual >= 100 ? 'text-success' : 'text-warning'}`}>
                      {l.estoqueTotalPercentual !== null ? `${fmtNum(l.estoqueTotalPercentual, 1)}%` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold ${l.percentualMetaEstoqueDiariaBatida >= 100 ? 'text-success' : 'text-warning'}`}>
                      {fmtNum(l.percentualMetaEstoqueDiariaBatida, 1)}%
                    </td>
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
