import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The frame every workspace tool page sits in, so codebase and database pages
// read as one product: a rounded panel aligned with the sidebar, a header with
// the module's accent, and a body that fits the screen and scrolls inside.

export type ModuleTone = 'explore' | 'insights' | 'architecture' | 'security' | 'patterns' | 'actions' | 'quality' | 'database' | 'settings';

const toneVar = (tone: ModuleTone) => `var(--mod-${tone})`;

/** The framed page. `scroll` lets the whole body scroll; otherwise children manage their own scrolling (fit to screen). */
export function Page({ children, scroll = false, className }: { children: ReactNode; scroll?: boolean; className?: string }) {
  return (
    <div className={cn(
      'mx-3 mb-3 flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border bg-card text-foreground shadow-[0_10px_28px_rgba(20,24,32,0.09)]',
      className,
    )}>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-3 px-6 pt-5 pb-5', scroll ? 'overflow-y-auto' : 'overflow-hidden max-[900px]:overflow-y-auto')}>
        {children}
      </div>
    </div>
  );
}

/** Title row: module icon tile, title, one or two lines of context, and actions on the right. */
export function PageHeader({ icon: Icon, tone, title, description, actions, children }: {
  icon: LucideIcon;
  tone: ModuleTone;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra row under the title, e.g. tabs or filters. */
  children?: ReactNode;
}) {
  const style = { '--page-tone': toneVar(tone) } as CSSProperties;
  return (
    <header className="flex shrink-0 flex-col gap-3" style={style}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--page-tone)_28%,transparent)] bg-[color-mix(in_srgb,var(--page-tone)_11%,transparent)] text-[var(--page-tone)]">
          <Icon className="size-[18px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
          {description && <p className="mt-0.5 line-clamp-2 max-w-[100ch] text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A card inside a page. Sits one step darker than the page so it reads as a surface. */
export function Section({ title, meta, icon: Icon, action, onAction, actions, className, bodyClassName, children }: {
  title?: ReactNode;
  meta?: ReactNode;
  icon?: LucideIcon;
  /** A single text link in the header, e.g. "Open". */
  action?: string;
  onAction?: () => void;
  /** Free-form header controls. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-[var(--surface-subtle)]', className)}>
      {title && (
        <header className="flex min-h-11 shrink-0 items-center gap-2 border-b px-4 py-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {actions}
            {action && onAction && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary" onClick={onAction}>
                {action} <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </header>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto px-4 py-3', bodyClassName)}>{children}</div>
    </section>
  );
}

export interface SegmentOption<T extends string> { value: T; label: ReactNode; count?: number }

/** A compact single-choice switch (filters, views). Unselected options stay flat, never filled. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border bg-[var(--surface-subtle)] p-0.5', className)}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--border-focus)]',
              active && 'border-border bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,32,0.08)]',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn('rounded-full px-1.5 font-mono text-[10px] leading-4 tabular-nums', active ? 'bg-[var(--surface-hover)] text-foreground' : 'text-muted-foreground')}>{option.count.toLocaleString()}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One row of list controls: a count on the left, controls on the right, wrapping cleanly. */
export function Toolbar({ count, children, className }: { count?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {count !== undefined && <strong className="mr-auto text-sm font-semibold whitespace-nowrap tabular-nums">{count}</strong>}
      {children}
    </div>
  );
}
