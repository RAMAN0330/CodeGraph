import { useCallback } from 'react';
import { KeyRound, ShieldCheck, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, Panel, Stat, StatusBadge } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { severityTone } from '../../services/format';

interface SecurityPageProps { projectId: number; paused: boolean; }

export default function SecurityPage({ projectId, paused }: SecurityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.security(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 30000, paused });

  if (loading && !data) return <LoadingState label="Loading security posture…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const scoreTone = data.securityScore >= 80 ? 'good' : data.securityScore >= 60 ? 'warn' : 'bad';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={ShieldCheck} label="Security score" value={data.securityScore} tone={scoreTone}
          hint={scoreTone === 'good' ? 'No serious findings' : `${data.findings.length} finding${data.findings.length === 1 ? '' : 's'} to review`} />
        <Stat icon={Users} label="Database roles" value={data.totalUsers} hint="Roles that can sign in" />
        <Stat icon={KeyRound} label="Privileged roles" value={data.privilegedAccounts} tone={data.privilegedAccounts > 1 ? 'warn' : 'neutral'}
          hint={data.privilegedAccounts > 1 ? 'Keep superusers to a minimum' : 'Superuser access is limited'} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Roles" contentClassName="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Privilege</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map(u => (
                <TableRow key={u.name}>
                  <TableCell className="font-mono text-xs">{u.name}</TableCell>
                  <TableCell className="capitalize">{u.role}</TableCell>
                  <TableCell><StatusBadge tone={u.privilege === 'Full' ? 'warn' : 'neutral'}>{u.privilege}</StatusBadge></TableCell>
                </TableRow>
              ))}
              {data.users.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No roles found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Findings" contentClassName="p-0">
          {data.findings.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No findings">Nothing in this database's role setup needs attention.</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {data.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <StatusBadge tone={severityTone(f.severity)} className="mt-0.5 w-16 justify-center">{f.severity}</StatusBadge>
                  <span>{f.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
