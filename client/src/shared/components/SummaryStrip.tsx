import type { ReactNode } from 'react';
import { Metric } from './Dashboard';
import type { Tone } from './dashboardTones';

export interface SummaryItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  /** Makes the tile a filter or shortcut. */
  onClick?: () => void;
}

/** A compact row of figures under a page header; tiles with onClick act as filters. */
export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" aria-label="Summary">
      {items.map(item => <Metric key={item.label} {...item} />)}
    </section>
  );
}
