// Turns the engine's raw failure strings into what happened and what to do.
export function describeAnalysisError(error: string): { message: string; hint?: string } {
  const status = error.match(/\b(401|403|404|429|5\d\d)\b/)?.[1];
  if (status === '403' || status === '429' || /rate limit/i.test(error)) return {
    message: 'GitHub refused the request (rate limit or access).',
    hint: 'Anonymous GitHub requests are limited to 60 an hour, and private repositories need access. Connect GitHub from your account menu, or wait a few minutes and retry.',
  };
  if (status === '404') return {
    message: 'Repository not found.',
    hint: 'Check the owner/repository name and branch. If the repository is private, connect a GitHub account that has access to it.',
  };
  if (status === '401') return {
    message: 'GitHub rejected the saved credentials.',
    hint: 'Your GitHub connection may have expired. Reconnect GitHub from your account menu, then retry.',
  };
  if (status && status.startsWith('5')) return {
    message: 'GitHub or the analysis service had a temporary problem.',
    hint: 'This is usually brief. Retry in a moment.',
  };
  if (/failed to fetch|network|unreachable/i.test(error)) return {
    message: 'Structrace could not reach GitHub or its server.',
    hint: 'Check your connection and retry.',
  };
  return { message: error };
}
