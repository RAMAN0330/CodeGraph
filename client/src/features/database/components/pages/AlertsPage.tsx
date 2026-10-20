import { useCallback, useState } from 'react';
import { AlertTriangle, BellOff, BellRing, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import type { DbNavId, EvaluatedAlert, HealthStatus } from '../../types';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

const METRIC_OPTIONS = [
  { id: 'p95_latency_ms', label: 'Query latency (ms)' },
  { id: 'connections_pct', label: 'Connections (% of max)' },
  { id: 'blocked_queries', label: 'Blocked queries' },
];
const metricLabel = (id: string) => METRIC_OPTIONS.find(m => m.id === id)?.label ?? id;
const METRIC_SECTION: Record<string, DbNavId> = { p95_latency_ms: 'queries', connections_pct: 'performance', blocked_queries: 'performance' };

const SEVERITY_TONE: Record<EvaluatedAlert['severity'], Tone> = { critical: 'bad', high: 'warn', warning: 'warn' };
const STATUS_TONE: Record<HealthStatus, Tone> = { healthy: 'good', warning: 'warn', critical: 'bad', unknown: 'neutral' };
const STATUS_DOT: Record<HealthStatus, string> = { healthy: 'bg-[var(--color-success)]', warning: 'bg-[var(--color-warning)]', critical: 'bg-[var(--color-danger)]', unknown: 'bg-muted-foreground' };

// The built-in checks behind the health score, with the thresholds the server applies.
const CHECK_RULE: Record<string, string> = {
  connections: 'Warn over 75% of max, critical over 90%',
  latency: 'Warn over 80 ms round trip, critical over 200 ms',
  queries: 'Needs statement statistics enabled',
  locks: 'Warn on any blocked query, critical over 5',
  replication: 'Warn when a replica lags over 5 s',
  storage: 'Size tracked on Storage',
  cache: 'Warn under 90% cache hit ratio',
  errors: 'Warn on any deadlock since stats reset',
};

interface AlertsPageProps { projectId: number; paused: boolean; onNavigate: (section: DbNavId) => void; }

export default function AlertsPage({ projectId, paused, onNavigate }: AlertsPageProps) {
  const [chosenTab, setTab] = useState<'active' | 'checks' | 'resolved' | null>(null);
  const overviewFetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data: overview, error: overviewError } = useDbTelemetry(overviewFetcher, [projectId], { pollMs: 10000, paused });
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
    if (!Number.isFinite(Number(threshold)) || threshold.trim() === '') { setFormError('Threshold must be a number.'); return; }
    if (!Number.isInteger(Number(forMinutes)) || Number(forMinutes) < 0) { setFormError('Minutes must be a whole number.'); return; }
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
    try {
      await dbTelemetryApi.deleteAlertRule(projectId, ruleId);
      await refreshRules();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not delete this rule.');
    }
  }

  const active = overview?.activeAlerts ?? [];
  const checks = overview?.healthMatrix ?? [];
  const failing = checks.filter(c => c.status === 'warning' || c.status === 'critical').length;
  const healthy = checks.filter(c => c.status === 'healthy').length;
  // Until the user picks a view, show what matters: firing alerts if any, else the health checks.
  const tab = chosenTab ?? (active.length ? 'active' : 'checks');
  const ruleList = rules ?? [];

  return (
    <Page>
      <PageHeader
        icon={BellRing}
        tone="database"
        title="Alerts"
        description="Your own threshold rules plus the built-in health checks, evaluated every 10 seconds. A firing rule is critical at over 2x its threshold, high over 1.3x, otherwise a warning."
      />
      <SummaryStrip items={[
        { label: 'Firing now', value: overview ? active.length : '—', tone: active.some(a => a.severity === 'critical') ? 'bad' : active.length ? 'warn' : 'good', sub: active.length ? 'Investigate' : 'All clear', onClick: () => setTab('active') },
        { label: 'Health checks', value: overview ? `${healthy}/${checks.length}` : '—', tone: failing ? 'warn' : 'good', sub: failing ? `${failing} need a look` : healthy < checks.length ? `${checks.length - healthy} not measurable` : 'All healthy', onClick: () => setTab('checks') },
        { label: 'Rules', value: rules ? ruleList.length : '—', sub: ruleList.length ? `${ruleList.filter(r => r.enabled).length} enabled` : 'Add one on the right' },
        { label: 'Health score', value: overview?.healthScore ?? '—', tone: overview ? STATUS_TONE[overview.healthStatus] : 'neutral', sub: overview ? overview.healthStatus.charAt(0).toUpperCase() + overview.healthStatus.slice(1) : undefined },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]">
        <Section
          className="min-h-[300px]"
          bodyClassName="p-0"
          title="Status"
          actions={<Segmented label="Alert view" value={tab} onChange={setTab} options={[
            { value: 'active', label: 'Firing', count: active.length },
            { value: 'checks', label: 'Health checks', count: checks.length },
            { value: 'resolved', label: 'Resolved' },
          ]} />}
        >
          {overviewError && !overview ? (
            <StateCard icon={AlertTriangle} title="Could not load alert status">{overviewError}</StateCard>
          ) : !overview ? (
            <p className="p-4 text-xs text-muted-foreground">Loading…</p>
          ) : tab === 'active' ? (
            active.length === 0 ? (
              <StateCard icon={BellOff} title="Nothing is firing">
                {ruleList.length ? 'Every rule is within its threshold.' : 'No rules yet. Add one on the right, for example connections over 80% of max.'}
              </StateCard>
            ) : (
              <ul className="divide-y">
                {active.map(alert => (
                  <li key={alert.rule.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', toneText[SEVERITY_TONE[alert.severity]])}><BellRing className="size-4" /></span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-semibold">{metricLabel(alert.rule.metric)} {alert.rule.condition === 'gt' ? '>' : '<'} {alert.rule.threshold}</span>
                      <span className="truncate text-xs text-muted-foreground">Now <b className="font-mono text-foreground">{alert.currentValue.toFixed(1)}</b></span>
                    </span>
                    <span className={cn('text-[11px] font-semibold capitalize', toneText[SEVERITY_TONE[alert.severity]])}>{alert.severity}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onNavigate(METRIC_SECTION[alert.rule.metric] ?? 'performance')}>Investigate</Button>
                  </li>
                ))}
              </ul>
            )
          ) : tab === 'checks' ? (
            <ul className="divide-y">
              {checks.map(check => (
                <li key={check.category} className="flex items-center gap-3 px-4 py-2.5">
                  <i className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[check.status])} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold capitalize">{check.category}</span>
                    <span className="truncate text-xs text-muted-foreground">{CHECK_RULE[check.category]}</span>
                  </span>
                  <span className="max-w-[40%] truncate text-right text-xs text-muted-foreground">{check.detail}</span>
                  <span className={cn('w-16 text-right text-[11px] font-semibold capitalize', toneText[STATUS_TONE[check.status]])}>{check.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <StateCard icon={BellOff} title="No history kept yet">Alerts are evaluated live and not stored, so a rule that stops firing simply leaves the Firing list. Resolved history needs persisted alert state, planned for a later release.</StateCard>
          )}
        </Section>

        <Section title="Rules" meta={`${ruleList.length}`} className="min-h-[300px]" bodyClassName="flex flex-col gap-3">
          <form onSubmit={submitRule} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 rounded-lg border bg-card p-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Metric</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger size="sm" className="w-full text-xs" aria-label="Metric"><SelectValue /></SelectTrigger>
                <SelectContent>{METRIC_OPTIONS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">When</Label>
                <Select value={condition} onValueChange={v => setCondition(v as 'gt' | 'lt')}>
                  <SelectTrigger size="sm" className="w-full text-xs" aria-label="Condition"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="gt">above</SelectItem><SelectItem value="lt">below</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="alert-rule-threshold" className="text-[11px] text-muted-foreground">Threshold</Label>
                <Input id="alert-rule-threshold" inputMode="decimal" className="h-8 text-xs" value={threshold} onChange={e => setThreshold(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="alert-rule-for-minutes" className="text-[11px] text-muted-foreground">For (min)</Label>
                <Input id="alert-rule-for-minutes" inputMode="numeric" className="h-8 text-xs" value={forMinutes} onChange={e => setForMinutes(e.target.value)} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saving} className="col-span-2 h-8 gap-1.5 text-xs"><Plus className="size-3.5" /> Add rule</Button>
          </form>
          {(formError || rulesError) && <p role="alert" className={cn('text-xs', toneText.bad)}>{formError || rulesError}</p>}

          {ruleList.length === 0 ? (
            <StateCard icon={BellRing} title="No rules yet">Rules fire when a metric crosses its threshold. A good start: connections above 80, query latency above 500.</StateCard>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border bg-card">
              {ruleList.map(rule => {
                const firing = active.some(a => a.rule.id === rule.id);
                return (
                  <li key={rule.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
                    <i className={cn('size-2 shrink-0 rounded-full', firing ? 'bg-[var(--color-danger)]' : rule.enabled ? 'bg-[var(--color-success)]' : 'bg-muted-foreground')} aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">{metricLabel(rule.metric)} {rule.condition === 'gt' ? '>' : '<'} {rule.threshold}</span>
                      <span className="text-xs text-muted-foreground">{firing ? 'Firing' : rule.enabled ? 'Watching' : 'Disabled'} · for {rule.forMinutes} min</span>
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete rule ${metricLabel(rule.metric)}`} onClick={() => removeRule(rule.id)}><Trash2 className="size-3.5" /></Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </Page>
  );
}
