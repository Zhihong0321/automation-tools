# Progress — 2026-08-20

Goal: expose the Mac mini as a second location for the `chatgpt` engine, so
`ee-auto` can route model calls to either the container or this machine.

The previous session left the ChatGPT wrapper answering correctly but slowly.
This session replaced its browser layer with **ego lite**, fixed the slowness,
and wired the server side that a second location needs.

---

## DONE — proven, not assumed

### The mini answers jobs from the cloud

A real round trip, against the live `ee-auto.up.railway.app`:

```
POST /api/jobs {"type":"chatgpt.ask","payload":{"id":"pro","prompt":"..."}}
  -> claimed by worker "macmini-ego"
  -> ego lite task space 12 (Zhihong PRO account)
  -> "Kuala Lumpur"
```

Job `0a234a0a1d82`, **7.68s end to end**, ~360ms of that cloud overhead.

### `worker/chatgpt-ego.mjs` — new engine on ego lite

Replaces `worker/chatgpt.mjs`. ego lite owns launching, profiles, the CDP
socket and login state, so `connect()`, `launch()`, `portFor()`, the profile
dir and attach-first are all gone.

| | old (raw CDP) | new (ego lite) |
|---|---|---|
| answer phase | 17971ms | **2031ms** |
| wall clock | ~80s | **5.6s** |

Long answers verified un-truncated (8 planets with diameters, line breaks intact).
Two accounts run **concurrently**: both finished in 8.9s, not 16.1s serial.

### Server side — all four handoff items

- `jobs.ts` — `wait(id, timeoutMs)`. Resolves the moment `finish()` lands
  (302ms in test, not on its own timeout). On timeout it resolves with the job
  *still running* rather than erroring: the work is not cancelled and the caller
  keeps an id to read later.
- `jobs.ts` — worker `types` recorded on `touch()`, plus `liveWorkers()` /
  `liveTypes()`, so the gateway can tell a location is absent instead of
  enqueueing a job that sits pending until it times out.
- `queue.ts` — a **`mini` lane**, not extra width on `browser`. `browser` is
  width 1 because the container has one Chrome; the mini is a different machine
  with a different account, so sharing would serialize two things that have no
  reason to wait for each other. Width 2 (`MINI_MAX_CONCURRENT`), EMA seeded 8s.
- `gateway.ts` — `Route` carries a location, `@mini` / `@container` parsing,
  dispatch to the job queue, and `/v1/models` listing the mini's engines with
  per-call liveness.

Verified by driving the real routes:

```
chatgpt            -> chatgpt @mini  model=chatgpt:mini-main@mini
chatgpt:pro@mini   -> chatgpt @mini  model=chatgpt:pro@mini
chatgpt@container  -> 503   refuses; does NOT silently fall back to mini
agy@mini           -> 503   no worker claiming agy.ask
chatgpt@bogus      -> 404   Unknown location
```

`POST /api/ask {model:"chatgpt@mini"}` returns
`200 {"model":"chatgpt:mini-main@mini","answer":"Kuala Lumpur"}`.
Failure mapping: `signed_out`→503, `answer_timeout`→504, empty answer→502.

### Routing policy — decided

Was left undecided by the handoff. Now: **explicit `@mini` / `@container` always
wins; a bare model name is pooled and prefers the mini when a mini worker is
live**, falling back to the container the moment it stops polling. The mini is
preferred because it is the capacity that was *added* — sending pooled traffic
to the container first would leave it idle. Override with `ROUTING_PREFER`.

---

## Bugs found and fixed

1. **`chatgpt.mjs:144` — uncleared reject timer.** The CDP attach's
   `setTimeout(rej, 60_000)` was never cleared, and being reffed it held Node's
   event loop open for its full 60s *after the work finished*. `probe` reported
   `ms: 1443` then sat for another 58.6s. Every CLI call paid it. The handoff's
   "~20s" was the internal phase sum; real wall clock was ~80s.
