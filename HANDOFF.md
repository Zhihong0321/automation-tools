# SESSION HANDOFF — 2026-08-19

Read [STUPID-LOG.md](STUPID-LOG.md) first. It explains the process failure that
turned "fill email, password, OTP" into a multi-hour bug hunt. Do not repeat it.

**The one rule: observe on prod before writing code.** The debug layer already
exists (see below) — every question below can be answered with one API call. No
selector should ever be written from memory again.

---

## Goal

Move `gmap-recon`'s two dependencies into a Railway container: the **agy CLI** and
a **signed-in ChatGPT browser session**, with multiple ChatGPT accounts.

## Status

### agy — DONE, verified end to end

| | |
|---|---|
| Binary | `/data/.local/bin/agy` (on the volume, not the image) |
| Credential | `/data/.gemini/antigravity-cli/antigravity-oauth-token` — 498 bytes, mode 0600 |
| Contents | `{token:{access_token, refresh_token, expiry}, auth_method:"consumer"}` |
| Auth method | OAuth URL + paste code, through a pty (`script`, see `src/pty.ts`) |
| Survives redeploy | **Yes — verified.** Probed `ready` after a full rebuild, no re-login |
| Probe | `POST /api/probe` → `ready` in ~8–10s (a real model call) |

The access token is 1 hour; the refresh token is what makes it survive. Both
binary and credential are on `/dev/zd5920` (the volume), not the overlay.

Caveat: `auth_method: "consumer"` — a personal Google account running headless in
a datacenter. Works, but it is the pattern that gets accounts flagged.
`GEMINI_API_KEY` + `modelProvider: "gemini"` is the documented headless route if
that ever matters.

### ChatGPT sessions — BLOCKED at MFA

Working, all measured on prod:

- Chrome (real Google Chrome, not Chromium) + Xvfb + patchright launching
- Cloudflare **passes** from the Railway IP (`208.77.246.6`, SIN edge). **No proxy
  needed.** `PROXY_URL` is wired and unset
- Profiles persist on the volume at `/data/profiles/<id>`
- Full flow up to and including the password: landing → click Log in → modal →
  email → Continue → `auth.openai.com/log-in/password` → password → Continue →
  **MFA page**. The password IS accepted.

**Blocked:** the TOTP code cannot be submitted.

---

## The blocking bug — everything that has been measured

Page: `https://auth.openai.com/mfa-challenge/<id>`
Title: `Check your authenticator app - OpenAI`

```
input : {"type":"text","name":"code","placeholder":"One-time code","visible":true}
button: {"text":"Continue","tag":"BUTTON","visible":true,"disabled":false,"ariaHidden":false}
```

Observed behaviour:

| Action | Result |
|---|---|
| `fill()` the code | digits appear on screen (confirmed by screenshot) |
| click `Continue` | **nothing** — no error, no navigation, no request |
| press `Enter` | **nothing** |
| `fill('')` to clear | **does not clear** — old value remains |
| click, then digit key presses | value **does not change**; text just shows as selected |

So mouse events reach the page (the click visibly selects the text) but keyboard
input does not alter the field, and submitting does nothing at all — not even a
validation error.

**Leading hypothesis, NOT verified:** the page uses `react-aria` (React-generated
ids like `react-aria-_R_6dhj5_` were observed on the password screen). A
react-aria input tracks its own state and ignores a value written straight onto
the element, so `fill()` can leave the DOM looking correct while the component
still believes the field is empty — which would explain a submit that produces
neither success nor an error.

An alternative that has not been ruled out: keyboard events not landing on the
page at all.

**These two are distinguishable with one observation** (see Next step).

---

## What was deployed to test it — NOT yet exercised against the MFA page

The last deploy added exactly the missing observation. It is live but was never
run against the code screen, because the redeploy itself reset the browser to
`about:blank` and destroyed the in-flight auth state.

- `/dom` now reports each input's **`value`** (password inputs masked to a length)
  — previously the dump reported every attribute *except* the one that mattered
- `/dom` now reports **`bodyText`** (600 chars), so an error message is readable
  without a screenshot
- step action **`type`** — real keystrokes via `keyboard.type`
- step action **`selectall`** — `ControlOrMeta+a` then `Delete`, because `fill('')`
  does not clear this field
- `page.bringToFront()` before steps run

---

## Next step — do this ONE thing first

Drive back to the MFA screen, then **read the field value before submitting
anything**:

```bash
LAB=https://ee-auto.up.railway.app
TOK=<LAB_TOKEN>
S=openai-waynecollins

# 1. back to the code screen (needs the account password)
STEPS='[{"goto":"https://chatgpt.com/?temporary-chat=true","wait":3000},
        {"click":"button:text-is(\"Log in\"):visible","wait":3000},
        {"fill":"input#mobile-auth-email:visible","value":"<EMAIL>","wait":700},
        {"click":"button:text-is(\"Continue\"):visible","wait":9000},
        {"fill":"input[type=\"password\"]:visible","value":"<PASSWORD>","wait":900},
        {"click":"button:text-is(\"Continue\"):visible","wait":15000}]'
curl -s -G -H "Authorization: Bearer $TOK" --data-urlencode "steps=$STEPS" "$LAB/api/cgpt/$S/dom"

# 2. type a DUMMY code with real keystrokes and READ THE VALUE BACK. Do not submit.
STEPS='[{"click":"input[name=\"code\"]:visible"},{"selectall":true},
        {"type":"123456","delay":90,"wait":500}]'
curl -s -G -H "Authorization: Bearer $TOK" --data-urlencode "steps=$STEPS" "$LAB/api/cgpt/$S/dom"
```

