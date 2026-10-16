import { useCallback, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingState, Panel, StatusBadge } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { severityTone } from '../../services/format';

const METRICS = [
  { id: 'p95_latency_ms', label: 'p95 query latency (ms)' },
  { id: 'connections_pct', label: 'Connections (% of max)' },
  { id: 'blocked_queries', label: 'Blocked queries' },
];
const metricLabel = (id: string) => METRICS.find(m => m.id === id)?.label ?? id;

interface AlertsPageProps { projectId: number; paused: boolean; }

export default function AlertsPage({ projectId, paused }: AlertsPageProps) {
  const overviewFetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data: overview, error: overviewError, refresh: refreshOverview } = useDbTelemetry(overviewFetcher, [projectId], { pollMs: 10000, paused });
  const rulesFetcher = useCallback(() => dbTelemetryApi.listAlertRules(projectId), [projectId]);
  const { data: rules, error: rulesError, refresh: refreshRules } = useDbTelemetry(rulesFetcher, [projectId], { pollMs: 0, paused: true });

  const [metric, setMetric] = useState(METRICS[0].id);
  const [condition, setCondition] = useState<'gt' | 'lt'>('gt');
  const [threshold, setThreshold] = useState('500');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function submitRule(event: React.FormEvent) {
    event.preventDefault();
    const thresholdValue = Number(threshold);
    if (threshold.trim() === '' || !Number.isFinite(thresholdValue)) {
      setFormError('Enter a number for the threshold.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      // shortcut: rules fire on the latest reading; a sustained-for duration is
      // stored by the API but not evaluated yet, so the form does not offer it.
      await dbTelemetryApi.createAlertRule(projectId, { metric, condition, threshold: thresholdValue, forMinutes: 1 });
      await refreshRules();
      refreshOverview();
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
      refreshOverview();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not delete this rule.');
    }
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <Panel title="Firing now" description="Rules whose threshold is currently crossed" contentClassName="p-0">
        {overviewError && !overview ? <div className="p-4"><ErrorState message={overviewError} onRetry={refreshOverview} /></div>
          : !overview ? <LoadingState label="Checking alerts…" />
          : overview.activeAlerts.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing is firing">{(rules ?? []).length ? 'Every rule is within its threshold.' : 'Add a rule to start watching a metric.'}</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {overview.activeAlerts.map(alert => (
                <li key={alert.rule.id} className="flex items-center gap-3 px-4 py-2.5">
                  <StatusBadge tone={severityTone(alert.severity)}>{alert.severity}</StatusBadge>
                  <span className="min-w-0 flex-1 truncate">{metricLabel(alert.rule.metric)} {alert.rule.condition === 'gt' ? '>' : '<'} {alert.rule.threshold}</span>
                  <span className="font-semibold tabular-nums">{alert.currentValue.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          )}
      </Panel>

      <Panel title="Rules" description="Checked against the latest reading on every poll" contentClassName="p-0">
        <form onSubmit={submitRule} className="grid grid-cols-[minmax(0,1fr)_88px_96px_auto] items-end gap-2 border-b p-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Metric</Label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger size="sm" className="w-full" aria-label="Metric"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">When</Label>
            <Select value={condition} onValueChange={v => setCondition(v as 'gt' | 'lt')}>
              <SelectTrigger size="sm" className="w-full" aria-label="Condition"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="gt">above</SelectItem><SelectItem value="lt">below</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="alert-threshold" className="text-xs">Threshold</Label>
            <Input id="alert-threshold" inputMode="decimal" className="h-8" value={threshold} onChange={e => setThreshold(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add</Button>
          {(formError || rulesError) && <p className="col-span-full text-xs text-destructive" role="alert">{formError || rulesError}</p>}
        </form>
        {(rules ?? []).length === 0 ? (
          <EmptyState icon={BellRing} title="No rules yet">For example: p95 query latency above 500 ms.</EmptyState>
        ) : (
          <ul className="divide-y text-sm">
            {(rules ?? []).map(rule => (
              <li key={rule.id} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate">{metricLabel(rule.metric)} {rule.condition === 'gt' ? 'above' : 'below'} <b className="tabular-nums">{rule.threshold}</b></span>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeRule(rule.id)} aria-label={`Delete rule: ${metricLabel(rule.metric)}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
