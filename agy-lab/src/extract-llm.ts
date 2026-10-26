// The contact extract step's own model: one OpenAI-compatible chat call, no
// tools. Set CONTACT_LLM_URL, CONTACT_LLM_KEY and CONTACT_LLM_MODEL and contact
// research reads its pages with that model instead of Pi (MiniMax), which also
// serves report rounds and translation and whose Token Plan ran out on
// 2026-10-24. Unset, contact research stays on Pi.
//
// Errors carry Pi's codes (rate_limit, timeout, length, empty, failed), so the
// extract step's retry and the lane's cooldown treat both models alike.

type FetchImpl = typeof fetch;

export type LlmConfig = { url: string; key: string; model: string };

export function config(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const url = env.CONTACT_LLM_URL?.trim().replace(/\/+$/, '') ?? '';
  const key = env.CONTACT_LLM_KEY?.trim() ?? '';
  const model = env.CONTACT_LLM_MODEL?.trim() ?? '';
  return url && key && model ? { url, key, model } : null;
}

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export async function ask(
  prompt: string,
  opts: { timeoutMs?: number; maxTokens?: number } = {},
  cfg: LlmConfig | null = config(),
  fetchImpl: FetchImpl = fetch,
): Promise<{ answer: string; ms: number; model: string }> {
  if (!cfg) throw fail('not_configured', 'CONTACT_LLM_URL, CONTACT_LLM_KEY and CONTACT_LLM_MODEL are not all set');
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(cfg.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + cfg.key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        // Page text cut mid-emoji leaves half a surrogate pair, and Vectide
        // rejects the whole request with HTTP 400 VectorTide_invalid_request.
        messages: [{ role: 'user', content: prompt.toWellFormed() }],
        temperature: 0,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (cause) {
    const name = (cause as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw fail('timeout', `${cfg.model} gave no answer within ${Math.round((opts.timeoutMs ?? 120_000) / 1000)}s`);
    throw fail('failed', `${cfg.model} unreachable: ${(cause as Error).message}`);
  }
  const raw = await res.text();
  if (res.status === 429) throw fail('rate_limit', `${cfg.model} rate limit: 429 ${raw.slice(0, 300)}`);
  if (!res.ok) throw fail('failed', `${cfg.model} answered HTTP ${res.status}: ${raw.slice(0, 300)}`);
  let body: { choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
  try {
    body = JSON.parse(raw);
  } catch {
    throw fail('failed', `${cfg.model} returned no JSON: ${raw.slice(0, 200)}`);
  }
  const choice = body.choices?.[0];
  const answer = choice?.message?.content?.trim() ?? '';
  if (!answer && choice?.finish_reason === 'length') throw fail('length', `${cfg.model} used its ${opts.maxTokens ?? 'default'} output tokens thinking and gave no answer.`);
  if (!answer) throw fail('empty', `${cfg.model} returned an empty answer`);
  return { answer, ms: Date.now() - started, model: cfg.model };
}
