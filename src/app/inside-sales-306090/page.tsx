'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Loader2, RefreshCw, AlertCircle, Users, Search, ChevronUp, ChevronDown, ChevronsUpDown, Info, FileSpreadsheet,
} from 'lucide-react';
import type { InsideSales306090Data, InsideSales306090Row, CicloStatus, CicloPerformance } from '@/lib/inside-sales-306090';
import { Select } from '@/components/ui/Select';

type SortCol = 'nome' | 'diasRestantesCiclo' | 'pvTotal90Dias' | 'valorTotal90Dias' | 'metaGeralFinanceiroPercentual' | 'roiPeriodo';
type SortDir = 'asc' | 'desc';
type CicloFiltro = 'todos' | CicloStatus;

function fmtData(s: string | null): string {
  if (!s) return '—';
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtNum(v: number | null, casas = 0): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDias(v: number | null): string {
  if (v === null) return '—';
  if (v < 0) return `${Math.abs(v)}d atrás`;
  return `${v}d`;
}

const CICLO_LABEL: Record<CicloStatus, string> = {
  ciclo1: '1º Ciclo',
  ciclo2: '2º Ciclo',
  ciclo3: '3º Ciclo',
  validado: 'Validado',
};

function CicloBadge({ ciclo }: { ciclo: CicloStatus }) {
  if (ciclo === 'validado') {
    return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success whitespace-nowrap">Validado</span>;
  }
  return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning whitespace-nowrap">{CICLO_LABEL[ciclo]}</span>;
}

function CicloCell({ ciclo }: { ciclo: CicloPerformance }) {
  const bateu = ciclo.metaPercentual >= 100;
  return (
    <div className="text-right">
      <div className={`tabular-nums text-xs font-semibold ${bateu ? 'text-success' : 'text-warning'}`}>
        {ciclo.vendas} vendas · {fmtNum(ciclo.metaPercentual, 0)}%
      </div>
      <div className="tabular-nums text-[11px] text-muted-foreground">{fmtMoeda(ciclo.financeiro)}</div>
    </div>
  );
}

const DESCRICOES: Record<string, string> = {
  nome: 'Colaborador na Convenia, filtrado por gestor = Jackson Savi Alberti, cargo contendo "Vendedor" e departamento Imóveis. Abaixo do nome, o cargo exato da Convenia.',
  squad: 'Squad atual do vendedor no admin (crm_salesperson_allocation + crm_squad), vinculado a partir da Convenia por CPF ou nome.',
  supervisor: 'Supervisor/treinador atual do vendedor no admin (tb_vendedor_grupo, perfil=4).',
  ciclo: 'Ciclo de validação comercial: 30 dias corridos por ciclo a partir da data de admissão. "Validado" = passou dos 90 dias.',
  diasRestantesCiclo: 'Dias restantes até o fim do ciclo atual. Zero quando já validado.',
  validacaoRh: 'Datas de fim do período de experiência (Convenia). Ficam vazias quando a Convenia não tem mais o período de experiência armazenado (comum para admissões antigas).',
  ciclo1: 'Vendas e valor faturado (tb_financeiro_contrato, não cancelado, cliente não congelado) entre o dia 1 e o dia 30 da admissão. Meta: 10 vendas / R$ 3.000.',
  ciclo2: 'Mesmo cálculo do ciclo 1, entre o dia 31 e o dia 60. Meta: 15 vendas / R$ 4.500.',
  ciclo3: 'Mesmo cálculo do ciclo 1, entre o dia 61 e o dia 90. Meta: 20 vendas / R$ 6.000.',
  pvTotal90Dias: 'Soma das vendas dos 3 ciclos.',
  metaGeralPvPercentual: 'PV total dividido pela meta geral de 45 vendas em 90 dias.',
  valorTotal90Dias: 'Soma do financeiro dos 3 ciclos.',
  metaGeralFinanceiroPercentual: 'Valor total dividido pela meta geral de R$ 13.500 em 90 dias.',
  mediaPvPeriodo: 'PV total dividido por 3 (média mensal de vendas no período).',
  mediaValorPeriodo: 'Valor total dividido por 3 (média mensal de faturamento no período).',
  roiPeriodo: 'Média de valor mensal dividida pela meta do 1º ciclo (R$ 3.000), menos 1. Mesmo cálculo usado na planilha de métricas do time de IS.',
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

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' }) {
  const cor = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${cor}`}>{value}</p>
    </div>
  );
}

function exportarExcel(linhas: InsideSales306090Row[]) {
  const header = [
    'Nome', 'Cargo', 'Squad', 'Supervisor', 'Admissão', 'Ciclo Atual', 'Dias Restantes Ciclo',
    'Validação RH 45', 'Dias Faltantes 45', 'Validação RH 90', 'Dias Faltantes 90',
    'Ciclo 1 - Vendas', 'Ciclo 1 - Meta %', 'Ciclo 1 - Financeiro',
    'Ciclo 2 - Vendas', 'Ciclo 2 - Meta %', 'Ciclo 2 - Financeiro',
    'Ciclo 3 - Vendas', 'Ciclo 3 - Meta %', 'Ciclo 3 - Financeiro',
    'PV Total 90 dias', '% Meta Geral PV', 'Valor Total 90 dias', '% Meta Geral Financeiro',
    'Média PV/mês', 'Média Valor/mês', 'ROI %',
  ];
  const linhasExport = linhas.map((l) => [
    l.nome, l.cargo ?? '', l.squad ?? '', l.supervisor ?? '', l.dataAdmissao, CICLO_LABEL[l.cicloAtual], l.diasRestantesCiclo,
    l.validacaoRh45 ?? '', l.diasFaltantesValidacao45 ?? '', l.validacaoRh90 ?? '', l.diasFaltantesValidacao90 ?? '',
    l.ciclo1.vendas, Math.round(l.ciclo1.metaPercentual), l.ciclo1.financeiro,
    l.ciclo2.vendas, Math.round(l.ciclo2.metaPercentual), l.ciclo2.financeiro,
    l.ciclo3.vendas, Math.round(l.ciclo3.metaPercentual), l.ciclo3.financeiro,
    l.pvTotal90Dias, Math.round(l.metaGeralPvPercentual), l.valorTotal90Dias, Math.round(l.metaGeralFinanceiroPercentual),
    Math.round(l.mediaPvPeriodo * 10) / 10, l.mediaValorPeriodo, Math.round(l.roiPeriodo),
  ]);
  const planilha = XLSX.utils.aoa_to_sheet([header, ...linhasExport]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'IS 30-60-90');
  XLSX.writeFile(livro, `is-306090-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function InsideSales306090Page() {
  const [dados, setDados] = useState<InsideSales306090Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [squadFiltro, setSquadFiltro] = useState('todos');
  const [supervisorFiltro, setSupervisorFiltro] = useState('todos');
  const [cicloFiltro, setCicloFiltro] = useState<CicloFiltro>('todos');
  const [sortCol, setSortCol] = useState<SortCol>('nome');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchDados = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      const res = await axios.get('/api/inside-sales-306090', { params: forceRefresh ? { forceRefresh: 'true' } : {} });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    fetchDados(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'nome' ? 'asc' : 'desc'); }
  }

  const linhasFiltradas = useMemo(() => {
    if (!dados) return [];
    let lista = dados.linhas;
    if (squadFiltro !== 'todos') lista = lista.filter((l) => l.squad === squadFiltro);
    if (supervisorFiltro !== 'todos') lista = lista.filter((l) => l.supervisor === supervisorFiltro);
    if (cicloFiltro !== 'todos') lista = lista.filter((l) => l.cicloAtual === cicloFiltro);
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
      else if (sortCol === 'diasRestantesCiclo') v = a.diasRestantesCiclo - b.diasRestantesCiclo;
      else if (sortCol === 'pvTotal90Dias') v = a.pvTotal90Dias - b.pvTotal90Dias;
      else if (sortCol === 'valorTotal90Dias') v = a.valorTotal90Dias - b.valorTotal90Dias;
      else if (sortCol === 'metaGeralFinanceiroPercentual') v = a.metaGeralFinanceiroPercentual - b.metaGeralFinanceiroPercentual;
      else v = a.roiPeriodo - b.roiPeriodo;
      return sortDir === 'asc' ? v : -v;
    });
  }, [dados, squadFiltro, supervisorFiltro, cicloFiltro, busca, sortCol, sortDir]);

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando métricas de validação IS 30/60/90…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(false); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">IS 30/60/90 — Validação Comercial</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportarExcel(linhasFiltradas)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
          <button onClick={() => { setReloading(true); fetchDados(true); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Total" value={dados.stats.total} />
        <KpiCard label="1º Ciclo" value={dados.stats.ciclo1} tone="warning" />
        <KpiCard label="2º Ciclo" value={dados.stats.ciclo2} tone="warning" />
        <KpiCard label="3º Ciclo" value={dados.stats.ciclo3} tone="warning" />
        <KpiCard label="Validados" value={dados.stats.validado} tone="success" />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
            <Users size={15} className="text-primary" /> Inside Sales em validação
          </h2>
          <Select
            value={squadFiltro}
            onChange={setSquadFiltro}
            className="min-w-[170px]"
            options={[{ value: 'todos', label: 'Todos os squads' }, ...dados.squads.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            value={supervisorFiltro}
            onChange={setSupervisorFiltro}
            className="min-w-[200px]"
            options={[{ value: 'todos', label: 'Todos os supervisores' }, ...dados.supervisores.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            value={cicloFiltro}
            onChange={(v) => setCicloFiltro(v as CicloFiltro)}
            className="min-w-[160px]"
            options={[
              { value: 'todos', label: 'Todos os ciclos' },
              { value: 'ciclo1', label: '1º Ciclo' },
              { value: 'ciclo2', label: '2º Ciclo' },
              { value: 'ciclo3', label: '3º Ciclo' },
              { value: 'validado', label: 'Validado' },
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
            <table className="w-full min-w-[2400px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="nome" current={sortCol} dir={sortDir} onSort={toggleSort} className="sticky left-0 z-20 bg-card px-5 w-[220px] min-w-[220px]"><HeaderLabel label="IS" info={DESCRICOES.nome} /></SortTh>
                  <th className="sticky left-[220px] z-20 bg-card px-4 py-3 font-semibold w-[170px] min-w-[170px]"><HeaderLabel label="Squad" info={DESCRICOES.squad} /></th>
                  <th className="px-4 py-3 font-semibold w-[150px] min-w-[150px]"><HeaderLabel label="Supervisor" info={DESCRICOES.supervisor} /></th>
                  <th className="px-4 py-3 font-semibold text-center"><HeaderLabel label="Ciclo" info={DESCRICOES.ciclo} /></th>
                  <SortTh col="diasRestantesCiclo" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Dias restantes" info={DESCRICOES.diasRestantesCiclo} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right">Admissão</th>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Validação RH 45/90" info={DESCRICOES.validacaoRh} /></th>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="1ª Volta" info={DESCRICOES.ciclo1} /></th>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="2ª Volta" info={DESCRICOES.ciclo2} /></th>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="3ª Volta" info={DESCRICOES.ciclo3} /></th>
                  <SortTh col="pvTotal90Dias" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="PV 90 dias" info={DESCRICOES.pvTotal90Dias} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="% Meta PV" info={DESCRICOES.metaGeralPvPercentual} /></th>
                  <SortTh col="valorTotal90Dias" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="Valor 90 dias" info={DESCRICOES.valorTotal90Dias} /></SortTh>
                  <SortTh col="metaGeralFinanceiroPercentual" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right"><HeaderLabel label="% Meta financeira" info={DESCRICOES.metaGeralFinanceiroPercentual} /></SortTh>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Média PV/mês" info={DESCRICOES.mediaPvPeriodo} /></th>
                  <th className="px-4 py-3 font-semibold text-right"><HeaderLabel label="Média Valor/mês" info={DESCRICOES.mediaValorPeriodo} /></th>
                  <SortTh col="roiPeriodo" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5 text-right"><HeaderLabel label="ROI" info={DESCRICOES.roiPeriodo} /></SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasFiltradas.map((l) => (
                  <tr key={l.nome} className="group hover:bg-muted/50 transition-colors">
                    <td className="sticky left-0 z-10 bg-card group-hover:bg-muted px-5 py-3 w-[220px] min-w-[220px]">
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">{l.cargo}</div>
                    </td>
                    <td className="sticky left-[220px] z-10 bg-card group-hover:bg-muted px-4 py-3 text-xs w-[170px] min-w-[170px]">{l.squad ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{l.supervisor ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><CicloBadge ciclo={l.cicloAtual} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtDias(l.diasRestantesCiclo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtData(l.dataAdmissao)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                      {fmtData(l.validacaoRh45)} / {fmtData(l.validacaoRh90)}
                    </td>
                    <td className="px-4 py-3"><CicloCell ciclo={l.ciclo1} /></td>
                    <td className="px-4 py-3"><CicloCell ciclo={l.ciclo2} /></td>
                    <td className="px-4 py-3"><CicloCell ciclo={l.ciclo3} /></td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtNum(l.pvTotal90Dias)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${l.metaGeralPvPercentual >= 100 ? 'text-success' : 'text-warning'}`}>
                      {fmtNum(l.metaGeralPvPercentual, 0)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(l.valorTotal90Dias)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${l.metaGeralFinanceiroPercentual >= 100 ? 'text-success' : 'text-warning'}`}>
                      {fmtNum(l.metaGeralFinanceiroPercentual, 0)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(l.mediaPvPeriodo, 1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtMoeda(l.mediaValorPeriodo)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold ${l.roiPeriodo >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {fmtNum(l.roiPeriodo, 0)}%
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
