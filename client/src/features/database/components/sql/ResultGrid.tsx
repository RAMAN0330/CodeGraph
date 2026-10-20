import { forwardRef, type HTMLAttributes } from 'react';
import { TableVirtuoso, type TableComponents } from 'react-virtuoso';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GridSort { column: string; dir: 'asc' | 'desc' }

interface ResultGridProps {
  columns: string[];
  rows: unknown[][];
  columnTypes?: string[];
  sort?: GridSort | null;
  onSort?: (column: string) => void;
  emptyText?: string;
}

// Virtualized so 5,000-row results scroll smoothly; the grid fills its parent
// and scrolls inside it, so the page itself never overflows.
const components: TableComponents<unknown[]> = {
  Table: props => <table {...props} className="w-full caption-bottom border-separate border-spacing-0 text-xs" />,
  TableHead: forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <thead {...props} ref={ref} className="z-10" />),
  TableRow: props => <tr {...props} className="hover:bg-[var(--surface-hover)]" />,
  TableBody: forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <tbody {...props} ref={ref} />),
};

function renderCell(value: unknown) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export default function ResultGrid({ columns, rows, columnTypes, sort, onSort, emptyText = 'No rows.' }: ResultGridProps) {
  if (!columns.length) return <div className="grid h-full place-items-center rounded-md border bg-card p-6 text-center text-xs text-muted-foreground">{emptyText}</div>;
  return (
    <div className="h-full min-h-0 rounded-md border bg-card">
      <TableVirtuoso
        style={{ height: '100%' }}
        data={rows}
        components={components}
        fixedHeaderContent={() => (
          <tr>
            <th className="sticky left-0 w-10 border-b border-r bg-muted px-2 py-1.5 text-right font-medium text-muted-foreground">#</th>
            {columns.map((column, i) => {
              const active = sort?.column === column;
              const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th key={`${column}-${i}`} scope="col" className="border-b border-r bg-muted px-2 py-1.5 text-left align-bottom font-medium whitespace-nowrap">
                  {onSort ? (
                    <button type="button" onClick={() => onSort(column)} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-medium hover:text-foreground" aria-label={`Sort by ${column}`}>
                      <span>{column}</span>
                      <Icon className={cn('size-3', active ? 'text-primary' : 'text-muted-foreground/60')} />
                    </button>
                  ) : column}
                  {columnTypes?.[i] && <div className="font-mono text-[10px] font-normal text-muted-foreground">{columnTypes[i]}</div>}
                </th>
              );
            })}
          </tr>
        )}
        itemContent={(index, row) => (
          <>
            <td className="sticky left-0 border-b border-r bg-card px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{index + 1}</td>
            {row.map((value, i) => (
              <td key={i} className="max-w-[360px] truncate border-b border-r px-2 py-1 font-mono" title={value === null || value === undefined ? 'null' : String(value)}>
                {renderCell(value)}
              </td>
            ))}
          </>
        )}
      />
    </div>
  );
}
