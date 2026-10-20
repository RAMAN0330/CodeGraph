import { AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { planWarnings, type ExplainResult } from '../../services/sqlApi';

export default function PlanView({ plan }: { plan: ExplainResult | null }) {
  if (!plan) return <div className="grid h-full place-items-center rounded-md border bg-card p-6 text-center text-xs text-muted-foreground">Explain a statement to see how the database will run it. The statement itself is not executed.</div>;
  if (!plan.nodes.length) {
    return (
      <ScrollArea className="h-full rounded-md border bg-card">
        <pre className="p-3 font-mono text-[11px]">{JSON.stringify(plan.raw, null, 2)}</pre>
      </ScrollArea>
    );
  }
  const maxCost = Math.max(...plan.nodes.map(n => n.totalCost ?? 0), 1);
  const warnings = planWarnings(plan.nodes);
  return (
    <ScrollArea className="h-full rounded-md border bg-card">
      <div className="space-y-3 p-3">
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-2 text-xs text-foreground">
            {warnings.map(w => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />{w}</li>)}
          </ul>
        )}
        <ol className="list-none space-y-1">
          {plan.nodes.map((node, i) => (
            <li key={i} className="text-xs" style={{ paddingLeft: node.depth * 18 }}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{node.nodeType}</span>
                {node.relation && <span className="font-mono text-muted-foreground">{node.relation}</span>}
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  cost {node.totalCost?.toLocaleString() ?? '–'} · ~{node.planRows?.toLocaleString() ?? '–'} rows
                </span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-muted">
                <div className="h-1 rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, ((node.totalCost ?? 0) / maxCost) * 100)}%` }} />
              </div>
              {node.detail && <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={node.detail}>{node.detail}</div>}
            </li>
          ))}
        </ol>
      </div>
    </ScrollArea>
  );
}
