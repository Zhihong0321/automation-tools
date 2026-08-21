# The home worker

A loop that asks the lab for a job, runs it on this machine, and posts the answer
back. Two things keep the work here rather than in the container:

- **A home IP.** A Google Maps scan from a datacenter address comes back thin
  instead of coming back an error, so a scan run in Railway is quietly incomplete.
- **Logins that already exist here.** The ChatGPT accounts are signed in inside
  ego lite's profiles on this machine, and this machine's `agy` was signed in
  interactively — no OAuth-paste apparatus, no keyring the container does not have.

It only ever makes outbound requests. Nothing needs to be opened on the router.

```
GET  /api/jobs/next?worker=<name>&wait=25&types=…   held open ~25s, 204 when idle
POST /api/jobs/<id>/result                          {ok, result, error}
```

## What it runs

| type | payload | runs |
|---|---|---|
| `ping` | anything, echoed back | the proof job — reports `publicIp` |
| `gmap.scan` | `{keyword, place?, max?, userId?}` | `gmap.mjs`, a Chrome on the home line, 12–60s |
| `chatgpt.ask` | `{id, prompt, space?, timeoutMs?}` | `chatgpt-ego.mjs`, an ego lite task space, ~6s |
| `chatgpt.probe` | `{id}` | whether that account is still signed in |
| `agy.ask` | `{prompt, tools?, timeoutMs?}` | `agy.mjs` — `agy -p`, ~10s for a one-line answer |
| `agy.probe` | none | one real model call, so "installed" is never mistaken for "signed in" |
| `meta.ask` / `muse.ask` | `{prompt, model?, timeoutMs?}` | `muse.mjs` — `opencode run` pinned to muse 1.2, ~3–5s |
| `meta.probe` / `muse.probe` | none | one real model call, same reasoning as `agy.probe` |

**`meta.*` is muse now.** Meta AI was never activated on this machine: no ego
lite profile ever held a `meta.ai` or `facebook.com` cookie, so every route to it
ended at an interactive Facebook login. `muse.mjs` answers the same model through
opencode's provider — no browser, no profile, no session to keep signed in — and
it answers under the `meta.*` names because those are what the deployed gateway
reaches (`meta@mini` in `GET /v1/models`). The engine changed; the address did
not. `meta-ego.mjs` is left in the tree unused, with its tests, as the record of
the browser route.

The cloud gateway reaches these through the queue: `chatgpt@mini` and `agy@mini`
in `GET /v1/models` are exactly `chatgpt.ask` and `agy.ask`, and an engine is
listed `ready` there only while some lane here is claiming its type. A worker
advertises the types it was **started** with, so a process older than the handler
it is missing looks, from the cloud, exactly like a machine that is switched off.
See [API.md](../API.md).

## Lanes

`macmini.mjs` runs one claim loop per lane, side by side in one process, each
checking in under its own name — so a lane that dies is visible in `GET /api/jobs`
instead of being covered for by its neighbour still polling.

With `WORKER_TYPES` unset there are two lanes: `<name>` for `ping` and `gmap.scan`,
and `<name>-ask` for the four wrapper types. Set, it collapses the process to a
single lane taking exactly those types — which is how this machine actually runs,
one process per engine:

| Process | `WORKER_NAME` | `WORKER_TYPES` | Kept alive by |
|---|---|---|---|
| the scan | `$(hostname)` | `ping,gmap.scan` | the LaunchDaemon, at boot |
| the ask lane | `macmini-ask` | the six wrapper types plus `muse.*` | the LaunchAgent, at login |

Pinning the daemon matters as much as pinning the wrappers: a claim with no
`types` asks for **any** job, so an unpinned scan daemon will happily take a
`chatgpt.ask` off the queue and fail it with "no handler" — stealing it from the
worker that could have answered.

The split is by duration and by what the engine needs. A 15-second ChatGPT call
queued behind a 60-second Maps scan is a person waiting on an HTTP request stuck
behind work that holds the loop for minutes by design — and an `agy` call with a
five-minute ceiling has no business in front of either.

## Accounts

The wrappers store no password, token or TOTP. Every credential is a login that a
human performed once, in a browser profile on this machine:

- **ChatGPT** — `~/.gmap-worker/spaces.json` maps a session id to
  `{space, profile}`, e.g. `pro -> {12, "Zhihong PRO"}`. Auth lives in that
  profile's cookie DB under `~/Library/Application Support/Citro Labs/ego lite/`.
  A task space inherits whatever profile is **default at the moment it is
  created**, and `profileId`/`profileName` are accepted and silently ignored — so
  adding an account means making its profile default in the GUI first. The wrapper
  asserts the expected profile before typing and fails `wrong_profile` rather than
  answering as the wrong account.
