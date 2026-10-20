import { cn } from '@/lib/utils';

// Small pieces shared by the Insights pages (Commits, People, Ownership, Releases).

export function timeAgo(dateStr: string): string {
  const min = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  const hr = Math.floor(min / 60), day = Math.floor(hr / 24);
  if (day >= 365) return `${Math.floor(day / 365)}y ago`;
  if (day >= 30) return `${Math.floor(day / 30)}mo ago`;
  if (day > 0) return `${day}d ago`;
  if (hr > 0) return `${hr}h ago`;
  if (min > 0) return `${min}m ago`;
  return 'just now';
}

export function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A person: their GitHub avatar when there is one, else neutral initials (never a series colour). */
export function Avatar({ login, src, size = 'md' }: { login: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'sm' ? 'size-6 text-[10px]' : size === 'lg' ? 'size-10 text-sm' : 'size-8 text-xs';
  return src
    ? <img src={src} alt="" loading="lazy" className={cn('shrink-0 rounded-full border bg-muted', box)} />
    : <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full border bg-card font-semibold text-muted-foreground', box)}>{(login || '?').slice(0, 2).toUpperCase()}</span>;
}

export const labelClass = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';
