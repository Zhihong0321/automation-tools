// GET/POST /api/contact-keys: the search keys contact research rotates through,
// Tavily and Exa, each shown in full with its quota state. Behind LAB_TOKEN.
import * as db from './reportdb.ts';
import * as tavily from './tavily.ts';
import * as exa from './exa.ts';

type Ctx = { json: (res: unknown, status: number, body: unknown) => void; readJson: (req: unknown) => Promise<Record<string, unknown>> };

export async function handleKeys(req: { method?: string }, res: unknown, url: URL, ctx: Ctx): Promise<boolean> {
  // Which search provider digs up more: per provider over the last ?days= (default 7).
  if (url.pathname === '/api/contact-stats' && (req.method ?? 'GET') === 'GET') {
    const days = Number(url.searchParams.get('days')) || 7;
    ctx.json(res, 200, { days, ...(await db.contactProviderStats(days)) });
    return true;
  }
  if (url.pathname !== '/api/contact-keys' && url.pathname !== '/api/gemini-contact-keys') return false;
  const method = req.method ?? 'GET';
  if (method === 'GET') {
    const [tavilyKeys, exaKeys] = await Promise.all([tavily.refresh(), exa.refresh()]);
    ctx.json(res, 200, {
      tavilyKeys,
      tavily: tavily.pool.stats(),
      exaKeys,
      exa: exa.pool.stats(),
      exaProxy: exa.proxy() ? { url: exa.proxy()!.url, tokenSet: true } : null,
      step1Slots: tavily.pool.slots(),
      exaSlots: exa.pool.slots(),
    });
    return true;
  }
  if (method === 'POST') {
    const body = await ctx.readJson(req);
    if (Array.isArray(body.tavily)) await db.replaceGeminiContactKeys('tavily', body.tavily.map(String));
    if (Array.isArray(body.exa)) await db.replaceGeminiContactKeys('exa', body.exa.map(String));
    // The US proxy that "us:" Exa keys go through: {url, token}, or null to remove it.
    if (body.exaProxy !== undefined) {
      const proxy = body.exaProxy === null ? null : exa.parseProxy(body.exaProxy);
      if (body.exaProxy !== null && !proxy) {
        ctx.json(res, 400, { error: 'exaProxy needs {url: "https://...", token: "..."}' });
        return true;
      }
      await db.replaceGeminiContactKeys('exa_proxy', proxy ? [JSON.stringify(proxy)] : []);
    }
    await Promise.all([tavily.refresh(), exa.refresh()]);
    ctx.json(res, 200, { ok: true, step1Slots: tavily.pool.slots(), exaSlots: exa.pool.slots() });
    return true;
  }
  ctx.json(res, 405, { error: 'method not allowed' });
  return true;
}
