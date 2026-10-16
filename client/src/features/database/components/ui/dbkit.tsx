import type { ComponentType, ReactNode } from 'react';
import { AlertCircle, Loader2, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// The database dashboard's building blocks. Every page composes these, so
// panels, figures, states and status colours look and behave the same
// everywhere instead of each page styling its own.

type Icon = ComponentType<{ className?: string }>;
export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-destructive',
  info: 'text-primary',
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  bad: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-primary/20 bg-primary/10 text-primary',
};

export function Panel({ title, description, action, className, contentClassName, children }: {
  title?: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; contentClassName?: string; children: ReactNode;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-xs', className)}>
      {(title || action) && (
        <header className="flex min-h-11 items-center gap-3 border-b px-4 py-2">
          <div className="min-w-0 flex-1">
            {title && <h3 className="truncate text-sm font-semibold">{title}</h3>}
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('min-h-0 flex-auto p-4', contentClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'neutral', icon: IconComp, onClick }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: Icon; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {IconComp && <IconComp className="size-4 shrink-0" />}
      </div>
      <div className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className={cn('min-h-4 truncate text-xs', TONE_TEXT[tone])}>{hint}</div>
    </>
  );
  const base = 'flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-xs';
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(base, 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none')}>
      {body}
    </button>
  );
}

export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap capitalize', TONE_BADGE[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: IconComp, title, children, action, className }: {
  icon?: Icon; title: string; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center', className)}>
      {IconComp && <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><IconComp className="size-5" /></span>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-xs leading-relaxed text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ title = 'Could not load this page', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="max-w-2xl">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry && <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}><RotateCw className="size-3.5" /> Try again</Button>}
      </AlertDescription>
    </Alert>
  );
}

/** Label / value rows, for short facts inside a panel. */
export function FactList({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
