'use client';

import { useEffect, useState } from 'react';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Input de valor monetário com máscara "R$ 0,00" — os dígitos digitados preenchem da direita pra esquerda. */
export function CurrencyInput({ value, onChange, className, placeholder }: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatCents(Math.round(value * 100)));

  useEffect(() => {
    const formatted = formatCents(Math.round(value * 100));
    setDisplay((current) => (current === formatted ? current : formatted));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    const cents = digits ? parseInt(digits, 10) : 0;
    setDisplay(formatCents(cents));
    onChange(cents / 100);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
