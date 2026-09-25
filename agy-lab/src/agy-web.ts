/** Opt-in client for the separate agy-web account pool. */
const DEFAULT_URL = 'https://agy.up.railway.app';

export function configured(): boolean {
  return Boolean(process.env.AGY_WEB_TOKEN?.trim());
}

type PromptReply = {
  ok?: boolean;
  answer?: string;
  error?: string;
  auth_failure?: boolean;
  account?: string;
  ms?: number;
};

async function request(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<PromptReply> {
  const token = process.env.AGY_WEB_TOKEN?.trim();
  if (!token) throw new Error('AGY_WEB_TOKEN is not configured');
  const base = new URL(process.env.AGY_WEB_URL?.trim() || DEFAULT_URL);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
    throw new Error('AGY_WEB_URL must use HTTPS');
  }
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const reply = await response.json() as PromptReply;
  if (!response.ok) throw new Error(`agy-web ${path} returned HTTP ${response.status}: ${reply.error || 'request failed'}`);
  return reply;
}

export async function ask(prompt: string, timeoutMs: number): Promise<{ answer: string; ms: number; account?: string }> {
  const deadline = Date.now() + timeoutMs;
  const preflight = await request('/api/ensure-active', {}, Math.min(30_000, timeoutMs));
  if (preflight.ok === false) throw new Error(`agy-web has no active account: ${preflight.error || 'preflight failed'}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = Math.max(1, deadline - Date.now());
    const result = await request('/api/prompt', {
      prompt,
      ...(process.env.AGY_WEB_MODEL?.trim() ? { model: process.env.AGY_WEB_MODEL.trim() } : {}),
      tools: true,
      sandbox: true,
      timeout: Math.max(1, Math.floor((remaining - 5_000) / 1000)),
    }, remaining);
    if (result.ok && result.answer?.trim()) {
      return { answer: result.answer, ms: result.ms ?? timeoutMs - remaining, account: result.account };
    }
    const detail = result.error || 'agy-web returned an empty answer';
    if (attempt || (!result.auth_failure && !/quota|rate.limit|429/i.test(detail))) {
      throw new Error(`agy-web prompt failed: ${detail}`);
    }
    const rotated = await request('/api/rotate', { reason: result.auth_failure ? 'auth' : 'quota', cooldown_minutes: 60, force_switch: true }, Math.min(30_000, Math.max(1, deadline - Date.now())));
    if (rotated.ok === false) throw new Error(`agy-web could not rotate accounts: ${rotated.error || 'rotation failed'}`);
  }
  throw new Error('agy-web prompt failed');
}
