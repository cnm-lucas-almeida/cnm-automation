'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Loader2, RefreshCw, AlertCircle, CalendarDays, Search, ChevronLeft, ChevronRight, Info, FileSpreadsheet,
} from 'lucide-react';
import type { VendasDiaADiaData, VendasDiaADiaRow } from '@/lib/vendas-dia-a-dia';
import { Select } from '@/components/ui/Select';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtCompetenciaLabel(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return `${MESES[mes - 1]} ${ano}`;
}

function deslocarCompetencia(competencia: string, delta: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtDiaCurto(iso: string): string {
  const [, , d] = iso.split('-');
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return `${DOW[dow]} ${d}`;
}

function DiaCell({ dia, hoje }: { dia: { data: string; total: number; ativas: number } | undefined; hoje: string }) {
  if (!dia) return <td className="px-2 py-3 text-center text-xs text-muted-foreground/40">—</td>;
  if (dia.data > hoje) return <td className="px-2 py-3 text-center text-xs text-muted-foreground/40">·</td>;
  if (dia.total === 0) return <td className="px-2 py-3 text-center text-xs text-muted-foreground">0</td>;
  const cancelouOuCongelou = dia.ativas < dia.total;
  return (
    <td className={`px-2 py-3 text-center text-xs tabular-nums font-semibold ${cancelouOuCongelou ? 'text-warning' : 'text-success'}`}>
      {dia.total}
    </td>
  );
}

const DESCRICOES: Record<string, string> = {
  nome: 'Mesma população do relatório IS 30/60/90: Convenia, gestor Jackson Savi Alberti, cargo contendo "Vendedor", departamento Imóveis.',
  dia: 'Quantidade de vendas (tb_financeiro_contrato) no dia, não cancelada. "·" = dia futuro, ainda sem dados. Verde = todas ativas; âmbar = alguma cancelada/congelada depois.',
  totalMes: 'Soma de todas as vendas do mês (bruto, inclui as que foram canceladas depois).',
  totalAtivas: 'Soma das vendas do mês que continuam ativas (não canceladas, não congeladas).',
  diasZerados: 'Dias úteis já decorridos no mês (até hoje) em que o vendedor não teve nenhuma venda.',
  congelados: 'Contratos do mês que estão congelados hoje.',
  cancelados: 'Contratos do mês que foram cancelados.',
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

function exportarExcel(dados: VendasDiaADiaData, linhas: VendasDiaADiaRow[]) {
  const header = ['Nome', 'Squad', 'Supervisor', ...dados.diasUteis.map(fmtDiaCurto), 'Total Mês', 'Total Ativas', 'Dias Zerados', 'Congelados', 'Cancelados'];
  const linhasExport = linhas.map((l) => [
    l.nome, l.squad ?? '', l.supervisor ?? '',
    ...l.porDia.map((d) => d.total),
    l.totalMes, l.totalAtivas, l.diasZerados, l.congelados, l.cancelados,
  ]);
  const planilha = XLSX.utils.aoa_to_sheet([header, ...linhasExport]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, dados.competencia);
  XLSX.writeFile(livro, `vendas-dia-a-dia-${dados.competencia}.xlsx`);
}

export default function VendasDiaADiaPage() {
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [dados, setDados] = useState<VendasDiaADiaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [squadFiltro, setSquadFiltro] = useState('todos');
  const [supervisorFiltro, setSupervisorFiltro] = useState('todos');

  const fetchDados = useCallback(async (comp: string, forceRefresh = false) => {
    setError(null);
    try {
      const res = await axios.get('/api/vendas-dia-a-dia', { params: { competencia: comp, ...(forceRefresh ? { forceRefresh: 'true' } : {}) } });
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
    fetchDados(competencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  const hoje = new Date().toISOString().slice(0, 10);

  const linhasFiltradas = useMemo(() => {
    if (!dados) return [];
    let lista = dados.linhas;
    if (squadFiltro !== 'todos') lista = lista.filter((l) => l.squad === squadFiltro);
    if (supervisorFiltro !== 'todos') lista = lista.filter((l) => l.supervisor === supervisorFiltro);
    const termo = busca.trim().toLowerCase();
    if (termo) lista = lista.filter((l) => l.nome.toLowerCase().includes(termo) || (l.squad ?? '').toLowerCase().includes(termo));
    return lista;
  }, [dados, squadFiltro, supervisorFiltro, busca]);

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando vendas dia a dia…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(competencia); }}
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
          <h1 className="text-2xl font-semibold tracking-tight">Vendas Dia a Dia</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1.5">
            <button onClick={() => setCompetencia((c) => deslocarCompetencia(c, -1))} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium w-32 text-center">{fmtCompetenciaLabel(competencia)}</span>
            <button onClick={() => setCompetencia((c) => deslocarCompetencia(c, 1))} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <ChevronRight size={16} />
            </button>
          </div>
          <button onClick={() => exportarExcel(dados, linhasFiltradas)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
          <button onClick={() => { setReloading(true); fetchDados(competencia, true); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 mr-auto">
            <CalendarDays size={15} className="text-primary" /> Vendas por dia útil
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
            <table className="text-sm border-collapse" style={{ minWidth: `${560 + dados.diasUteis.length * 40}px` }}>
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="sticky left-0 z-20 bg-card px-5 py-3 font-semibold w-[200px] min-w-[200px]"><HeaderLabel label="IS" info={DESCRICOES.nome} /></th>
                  <th className="sticky left-[200px] z-20 bg-card px-3 py-3 font-semibold w-[150px] min-w-[150px]">Squad</th>
                  {dados.semanas.map((semana, i) => (
                    <th key={i} colSpan={semana.dias.length} className="px-2 py-1 font-semibold text-center border-l border-border text-[10px]">
                      Semana {i + 1}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-semibold text-right border-l border-border"><HeaderLabel label="Total" info={DESCRICOES.totalMes} /></th>
                  <th className="px-3 py-3 font-semibold text-right"><HeaderLabel label="Ativas" info={DESCRICOES.totalAtivas} /></th>
                  <th className="px-3 py-3 font-semibold text-right"><HeaderLabel label="Zerados" info={DESCRICOES.diasZerados} /></th>
                  <th className="px-3 py-3 font-semibold text-right"><HeaderLabel label="Congel." info={DESCRICOES.congelados} /></th>
                  <th className="px-3 py-3 font-semibold text-right"><HeaderLabel label="Cancel." info={DESCRICOES.cancelados} /></th>
                </tr>
                <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
                  <th className="sticky left-0 z-20 bg-card px-5"></th>
                  <th className="sticky left-[200px] z-20 bg-card px-3"></th>
                  {dados.diasUteis.map((dia) => (
                    <th key={dia} className="px-2 py-1 text-center font-medium">{fmtDiaCurto(dia)}</th>
                  ))}
                  <th colSpan={5}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasFiltradas.map((l) => (
                  <tr key={l.nome} className="group hover:bg-muted/50 transition-colors">
                    <td className="sticky left-0 z-10 bg-card group-hover:bg-muted px-5 py-3 w-[200px] min-w-[200px] font-medium">{l.nome}</td>
                    <td className="sticky left-[200px] z-10 bg-card group-hover:bg-muted px-3 py-3 text-xs w-[150px] min-w-[150px]">{l.squad ?? '—'}</td>
                    {dados.diasUteis.map((dia) => (
                      <DiaCell key={dia} dia={l.porDia.find((d) => d.data === dia)} hoje={hoje} />
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-xs border-l border-border">{l.totalMes}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{l.totalAtivas}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{l.diasZerados}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{l.congelados}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{l.cancelados}</td>
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