2. **`readAnswer` scope.** The old code cloned the whole
   `[data-message-author-role="assistant"]` subtree and stripped only
   `button, [role=button], svg`. Footer chrome that renders seconds after the
   prose stayed in the string, kept changing, and kept resetting the
   "text stopped changing" half of the completion rule. Reading `.markdown`
   (prose only) sidesteps it. Best explanation for the 18s; never trace-confirmed.
3. **`cliLog` writes to stderr**, not stdout. The result parser scanned only
   stdout and reported a successful call as an engine error.
4. **A native `<dialog>` silently swallowed all input.** ChatGPT's
   "Temporary Chat" explainer, shown once per profile, traps focus and matches
   *neither* `[role="dialog"]` nor `[aria-modal]`, so an ordinary overlay check
   misses it. While open, `Input.insertText`, `typeText` and `fillInput` all
   land nothing and raise nothing. It also renders *after* the composer, so a
   single dismissal at load time misses it — it needs a poll.

## ego lite facts worth keeping

- **A task space inherits whatever browser profile is DEFAULT at the moment it
  is created, and the profile cannot be set afterwards.** `profileId` /
  `profileName` are accepted and **silently ignored** by both
  `useOrCreateTaskSpace` and `newTaskSpace`. Changing the default is a GUI action.
- **A numeric-string space id that no longer exists does not fail** — it falls
  back to name matching and *creates* a space on the default profile, i.e.
  answers as the wrong account without erroring. `spaces.json` therefore records
  the expected profile and the wrapper asserts it before typing (`wrong_profile`).
- Auth lives in the profile's Chromium cookie DB
  (`~/Library/Application Support/Citro Labs/ego lite/Profile N/Cookies`).
  The wrapper stores no password, token or TOTP.
- `ego-browser` is a compiled binary shipped inside the app; `listProfiles()`
  exists but is not in `SKILL.md`'s helper list.

## Accounts

`~/.gmap-worker/spaces.json` maps session id -> `{space, profile}`.
Currently only `pro -> {12, "Zhihong PRO"}`.

Profiles on disk, by ChatGPT session-token presence:

| Dir | Name | Logged in |
|---|---|---|
| Default | Zhi Hong | no |
| Profile 1 | Zhihong | yes, untested |
| Profile 2 | ZhiHong 三专 | yes, untested |
| Profile 3 | Zhihong PRO | yes, **live as space 12** |
| Profile 4 | MasterKey Eternalgy | no — excluded by instruction |
| Profile 5 | gan gemini | yes, space was destroyed |

---

## NOT DONE

- **Nothing is deployed.** Railway still runs the old container, so
  `/v1/chat/completions` cannot reach the mini. `/api/jobs` is the only working
  path today. The gateway changes have only been exercised locally.
- **The mini worker is not durable.** `macmini-ego` was started by hand in a
  terminal and dies on reboot or logout. It needs a **LaunchAgent, not a daemon** —
  a daemon has no GUI session and ego lite will not start under one.
- **Only one account is live.** Rebuilding gan gemini needs Profile 5 made
  default in the GUI first. Profiles 1 and 2 are untested for the same reason.
- **No DB.** `jobs.ts` is in-memory `Map`s with a 500-job ring that evicts;
  `schema.sql` has only the gmap tables. Nothing persists a chatgpt job.
  Schema not yet designed — deliberately deferred.
- **Docs stale.** `API.md` and `CHATGPT-PROGRESS.md` still describe a
  single-location gateway.
- `worker/README.md` still documents `WORKER_TYPES` as the only lane control and
  does not mention lanes, task spaces, `spaces.json` or the hand-login.
- **`agy-lab/node_modules` is not gitignored.** Worth fixing before anyone runs
  `npm install` there.
- The answer-wait trace (`CGPT_TRACE=1`) was never captured on the *old* wrapper,
  so bug 2 above remains the best explanation rather than a measured diagnosis.
