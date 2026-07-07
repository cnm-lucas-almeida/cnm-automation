'use client';

import { useMemo } from 'react';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CalendarProps {
  month: Date;
  onMonthChange: (date: Date) => void;
  selected: Date | null;
  onSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

export function Calendar({ month, onMonthChange, selected, onSelect, minDate, maxDate }: CalendarProps) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const arr: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) arr.push(d);
    return arr;
  }, [month]);

  return (
    <div className="p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => onMonthChange(subMonths(month, 1))}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</span>
        <button type="button" onClick={() => onMonthChange(addMonths(month, 1))}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[10px] font-semibold text-muted-foreground text-center uppercase">{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const isSelected = !!selected && isSameDay(d, selected);
          const disabled = !inMonth || (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false);
          return (
            <div key={d.toISOString()} className="flex items-center justify-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(d)}
                className={`h-7 w-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                  !inMonth ? 'invisible'
                  : disabled ? 'text-muted-foreground/40 cursor-not-allowed'
                  : isSelected ? 'bg-primary text-primary-foreground font-semibold'
                  : isToday(d) ? 'text-primary font-semibold hover:bg-muted'
                  : 'text-foreground hover:bg-muted'
                }`}
              >
                {format(d, 'd')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
