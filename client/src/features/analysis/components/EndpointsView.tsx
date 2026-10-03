import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Route } from 'lucide-react';
import type { EndpointWithReach } from '../services/endpoints';

// HTTP endpoints found by the analysis (client/src/features/analysis/services/endpoints.ts),
// each with the code and database tables it reaches.

interface Props { data: any; onOpenFile: (path: string) => void; onOpenTable: (table: string) => void }

export default function EndpointsView({ data, onOpenFile, onOpenTable }: Props) {
  const endpoints: EndpointWithReach[] | undefined = data?.endpoints;
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!endpoints || !q) return endpoints ?? [];
    return endpoints.filter(e => `${e.method} ${e.path} ${e.file} ${e.handler ?? ''} ${e.tables.join(' ')}`.toLowerCase().includes(q));
  }, [endpoints, filter]);

  if (!endpoints) {
    return <div className="gi-page guide-page"><h1>API endpoints</h1><div className="guide-card"><p className="guide-empty">This analysis predates endpoint detection. Rescan the repository to map its endpoints.</p></div></div>;
  }

  const frameworks = [...new Set(endpoints.map(e => e.framework))];
  const key = (e: EndpointWithReach) => `${e.method} ${e.path} ${e.file}:${e.line}`;

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>API endpoints</h1>
          <p>{endpoints.length ? `${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'} (${frameworks.join(', ')}), each with the code and database tables its handler reaches.` : 'No HTTP endpoints were found. Detection covers Express-style routers, FastAPI, Flask, Django, Go, Spring and Next.js.'}</p>
        </div>
      </header>
      {endpoints.length > 0 && (
        <>
          <div className="ask-form endpoints-filter">
            <Route size={16} aria-hidden="true" />
            <label htmlFor="endpoint-filter" className="sr-only">Filter endpoints</label>
            <input id="endpoint-filter" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by path, method, file or table" autoComplete="off" />
          </div>
          <section className="guide-card">
            <table className="hotspots-table endpoints-table">
              <thead><tr><th scope="col"><span className="sr-only">Details</span></th><th scope="col">Endpoint</th><th scope="col">Handler</th><th scope="col">Tables</th><th scope="col">Reach</th></tr></thead>
              <tbody>
                {shown.map(e => {
                  const k = key(e);
                  const expanded = open === k;
                  return (
                    <Fragment key={k}>
                      <tr>
                        <td><button type="button" className="endpoints-expand" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} what ${e.method} ${e.path} reaches`} onClick={() => setOpen(expanded ? null : k)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                        <td><span className={`endpoint-method m-${e.method.toLowerCase()}`}>{e.method}</span> <code>{e.path}</code></td>
                        <td><button type="button" className="guide-file" onClick={() => onOpenFile(e.file)} title={`${e.file}:${e.line}`}>{e.handler ? `${e.handler}()` : `${e.file.split('/').pop()}:${e.line}`}</button></td>
                        <td>{e.tables.length ? e.tables.map(t => <button key={t} type="button" className="endpoint-table" onClick={() => onOpenTable(t)}>{t}</button>) : <span className="guide-empty">—</span>}</td>
                        <td>{e.reachCount} file{e.reachCount === 1 ? '' : 's'}</td>
                      </tr>
                      {expanded && (
                        <tr className="endpoints-detail">
                          <td />
                          <td colSpan={4}>
                            <p>Declared in <button type="button" className="guide-file" onClick={() => onOpenFile(e.file)}>{e.file}:{e.line}</button>{e.calls.length > 0 && <> · calls {e.calls.slice(0, 8).map(c => `${c}()`).join(', ')}{e.calls.length > 8 ? '…' : ''}</>}</p>
                            {e.reach.length ? <ul className="ask-list">{e.reach.map(f => <li key={f}><div><button type="button" className="guide-file" onClick={() => onOpenFile(f)}>{f}</button></div></li>)}</ul> : <p className="guide-empty">The handler doesn't call into other files.</p>}
                            {e.reachCount > e.reach.length && <p className="guide-empty">+{e.reachCount - e.reach.length} more files further down</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!shown.length && <p className="guide-empty">No endpoint matches “{filter}”.</p>}
          </section>
        </>
      )}
    </div>
  );
}
