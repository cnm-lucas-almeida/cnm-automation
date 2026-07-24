import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPercent } from '@/lib/format';

interface ComparativoCellProps {
  atual: number;
  anterior: number;
  variacaoPct: number | null;
  direcao: 'positiva' | 'negativa' | 'neutra';
  formatador: (v: number) => string;
  align?: 'left' | 'right';
}

export const COMPARATIVO_BADGE_STYLE: Record<ComparativoCellProps['direcao'], string> = {
  positiva: 'bg-success-bg text-success',
  negativa: 'bg-destructive/10 text-destructive',
  neutra: 'bg-info-bg text-info',
};

export function ComparativoCell({ atual, anterior, variacaoPct, direcao, formatador, align = 'right' }: ComparativoCellProps) {
  // A seta reflete o sentido real do número (subiu/caiu); a cor reflete se isso é bom ou ruim para a métrica.
  const Icon = !variacaoPct ? Minus : variacaoPct > 0 ? TrendingUp : TrendingDown;
  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="font-semibold tabular-nums">{formatador(atual)}</span>
      <div className="flex items-center gap-1.5 mt-0.5">
        {variacaoPct !== null ? (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${COMPARATIVO_BADGE_STYLE[direcao]}`}>
            <Icon size={10} />
            {formatPercent(Math.abs(variacaoPct))}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">sem base</span>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums" title={`Período anterior: ${formatador(anterior)}`}>
          {formatador(anterior)}
        </span>
      </div>
    </div>
  );
}
