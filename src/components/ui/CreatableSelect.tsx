'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';

interface CreatableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

/** Select com busca que permite criar uma opção nova digitando um valor que ainda não existe na lista. */
export function CreatableSelect({ value, onChange, options, placeholder = 'Selecionar ou criar…', className }: CreatableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // O valor atual pode ainda não estar em `options` (ex: acabou de ser criado nesta
  // mesma sessão do modal, antes de salvar e recarregar a lista do servidor).
  // Sem isso, reabrir o select não reconhece o valor escolhido e oferece "criar" de novo.
  const allOptions = value && !options.some((o) => o.toLowerCase() === value.toLowerCase())
    ? [value, ...options]
    : options;

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? allOptions.filter((o) => o.toLowerCase().includes(normalizedQuery))
    : allOptions;
  const exactMatch = allOptions.some((o) => o.toLowerCase() === normalizedQuery);
  const canCreate = query.trim().length > 0 && !exactMatch;

  function selecionar(v: string) {
    onChange(v);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canCreate) selecionar(query.trim());
      else if (filtered.length > 0) selecionar(filtered[0]);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="flex items-center justify-between gap-2 w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-left focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted/40 transition-colors"
      >
        <span className={`truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-max rounded-lg border border-border bg-card shadow-lg py-1">
          <div className="px-2 pb-1 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar ou digitar um novo…"
              className="w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && !canCreate && (
              <p className="px-4 py-2.5 text-sm text-muted-foreground">Nenhuma opção</p>
            )}
            {filtered.map((opt) => {
              const isSelected = opt === value;
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => selecionar(opt)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                    isSelected ? 'text-primary font-semibold bg-primary/5' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check size={14} className="text-primary flex-shrink-0" />}
                </button>
              );
            })}
            {canCreate && (
              <button
                type="button"
                onClick={() => selecionar(query.trim())}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left text-primary hover:bg-primary/5 transition-colors border-t border-border"
              >
                <Plus size={14} /> Criar “{query.trim()}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