- **agy** — signed in interactively, on this machine, once. `worker/agy.mjs` only
  runs the binary at `~/.local/bin/agy`.

---

## Install on the Mac mini

```bash
# 1. Node 24 (type stripping and process.loadEnvFile are both required)
brew install node
node --version          # must be v24 or newer

# 2. The code
cd ~
git clone https://github.com/Zhihong0321/automation-tools.git
cd automation-tools

# 3. The token, in a file only you can read.
#    It is a root shell on the lab container — never put it in the plist.
printf 'LAB_TOKEN=%s\n' 'PASTE_THE_TOKEN' > ~/.gmap-worker.env
chmod 600 ~/.gmap-worker.env

# 4. Run it in the foreground FIRST. A failure you can see beats one in a log.
node worker/macmini.mjs
```

Expect:

```
[2026-08-20 19:31:02] worker "macmini" -> https://ee-auto.up.railway.app (any type)
```

…and then nothing, which is correct: it is holding a long poll, waiting for work.

## Prove it, from any machine with the token

```bash
LAB=https://ee-auto.up.railway.app
ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' -d '{"type":"ping"}' | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result
```

```json
{
  "hostname": "macmini",
  "platform": "darwin 24.5.0 arm64",
  "publicIp": "…your home line…",
  "at": "2026-08-20T11:31:44.201Z"
}
```

**`publicIp` is the whole test.** If it is your home address, a Maps scan launched from
here will be served the full result page. If it is a Railway address, the job ran in the
container and nothing has been proven — stop and find out why.

## Keep it running

Use the **daemon**, not the agent. A LaunchAgent starts when a user logs in; a mini
that reboots at 3am and stops at the login window runs no agent, and there is nothing
in the log to say so — the jobs just stay `pending`. A LaunchDaemon starts at boot with
nobody logged in. It still runs as you, not as root, so it can read the chmod-600 token.

```bash
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$(which node)|g" -e "s|__USER__|$(id -un)|g" \
    worker/com.eternalgy.gmapworker.daemon.plist > /tmp/gmapworker.plist
sudo install -o root -g wheel -m 644 /tmp/gmapworker.plist \
    /Library/LaunchDaemons/com.eternalgy.gmapworker.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.eternalgy.gmapworker.plist
tail -f ~/Library/Logs/gmap-worker.log
```

To stop it: `sudo launchctl bootout system/com.eternalgy.gmapworker`. Re-run the four
lines above after a `git pull` that changes the worker, or after any Node change.

`com.eternalgy.gmapworker.plist` (no `.daemon`) is the LaunchAgent version. It is kept
only for a mini that is already set to log in automatically; on anything else it is the
trap described above.

### The agy lane — a LaunchAgent, and why it cannot ride the daemon

agy on this machine was signed in interactively and keeps no OAuth token file
under `~/.gemini/antigravity-cli` — unlike the container, where the entire
paste-the-code apparatus in `agy-lab` exists precisely because there is no keyring
to fall back on. A system-domain process has no login session and no unlocked
login keychain, so an agy started there may find itself signed out in the one
place nobody is reading. That has not been measured either way. What *has* been
measured is the logged-in session: agy answers in ~10s from an Aqua session, which
is where a LaunchAgent runs. So the agy lane is an agent, deliberately, and pays
the price the daemon exists to avoid.

```bash
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$(which node)|g" \
    worker/com.eternalgy.gmapworker.agy.plist \
    > ~/Library/LaunchAgents/com.eternalgy.gmapworker.agy.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.eternalgy.gmapworker.agy.plist
tail -f ~/Library/Logs/gmap-worker-agy.log
```

No `sudo`: it is a user job in the user's own domain. Stop it with
`launchctl bootout gui/$(id -u)/com.eternalgy.gmapworker.agy`, and re-run both
lines after a `git pull` that changes the worker or after any Node change — the
plist bakes in an absolute Node path exactly like the daemon's.

**An agent starts at login, not at boot.** Pay for that with automatic login:
System Settings → Users & Groups → Automatic login, set to this account. It asks
for the account password, so it is a human's job, not a script's. FileVault has to
stay off for it to work at all — a FileVault boot stops for the disk password
before any account logs in. Until automatic login is on, `agy@mini` lives exactly
as long as the login session does, and the cloud's answer to a bare `agy` quietly
goes back to the container.

`macmini-ego` has the same gap and no plist at all yet. The same agent shape fits
it — ego lite is a GUI app and cannot run in the system domain either — with
`WORKER_NAME` and `WORKER_TYPES` changed.

