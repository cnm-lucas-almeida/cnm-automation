'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Altura pensada para caber ~10 opções visíveis antes de precisar rolar (cada linha ~40px: py-2.5 + texto).
const MAX_LIST_HEIGHT = 400;

export function Select({ value, onChange, options, placeholder = 'Selecionar', className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusca('');
    // Foca a busca ao abrir — o timeout evita disputa com o próprio evento de clique que abriu o dropdown.
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const opcoesFiltradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return options;
    return options.filter((o) => normalizar(o.label).includes(termo));
  }, [options, busca]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-left focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted/40 transition-colors"
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-max rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="relative border-b border-border">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="py-1 overflow-y-auto" style={{ maxHeight: MAX_LIST_HEIGHT }}>
            {opcoesFiltradas.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-muted-foreground">Nenhuma opção encontrada</p>
            ) : (
              opcoesFiltradas.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    type="button"
                    key={opt.value || '__empty__'}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                      isSelected ? 'text-primary font-semibold bg-primary/5' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={14} className="text-primary flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
