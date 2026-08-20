# agy-lab

Install, authenticate and drive the **Antigravity CLI (`agy`)** inside a Railway
container — and find out whether the login survives a redeploy.

This is a research harness, not a product. It exists to settle one question:
*can agy hold a Google session in a container, or does agy have to stay on a
local PC?* The answer decides whether the gmap-recon pipeline can move to the
cloud or needs a worker at home.

It can: agy holds its login across a redeploy, and so does a ChatGPT browser
session. So the harness now has a consumer-facing end - a gateway that serves
both to other tools in the OpenAI chat-completions shape, documented in
[../API.md](../API.md). Everything below is the machinery under it: installing
agy, driving a login, and observing a page that will not cooperate.

## Railway setup

1. **New service → deploy from this repo.** No Root Directory setting needed —
   the Dockerfile sits at the repo root and copies `agy-lab/` in. Railway's
   builder only looks for a Dockerfile at the root of the build context and falls
   back to language autodetection when it finds none, so a Dockerfile one
   directory down is silently ignored and the deploy fails claiming it cannot
   tell what the app is.
2. **Variables → `LAB_TOKEN`** — 16+ random characters. The service refuses to
   start without it (see *Security* below).
3. **Volume → mount at `/data`.** `HOME=/data`, and agy derives everything from
   `HOME`: the binary at `~/.local/bin/agy`, settings, conversations, and the
   credential store. Without the volume the container works fine and forgets the
   login on every redeploy.

Then open the service URL, paste the token, and work down the buttons.

## The three ways agy can authenticate here

| Route | Interaction | Verdict |
|---|---|---|
| **Gemini API key** | none | Set `GEMINI_API_KEY`, then press *Set provider = gemini* (writes `modelProvider` into `settings.json`). The documented headless/CI path. The env var alone is not enough — the provider switch is what stops agy reaching for a keyring session. |
| **OAuth paste** | once | Press *Log in*. agy prints an authorization URL, you open it, and paste the code back into the terminal box. This is the flow you already use on the PC. |
| **OS keyring** | — | Not available. Containers have no D-Bus session bus, and agy's changelog says it bypasses the keyring when there is none. That fallback is precisely what this harness measures. |

### Why the login needs a terminal

agy's changelog: the authorization code is read *"via the controlling terminal
(/dev/tty on POSIX and CONIN$ on Windows) when stdin is consumed by a piped
prompt"*, and *"truly headless runs fail fast with an actionable message instead
of blocking"*. A normal `spawn` gives it pipes, not a terminal, so the paste step
can never complete.

`src/pty.ts` solves that with `script` from util-linux rather than `node-pty`: it
allocates a pty from a package Debian already ships, with no C++ toolchain in the
image and nothing to rebuild when Node's ABI moves.

The docs also describe two *different* login behaviours — a local run launches a
browser (there is none here), while an SSH run prints a URL to paste a code back
into. Only the second can work in a container, so sessions set `SSH_CONNECTION`,
`SSH_CLIENT` and `SSH_TTY` by default. Whether that is sufficient is one of the
things being tested; pass `fakeSsh: false` to turn it off.

## Where does the credential land?

The open question. agy bypasses the keyring in a container — in favour of *what*,
written *where*, is documented nowhere, and it decides whether a login survives a
redeploy.

The method is deliberately dumb and therefore trustworthy:

1. **Snapshot now** — records every file under `HOME`.
2. **Log in.**
3. **Diff vs pre-login** — whatever appeared is the credential store.
4. **Inspect** it. Redacted by default: the file being hunted is a live token and
   a browser tab is not a vault. `?reveal=1` prints it verbatim.

No guessing at library internals, no reading strings out of a Go binary.

## API

Everything the page does is a plain HTTP call, so the whole harness can be driven
from a terminal. All `/api/*` routes need `Authorization: Bearer $LAB_TOKEN`.

