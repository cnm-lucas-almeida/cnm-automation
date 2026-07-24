'use client';

import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Info } from 'lucide-react';
import { aggregatePeriod, type CampanhaComSerie, type TipoPeriodo } from '@/lib/campanhas';
import { ComparativoCell } from '@/components/ui/ComparativoCell';
import { formatCurrencyBRL, formatNumberBR } from '@/lib/format';

type SortCol = 'nome' | 'cpa' | 'cpc' | 'leads' | 'custoDia' | 'faturamento';
type SortDir = 'asc' | 'desc';

interface CampanhasTableProps {
  campanhas: CampanhaComSerie[];
  tipoPeriodo: TipoPeriodo;
  referencia: Date;
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

const STATUS_BADGE: Record<string, string> = {
  ativa: 'bg-success-bg text-success',
  pausada: 'bg-muted text-muted-foreground',
  rascunho: 'bg-warning-bg text-warning',
};

function extrasParaTooltip(extras?: Record<string, string | number | null>): string {
  if (!extras) return '';
  return Object.entries(extras)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function CampanhasTable({ campanhas, tipoPeriodo, referencia }: CampanhasTableProps) {
  const [sortCol, setSortCol] = useState<SortCol>('faturamento');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const linhas = useMemo(() => {
    return campanhas.map(({ campanha, serie }) => ({
      campanha,
      comparativo: aggregatePeriod(serie, tipoPeriodo, referencia),
    }));
  }, [campanhas, tipoPeriodo, referencia]);

  const linhasOrdenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'nome') return a.campanha.nomeCampanha.localeCompare(b.campanha.nomeCampanha) * mult;
      return (a.comparativo.atual[sortCol] - b.comparativo.atual[sortCol]) * mult;
    });
    return copia;
  }, [linhas, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  if (linhas.length === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma campanha encontrada.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
            <SortTh col="nome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Campanha</SortTh>
            <th className="px-3 py-3 font-semibold">Localidade</th>
            <th className="px-3 py-3 font-semibold">Transação</th>
            <th className="px-3 py-3 font-semibold">UTM</th>
            <th className="px-3 py-3 font-semibold text-right">Habitantes</th>
            <SortTh col="cpa" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-3 text-right">CPA</SortTh>
            <SortTh col="cpc" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-3 text-right">CPC</SortTh>
            <SortTh col="leads" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-3 text-right">Leads</SortTh>
            <SortTh col="custoDia" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-3 text-right">Custo</SortTh>
            <SortTh col="faturamento" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-3 text-right">Faturamento</SortTh>
            <th className="px-3 py-3 font-semibold text-center">Info</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhasOrdenadas.map(({ campanha, comparativo }) => (
            <tr key={campanha.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-5 py-3 max-w-[280px]">
                <div className="font-medium truncate" title={campanha.nomeCampanha}>{campanha.nomeCampanha}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">{campanha.tipoCampanha}</span>
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[campanha.status]}`}>
                    {campanha.status}
                  </span>
                  {campanha.isPlaceholder && (
                    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning-bg text-warning">mock</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{campanha.uf ? `${campanha.uf} · ${campanha.localidade}` : campanha.localidade}</td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{campanha.transacao ?? '—'}</td>
              <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[160px]" title={campanha.utm}>{campanha.utm}</td>
              <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                {campanha.habitantes != null ? formatNumberBR(campanha.habitantes) : '—'}
              </td>
              <td className="px-3 py-3">
                <ComparativoCell {...comparativo.deltas.cpa} formatador={formatCurrencyBRL} />
              </td>
              <td className="px-3 py-3">
                <ComparativoCell {...comparativo.deltas.cpc} formatador={formatCurrencyBRL} />
              </td>
              <td className="px-3 py-3">
                <ComparativoCell {...comparativo.deltas.leads} formatador={(v) => formatNumberBR(v)} />
              </td>
              <td className="px-3 py-3">
                <ComparativoCell {...comparativo.deltas.custoDia} formatador={formatCurrencyBRL} />
              </td>
              <td className="px-3 py-3">
                <ComparativoCell {...comparativo.deltas.faturamento} formatador={formatCurrencyBRL} />
              </td>
              <td className="px-3 py-3 text-center">
                {campanha.extras && (
                  <span title={extrasParaTooltip(campanha.extras)} className="inline-flex cursor-help" aria-label="Detalhes da plataforma">
                    <Info size={14} className="text-muted-foreground" />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
