import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GG, GGErrorBanner, ggInput, ggLabel } from '../dbConnectTheme';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

type Tab = 'active' | 'resolved' | 'rules';

const METRIC_OPTIONS = [
  { id: 'p95_latency_ms', label: 'P95 Query Latency (ms)' },
  { id: 'connections_pct', label: 'Connections (% of max)' },
  { id: 'blocked_queries', label: 'Blocked Queries' },
];

interface AlertsPageProps { projectId: number; paused: boolean; }

export default function AlertsPage({ projectId, paused }: AlertsPageProps) {
  const [tab, setTab] = useState<Tab>('active');
  const overviewFetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data: overview } = useDbTelemetry(overviewFetcher, [projectId], { pollMs: 10000, paused });
  const rulesFetcher = useCallback(() => dbTelemetryApi.listAlertRules(projectId), [projectId]);
  const { data: rules, error: rulesError, refresh: refreshRules } = useDbTelemetry(rulesFetcher, [projectId], { pollMs: 0, paused: true });

  const [metric, setMetric] = useState(METRIC_OPTIONS[0].id);
  const [condition, setCondition] = useState<'gt' | 'lt'>('gt');
  const [threshold, setThreshold] = useState('500');
  const [forMinutes, setForMinutes] = useState('5');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function submitRule(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await dbTelemetryApi.createAlertRule(projectId, { metric, condition, threshold: Number(threshold), forMinutes: Number(forMinutes) });
      await refreshRules();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not create this rule.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(ruleId: number) {
    await dbTelemetryApi.deleteAlertRule(projectId, ruleId);
    await refreshRules();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['active', 'resolved', 'rules'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: 7, border: `1px solid ${tab === t ? GG.accent + '55' : GG.lineStrong}`,
            background: tab === t ? `${GG.accent}18` : 'transparent', color: tab === t ? GG.accent : GG.fg3,
            fontFamily: GG.mono, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'active' && (
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18 }}>
          {!overview ? <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>Loading…</p> : overview.activeAlerts.length === 0 ? (
            <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>No active alerts. All monitored thresholds are within range.</p>
          ) : overview.activeAlerts.map((alert, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: i > 0 ? `1px solid ${GG.line}` : 'none' }}>
              <div>
                <div style={{ fontFamily: GG.mono, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: alert.severity === 'critical' ? 'var(--color-danger)' : alert.severity === 'high' ? 'var(--color-warning)' : GG.info }}>{alert.severity}</div>
                <div style={{ fontFamily: GG.sans, fontSize: 12.5, color: GG.fg2, marginTop: 3 }}>{METRIC_OPTIONS.find(m => m.id === alert.rule.metric)?.label ?? alert.rule.metric} {alert.rule.condition === 'gt' ? '>' : '<'} {alert.rule.threshold}</div>
              </div>
              <div style={{ fontFamily: GG.mono, fontSize: 12, color: GG.fg, fontWeight: 700 }}>{alert.currentValue.toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'resolved' && (
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18 }}>
          <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>Resolved-alert history is not available yet — this requires persisted alert-state tracking, planned for a later release.</p>
        </div>
      )}

      {tab === 'rules' && (
        <>
          <form onSubmit={submitRule} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
            <div>
              <label style={ggLabel}>Metric</label>
              <select style={{ ...ggInput, width: 220 }} value={metric} onChange={e => setMetric(e.target.value)}>
                {METRIC_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={ggLabel}>Condition</label>
              <select style={{ ...ggInput, width: 90 }} value={condition} onChange={e => setCondition(e.target.value as 'gt' | 'lt')}>
                <option value="gt">{'>'}</option>
                <option value="lt">{'<'}</option>
              </select>
            </div>
            <div>
              <label style={ggLabel}>Threshold</label>
              <input style={{ ...ggInput, width: 100 }} value={threshold} onChange={e => setThreshold(e.target.value)} />
            </div>
            <div>
              <label style={ggLabel}>For (minutes)</label>
              <input style={{ ...ggInput, width: 90 }} value={forMinutes} onChange={e => setForMinutes(e.target.value)} />
            </div>
            <button type="submit" disabled={saving} style={{ height: 38, padding: '0 16px', background: GG.accent, border: 'none', borderRadius: 8, color: '#181a1f', fontFamily: GG.mono, fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Add rule
            </button>
          </form>
          {formError && <GGErrorBanner msg={formError} />}
          {rulesError && <GGErrorBanner msg={rulesError} />}

          <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
            {(rules ?? []).length === 0 ? (
              <p style={{ padding: 20, textAlign: 'center', color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>No alert rules yet.</p>
            ) : (rules ?? []).map(rule => (
              <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${GG.line}` }}>
                <span style={{ fontFamily: GG.mono, fontSize: 12, color: GG.fg2 }}>
                  {METRIC_OPTIONS.find(m => m.id === rule.metric)?.label ?? rule.metric} {rule.condition === 'gt' ? '>' : '<'} {rule.threshold} for {rule.forMinutes}m
                </span>
                <button onClick={() => removeRule(rule.id)} style={{ background: 'none', border: 0, color: GG.fg4, cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
