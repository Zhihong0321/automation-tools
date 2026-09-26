// Queues contact research for untouched leads while a matching worker is live.
import * as jobs from './jobs.ts';
import * as db from './reportdb.ts';

const INTERVAL_MS = 60_000;
const BATCH = 3;

const GEMINI_CONTACT_MODELS = new Set(['gemini-3.7-flash', 'gemini-3.7', 'gemini37']);

function modelName(): string {
  const model = (process.env.CONTACT_RESEARCH_MODEL?.trim() || 'research.contact').toLowerCase();
  return model.split(/[:@/]/)[0] ?? model;
}

function chatgptModel(name: string): boolean {
  return name.startsWith('chatgpt') || name.startsWith('openai') || name.startsWith('gpt') || /^o[134]/.test(name);
}

/** Gemini model ids, including the gamini typo that the chat gateway used to reject. */
function geminiContactModel(name: string): boolean {
  return GEMINI_CONTACT_MODELS.has(name) || name.startsWith('gemini') || name.startsWith('gamini');
}

/**
 * Job type a live contact worker must claim.
 *
 * Gemini 3.7 is the in-hub worker. It runs two searches itself — find public
 * pages, then read those pages for people and contacts. A configured key owns
 * the contact queue, so a leftover CONTACT_RESEARCH_MODEL=agy-web cannot fall
 * through to the chat gateway.
 */
export function contactResearchJobType(): string {
  const name = modelName();
  if (chatgptModel(name)) return 'chatgpt.ask';
  if (
    process.env.TAVILY_API_KEY?.trim() ||
    process.env.TAVILY_API_KEYS?.trim() ||
    process.env.GEMINI37_API_KEY?.trim() ||
    geminiContactModel(name) ||
    name.includes('tavily')
  ) {
    return 'research.contact.gemini';
  }
  return 'research.contact';
}

type Launch = (
  company: Record<string, unknown>,
  opts: { autoQueued?: boolean },
) => Promise<unknown>;

type Deps = {
  launch: Launch;
  liveTypes?: () => string[];
  backlog?: (limit: number) => Promise<Record<string, unknown>[]>;
};

let deps: Deps = {
  launch: async () => { throw new Error('auto-queue not initialised'); },
};
let ticking = false;

export function init(next: Deps): void {
  deps = next;
}

function workerLive(): boolean {
  const types = deps.liveTypes ? deps.liveTypes() : jobs.liveTypes();
  return types.includes(contactResearchJobType());
}

/** Queue up to BATCH untouched leads when a matching worker is live. */
export async function tick(): Promise<number> {
  if (process.env.CONTACT_RESEARCH_MODEL?.trim().toLowerCase() === 'agy-web'
    && process.env.AGY_WEB_AUTO_QUEUE?.trim().toLowerCase() !== 'true') return 0;
  if (ticking || !workerLive()) return 0;
  ticking = true;
  try {
    // Saved reports are the durable queue. Do not mint new reports while older
    // ones are waiting for the research lanes.
    const free = deps.backlog ? BATCH : Math.max(0, BATCH - await db.pendingContactReportCount());
    if (!free) return 0;
    const rows = deps.backlog
      ? await deps.backlog(free)
      : await db.contactResearchBacklog(free);
    for (const company of rows) {
      await deps.launch(company, { autoQueued: true });
    }
    console.log(`[auto-queue] queued ${rows.length} contact research job(s)`);
    return rows.length;
  } finally {
    ticking = false;
  }
}

export function start(): void {
  setInterval(() => { void tick(); }, INTERVAL_MS).unref();
}

export async function status(): Promise<{
  workerAvailable: boolean;
  totals: { queued: number; running: number; completed: number; failed: number };
}> {
  return {
    workerAvailable: workerLive(),
    totals: await db.autoContactQueueTotals(),
  };
}
