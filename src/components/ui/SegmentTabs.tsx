import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';

export interface SegmentTabOption<T extends string | number> {
  value: T;
  label: string;
  icon?: LucideIcon;
  iconSrc?: string; // imagem (ex.: logo de marca) — tem prioridade sobre `icon` quando presente
}

interface SegmentTabsProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentTabOption<T>[];
  className?: string;
}

export function SegmentTabs<T extends string | number>({ value, onChange, options, className }: SegmentTabsProps<T>) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm ${className ?? ''}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {opt.iconSrc
              ? <Image src={opt.iconSrc} alt="" width={16} height={16} className="object-contain" />
              : Icon && <Icon size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
