# ChatGPT wrapper — what works

Last verified on prod: **2026-08-20**. Every number below is a measurement from
that day, not an estimate.

A signed-in ChatGPT session, running in a Railway container, driven over HTTP.
Log in without a human, ask a question, get the answer back as JSON.

---

## It works

| | Evidence |
|---|---|
| **Unattended login** | `POST /login` with only an email and a password → `state: ready` in **13.8s**. Nobody typed a code. |
| **Ask and get an answer** | `{"prompt":"Reply with exactly one line: the capital of Malaysia, nothing else."}` → `{"answer":"Kuala Lumpur","ms":15389,"settled":true}` |
| **The session persists** | Probed `ready` again after a **full redeploy**, no re-login. Cookies live in the Chrome profile on the `/data` volume. |
| **One-time codes are derived, not asked for** | The TOTP secret is stored; the code is generated in-container at the moment of submit. Container clock verified within 1s of real time, and its codes byte-identical to codes generated off-box. |

```
POST /api/cgpt/openai-waynecollins/ask
{"prompt":"Reply with exactly one line: the capital of Malaysia, nothing else."}

{"id":"openai-waynecollins","answer":"Kuala Lumpur","ms":15389,"settled":true}
```

---

## The API

Base `https://ee-auto.up.railway.app`, bearer `LAB_TOKEN` on every `/api/*`.
`:id` is a session name; one browser profile per session, per account.

| Call | Does | Typical |
|---|---|---|
| `POST /api/cgpt` `{id, label}` | create a session | instant |
| `POST /api/cgpt/:id/totp` `{secret}` | store the TOTP secret, once per account | instant |
| `POST /api/cgpt/:id/login` `{email, password}` | sign in, unattended | ~14s clean, ~60s if it has to fight |
| `POST /api/cgpt/:id/ask` `{prompt, timeoutMs}` | send a prompt, return the answer | ~15s for a short answer |
| `POST /api/cgpt/:id/probe` | is it still signed in | ~4s |
| `GET /api/cgpt` | list sessions and their last probe | instant |
| `GET /api/cgpt/:id/dom` | the observation layer — see below | varies |
| `GET /api/cgpt/:id/frame` | JPEG of the page | ~1s |

### Typical use

```bash
LAB=https://ee-auto.up.railway.app
TOK=<LAB_TOKEN>
S=openai-waynecollins

# once per account — base32, otpauth:// or Google Authenticator's
# otpauth-migration:// export link, whichever form you actually have
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"secret":"otpauth-migration://offline?data=..."}' "$LAB/api/cgpt/$S/totp"

# once, and again only if the cookie ever expires
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' "$LAB/api/cgpt/$S/login"

# from then on, this is the whole wrapper
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"prompt":"..."}' "$LAB/api/cgpt/$S/ask"
```

`/totp` answers with a live code, which is the only honest proof that what was
stored matches the phone. `GET /api/cgpt` reports `"(set)"` and never the value.

---

## Current state

| Session | Status |
|---|---|
| `openai-waynecollins` | **ready** — signed in, TOTP secret stored |
| `openai-main` | logged out, no secret stored |

---

## Known limits — read before relying on it

**One browser at a time.** `MAX_OPEN_BROWSERS=1`, LRU-evicted, closed after 5
minutes idle. Concurrent `/ask` calls against different sessions serialise, and a
cold call pays the browser launch. Fine for a pipeline, not for fan-out.

**Answers are read from `innerText`.** `/ask` polls the last assistant message and
settles on three quiet ticks — there is no reliable completion marker in the DOM.
Consequences: a long fenced code block does not always read back whole, and a
prompt that asks for one big JSON blob is the shape most likely to come back
truncated. Ask for line records instead.

**`login.run()` does not clear a stale auth state.** The MFA challenge that made
the successful run work was reached after logging out of `auth.openai.com` first —
done by hand, not in the code. OpenAI resumes a pending challenge from the
cookies, and a challenge that has gone stale rejects every correct code silently,
with no error rendered anywhere on the page. If `/login` ever reports *"the
one-time code was submitted twice and the page stayed on the code screen"*, that
is what it is: `goto https://auth.openai.com/log-out` first and run it again.

**Cloudflare passes from the Railway IP** (`208.77.246.6`, SIN edge). `PROXY_URL`
is wired and unset. The interactive Turnstile checkbox is solved by a coordinate
click; if OpenAI escalates that to something harder, this stops.

---

## What was actually wrong, 2026-08-19 → 2026-08-20

Five separate causes. The one everybody assumed — a react-aria widget refusing a
scripted value — was not among them.

