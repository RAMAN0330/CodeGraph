import { useMemo } from 'react';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePersistentState } from '../hooks/usePersistentState';
import { rankAttention, type AttentionItem, type AttentionSeverity } from '../services/attention';
import { toneText, type Tone } from './dashboardTones';
import { EmptyNote } from './Dashboard';

const TONE: Record<AttentionSeverity, Tone> = { critical: 'bad', high: 'warn', medium: 'neutral', low: 'good' };
const NONE_DISMISSED: string[] = [];

/** The ranked "what should I do next" list; dismissed items stay hidden in this browser. */
export default function AttentionFeed({ items, storageKey, onOpen, limit = 5 }: {
  items: AttentionItem[];
  storageKey: string;
  onOpen: (target: string) => void;
  limit?: number;
}) {
  const [dismissed, setDismissed] = usePersistentState<string[]>(storageKey, NONE_DISMISSED);
  const live = useMemo(() => rankAttention(items).filter(i => !dismissed.includes(i.id)), [items, dismissed]);
  const hidden = items.length - live.length;

  if (!live.length) {
    return (
      <>
        <EmptyNote><CheckCircle2 className="mx-auto mb-1 block size-5 text-emerald-500" />{items.length ? 'Everything left is dismissed.' : 'Nothing needs attention. New problems show up here as they appear.'}</EmptyNote>
        {hidden > 0 && <Button variant="link" size="sm" className="h-auto self-center p-0 text-xs" onClick={() => setDismissed(NONE_DISMISSED)}>Show {hidden} dismissed</Button>}
      </>
    );
  }

  return (
    <>
      <ol className="flex min-h-0 flex-col divide-y overflow-hidden">
        {live.slice(0, limit).map(item => (
          <li key={item.id} className="group flex items-start gap-2 py-2 first:pt-0">
            <Badge variant="outline" className={cn('mt-0.5 shrink-0 capitalize', toneText[TONE[item.severity]])}>{item.severity}</Badge>
            <button type="button" className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit" onClick={() => onOpen(item.target)}>
              <b className="block truncate text-xs font-semibold group-hover:underline">{item.title}</b>
              <span className="line-clamp-1 text-xs text-muted-foreground" title={item.why}>{item.why}</span>
            </button>
            <span className="mt-0.5 hidden shrink-0 text-[11px] text-muted-foreground sm:block">~{item.effort}</span>
            <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground" aria-label={`Dismiss ${item.title}`} title="Dismiss" onClick={() => setDismissed([...dismissed, item.id])}><X className="size-3.5" /></Button>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
        <span>{live.length > limit ? `${live.length - limit} more not shown` : `${live.length} to review`}</span>
        {hidden > 0 && <Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={() => setDismissed(NONE_DISMISSED)}>Show {hidden} dismissed <ArrowRight className="size-3" /></Button>}
      </div>
    </>
  );
}
