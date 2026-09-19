'use client';

import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export function Chip({
  selected,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[0.95rem] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]',
        selected
          ? 'border-[var(--sage)] bg-[var(--sage-soft)] text-[var(--sage-deep)]'
          : 'border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)] hover:border-[var(--line-strong)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-base font-semibold text-[var(--ink)]">
          {label}
        </label>
        {description && <p id={`${id}-d`} className="mt-0.5 text-sm text-[var(--ink-soft)]">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2',
          checked ? 'bg-[var(--sage)]' : 'bg-[var(--line-strong)]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-6',
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-12 rounded-[var(--radius-md)] border px-4 text-[0.95rem] font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]',
            value === o.value
              ? 'border-[var(--sage)] bg-[var(--sage-soft)] text-[var(--sage-deep)]'
              : 'border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)] hover:border-[var(--line-strong)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('sv-card rounded-[var(--radius-lg)] border border-[var(--line)]', className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('sv-rule text-[0.78rem] font-bold uppercase tracking-[0.12em] text-[var(--ink-faint)]', className)}>
      {children}
    </h2>
  );
}