1. **Xvfb was dead, so no browser could start at all.** A Railway *restart* keeps
   the container's writable layer, so `/tmp/.X99-lock` survives. It names pid 3,
   and pid assignment here is deterministic (tini=1, entrypoint=2, Xvfb=3), so the
   new Xvfb reads a lock naming a live pid — itself — and exits. The readiness
   check passed anyway because it only tested for the socket *file*, also stale.
   Every Chrome launch failed with *"you launched a headed browser without having
   a XServer running"*, an error naming neither Xvfb nor the lock.

2. **The debug layer was corrupting its own output.** `bodyText` ran through
   `.replace(/s+/g, ' ')` — no backslash — deleting every lowercase `s` from every
   page dump.

3. **Cloudflare Turnstile in a cross-origin iframe.** `page.locator()` cannot
   enter one, so there is no selector for the checkbox and there never will be.
   The dump reported an empty page, indistinguishable from nothing being there.
   Solved with a coordinate click on the iframe element's own box.

4. **An account-chooser `<dialog>`.** After a logout OpenAI opens a real
   `<dialog open>` matching `:modal` — *"Welcome back / Choose an account"*. It
   sits in the **top layer**, so everything behind it is unclickable. `/login`
   reported *"a sign-in control is on the page but nothing clickable matched it"*
   while five "Log in" buttons sat there and `elementFromPoint` over every one
   returned the dialog.

5. **A stale MFA challenge.** The last ninety minutes went into "the code is being
   rejected" when the challenge id in every single response was the same
   `68f857bf94cc8191b2d9fc6d6a31b401` from an hour and a half earlier. A stale
   challenge rejects every correct code and renders no error at all.

### On the MFA page specifically

Measured, because none of it is guessable:

| Attempt | Result |
|---|---|
| click the code field | hit-target check times out — the floating `<label>` paints a positioner div over the input's centre |
| `keyboard.type()` | nothing arrives |
| `fill()` | value lands in the DOM and on screen — **and the submit is then rejected**, because the app's own state stayed empty |
| click `Continue` | nothing. An in-page capture listener confirms no click event is dispatched |
| click `Try another method` | nothing — and that is a plain `<a href="/mfa-challenge">`, which needs no JavaScript to navigate |
| `form.submit()` | posts, server answers HTTP 500 |
| **focus → `insertText` → 400ms → Enter** | **signs in** |

Two things worth carrying to any other site:

- **A field that reads back correct is not proof the page accepted it.** The DOM
  value and the app's state are two different claims. `fill()` satisfies the first
  and not the second.
- **"The control is visible but clicking does nothing" had two different causes on
  this one site in one day** — a top-layer dialog, and input not reaching the
  renderer. Neither is visible in a screenshot, and neither is a selector problem.

---

## The observation layer

`GET /api/cgpt/:id/dom` runs through the **server's own** `withProfile()` /
`acquire()` — same profile, same launch args as the real login. A fresh local
Chrome is a different experiment and proves nothing about this one.

Params: `?goto=` `?click=` `?wait=` `?steps=<json>`

Step actions: `{goto}`, `{fill, value}`, `{click}`, `{press}`, `{type, delay}`,
`{selectall}`, `{mouse:[x,y]}`, `{insert}`, `{eval}`, each with optional `wait`.

- `{mouse:[x,y]}` — a click at viewport coordinates through CDP. The only way into
  a cross-origin iframe, and the only way to solve the Turnstile.
- `{insert:"text"}` — `Input.insertText`: hands text to the focused node and fires
  `beforeinput`/`input` without dispatching key events.
- `{eval:"expr"}` — arbitrary expression against the live page. This is the one
  that makes the layer pay for itself: the next question costs one API call
  instead of one deploy.

Returns `url`, `title`, `bodyText`, every clickable, every input (with `value`,
`readOnly`, `disabled`, `focused`), plus:

- `focus` — `activeElement`, `document.hasFocus()`, `visibilityState`,
  `readyState`, and `elementFromPoint` at the viewport centre. **A top-layer
  dialog or an invisible overlay appears here and in no screenshot.**
- `frames` — every frame including cross-origin ones, each element's rect in
  **viewport** coordinates, ready to hand to a `mouse` step.
- `console` — console output and uncaught page errors for the request.
- `tabs` — every page in the context.

`GET /api/cgpt/:id/frame` returns a JPEG. Useful, but it cannot show a top-layer
dialog, a stolen focus, or an event that never fired — which is three of the five
bugs above.

---

## Not done

- `login.run()` does not log out of `auth.openai.com` before starting, so it
  cannot recover from a stale challenge on its own.
- `openai-main` has never been signed in.
- `[data-testid="login-button"]` is **still dead** in
  `gmap-recon/session-monitor/src/probe-chatgpt.ts`, where the whole selector
  mistake was originally copied from.
- Nothing re-logs-in automatically when a probe reports `logged_out`.
- No test covers any of this. Every claim above is a manual measurement.
