// Queues contact research for untouched leads while a matching worker is live.
import * as jobs from './jobs.ts';
import * as db from './reportdb.ts';

const INTERVAL_MS = 60_000;
const BATCH = 3;

/** Job type the default contact-research model needs a live worker to claim. */
export function contactResearchJobType(): string {
  const model = (process.env.CONTACT_RESEARCH_MODEL?.trim() || 'agy').toLowerCase();
  const name = model.split(/[:@/]/)[0] ?? model;
  if (name.startsWith('chatgpt') || name.startsWith('openai') || name.startsWith('gpt') || /^o[134]/.test(name)) {
    return 'chatgpt.ask';
  }
  return 'agy.ask';
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
  if (ticking || !workerLive()) return 0;
  ticking = true;
  try {
    const rows = deps.backlog
      ? await deps.backlog(BATCH)
      : await db.contactResearchBacklog(BATCH);
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
