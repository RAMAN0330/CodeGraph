import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toneFill, toneText, type Tone } from './dashboardTones';

// Building blocks shared by the Codebase and Database Overview dashboards, so
// both read as one system. Panels clip instead of growing: the dashboards are
// sized to the viewport and never scroll the page.

/** The page grid: fills the space under the header on desktop, stacks and scrolls on small screens. */
export function DashboardGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main className={cn('grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-3 lg:overflow-hidden', className)}>
      {children}
    </main>
  );
}

export function Panel({ title, meta, action, onAction, className, children }: {
  title: ReactNode;
  meta?: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('min-h-0 gap-0 overflow-hidden rounded-xl py-0 shadow-none', className)}>
      <header className="flex min-h-11 items-center gap-2 border-b px-4 py-2">
        <h2 className="truncate text-sm font-semibold tracking-normal">{title}</h2>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        {action && onAction && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs text-primary" onClick={onAction}>
            {action} <ArrowRight className="size-3.5" />
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">{children}</div>
    </Card>
  );
}

export function Metric({ label, value, sub, tone = 'neutral', icon, onClick }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}{label}
      </span>
      <strong className="truncate font-mono text-2xl leading-tight font-semibold text-foreground">{value}</strong>
      {sub !== undefined && <span className={cn('truncate text-xs font-medium', toneText[tone])}>{sub}</span>}
    </>
  );
  const className = 'flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card px-4 py-3 text-left';
  return onClick
    ? <button type="button" className={cn(className, 'cursor-pointer transition-colors hover:bg-accent')} onClick={onClick}>{body}</button>
    : <div className={className}>{body}</div>;
}

/** One labelled horizontal bar; value is a 0-100 share. */
export function Meter({ label, value, display, tone = 'neutral', onClick }: {
  label: ReactNode;
  value: number;
  display: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const row = (
    <>
      <span className="min-w-0 truncate text-left text-xs text-foreground">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <i className={cn('block h-full rounded-full', toneFill[tone])} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
      <b className="text-right font-mono text-xs font-semibold">{display}</b>
    </>
  );
  const className = 'grid grid-cols-[minmax(0,1fr)_minmax(60px,35%)_3.5rem] items-center gap-3 py-1.5';
  return onClick
    ? <button type="button" className={cn(className, '-mx-2 rounded-md border-0 bg-transparent px-2 text-inherit hover:bg-accent')} onClick={onClick}>{row}</button>
    : <div className={className}>{row}</div>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-auto max-w-[36ch] text-center text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
