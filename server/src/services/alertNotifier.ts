import type { Regression } from '../analysis/sharedRules';

// Regression alerts go to Slack or Discord incoming webhooks. Only those two
// hosts are accepted: the server POSTs to whatever URL is saved, so an open
// allowlist would let a project setting reach internal services.

type WebhookKind = 'slack' | 'discord';

export function webhookKind(value: unknown): WebhookKind | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/')) return 'slack';
  if ((url.hostname === 'discord.com' || url.hostname === 'discordapp.com') && url.pathname.startsWith('/api/webhooks/')) return 'discord';
  return null;
}

export function formatAlertMessage(input: { owner: string; repo: string; branch: string; commitSha: string; regressions: Regression[]; workspaceUrl: string }): string {
  const ref = input.branch === 'HEAD' ? 'default branch' : input.branch;
  const lines = [`Structrace: ${input.owner}/${input.repo} (${ref} @ ${input.commitSha.slice(0, 7)}) got worse`];
  input.regressions.forEach(r => lines.push(`• ${r.message}`));
  lines.push(input.workspaceUrl);
  return lines.join('\n');
}

export async function sendWebhookMessage(url: string, text: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const kind = webhookKind(url);
  if (!kind) throw new Error('Only Slack or Discord incoming webhook URLs are supported.');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kind === 'slack' ? { text } : { content: text.slice(0, 2000) }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The webhook answered ${response.status}.`);
}
