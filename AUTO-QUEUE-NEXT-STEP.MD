# Auto-Queue Next Step

**Plan only. No code is written until this plan is approved.**
Scope rule: implement only the original instruction below. Anything not required by it is listed under **Remove** or **Non-goals**.

## Original instruction (verbatim)

> i need a auto contact research queue function.
>
> When there is "available match worker" that can run contact research available, auto queue the job.
>
> also give me a log, how many job auto queue runned.

Three requirements, nothing more:

1. **R1** — a function that auto-queues contact research jobs.
2. **R2** — trigger: only when an available worker that can run contact research is live.
3. **R3** — a log showing how many auto-queued jobs ran.

## Current state

| File | State |
|---|---|
| `agy-lab/src/reportdb.ts` | 5 functions appended after `findContactReport` (additive only). One pre-existing uncommitted modification existed **before** this work began — it must not be reverted. |
| `agy-lab/src/intel.ts` | **BROKEN, two ways:** (1) `import * as autoContact from './autocontact.ts'` — that file does not exist; (2) `launchContactResearch` was declared with `export` **inside** `handleApi` — syntax error. Also: `POST /api/contact-research` was refactored to call `launchContactResearch`; `GET` + `POST /api/contact-research/auto-queue` routes were added calling `autoContact.status()` / `autoContact.setEnabled()`. |
| `agy-lab/src/autocontact.ts` | Does not exist. |
| `agy-lab/src/server.ts` | Untouched. |
| Tests / commits | None. Nothing committed. |

## Remove (over-engineered — never requested)

1. `contactResearchBacklogTotal()` in `reportdb.ts` — status-page material. The batch limit already bounds each tick.
2. `contactResearchInflightCount()` in `reportdb.ts` — an inflight cap/politeness mechanism was invented, not asked for. The queue is self-limiting: a company is only in the backlog until its first contact report exists, so the backlog drains and the tick returns 0.
3. `autoContactQueueLog()` in `reportdb.ts` — per-event DB reader. Totals already answer "how many ran".
4. `POST /api/contact-research/auto-queue` route + `setEnabled()` + all runtime toggle state — no on/off switch was requested. (`GET` stays — it is the deliverable for R3.)
5. Runtime bookkeeping in `autocontact.ts`: `lastResult`, `lastWorkerLive`, `lastTickAt`, state-change logging, queued-since-boot counters. A single interval tick does not need any of it. Only a `ticking` boolean (skip if the previous tick has not finished) stays.
6. New env vars (`AUTO_CONTACT_MAX_INFLIGHT`, `AUTO_CONTACT_QUEUE_BATCH`, `AUTO_CONTACT_QUEUE_INTERVAL_SEC`, …) — none. Hardcode two constants: `INTERVAL_MS = 60_000`, `BATCH = 3`.
7. Dependency-injection framework in `autocontact` — tests pass plain fakes for at most `{ liveTypes, backlog, launch }`.
8. Fat status payload (`backlog`, full `liveTypes` dump, `nextTickInMs`, per-status breakdown beyond the four totals).

## Keep (exactly what R1–R3 need)

1. `contactResearchBacklog(limit)` in `reportdb.ts` — the work source (R1). Already written; already excludes hidden / merged / `do_not_call` / any company that ever had a contact report.
2. `autoContactQueueTotals()` in `reportdb.ts` — durable counts `{ queued, running, completed, failed }` from `request->>'autoQueued' = 'true'` (R3).
3. `launchContactResearch()` in `intel.ts` — one launch path shared with the portal button, so auto-queued and clicked runs share the same dedupe, title and trail. The `autoQueued: 'true'` request flag is what R3's totals read (R1). **Must be moved to module scope.**
4. Trigger check (R2): `jobs.liveTypes().includes(contactResearchJobType())` — the same test the gateway uses (`miniLive`). `contactResearchJobType()` is ~5 lines: `CONTACT_RESEARCH_MODEL` (default `agy`) → `chatgpt.ask` if the model starts with `chatgpt`/`openai`/`gpt`/`o1|o3|o4`, else `agy.ask`.
5. `autocontact.ts` — minimal: `init({ launch })`, `tick()` (if `ticking` or worker not live → return; else fetch up to `BATCH` backlog rows, `launch(..., { autoQueued: true })` each, `console.log('[auto-queue] queued N contact research job(s)')`), `start()` = `setInterval(tick, 60_000)` with `.unref()`, `status()` = `{ workerAvailable, totals }`.
6. `GET /api/contact-research/auto-queue` → `autoContact.status()` (R3's readable log). Read-only.
7. One small test file (`autocontact.test.ts`) in the repo's existing `node --test` style.

## Assumption to confirm (only one)

The backlog is the **master lead list** — active, non-hidden, non-DNC companies with no contact-research report yet. If the intended source is something else (e.g. only the companies of one specific business-search report), say so before step 3; only step 3 changes.

Auto-queue uses the **legacy** provider path only (the default contact research, `agy` engine). Parallel is not involved.

## Next steps (in order)

0. **Wait for approval of this plan.** No code before that.
1. `agy-lab/src/intel.ts` — fix structure:
   a. Move `launchContactResearch` out of `handleApi` to module scope (immediately before `export async function handleApi`, ~L2786). Keep its body as written.
   b. Delete the `POST /api/contact-research/auto-queue` route block. Keep the `GET` one.
   c. Keep the `autoContact` import (now valid once step 3 lands) and the refactored `POST /api/contact-research` call site — verify 200/202 parity is unchanged (200 when a run was already in flight, 202 when newly queued).
2. `agy-lab/src/reportdb.ts` — delete exactly three functions: `contactResearchBacklogTotal`, `contactResearchInflightCount`, `autoContactQueueLog`. Targeted edits only; do not touch the pre-existing local changes in this file.
3. Create `agy-lab/src/autocontact.ts` — as specified under **Keep** item 5. No toggle, no status bookkeeping, no env vars.
4. `agy-lab/src/server.ts` — inside the `server.listen` callback, beside the existing `reapAbandonedRuns` wiring:
   `autoContact.init({ launch: intel.launchContactResearch }); autoContact.start();`
5. `agy-lab/src/autocontact.test.ts` — three cases, ~60 lines max:
   a. no live worker claiming the job type → 0 queued;
   b. worker live → queues `min(BATCH, backlog)` and logs the count;
   c. `launch` receives `autoQueued: true`.
6. Verify: `npm test` in `agy-lab` (the existing suite imports `intel.ts`, so it catches the syntax error from step 1). Then start the server and `GET /api/contact-research/auto-queue` once — expect `{ workerAvailable, totals }`.

## Definition of done

- **R1:** with a live matching worker, the service queues contact research for up to 3 untouched leads per minute with no human clicking; the portal button path behaves exactly as before.
- **R2:** with no matching worker live, 0 jobs are queued; `workerAvailable` is `false` in the status.
- **R3:** each active tick writes one `[auto-queue] queued N …` console line, and `GET /api/contact-research/auto-queue` returns durable totals `{ queued, running, completed, failed }`.

## Non-goals

No portal/UI changes. No toggle, no new env vars, no inflight cap, no per-event log reader. No schema/migration changes, no new tables. No parallel-provider support. No commits unless explicitly requested.
