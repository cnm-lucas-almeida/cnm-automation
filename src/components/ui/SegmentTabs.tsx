import type { LucideIcon } from 'lucide-react';

export interface SegmentTabOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentTabOption<T>[];
  className?: string;
}

export function SegmentTabs<T extends string>({ value, onChange, options, className }: SegmentTabsProps<T>) {
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
            {Icon && <Icon size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
