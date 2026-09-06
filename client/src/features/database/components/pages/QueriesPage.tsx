import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { GG, GGErrorBanner, ggInput } from '../dbConnectTheme';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { TopQueryRow } from '../../types';

type Filter = 'all' | 'slow' | 'frequent';

function impactColor(impact: TopQueryRow['impact']): string {
  if (impact === 'critical') return 'var(--color-danger)';
  if (impact === 'high') return 'var(--color-warning)';
  if (impact === 'medium') return GG.info;
  return GG.fg4;
}

interface QueriesPageProps { projectId: number; paused: boolean; }

export default function QueriesPage({ projectId, paused }: QueriesPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.queries(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 15000, paused });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<TopQueryRow | null>(null);

  const frequentThreshold = useMemo(() => {
    if (!data?.queries.length) return Infinity;
    const sorted = [...data.queries].map(q => q.calls).sort((a, b) => b - a);
    return sorted[Math.floor(sorted.length / 4)] ?? Infinity;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.queries.filter(q => {
      if (search && !q.query.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'slow' && q.avgMs < 200) return false;
      if (filter === 'frequent' && q.calls < frequentThreshold) return false;
      return true;
    });
  }, [data, search, filter, frequentThreshold]);

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading queries…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  if (!data.available) {
    return (
      <div style={{ padding: 24, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, maxWidth: 700 }}>
        <h2 style={{ margin: '0 0 6px', fontFamily: GG.mono, fontSize: 15, color: GG.fg }}>Query statistics are not available</h2>
        <p style={{ margin: 0, color: GG.fg3, fontSize: 13, lineHeight: 1.6 }}>{data.reason}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input style={{ ...ggInput, maxWidth: 320 }} placeholder="Search queries…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'slow', 'frequent'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 7, border: `1px solid ${filter === f ? GG.accent + '55' : GG.lineStrong}`,
                background: filter === f ? `${GG.accent}18` : 'transparent', color: filter === f ? GG.accent : GG.fg3,
                fontFamily: GG.mono, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
              }}>{f}</button>
            ))}
          </div>
        </div>

        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <thead>
              <tr style={{ background: GG.bg2, textAlign: 'left' }}>
                {['Query', 'Calls', 'Avg', 'Total', 'Rows', 'Impact'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.fingerprint} onClick={() => setSelected(q)} style={{ cursor: 'pointer', borderTop: `1px solid ${GG.line}` }}>
                  <td style={{ padding: '9px 14px', color: GG.fg2, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
                  <td style={{ padding: '9px 14px', color: GG.fg2 }}>{q.calls.toLocaleString()}</td>
                  <td style={{ padding: '9px 14px', color: GG.fg2 }}>{q.avgMs.toFixed(0)}ms</td>
                  <td style={{ padding: '9px 14px', color: GG.fg2 }}>{(q.totalMs / 1000).toFixed(1)}s</td>
                  <td style={{ padding: '9px 14px', color: GG.fg2 }}>{q.rows === null ? '—' : q.rows.toLocaleString()}</td>
                  <td style={{ padding: '9px 14px', color: impactColor(q.impact), fontWeight: 700, textTransform: 'capitalize' }}>{q.impact}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: GG.fg4 }}>No queries match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div style={{ width: '100%', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ fontFamily: GG.mono, fontSize: 13, fontWeight: 700, color: GG.fg }}>Query Details</div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 0, color: GG.fg3, cursor: 'pointer' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>SQL</div>
              <pre style={{ margin: 0, padding: 12, background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 8, color: GG.fg2, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>{selected.query}</pre>
              <p style={{ marginTop: 14, marginBottom: 0, color: GG.fg4, fontSize: 10.5, lineHeight: 1.5 }}>Execution plan and index recommendations are not available in this release.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, borderLeft: `1px solid ${GG.line}`, paddingLeft: 24 }}>
              {[
                ['Fingerprint', selected.fingerprint],
                ['Impact', selected.impact.toUpperCase()],
                ['Average', `${selected.avgMs.toFixed(0)}ms`],
                ['Calls', selected.calls.toLocaleString()],
                ['Total Time', `${(selected.totalMs / 60000).toFixed(1)}m`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: GG.mono, fontSize: 15, fontWeight: 700, color: GG.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
