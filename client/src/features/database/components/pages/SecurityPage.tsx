import { useCallback } from 'react';
import { ShieldCheck, Users, KeyRound } from 'lucide-react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import KpiCard from '../ui/KpiCard';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

function severityColor(severity: 'low' | 'medium' | 'high'): string {
  if (severity === 'high') return 'var(--color-danger)';
  if (severity === 'medium') return 'var(--color-warning)';
  return GG.fg3;
}

interface SecurityPageProps { projectId: number; paused: boolean; }

export default function SecurityPage({ projectId, paused }: SecurityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.security(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 30000, paused });

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading security posture…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiCard icon={<ShieldCheck size={14} />} value={data.securityScore} label="Security Score" subTone={data.securityScore >= 80 ? 'good' : data.securityScore >= 60 ? 'neutral' : 'bad'} />
        <KpiCard icon={<Users size={14} />} value={data.totalUsers} label="Database Users" />
        <KpiCard icon={<KeyRound size={14} />} value={data.privilegedAccounts} label="Privileged Accounts" subTone={data.privilegedAccounts > 1 ? 'bad' : 'neutral'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, alignItems: 'start' }}>
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', borderBottom: `1px solid ${GG.line}` }}>Database Users</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <thead><tr style={{ background: GG.bg2, textAlign: 'left' }}>
              {['User', 'Role', 'Privilege'].map(h => <th key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.users.map(u => (
                <tr key={u.name} style={{ borderTop: `1px solid ${GG.line}` }}>
                  <td style={{ padding: '9px 18px', color: GG.fg2 }}>{u.name}</td>
                  <td style={{ padding: '9px 18px', color: GG.fg3, textTransform: 'capitalize' }}>{u.role}</td>
                  <td style={{ padding: '9px 18px', color: u.privilege === 'Full' ? 'var(--color-warning)' : GG.fg2, fontWeight: u.privilege === 'Full' ? 700 : 400 }}>{u.privilege}</td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: GG.fg4 }}>No users found.</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Findings</div>
          {data.findings.length === 0 ? (
            <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>No security findings detected.</p>
          ) : data.findings.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i > 0 ? `1px solid ${GG.line}` : 'none' }}>
              <span style={{ fontFamily: GG.mono, fontSize: 10, fontWeight: 700, color: severityColor(f.severity), textTransform: 'uppercase', flex: '0 0 auto', width: 56 }}>{f.severity}</span>
              <span style={{ fontFamily: GG.sans, fontSize: 12.5, color: GG.fg2 }}>{f.summary}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
