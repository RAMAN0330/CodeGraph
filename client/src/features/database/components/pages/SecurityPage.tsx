import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, ShieldCheck, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { EmptyNote } from '../../../../shared/components/Dashboard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { SecurityFinding } from '../../types';

const SEVERITY_TONE: Record<SecurityFinding['severity'], Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
const SEVERITY_DOT: Record<SecurityFinding['severity'], string> = { high: 'bg-[var(--color-danger)]', medium: 'bg-[var(--color-warning)]', low: 'bg-muted-foreground' };
const PRIVILEGE_HINT: Record<string, string> = {
  Full: 'Superuser: bypasses every permission check',
  'Create DB': 'Can create new databases',
  Standard: 'Only what has been granted',
};

interface SecurityPageProps { projectId: number; paused: boolean; }

export default function SecurityPage({ projectId, paused }: SecurityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.security(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 30000, paused });
  const [view, setView] = useState<'all' | 'privileged'>('all');

  const users = useMemo(() => (data?.users ?? []).filter(u => view === 'all' || u.privilege !== 'Standard'), [data, view]);

  const header = (
    <PageHeader
      icon={ShieldCheck}
      tone="database"
      title="Security"
      description="Who can log in to this database and with how much power. The score starts at 100, loses 15 per finding and 5 per superuser, and never drops below 40."
    />
  );

  if (loading && !data) return <Page>{header}<Skeleton className="h-[86px] rounded-xl" /><Skeleton className="min-h-60 flex-1 rounded-xl" /></Page>;
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load the security posture">{error}</StateCard></Page>;
  if (!data) return null;

  const elevated = data.users.filter(u => u.privilege !== 'Standard').length;
  const recommendations = [
    data.privilegedAccounts > 1 && { title: 'Keep one superuser', body: `There are ${data.privilegedAccounts}. Give admins their own non-superuser roles with the grants they need, and keep a single break-glass superuser.` },
    data.findings.some(f => /connection limit/i.test(f.summary)) && { title: 'Cap connections per role', body: 'A runaway client can use every slot. Set a limit, for example: ALTER ROLE app_user CONNECTION LIMIT 50;' },
    data.users.some(u => u.privilege === 'Full' && !/^(postgres|root)$/i.test(u.name)) && { title: 'Applications should not be superusers', body: 'If a service logs in as a superuser, move it to a role that owns only its schema.' },
    { title: 'Grant least privilege', body: 'Give each application its own login role and grant only the schemas and tables it uses. Read-only tools get SELECT only.' },
    { title: 'Require TLS and strong auth', body: 'Use scram-sha-256 passwords and hostssl rules in pg_hba.conf so credentials never cross the network in clear text.' },
  ].filter(Boolean) as { title: string; body: string }[];

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Security score', value: data.securityScore, tone: data.securityScore >= 80 ? 'good' : data.securityScore >= 60 ? 'warn' : 'bad', sub: data.securityScore >= 80 ? 'Good' : data.securityScore >= 60 ? 'Needs attention' : 'At risk' },
        { label: 'Login roles', value: data.totalUsers, sub: `${data.totalUsers - elevated} standard` },
        { label: 'Superusers', value: data.privilegedAccounts, tone: data.privilegedAccounts > 1 ? 'warn' : 'good', sub: data.privilegedAccounts > 1 ? 'More than one' : 'Within best practice', onClick: () => setView(view === 'privileged' ? 'all' : 'privileged') },
        { label: 'Findings', value: data.findings.length, tone: data.findings.some(f => f.severity === 'high') ? 'bad' : data.findings.length ? 'warn' : 'good', sub: data.findings.length ? 'See the list' : 'Nothing found' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <Section
          title="Users and roles"
          meta="Roles that can log in"
          className="min-h-[300px]"
          bodyClassName="p-0"
          actions={<Segmented label="Filter roles" value={view} onChange={setView} options={[{ value: 'all', label: 'All', count: data.users.length }, { value: 'privileged', label: 'Elevated', count: elevated }]} />}
        >
          {users.length === 0 ? (
            <StateCard icon={User} title={data.users.length ? 'No elevated roles' : 'No login roles found'}>
              {data.users.length ? 'Every login role has standard privileges.' : 'The monitoring user may not be allowed to read pg_roles.'}
            </StateCard>
          ) : (
            <ul className="divide-y">
              {users.map(u => {
                const full = u.privilege === 'Full';
                return (
                  <li key={u.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', full ? toneText.warn : 'text-muted-foreground')}>
                      {full ? <KeyRound className="size-4" /> : <User className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-[13px] font-semibold">{u.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{PRIVILEGE_HINT[u.privilege] ?? u.role}</span>
                    </span>
                    <span className={cn('text-[11px] font-semibold', full ? toneText.warn : 'text-muted-foreground')}>{u.privilege}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="flex min-h-0 flex-col gap-3 max-lg:min-h-[480px]">
          <Section title="Findings" meta={`${data.findings.length}`} className="shrink-0" bodyClassName="flex max-h-48 flex-col">
            {data.findings.length === 0 ? <EmptyNote>No findings. Checks: more than one superuser, and login roles without a connection limit.</EmptyNote> : (
              <ul className="flex flex-col divide-y">
                {data.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                    <span className={cn('inline-flex w-16 shrink-0 items-center gap-1.5 text-[11px] font-semibold capitalize', toneText[SEVERITY_TONE[f.severity]])}>
                      <i className={cn('size-1.5 rounded-full', SEVERITY_DOT[f.severity])} aria-hidden="true" />{f.severity}
                    </span>
                    <span className="text-[13px] leading-snug">{f.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Recommendations" className="min-h-0 flex-1" bodyClassName="flex flex-col gap-3">
            {recommendations.map(r => (
              <div key={r.title} className="flex flex-col gap-0.5">
                <strong className="text-[13px] font-semibold">{r.title}</strong>
                <p className="text-xs leading-relaxed text-muted-foreground">{r.body}</p>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </Page>
  );
}
