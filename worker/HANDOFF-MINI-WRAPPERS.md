# Handoff — running the ChatGPT and agy wrappers on the Mac mini

Written 2026-08-20 by the previous session, which was stopped for poor work. Read
the *Mistakes* section before touching `chatgpt.mjs`; it is the part with value.

**Nothing is deployed.** The live worker (pid 4621, started 21:38) is still running
the committed `macmini.mjs`. No service was restarted, no server-side file was
touched, nothing was committed or pushed. The mini's production behaviour today is
exactly what it was yesterday.

---

## The goal

Expose the mini as a second location for the `chatgpt` and `agy` engines, so
`ee-auto` can route model calls to either the container or this machine and serve
more requests. The mini gets its own ChatGPT account, so it is a second account and
a second browser, not a copy of the container's one.

The user's explicit instruction was: **prove the wrappers run on the mini before
designing any routing.** The previous session was told off for jumping to routing
design first. Do not repeat that.

---

## Decisions already made

| | |
|---|---|
| Mini's ChatGPT login | **Signed in by hand, once.** Done — the profile is live. No scripted login, no stored password, no TOTP secret on this machine. Residential IP and a real keyboard make the container's whole login apparatus unnecessary here. |
| Routing policy | **UNDECIDED — do not assume.** The question (pooled / explicit-only / prefer-mini) was asked and deliberately deferred until the wrappers are proven. Ask again before building it. |
| Browser mode | **Headful.** Headless is a fingerprint tell ChatGPT's bot check reads; the container pays for an entire Xvfb to avoid it. The mini has a real GUI session (`launchctl managername` = Aqua), so headful is free here. The user mentioned "ego-lite" as an alternative if headful were a problem — **nobody ever explained what that is; ask them.** |

---

## State of the work

| File | Status |
|---|---|
| `worker/agy.mjs` | **new, works.** Proven on the mini. |
| `worker/chatgpt.mjs` | **new, works but is too slow.** Answers correctly; see *The open problem*. |
| `worker/macmini.mjs` | **modified, untested.** Handlers + lanes wired. Never run. |
| everything server-side | **untouched.** Not started. |

```
 M worker/macmini.mjs      (+87 -27)
 ?? worker/agy.mjs
 ?? worker/chatgpt.mjs
```

Revert with `git checkout worker/macmini.mjs` and deleting the two new files;
nothing else in the repo was modified.

### `worker/agy.mjs` — done

Wraps the local `agy` CLI, which is installed at `~/.local/bin/agy` (v1.1.9) and is
**already signed in** — it holds its Google session in the macOS keyring, the one
mechanism the container could not use. Zero setup was needed.

```
node worker/agy.mjs probe          -> {"status":"ready","detail":"answered in 11655ms"}
node worker/agy.mjs ask "..."      -> {"answer":"Kuala Lumpur","ms":15070}
```

Comparable to the container's ~14s. Consider this component finished.

**Unverified:** whether the mini's agy and the container's agy use the *same*
Google account. If they do, they share a rate limit and this is concurrency but not
extra capacity. Worth checking before promising throughput.

### `worker/macmini.mjs` — wired, never run

- Handlers added: `chatgpt.ask`, `chatgpt.probe`, `agy.ask`, `agy.probe`.
- The single claim loop became **lanes**: one loop for `ping` + `gmap.scan`, one for
  the four new fast types, running concurrently. Reason: a 15s ChatGPT call must not
  queue behind a 60s Maps scan. Each lane is serial within itself, which is also
  what keeps "one Chrome per profile" true without a lock.
- Each lane checks in under its own name (`macmini`, `macmini-ask`) so a dead lane
  is visible in `GET /api/jobs` instead of being covered for by its neighbour.
- `WORKER_TYPES` still works and now collapses the worker to a single lane.

**Not run once.** `claim`/`report`/`run` all changed signature to take a lane name.
Read the diff before starting it, and start it in a terminal, not launchd, the
first time.

### `worker/chatgpt.mjs` — works, too slow

Raw CDP against the installed Chrome, no Playwright — the same zero-dependency rule
`gmap.mjs` states. Persistent profile at `~/.gmap-worker/profiles/<id>`, one derived
debugging port per session id (`mini-main` -> 9465).

**Attach-first, launch-second.** A call looks for a debuggable Chrome already on the
profile's port and uses it; it only launches when nothing answers. This is what
makes the hand-login work: the window a human signs in to *is* the browser the code
then drives.

```
node worker/chatgpt.mjs open  mini-main      # launch profile, sign in by hand
node worker/chatgpt.mjs probe mini-main      # -> status: ready
node worker/chatgpt.mjs ask   mini-main "What is 2+2? Reply with just the number."
```

