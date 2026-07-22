'use client';

import { useEffect, useRef, useState } from 'react';
import { addMonths, format, isValid, parse, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Calendar } from './Calendar';

interface DateRangePickerProps {
  dataInicial: string; // 'yyyy-MM-dd'
  dataFinal: string; // 'yyyy-MM-dd'
  onChange: (dataInicial: string, dataFinal: string) => void;
  className?: string;
}

function parseIso(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
}

function toIso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

type Atalho = { label: string; getRange: () => [Date, Date] };

const ATALHOS: Atalho[] = [
  { label: 'Hoje', getRange: () => { const h = new Date(); return [h, h]; } },
  { label: 'Ontem', getRange: () => { const o = subDays(new Date(), 1); return [o, o]; } },
  { label: '7 dias', getRange: () => [subDays(new Date(), 6), new Date()] },
  { label: '30 dias', getRange: () => [subDays(new Date(), 29), new Date()] },
  { label: '90 dias', getRange: () => [subDays(new Date(), 89), new Date()] },
  { label: 'Este mês', getRange: () => [inicioDoMes(new Date()), new Date()] },
  {
    label: 'Mês passado',
    getRange: () => {
      const mesPassado = subMonths(new Date(), 1);
      const inicio = inicioDoMes(mesPassado);
      const fim = new Date(mesPassado.getFullYear(), mesPassado.getMonth() + 1, 0);
      return [inicio, fim];
    },
  },
];

export function DateRangePicker({ dataInicial, dataFinal, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const inicioSelecionado = parseIso(dataInicial);
  const fimSelecionado = parseIso(dataFinal);
  // Início pendente enquanto o usuário está clicando o 2º dia direto no calendário (fora dos atalhos).
  const [pendenteInicio, setPendenteInicio] = useState<Date | null>(null);
  const [mesEsquerda, setMesEsquerda] = useState(() => subMonths(inicioSelecionado ?? new Date(), 1));
  const rootRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open) {
      setMesEsquerda(subMonths(inicioSelecionado ?? new Date(), 1));
      setPendenteInicio(null);
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setPendenteInicio(null); }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setPendenteInicio(null); }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function aplicarAtalho(atalho: Atalho) {
    const [ini, fim] = atalho.getRange();
    onChange(toIso(ini), toIso(fim));
    setPendenteInicio(null);
    setOpen(false);
  }

  function clicarDia(d: Date) {
    if (!pendenteInicio) {
      setPendenteInicio(d);
      return;
    }
    const [ini, fim] = d < pendenteInicio ? [d, pendenteInicio] : [pendenteInicio, d];
    onChange(toIso(ini), toIso(fim));
    setPendenteInicio(null);
    setOpen(false);
  }

  const rangeStartExibido = pendenteInicio ?? inicioSelecionado;
  const rangeEndExibido = pendenteInicio ? null : fimSelecionado;
  const atalhoAtivo = ATALHOS.find((a) => {
    const [ini, fim] = a.getRange();
    return dataInicial === toIso(ini) && dataFinal === toIso(fim);
  });

  const mesDireita = addMonths(mesEsquerda, 1);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted/40 transition-colors"
      >
        <CalendarDays size={14} className="text-muted-foreground" />
        <span className="text-foreground">
          {atalhoAtivo ? atalhoAtivo.label : (
            inicioSelecionado && fimSelecionado
              ? `${format(inicioSelecionado, 'dd/MM/yyyy', { locale: ptBR })} - ${format(fimSelecionado, 'dd/MM/yyyy', { locale: ptBR })}`
              : 'Selecionar período'
          )}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 flex rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="w-36 border-r border-border py-2 shrink-0">
            <p className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Atalhos</p>
            {ATALHOS.map((a) => {
              const ativo = atalhoAtivo?.label === a.label;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => aplicarAtalho(a)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    ativo ? 'text-primary font-semibold bg-primary/10' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <div className="flex">
            <Calendar
              month={mesEsquerda}
              onMonthChange={setMesEsquerda}
              selected={null}
              onSelect={clicarDia}
              rangeStart={rangeStartExibido}
              rangeEnd={rangeEndExibido}
            />
            <div className="border-l border-border">
              <Calendar
                month={mesDireita}
                onMonthChange={() => {}}
                selected={null}
                onSelect={clicarDia}
                rangeStart={rangeStartExibido}
                rangeEnd={rangeEndExibido}
                hideNav
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
