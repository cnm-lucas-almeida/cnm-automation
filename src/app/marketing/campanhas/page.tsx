'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, AlertCircle, Wallet, TrendingUp, Users, Target, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { Calendar } from '@/components/ui/Calendar';
import { COMPARATIVO_BADGE_STYLE } from '@/components/ui/ComparativoCell';
import { CampanhasTable } from './CampanhasTable';
import {
  PLATAFORMAS, aggregatePeriod, combinarComparativos,
  periodoAtual, periodoAnterior, deslocarReferencia, ehPeriodoAtual, formatarPeriodoCompleto, formatarIntervalo,
  type Plataforma, type TipoPeriodo, type CampanhaComSerie, type MetricDelta,
} from '@/lib/campanhas';
import { formatCurrencyBRL, formatNumberBR, formatPercent } from '@/lib/format';

const PERIODO_TABS: { value: TipoPeriodo; label: string }[] = [
  { value: 'semana', label: 'Semanal' },
  { value: 'quinzena', label: 'Quinzenal' },
  { value: 'mes', label: 'Mensal' },
];

function ResumoCard({
  titulo, icon: Icon, delta, formatador,
}: { titulo: string; icon: any; delta: MetricDelta; formatador: (v: number) => string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">{titulo}</p>
          <p className="font-bold mt-1 tabular-nums text-lg leading-tight break-words" title={formatador(delta.atual)}>{formatador(delta.atual)}</p>
          <div className="mt-1.5">
            {delta.variacaoPct !== null ? (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${COMPARATIVO_BADGE_STYLE[delta.direcao]}`}>
                {formatPercent(delta.variacaoPct, { signed: true })} vs. anterior
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">sem período anterior</span>
            )}
          </div>
        </div>
        <Icon size={20} className="opacity-60 flex-shrink-0 mt-1 text-primary" />
      </div>
    </div>
  );
}

function NavegadorPeriodo({
  tipo, referencia, onChange,
}: { tipo: TipoPeriodo; referencia: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [mesCalendario, setMesCalendario] = useState(referencia);
  const rootRef = useRef<HTMLDivElement>(null);
  const janela = periodoAtual(tipo, referencia);
  const janelaAnt = periodoAnterior(tipo, janela);
  const podeAvancar = !ehPeriodoAtual(tipo, referencia);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) setMesCalendario(referencia);
    setOpen((v) => !v);
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
      <button
        type="button"
        onClick={() => onChange(deslocarReferencia(tipo, referencia, -1))}
        aria-label="Período anterior"
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-1 text-sm hover:text-primary transition-colors"
      >
        <CalendarDays size={13} className="text-muted-foreground shrink-0" />
        <span className="font-medium whitespace-nowrap">{formatarIntervalo(janela)}</span>
        <span className="text-muted-foreground whitespace-nowrap">vs. {formatarIntervalo(janelaAnt)}</span>
      </button>
      <button
        type="button"
        onClick={() => podeAvancar && onChange(deslocarReferencia(tipo, referencia, 1))}
        aria-label="Próximo período"
        disabled={!podeAvancar}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <ChevronRight size={16} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 rounded-lg border border-border bg-card shadow-lg">
          <Calendar
            month={mesCalendario}
            onMonthChange={setMesCalendario}
            selected={null}
            onSelect={(d) => { onChange(d); setOpen(false); }}
            maxDate={new Date()}
            rangeStart={janela.inicio}
            rangeEnd={janela.fim}
          />
        </div>
      )}
    </div>
  );
}

export default function CampanhasPage() {
  const [plataforma, setPlataforma] = useState<Plataforma>('google');
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>('semana');
  const [referencia, setReferencia] = useState<Date>(() => new Date());
  const [campanhas, setCampanhas] = useState<CampanhaComSerie[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    axios.get<CampanhaComSerie[]>('/api/campanhas', { params: { plataforma } })
      .then((res) => { if (!cancelado) setCampanhas(res.data); })
      .catch((e) => { if (!cancelado) setErro(e.message ?? 'Erro ao carregar campanhas'); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [plataforma]);

  const resumo = useMemo(() => {
    if (!campanhas || campanhas.length === 0) return null;
    const comparativos = campanhas.map(({ serie }) => aggregatePeriod(serie, tipoPeriodo, referencia));
    return combinarComparativos(comparativos);
  }, [campanhas, tipoPeriodo, referencia]);

  const plataformaAtual = PLATAFORMAS.find((p) => p.value === plataforma)!;
  const janelaAtual = periodoAtual(tipoPeriodo, referencia);
  const janelaAnt = periodoAnterior(tipoPeriodo, janelaAtual);

  function trocarTipoPeriodo(novoTipo: TipoPeriodo) {
    setTipoPeriodo(novoTipo);
    // mantém a mesma data de referência — só recalcula os limites do novo tipo em torno dela
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Investimento em Mídia</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {plataformaAtual.label} — comparando{' '}
            <span className="font-medium text-foreground">{formatarPeriodoCompleto(tipoPeriodo, janelaAtual)}</span>
            {' '}com{' '}
            <span className="font-medium text-foreground">{formatarPeriodoCompleto(tipoPeriodo, janelaAnt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentTabs value={tipoPeriodo} onChange={trocarTipoPeriodo} options={PERIODO_TABS} />
          <NavegadorPeriodo tipo={tipoPeriodo} referencia={referencia} onChange={setReferencia} />
        </div>
      </div>

      <SegmentTabs
        value={plataforma}
        onChange={setPlataforma}
        options={PLATAFORMAS.map((p) => ({ value: p.value, label: p.label, iconSrc: p.logo }))}
      />

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" /> Carregando campanhas…
        </div>
      )}

      {!loading && erro && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} /> {erro}
        </div>
      )}

      {!loading && !erro && campanhas && (
        <>
          {resumo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <ResumoCard titulo="Investimento" icon={Wallet} delta={resumo.deltas.investimentoTotal} formatador={formatCurrencyBRL} />
              <ResumoCard titulo="Faturamento" icon={TrendingUp} delta={resumo.deltas.faturamento} formatador={formatCurrencyBRL} />
              <ResumoCard titulo="Leads" icon={Users} delta={resumo.deltas.leads} formatador={(v) => formatNumberBR(v)} />
              <ResumoCard titulo="CPA médio" icon={Target} delta={resumo.deltas.cpa} formatador={formatCurrencyBRL} />
              <ResumoCard titulo="Custo médio" icon={Wallet} delta={resumo.deltas.custoDia} formatador={formatCurrencyBRL} />
            </div>
          )}

          <div className="rounded-lg border border-border">
            <CampanhasTable campanhas={campanhas} tipoPeriodo={tipoPeriodo} referencia={referencia} />
          </div>
        </>
      )}
    </div>
  );
}