| | |
|---|---|
| `GET /healthz` | unauthenticated; Railway's healthcheck |
| `GET /api/status` | installed? version? volume mounted? which auth route is configured? |
| `POST /api/install` | runs `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |
| `POST /api/login` | snapshots `HOME`, then starts a pty run that triggers the OAuth flow |
| `POST /api/session` | `{command, fakeSsh, env}` — run anything in a pty |
| `GET /api/session/:id?offset=N` | stream output from a byte offset |
| `POST /api/session/:id/input` | `{text}` — **this is how the OAuth code gets pasted** |
| `POST /api/session/:id/kill` | SIGHUP, then SIGKILL after 3s |
| `POST /api/probe` | one real tool-free model call: is the session actually live? |
| `POST /api/run` | `{prompt, tools, format}` — a real prompt |
| `POST /api/exec` | `{cmd}` — arbitrary shell |
| `POST /api/snapshot` | `{label}` — record the file tree |
| `GET /api/snapshot/diff?from=pre-login` | what changed |
| `GET /api/file?path=&reveal=` | inspect one file |
| `POST /api/settings/provider` | `{provider}` — write `modelProvider` into settings.json |

```bash
LAB=https://your-service.up.railway.app
TOK=your-lab-token
curl -s -H "Authorization: Bearer $TOK" $LAB/api/status
curl -s -X POST -H "Authorization: Bearer $TOK" $LAB/api/install
curl -s -H "Authorization: Bearer $TOK" "$LAB/api/session/s1?offset=0"
```

## Probe states

Four states, not two — lifted from gmap-recon's session-monitor for the same
reason. `ok | broken` collapses *"could not tell"* into *"logged out"*, which
sends a human to re-authenticate for nothing. Here it would also corrupt the
experiment: a container that failed to allocate a pty is not a container that
failed to authenticate, and telling those apart is the entire point.

| | |
|---|---|
| `ready` | proven just now by a real model call |
| `logged_out` | credentials are gone; sign in |
| `not_installed` | no binary; press Install |
| `unknown` | the probe could not tell — read `detail` before acting |

## Security

`/api/exec` is a remote shell, and this container will be holding a live Google
session. The service therefore **refuses to start without a `LAB_TOKEN` of at
least 16 characters**, and there is no dev mode that skips it — an open shell on a
public Railway hostname is a root shell for whoever scans the port first.

`--dangerously-skip-permissions` is opt-in per run, never a default. There is no
narrower per-tool allow flag on the command line, so it is all-or-nothing: full
tool auto-approval with nobody watching. That is a much bigger surface inside a
web-reachable container than it is on a desktop.

## Not built yet

agy's *own* browser tools. Chrome is now in the image for the ChatGPT sessions
below, but agy downloads its own Playwright driver at runtime and already 404s
doing so on a normal desktop; pointing it at the system Chrome is untried.

`agy update` self-modifies the binary. On a volume that works and silently drifts
from what this README claims is installed; pin it once there is anything worth
pinning.

---

# ChatGPT sessions

Many accounts, each a persistent Chrome profile on the volume at
`/data/profiles/<id>`, each with its own health state.

## Why headed Chrome under Xvfb

Headless is a materially different fingerprint — different user-agent, no window
chrome, a documented set of behavioural tells — and ChatGPT sits behind bot
detection that reads exactly those. Xvfb costs a few MB and removes the category.
Real Google Chrome rather than Chromium, because patchright's stealth patches
assume the real build and because the desktop pipeline enrolled its profiles with
`channel: "chrome"` — a profile whose browser build changes between machines is a
fingerprint change, which is what a bot check looks for.

## One Chrome per profile

Chrome enforces it with a lock file, and a second launch against a live profile
does not queue — it fails, or half-succeeds and corrupts the profile. Every
operation therefore goes through a per-id mutex, and a held context is reused
rather than relaunched. Idle profiles close after `BROWSER_IDLE_MS` (default 5
min) so a forgotten tab does not pin ~400MB and the profile lock until the next
deploy.

## Two ways to get a login in

**Scripted login.** Fill in session id, email and password and press *Log in*. The
server drives the flow: click through to the form, fill the named field, submit,
look at what came back, repeat. If a one-time code is wanted it stops and holds
the page — enter the code and the flow resumes from exactly there rather than
starting over.

Credentials are never stored. They arrive in a request body, are typed into the
page, and go out of scope with the call; the profile keeps the resulting session
cookies, which is the point, and nothing keeps the password.

There was a remote-control browser here that you drove by clicking on a
screenshot, and it is gone. A login is a FIXED sequence of known fields — nothing
to explore, so nothing to point at. Aiming a mouse at a JPEG spent three round
trips per step (frame out, coordinates back, frame again to see whether it landed)
to do what filling a named input does in one, and it missed silently whenever the
frame was stale. `GET /frame` survives as a read-only diagnostic, because when a
scripted login stops on an unrecognised page the only thing that answers "what is
it actually showing" is a picture of it.

**Import from a machine that already has one.** Paste a Playwright `storageState`
JSON. Cookies go in through the API; localStorage cannot, because it is
origin-scoped and only reachable from a page already on that origin, so each
origin is visited once and its entries written in place.

What an import cannot carry is the fingerprint the session was created under. A
cookie minted at a residential IP and replayed from a datacenter one is exactly
the pattern account-security systems look for — **the import succeeding is not the
same as the session surviving.** Probe afterwards.

## Reading the egress check

`GET /api/net` returns 403 with `cf-mitigated: challenge` from **any** address,
including a residential connection whose real Chrome reaches ChatGPT fine — a bare
fetch has no browser TLS fingerprint, sends no browser headers and runs no
JavaScript, so Cloudflare correctly says it is not a browser.

Do not read that as a block. What the endpoint is for is the egress IP, and the
difference between `challenge` (prove you are a browser — a real Chrome can) and
`block` (the address is refused outright, and a residential proxy via `PROXY_URL`
is the only answer). The verdict comes from a session probe, not from this.

## Session states

| | |
|---|---|
| `ready` | composer is live; the session works |
| `logged_out` | the sign-in wall; a human must sign in |
| `challenged` | a bot check is in the way — **not** a logout |
| `busy` | another Chrome holds the profile; the probe could not look |
| `never_used` | no profile directory yet |
| `unknown` | read `detail` before acting |

`challenged` earns its own state rather than folding into `unknown` because from a
datacenter IP it is the single most likely outcome and the single most misleading
one to report as a logout.

## ChatGPT routes

| | |
|---|---|
| `GET /api/net` | egress IP and what Cloudflare says |
| `GET /api/cgpt` | sessions, which are open, idle timeout |
| `POST /api/cgpt` | `{id, label}` — create a profile |
| `POST /api/cgpt/:id/probe` | `{keepOpen}` — signed in? |
| `POST /api/cgpt/:id/open` | launch and hold, optionally at a `url` |
| `POST /api/cgpt/:id/close` | release the profile lock |
| `POST /api/cgpt/:id/delete` | remove the profile and its login |
| `POST /api/cgpt/:id/login` | `{email, password, otp?}` — drive the whole login |
| `POST /api/cgpt/:id/otp` | `{code}` — resume a login that stopped for a code |
| `GET /api/cgpt/:id/frame` | current page as JPEG, read-only diagnostic (token via `?token=`) |
| `POST /api/cgpt/:id/goto` | `{url}` |
| `POST /api/cgpt/:id/import` | `{state}` — a Playwright storageState |
| `GET /api/cgpt/:id/export` | that session's storageState, **unredacted** |
| `POST /api/cgpt/:id/ask` | `{prompt}` — drive the real UI and read the answer |

## Capturing storageState on your PC

```js
// against the signed-in profile, with the pipeline not running
const ctx = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: false });
await ctx.pages()[0].goto('https://chatgpt.com/');
console.log(JSON.stringify(await ctx.storageState()));
await ctx.close();
```

## Memory

Chrome is ~400MB resident per open profile, on top of agy's language server and
CLI backend. Two profiles open at once on a 512MB plan will OOM. Budget 2GB, more
if several sessions run concurrently.

## `--no-sandbox`

Required: the container runs as root and Chrome refuses to sandbox as root. That
is a genuine weakening — a compromised page gets the container. Accepted because
the alternative, a non-root user owning a volume Railway mounts as root, trades
one problem for a worse one.
