// Evidence for an AI answer to a question about a repository. The client's
// graph query picks the files; the code comes from the server's own stored
// analysis (never from the request), clipped to a fixed budget so one
// question can't send a whole repository to the provider.

export const EXPLAIN_SYSTEM_PROMPT = [
  'You answer a question about one code repository using only the evidence provided:',
  'file paths, how many files depend on each and which files each depends on, and excerpts of their functions.',
  'Be concise and concrete. Refer to files by their exact path and list every file you relied on in "cited".',
  'If the evidence does not answer the question, say what is missing instead of guessing.',
].join(' ');

export const explainSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'cited'],
  properties: {
    answer: { type: 'string' },
    cited: { type: 'array', items: { type: 'string' } },
  },
};

const MAX_FILES = 8;
const MAX_FUNCTION_CHARS = 1500;
const MAX_TOTAL_CHARS = 16_000;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

export function buildExplainContext(data: any, question: string, paths: unknown): { user: string; allowed: Set<string> } {
  const known = new Set<string>((data?.files || []).map((f: any) => f.path));
  const chosen = (Array.isArray(paths) ? paths : []).filter((p): p is string => typeof p === 'string' && known.has(p));
  const files = [...new Set(chosen)].slice(0, MAX_FILES);
  const layer = new Map<string, string>((data?.files || []).map((f: any) => [f.path, f.layer || 'other']));
  const dependents = new Map<string, Set<string>>();
  const dependencies = new Map<string, Set<string>>();
  (data?.connections || []).forEach((c: any) => {
    const definer = endpoint(c.source);
    const caller = endpoint(c.target);
    if (definer === caller) return;
    if (!dependents.has(definer)) dependents.set(definer, new Set());
    dependents.get(definer)!.add(caller);
    if (!dependencies.has(caller)) dependencies.set(caller, new Set());
    dependencies.get(caller)!.add(definer);
  });

  let budget = MAX_TOTAL_CHARS;
  const evidence = files.map(path => {
    const functions: Array<{ name: string; line?: number; code: string }> = [];
    Object.entries(data?.fnStats || {}).forEach(([name, stats]: [string, any]) => {
      if (stats?.file !== path || typeof stats.code !== 'string' || budget <= 0) return;
      const code = stats.code.slice(0, Math.min(MAX_FUNCTION_CHARS, budget));
      budget -= code.length;
      functions.push({ name, line: stats.line, code });
    });
    return {
      path,
      layer: layer.get(path),
      dependents: dependents.get(path)?.size ?? 0,
      dependsOn: [...(dependencies.get(path) ?? [])].slice(0, 15),
      functions,
    };
  });
  return { user: JSON.stringify({ question: question.slice(0, 500), files: evidence }), allowed: new Set(files) };
}
