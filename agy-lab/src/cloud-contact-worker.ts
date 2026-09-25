import * as agyWeb from './agy-web.ts';
import { extractJson } from './intel.ts';

const TYPE = 'research.contact.cloud';
const NAME = 'cloud-agy-contact-1';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function start(port: number): void {
  const selected = process.env.CONTACT_RESEARCH_MODEL?.trim().toLowerCase() === 'agy-web';
  console.log(`[cloud-contact] startup selected=${selected} token=${agyWeb.configured()}`);
  if (!selected || !agyWeb.configured()) return;
  const token = process.env.LAB_TOKEN?.trim();
  if (!token) { console.error('[cloud-contact] LAB_TOKEN is missing'); return; }
  const base = `http://127.0.0.1:${port}`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  };
  void (async () => {
    for (;;) {
      try {
        await post('/api/jobs/heartbeat', { worker: NAME, types: [TYPE], contactProtocol: 'durable-v1' });
        const url = new URL('/api/jobs/next', base);
        url.search = new URLSearchParams({ worker: NAME, types: TYPE, wait: '20', contactProtocol: 'durable-v1' }).toString();
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(35_000) });
        if (response.status === 204) continue;
        if (!response.ok) throw new Error(`claim returned HTTP ${response.status}`);
        const { job } = await response.json() as { job?: { id: string; payload?: { prompt?: string; reportId?: string } } };
        if (!job) continue;
        const heartbeat = setInterval(() => {
          void post('/api/jobs/heartbeat', { worker: NAME, types: [TYPE], contactProtocol: 'durable-v1' }).catch((error) =>
            console.warn('[cloud-contact] heartbeat failed: ' + String(error)));
        }, 30_000);
        try {
          const prompt = job.payload?.prompt;
          if (!prompt) throw new Error('contact job has no prompt');
          const answer = await agyWeb.ask(prompt, 20 * 60_000);
          const parsed = extractJson(answer.answer);
          if (!parsed.value) throw new Error(`cloud AGY returned invalid JSON: ${parsed.error || 'unknown parse error'}`);
          await post(`/api/jobs/${job.id}/result`, { worker: NAME, reportId: job.payload?.reportId, ok: true, result: parsed.value });
          console.log(`[cloud-contact] completed job ${job.id}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await post(`/api/jobs/${job.id}/result`, { worker: NAME, reportId: job.payload?.reportId, ok: false, error: message });
          console.warn(`[cloud-contact] job ${job.id} failed: ${message}`);
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        console.warn('[cloud-contact] worker loop: ' + String(error));
        await sleep(5_000);
      }
    }
  })();
}
