'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Calendar } from './Calendar';

interface DatePickerProps {
  value: string; // 'yyyy-MM-dd' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  className?: string;
}

function parseIso(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
}

export function DatePicker({ value, onChange, placeholder = 'Selecionar data', minDate, maxDate, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [month, setMonth] = useState(selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open) setMonth(selected ?? new Date());
    setOpen((v) => !v);
  }

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

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-1.5 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted/40 transition-colors"
      >
        <CalendarDays size={13} className="text-muted-foreground" />
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? format(selected, 'dd/MM/yyyy', { locale: ptBR }) : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 rounded-lg border border-border bg-card shadow-lg">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(d) => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }}
            minDate={minDate ? parseIso(minDate) ?? undefined : undefined}
            maxDate={maxDate ? parseIso(maxDate) ?? undefined : undefined}
          />
        </div>
      )}
    </div>
  );
}
