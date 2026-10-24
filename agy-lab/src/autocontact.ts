// Queues contact research for untouched leads while a matching worker is live.
import * as jobs from './jobs.ts';
import * as db from './reportdb.ts';
import * as tavily from './tavily.ts';
import * as exa from './exa.ts';

const INTERVAL_MS = 60_000;
const BATCH = 3;

function modelName(): string {
  const model = (process.env.CONTACT_RESEARCH_MODEL?.trim() || 'research.contact').toLowerCase();
  return model.split(/[:@/]/)[0] ?? model;
}

function chatgptModel(name: string): boolean {
  return name.startsWith('chatgpt') || name.startsWith('openai') || name.startsWith('gpt') || /^o[134]/.test(name);
}

/**
 * Job type a live contact worker must claim.
 *
 * Pi is the in-hub worker: Tavily finds the pages, Pi (MiniMax) reads them for
 * people and contacts. A MiniMax or Tavily key owns the contact queue. Gemini and
 * agy names from before the Google ban route here too, so an old
 * CONTACT_RESEARCH_MODEL value cannot strand the queue on a worker that is gone.
 */
export function contactResearchJobType(): string {
  const name = modelName();
  if (chatgptModel(name)) return 'chatgpt.ask';
  if (
    process.env.MINIMAX_API_KEY?.trim() ||
    process.env.TAVILY_API_KEY?.trim() ||
    process.env.TAVILY_API_KEYS?.trim() ||
    /^(pi|minimax|tavily|gemini|gamini|agy)/.test(name)
  ) {
    return 'research.contact.pi';
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
  tavilyAvailable?: () => boolean;
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
let pausedForQuota = false;

/** The pi worker searches with Tavily or Exa, so it has no work to give while every key of both rests. */
function outOfCredits(): boolean {
  const paused = contactResearchJobType() === 'research.contact.pi' && !(deps.tavilyAvailable ?? (() => tavily.available() || exa.available()))();
  if (paused !== pausedForQuota) {
    console.log(paused ? '[auto-queue] paused: every Tavily and Exa key is resting' : '[auto-queue] resumed: a search key has credits again');
    pausedForQuota = paused;
  }
  return paused;
}

/**
 * Held by hand while the lead blacklist (docs/lead-blacklist.md) is reviewed:
 * without it the backlog includes banks, chains and competitors. Railway env, so
 * it survives a redeploy and lifts without one.
 */
export function pausedByHand(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.AUTO_CONTACT_PAUSED?.trim() ?? '');
}

export async function tick(): Promise<number> {
  if (ticking || pausedByHand() || !workerLive() || outOfCredits()) return 0;
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
  pausedForQuota: boolean;
  paused: boolean;
  totals: { queued: number; running: number; completed: number; failed: number };
}> {
  return {
    workerAvailable: workerLive(),
    pausedForQuota: outOfCredits(),
    paused: pausedByHand(),
    totals: await db.autoContactQueueTotals(),
  };
}