Read `inputs[].value` in the response:

- **value is `123456`** → keyboard works, the widget accepts real keystrokes. The
  earlier failure was `fill()`. Fix `enterOtp` in `src/login.ts` to use
  `selectall` + `keyboard.type`, then ask the user for a live code and submit
  within its 30-second window.
- **value is unchanged / empty** → keyboard input is not reaching the field. Then
  investigate focus (`bringToFront`, `page.focus()`) or dispatching through CDP,
  and only then write a fix.

Do not guess which one it is. One call answers it, and a dummy code costs nothing.

---

## The debug layer — use it for every question

`GET /api/cgpt/:id/dom` runs through the **server's own** `browser.withProfile()` /
`browser.acquire()` — the same profile and launch args the real login uses. A
fresh local Chrome is a different experiment and proves nothing about this one.
(That mistake was made in this session and reported as a PASS while prod failed.)

| Param | |
|---|---|
| `?goto=<url>` | navigate first |
| `?click=<sel>` | click a selector, then dump |
| `?wait=<ms>` | settle before reading |
| `?steps=<json>` | drive a sequence, stops at the first failure and names it |

Step actions: `{goto}`, `{fill, value}`, `{click}`, `{press}`, `{type, delay}`,
`{selectall}`, each with optional `wait`.

Returns: url, title, `bodyText`, every clickable (text, testid, aria, role, href,
visible, ariaHidden, disabled), every input (type, name, id, autocomplete,
placeholder, visible, **value**), and live counts for ~13 candidate locators.

`GET /api/cgpt/:id/frame` returns a JPEG — read-only, useful when the DOM dump is
ambiguous.

---

## Measured facts — do not re-derive, do not contradict without re-measuring

| Fact | Consequence |
|---|---|
| `[data-testid="login-button"]` → **0 matches** | It does not exist. It is **also dead in `gmap-recon/session-monitor/src/probe-chatgpt.ts`**, where it was copied from. Fix that too. |
| `a[href*="/auth/login"]` → 0 on landing | useless as a primary selector |
| `button:has-text("Log in")` → 8 matches | substring matching hits wrappers — never use it |
| 12 elements read "Log in", **3 visible** | always filter `:visible` |
| `getByRole` lags the raw DOM | it reads the accessibility tree. A DOM-based detector sees the button first, so a single `getByRole` sample right after detection returns 0. **Use `:text-is` + `:visible` + auto-waiting `click()`.** |
| Email field: `input#mobile-auth-email`, `name="login_hint"` | `input[name="email"]` matches **nothing** |
| Password field: `name="current-password"` | `input[name="password"]` matches nothing; use `input[type="password"]` |
| Password field id `_R_35H1_-current-password` | React-generated, changes on every render — never key on it |
| Sign-in is a **modal** on chatgpt.com | URL never changes; do not wait for navigation there |
| Modal offers "Continue with Google / Apple / phone" | never substring-match "Continue" — it clicks an SSO provider |
| Starting from plain `https://chatgpt.com/` | **hangs on `/auth/login_with`** with a blank page. Use `?temporary-chat=true` |
| Logged-out ChatGPT has a working composer | "composer is visible" ≠ signed in. A visible sign-in control outranks it |
| A redeploy resets the browser to `about:blank` | **never deploy mid-login** — in-flight auth state is destroyed |
| MFA is TOTP, 30-second window | any fix must submit fast; a slow round trip expires the code |

---

## Environment

| | |
|---|---|
| Service | `https://ee-auto.up.railway.app` |
| Repo | `https://github.com/Zhihong0321/automation-tools` |
| Auth | `LAB_TOKEN` env var, bearer on every `/api/*` |
| Volume | `/data` (46G), `HOME=/data` |
| Memory | 4 GB cap; ~250 MB idle, one Chrome ~400–700 MB |
| Browsers | `MAX_OPEN_BROWSERS=1`, LRU-evicted, 5-min idle close |
| Sessions | `openai-main`, `openai-waynecollins` (both `logged_out`) |

Account credentials were supplied by the user in chat and are **not stored in this
repo**. Ask for them; ask for a fresh TOTP code at the moment it is needed.

## Stability fixes already in place — do not undo

- `tini` as PID 1 (Chrome orphans were accumulating as zombies until nothing could
  fork)
- `.catch()` on the idle sweeper's `withProfile` (an unhandled rejection is fatal
  in modern Node and was killing the container)
- stale `SingletonLock` cleared before launch (a crashed container leaves a lock
  naming a dead host/pid on the volume)
- `unhandledRejection` / `uncaughtException` recorded and served on `/api/status`
  instead of ending the process

## Honest cost of this session

Roughly three hours and eight deploys to get from nothing to "password accepted,
blocked at MFA". Most of that was spent guessing selectors and shipping them —
work that one DOM dump would have made unnecessary. The debug layer that now
exists should have been the first commit, not the eighth.
