// The contact extract step's own model: one OpenAI-compatible chat call, no
// tools. Set CONTACT_LLM_URL, CONTACT_LLM_KEY and CONTACT_LLM_MODEL and contact
// research reads its pages with that model instead of Pi (MiniMax), which also
// serves report rounds and translation and whose Token Plan ran out on
// 2026-10-24. Unset, contact research stays on Pi.
//
// CONTACT_LLM_HIVE_KEYS (comma-separated) adds Hive accounts serving the same
// deepseek model. Calls take turns across Vectide and every Hive key, and a
// provider that answers 429 rests a minute while the call moves to the next.
//
// Errors carry Pi's codes (rate_limit, timeout, length, empty, failed), so the
// extract step's retry and the lane's cooldown treat both models alike.

type FetchImpl = typeof fetch;

export type LlmConfig = { url: string; key: string; model: string };

const HIVE_URL = 'https://api.thehive.ai/api/v3';
const HIVE_MODEL = 'deepseek-ai/deepseek-v4.1-flash-1017';
const REST_MS = 60_000;

/** Every provider the extract step may call: CONTACT_LLM_* first, then each Hive key. */
export function pool(env: NodeJS.ProcessEnv = process.env): LlmConfig[] {
  const out: LlmConfig[] = [];
  const url = env.CONTACT_LLM_URL?.trim().replace(/\/+$/, '') ?? '';
  const key = env.CONTACT_LLM_KEY?.trim() ?? '';
  const model = env.CONTACT_LLM_MODEL?.trim() ?? '';
  if (url && key && model) out.push({ url, key, model });
  const hiveUrl = env.CONTACT_LLM_HIVE_URL?.trim().replace(/\/+$/, '') || HIVE_URL;
  const hiveModel = env.CONTACT_LLM_HIVE_MODEL?.trim() || HIVE_MODEL;
  for (const hiveKey of (env.CONTACT_LLM_HIVE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean)) {
    out.push({ url: hiveUrl, key: hiveKey, model: hiveModel });
  }
  return out;
}

/** The first configured provider, or null when contact research stays on Pi. */
export function config(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  return pool(env)[0] ?? null;
}

let turn = 0;
const restingUntil = new Map<string, number>();

/** Test hook: forget turns and rests. */
export function resetForTests(): void {
  turn = 0;
  restingUntil.clear();
}

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export async function ask(
  prompt: string,
  opts: { timeoutMs?: number; maxTokens?: number } = {},
  cfg: LlmConfig | LlmConfig[] | null = pool(),
  fetchImpl: FetchImpl = fetch,
): Promise<{ answer: string; ms: number; model: string }> {
  const all = Array.isArray(cfg) ? cfg : cfg ? [cfg] : [];
  if (!all.length) throw fail('not_configured', 'Neither CONTACT_LLM_URL, CONTACT_LLM_KEY and CONTACT_LLM_MODEL nor CONTACT_LLM_HIVE_KEYS are set');
  const start = turn++;
  const now = Date.now();
  const order = all.map((_, i) => all[(start + i) % all.length]!);
  const awake = order.filter((c) => (restingUntil.get(c.key) ?? 0) <= now);
  let last: Error | null = null;
  // Every provider resting: try them anyway rather than fail the job.
  for (const c of awake.length ? awake : order) {
    try {
      return await askOne(prompt, opts, c, fetchImpl);
    } catch (err) {
      last = err as Error;
      if ((err as { code?: string }).code !== 'rate_limit') throw err;
      restingUntil.set(c.key, Date.now() + REST_MS);
    }
  }
  throw last!;
}

async function askOne(
  prompt: string,
  opts: { timeoutMs?: number; maxTokens?: number },
  cfg: LlmConfig,
  fetchImpl: FetchImpl,
): Promise<{ answer: string; ms: number; model: string }> {
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
