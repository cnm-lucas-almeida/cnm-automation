export function formatCurrencyBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumberBR(v: number, opts?: Intl.NumberFormatOptions): string {
  return v.toLocaleString('pt-BR', opts);
}

export function formatPercent(ratio: number, opts?: { signed?: boolean }): string {
  const pct = ratio * 100;
  const sinal = opts?.signed && pct > 0 ? '+' : '';
  return `${sinal}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
