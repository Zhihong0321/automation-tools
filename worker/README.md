# The home worker

A ~150-line loop that asks the lab for a job, runs it on this machine, and posts the
answer back. It runs on the Mac mini because that machine is on a **home IP**, and a
Google Maps scan from a datacenter IP comes back thin instead of coming back an error.

It only ever makes outbound requests. Nothing needs to be opened on the router.

```
GET  /api/jobs/next?worker=<name>&wait=25   held open ~25s, 204 when idle
POST /api/jobs/<id>/result                  {ok, result, error}
```

Today it handles exactly one job type — `ping` — because the point of the first
version is to prove the connection, not to do work. `gmap.scan` lands in the same
`handlers` map once the ping round-trips.

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

## Configuration

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; from `~/.gmap-worker.env` or the environment |
| `LAB_URL` | `https://ee-auto.up.railway.app` | |
| `WORKER_NAME` | `os.hostname()` | what `GET /api/jobs` reports |
| `WORKER_TYPES` | empty (any) | comma-separated, e.g. `gmap.scan` — set it once a second worker exists |
| `WORKER_ENV_FILE` | `~/.gmap-worker.env` | |
