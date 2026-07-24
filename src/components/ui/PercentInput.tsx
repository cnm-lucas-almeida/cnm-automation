'use client';

import { useEffect, useState } from 'react';

interface PercentInputProps {
  value: number; // fração, ex.: 0.15 = 15%
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
}

function formatCentesimos(centesimos: number): string {
  return `${(centesimos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Input de percentual com máscara "0,00%" — os dígitos digitados preenchem da direita pra esquerda. */
export function PercentInput({ value, onChange, className, placeholder }: PercentInputProps) {
  const [display, setDisplay] = useState(() => formatCentesimos(Math.round(value * 10000)));

  useEffect(() => {
    const formatted = formatCentesimos(Math.round(value * 10000));
    setDisplay((current) => (current === formatted ? current : formatted));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    const centesimos = digits ? parseInt(digits, 10) : 0;
    setDisplay(formatCentesimos(centesimos));
    onChange(centesimos / 10000);
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
