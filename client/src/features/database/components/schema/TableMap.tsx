import { ArrowLeft, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '../../services/format';
import type { SchemaTable } from '../../types';

interface TableMapProps {
  schemaName: string;
  tables: SchemaTable[];
  onBack?: () => void;
  onSelectTable: (name: string) => void;
}

export default function TableMap({ schemaName, tables, onBack, onSelectTable }: TableMapProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        {onBack && <Button variant="ghost" size="sm" className="h-7" onClick={onBack}><ArrowLeft className="size-3.5" /> All schemas</Button>}
        <span className="font-mono font-medium">{schemaName}</span>
        <span className="text-muted-foreground">· pick a table to see its relationships</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {tables.map(table => (
          <button key={table.name} type="button" onClick={() => onSelectTable(table.name)}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40">
            <span className="flex items-center gap-2 truncate font-mono text-sm font-semibold"><Table2 className="size-4 shrink-0 text-primary" />{table.name}</span>
            <span className="text-xs text-muted-foreground">
              {table.rowEstimate != null ? `~${table.rowEstimate.toLocaleString()} rows` : 'Rows unknown'}
              {table.sizeBytes != null && ` · ${formatBytes(table.sizeBytes)}`}
            </span>
            <span className="text-xs text-muted-foreground">{table.columns.length} columns · {table.foreignKeys.length} foreign key{table.foreignKeys.length === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
