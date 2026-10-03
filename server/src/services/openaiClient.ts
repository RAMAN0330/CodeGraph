import { env } from '../config/env';

// Structured-output call to the OpenAI Responses API, shared by the AI
// features (architecture explanation, codebase Q&A). Callers validate and
// clamp whatever comes back; this only guarantees parsed JSON or an error
// message that is safe to show.

export class AiUnavailableError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(env.openaiApiKey);
}

export async function structuredResponse<T>(input: { system: string; user: string; schemaName: string; schema: object; timeoutMs?: number }): Promise<T> {
  if (!env.openaiApiKey) throw new AiUnavailableError('AI is not configured on this server.');
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: input.system }] },
          { role: 'user', content: [{ type: 'input_text', text: input.user }] },
        ],
        text: { format: { type: 'json_schema', name: input.schemaName, strict: true, schema: input.schema } },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
    });
  } catch (error: any) {
    throw new Error(error?.name === 'TimeoutError' ? 'The AI request timed out.' : 'The AI provider could not be reached.');
  }
  const result: any = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message || 'The AI provider rejected the request.');
  const outputText = result?.output_text || result?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text;
  if (!outputText) throw new Error('The AI provider returned no structured output.');
  return JSON.parse(outputText) as T;
}