**Check what `$(which node)` actually resolved to.** launchd needs an absolute path, so
that sed bakes one in permanently. If Node came from nvm rather than brew it will be
version-specific — `~/.nvm/versions/node/v24.13.1/bin/node` — and the day that version is
uninstalled or switched away from, the plist points at nothing. It fails at boot, where
nobody is looking. Either install Node with brew so the path is `/opt/homebrew/bin/node`,
or re-run the sed after any Node change.

**Power.** A sleeping mini answers no polls, and the queue will simply say `pending`
forever with no error anywhere. The two settings live in System Settings → Energy, but
set and verify them from the shell — the checkbox labels move between macOS versions and
`pmset` does not:

```bash
sudo pmset -a autorestart 1   # come back by itself after a power cut
sudo pmset -a sleep 0         # never sleep the machine
pmset -g | grep -E 'autorestart|^ sleep'
```

Both must read what you set them to. `displaysleep` does not matter; only the machine
sleeping does.

## Reading the failure modes

| What you see | What it is |
|---|---|
| `FATAL: 401 — LAB_TOKEN is wrong or was rotated` | the worker exits on purpose. Retrying a bad token forever looks identical to working. |
| `poll failed (…) — retrying in 5s`, doubling to 60s | the lab is down or redeploying. It reconnects by itself; nothing to do. |
| a burst of `poll failed (fetch failed)` right after a reboot | the daemon starts before the network is up. It backs off to 60s and connects when the link comes back — on this mini it took about 4 minutes. Expected, not a fault. |
| a job sits `pending` and the worker log is silent | the mini is asleep, or the process is not running. `sudo launchctl list \| grep gmapworker`. |
| nothing at all in the log after a reboot | the job was installed as an agent, not a daemon, and nobody logged in. |
| a job goes back to `pending` on its own | its lease expired — the worker died mid-job. Three of those and the job fails with a message saying so. |
| the worker stops coming back after a Node upgrade | the plist holds the absolute path baked in at install. Re-run the `sed` line above. |
| `chatgpt@mini` fails `task space not found: <n>` after a reboot | task space ids do not survive a browser restart. Register the space by NAME in `~/.gmap-worker/spaces.json` (`"space": "chatgpt-pro"`), not by number — `useOrCreateTaskSpace` then rebuilds it on demand, and the login lives in the profile's cookie jar, which does survive. The profile guard keeps the rebuild honest. |
| `agy@mini` or `chatgpt@mini` is missing from `/v1/models` | no lane is claiming that type. Either the process is dead, or it is running code older than the handler — a worker only advertises the types it had when it started, so restart it after a `git pull`. |
| a job fails with `logged_out: agy is not signed in` | agy's own Google session expired. Sign in again interactively on this machine; nothing in the worker stores a credential to refresh. |
| a `chatgpt.ask` fails `wrong_profile` | the task space in `spaces.json` is gone, and ego lite created a fresh one on whatever profile is default — which answers as the wrong account. Fix the space id, or make the right profile default in the GUI and rebuild it. |
| every `agy` lane job stops at exactly 300s | `AGY_TIMEOUT_MS`, the default. A long agent run needs `timeoutMs` in the payload, and the caller's own timeout raised to match. |

## Configuration

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; from `~/.gmap-worker.env` or the environment |
| `LAB_URL` | `https://ee-auto.up.railway.app` | |
| `WORKER_NAME` | `os.hostname()` | what `GET /api/jobs` reports |
| `WORKER_TYPES` | empty | comma-separated. Empty gives the two default lanes; set, it pins the process to one lane taking exactly these types. See [Lanes](#lanes) |
| `WORKER_ENV_FILE` | `~/.gmap-worker.env` | |
| `AGY_BIN` | `~/.local/bin/agy` | |
| `AGY_TIMEOUT_MS` | 300000 | ceiling for one `agy.ask`; the payload's `timeoutMs` wins when it is set |
| `CGPT_ASK_TIMEOUT_MS` | 180000 | how long to wait for a ChatGPT answer to stop growing |
| `CGPT_TRACE` | off | `1` narrates the answer-wait, phase by phase |
| `EGO_BROWSER_BIN` | `ego-browser` on `PATH` | the worker prepends `~/.local/bin`, which launchd does not inherit |
| `CGPT_SPACE`, `CGPT_PROFILE` | — | override `spaces.json` for one process |
| `PG_PROXY_URL`, `PG_DB_NAME`, `PG_PROXY_TOKEN` | — | where `gmap.scan` writes its rows; a scan still returns them if this fails |