Current profile `mini-main` is **signed in and ready** (account shows as "Zhihong
Eternalgy", Free tier). Chrome pid 7922 is holding it.

---

## The open problem — READ THIS FIRST

A one-character answer takes **~20s**, of which **~18s is the answer-wait phase**.
ChatGPT itself renders the reply in about a second. The other 17 seconds are the
loop failing to notice it is finished.

Latest measured phases for `"What is 2+2?"` -> `"4"`:

```
connect  19ms | load 1454ms | interactive 1ms | type 169ms | submit 576ms | answer 17971ms
```

Everything except `answer` is fine. **Fix the completion detection and this
component is done.**

Three completion signals have been tried:

| Signal | Result |
|---|---|
| text stops changing for 3 polls of 1500ms | works, costs a fixed 4.5s |
| `aria-busy="true"` / `.result-streaming` on the assistant node | **wrong.** Still set 41s after a finished one-character answer, and set forever on a stream that died. |
| `[data-testid="stop-button"]` absent | still ~18s — reason unknown, never measured |

**The next step was to measure, and it was not done.** There is a `CGPT_TRACE=1`
env hook already in `ask()` that records `[t_ms, present, streaming, textLen]` per
tick into `phases.trace`. One run with it answers whether the stop button lingers,
whether the text keeps changing, or whether `READ_ANSWER` itself is slow:

```
CGPT_TRACE=1 node worker/chatgpt.mjs ask mini-main "What is 2+2? Reply with just the number."
```

Do that before changing any more code. Three separate wrong guesses were made here
by not doing it.

---

## Measured facts about the ChatGPT DOM (2026-08-20, this account, Chrome 151)

Worth keeping — these cost real time to establish.

- Composer is `div#prompt-textarea.ProseMirror`. Empty state renders
  `<p data-empty-paragraph="true" data-placeholder="Temporary chat">`.
- **The send control is `[data-testid="send-button"]`, aria-label "Send prompt".**
  It is `disabled: false` even with an empty composer, so its disabled state is
  **not** a usable "the app accepted the text" signal.
- `Input.insertText` into the focused composer works reliably. Verified by reading
  `#prompt-textarea` innerText back.
- **The composer accepts text before its keydown handler is wired.** Type
  immediately after navigation and Enter does nothing at all — the prompt sits in
  the box until the timeout, with no error anywhere. `waitInteractive()` waits for
  the send button to render, which is the cheapest signal the composer is live
  rather than merely drawn.
- A new `[data-message-author-role="user"]` node is the app's own record that it
  accepted the message. The composer emptying is not — it empties on a failed
  submit too.
- The assistant's `innerText` needs the controls stripped from a **cloned, still
  attached** copy; a detached clone degrades to `textContent` and loses the line
  breaks that are the whole reason for reading innerText. That code is carried over
  from `agy-lab/src/sessions.ts` and is correct.
- On the logged-out page here, `login: true, composer: false` — note this differs
  from what the container measured on 2026-08-19, where the logged-out page shipped
  a working composer. The rule still holds either way: **a visible sign-in control
  outranks a live composer.** The probe gets this right.

---

## Mistakes made, so they are not repeated

1. **Built a double-submit.** `submit()` pressed Enter, waited 5s for proof, and
   clicked the send button when that proof did not arrive — so when Enter *had*
   worked, the click fired a second submit. That is what left an assistant node
   stuck on `aria-busy` with an empty body, which was then misdiagnosed as ChatGPT
   stalling. **Now: click the send button, once, and verify. No Enter, no
   fallback.** Do not reintroduce a fallback that can fire after a success.
2. **Guessed at the completion signal three times instead of measuring once.** The
   trace hook existed and went unused. Every guess cost the user a full round trip.
3. **Jumped to routing design before the wrappers existed.** The user stopped this
   explicitly. Prove the thing, then design around it.
4. Left a 4.5s fixed settle cost in and called an 8s call a success without
   questioning where the time went.

---

## What is left

**On the mini**

- [ ] Fix the answer-wait. Run the trace first.
- [ ] Run `macmini.mjs` once by hand and confirm both lanes claim work.
- [ ] Decide whether the ask lane should survive a reboot, and which plist
      (`com.eternalgy.gmapworker.plist` is a LaunchAgent, `.daemon.plist` is not).
      **A daemon has no GUI session and headful Chrome will not start under it** —
      this matters and is not currently documented in `worker/README.md`.
- [ ] `worker/README.md` still documents `WORKER_TYPES` as the only lane control and
      does not mention lanes, the profile, the ports, or the hand-login.

**On the server (not started)**

- [ ] `jobs.ts` — a `wait(id, timeoutMs)` so a request can await a job's result;
      today `finish()` resolves nothing.
- [ ] `jobs.ts` — record each worker's declared `types` on `touch()`, so the gateway
      can tell whether a chatgpt-capable lane is actually online before routing to
      it. Without this a call routes into a job that sits pending until it times out.
- [ ] `queue.ts` — a lane for the mini. The container's `browser` lane is width 1
      because it has one Chrome; the mini is a *different* machine with a
      *different* account, so it must be its own lane with its own gap and caps, or
      the capacity gain is thrown away.
- [ ] `gateway.ts` — resolve a model to a location, and list the mini's engines in
      `GET /v1/models` with their liveness.
- [ ] Routing policy — **ask the user, it is still undecided.**
- [ ] `API.md` and `CHATGPT-PROGRESS.md` describe a single-location gateway
      throughout. Both need revising once routing exists.

---

## Housekeeping

- A Chrome (pid 7922) is holding the `mini-main` profile with the debugging port
  open on 9465. It is intentional and attach-first depends on it. Killing it is
  safe; the next call relaunches it and the login persists on disk.
- Scratch scripts used for measurement live in the session scratchpad and are not
  in the repo.
- Nothing was committed. `git status` above is the whole change.
