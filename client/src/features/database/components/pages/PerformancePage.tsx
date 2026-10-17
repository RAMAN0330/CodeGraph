import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import LiveAreaChart from '../ui/LiveAreaChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import type { HealthStatus } from '../../types';
import './PerformancePage.css';

/* ── Instruments ─────────────────────────────────────────────────────────
   No panel wraps anything on this page. A section is a labelled hairline
   plus its readings; inside a section, the only separator is a 1px vertical.
   ──────────────────────────────────────────────────────────────────────── */

function Section({ label, meta, grow, children }: { label: string; meta?: ReactNode; grow?: boolean; children: ReactNode }) {
  return (
    <section className={`perf-section${grow ? ' perf-section--grow' : ''}`}>
      <header className="perf-head">
        <h2 className="perf-head__label">{label}</h2>
        <span className="perf-head__rule" aria-hidden="true" />
        {meta !== undefined && <div className="perf-head__meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

function Row({ columns, children }: { columns: number; children: ReactNode }) {
  return <div className="perf-row" data-cols={Math.min(5, Math.max(1, columns))}>{children}</div>;
}

function statusColor(status: HealthStatus | undefined): string | null {
  if (status === 'critical') return 'var(--color-danger)';
  if (status === 'warning') return 'var(--color-warning)';
  return null;
}

/** Bars animate to their reading, which is the page's one moment of motion:
 *  every instrument settles into the new poll together. */
function Bar({ ratio, color, still }: { ratio: number; color: string; still: boolean }) {
  const width = `${Math.min(100, Math.max(2, ratio * 100))}%`;
  return (
    <div className="perf-bar">
      <motion.span
        className="perf-bar__fill"
        style={{ background: color }}
        initial={still ? false : { width: 0 }}
        animate={{ width }}
        transition={still ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 24 }}
      />
    </div>
  );
}

/** Thousands separators for the plain integer counters the engine reports as strings. */
function readable(value: string): string {
  return /^\d+$/.test(value) ? Number(value).toLocaleString() : value;
}

function Skeleton({ height, width, grow }: { height: number; width: string; grow?: boolean }) {
  return <div className="perf-skeleton" style={{ height: grow ? undefined : height, width, flex: grow ? '1 1 auto' : undefined }} />;
}

interface PerformancePageProps { projectId: number; paused: boolean; }

export default function PerformancePage({ projectId, paused }: PerformancePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.performance(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `perf-ops-${projectId}`);
  const still = useReducedMotion() === true;

  if (loading && !data) {
    return (
      <div className="perf-page">
        {['Throughput', 'Latency tail', 'Connection pool', 'Engine'].map((label, i) => (
          <Section key={label} label={label} grow={i === 0}>
            <Skeleton grow={i === 0} height={54} width={i === 0 ? '100%' : ['62%', '84%', '100%'][i - 1]} />
          </Section>
        ))}
      </div>
    );
  }
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  const { latency, connections } = data;
  const peak = opsHistory.length ? Math.max(...opsHistory) : null;
  const tail = latency.available && latency.p50 && latency.p99 ? latency.p99 / latency.p50 : null;
  const latencyScale = Math.max(1, latency.p99 ?? 0, latency.p95 ?? 0, latency.p50 ?? 0);

  const segments = [
    { key: 'Active', value: connections.active, color: GG.accent },
    { key: 'Waiting', value: connections.waiting, color: 'var(--color-warning)' },
    { key: 'Blocked', value: connections.blocked, color: 'var(--color-danger)' },
    { key: 'Idle', value: connections.idle, color: 'rgba(97,175,239,0.24)' },
  ];
  const pool = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="perf-page">
      <Section
        label="Throughput"
        grow
        meta={
          <>
            <b>{data.opsPerSecond === null ? 'unavailable' : `${data.opsPerSecond.toFixed(0)} ops/s`}</b>
            <span className="perf-head__sep">|</span>
            peak {peak === null ? '—' : peak.toFixed(0)}
            <span className="perf-head__sep">|</span>
            8s poll
          </>
        }
      >
        <LiveAreaChart points={opsHistory} color={GG.accent} />
      </Section>

      <Section
        label="Latency tail"
        meta={tail === null ? undefined : <>p99 is <em>{tail.toFixed(1)}×</em> p50</>}
      >
        {latency.available ? (
          <Row columns={3}>
            {/* One accent graded p50 → p99, so the three bars read as a single tail shape
                rather than three unrelated readings. */}
            {([
              ['p50', latency.p50, '66'],
              ['p95', latency.p95, 'b3'],
              ['p99', latency.p99, ''],
            ] as const).map(([label, value, alpha]) => (
              <div className="perf-cell" key={label}>
                <div className="perf-cell__label">{label}</div>
                <div className="perf-cell__value">{value === null ? '—' : `${value}ms`}</div>
                <Bar ratio={(value ?? 0) / latencyScale} color={`${GG.accent}${alpha}`} still={still} />
              </div>
            ))}
          </Row>
        ) : (
          <p className="perf-note">{latency.reason ?? 'Percentile latency is not available for this connection.'}</p>
        )}
      </Section>

      <Section
        label="Connection pool"
        meta={<><b>{pool}</b> {pool === 1 ? 'connection' : 'connections'}</>}
      >
        <div className={`perf-track${pool === 0 ? ' perf-track--empty' : ''}`} role="img" aria-label={`Pool: ${segments.map(s => `${s.value} ${s.key.toLowerCase()}`).join(', ')}`}>
          {pool > 0 && segments.filter(s => s.value > 0).map(s => (
            <motion.span
              key={s.key}
              className="perf-track__seg"
              style={{ background: s.color, flexBasis: 0 }}
              initial={still ? false : { flexGrow: 0 }}
              animate={{ flexGrow: s.value }}
              transition={still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 26 }}
            />
          ))}
        </div>
        <Row columns={4}>
          {segments.map(s => {
            const alarming = (s.key === 'Waiting' || s.key === 'Blocked') && s.value > 0;
            return (
              <div className="perf-cell" key={s.key}>
                <div className="perf-cell__label">
                  <i className={`perf-dot${alarming ? ' perf-dot--alert' : ''}`} style={{ background: s.color }} />
                  {s.key}
                </div>
                <div className="perf-cell__value" style={alarming ? { color: s.color } : undefined}>{s.value}</div>
              </div>
            );
          })}
        </Row>
      </Section>

      <Section label="Engine">
        <Row columns={data.engineIntelligence.length}>
          {data.engineIntelligence.map(metric => {
            const tone = statusColor(metric.status);
            return (
              <div className="perf-cell" key={metric.label}>
                <div className="perf-cell__label">
                  {tone && <i className="perf-dot perf-dot--alert" style={{ background: tone }} />}
                  {metric.label}
                </div>
                <div
                  className={`perf-cell__value${metric.value === 'Not available' ? ' perf-cell__value--sm' : ''}`}
                  style={tone ? { color: tone } : undefined}
                >
                  {readable(metric.value)}
                </div>
              </div>
            );
          })}
        </Row>
      </Section>
    </div>
  );
}
