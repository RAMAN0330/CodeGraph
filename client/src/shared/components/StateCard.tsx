import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Centered empty or unavailable state: an icon, what is going on, and what to do about it. */
export function StateCard({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-2 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children && <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
