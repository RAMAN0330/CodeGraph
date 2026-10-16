import { Layers } from 'lucide-react';
import type { SchemaTable } from '../../types';

interface DomainMapProps {
  tablesBySchema: Map<string, SchemaTable[]>;
  onSelectSchema: (name: string) => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

export default function DomainMap({ tablesBySchema, onSelectSchema }: DomainMapProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {Array.from(tablesBySchema.entries()).map(([schemaName, tables]) => {
        const relations = tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
        return (
          <button key={schemaName} type="button" onClick={() => onSelectSchema(schemaName)}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40">
            <span className="flex items-center gap-2 font-mono text-sm font-semibold"><Layers className="size-4 text-primary" />{schemaName}</span>
            <span className="text-xs text-muted-foreground">{plural(tables.length, 'table')} · {plural(relations, 'relationship')}</span>
          </button>
        );
      })}
    </div>
  );
}
