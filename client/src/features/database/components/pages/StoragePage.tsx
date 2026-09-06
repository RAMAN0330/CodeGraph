import { useCallback } from 'react';
import { HardDrive, TrendingUp, Table2, ListTree } from 'lucide-react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import MiniLineChart from '../ui/MiniLineChart';
import KpiCard from '../ui/KpiCard';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

interface StoragePageProps { projectId: number; paused: boolean; }

export default function StoragePage({ projectId, paused }: StoragePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.storage(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 60000, paused });

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading storage…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard icon={<HardDrive size={14} />} value={formatBytes(data.databaseSizeBytes)} label="Database Size" />
        <KpiCard
          icon={<TrendingUp size={14} />}
          value={data.growth7dBytes === null ? '—' : `${data.growth7dBytes >= 0 ? '+' : ''}${formatBytes(data.growth7dBytes)}`}
          label="7d Growth"
          sub={data.growth7dPercent === null ? 'Collecting history' : `${data.growth7dPercent >= 0 ? '+' : ''}${data.growth7dPercent.toFixed(1)}%`}
        />
        <KpiCard icon={<Table2 size={14} />} value={data.largestObject?.name ?? '—'} label="Largest Object" sub={data.largestObject ? formatBytes(data.largestObject.sizeBytes) : undefined} />
        <KpiCard icon={<ListTree size={14} />} value={formatBytes(data.indexesBytes)} label="Indexes" />
      </div>

      <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
        <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Database Size Over Time</div>
        <MiniLineChart
          series={[{ label: 'Size', color: GG.accent, points: data.history.map(h => h.sizeBytes) }]}
          emptyLabel="Not enough history yet — snapshots are captured periodically while this dashboard is open."
        />
      </div>

      <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', borderBottom: `1px solid ${GG.line}` }}>Largest Objects</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
          <thead>
            <tr style={{ background: GG.bg2, textAlign: 'left' }}>
              {['Table', 'Rows', 'Data', 'Indexes', 'Total'].map(h => (
                <th key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tables.map(t => (
              <tr key={`${t.schema}.${t.name}`} style={{ borderTop: `1px solid ${GG.line}` }}>
                <td style={{ padding: '9px 18px', color: GG.fg2 }}>{t.schema ? `${t.schema}.` : ''}{t.name}</td>
                <td style={{ padding: '9px 18px', color: GG.fg2 }}>{t.rows === null ? '—' : t.rows.toLocaleString()}</td>
                <td style={{ padding: '9px 18px', color: GG.fg2 }}>{formatBytes(t.dataBytes)}</td>
                <td style={{ padding: '9px 18px', color: GG.fg2 }}>{formatBytes(t.indexBytes)}</td>
                <td style={{ padding: '9px 18px', color: GG.fg, fontWeight: 700 }}>{formatBytes(t.totalBytes)}</td>
              </tr>
            ))}
            {data.tables.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: GG.fg4 }}>No tables found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
