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

```bash
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$(which node)|g" \
    worker/com.eternalgy.gmapworker.plist > ~/Library/LaunchAgents/com.eternalgy.gmapworker.plist
launchctl load ~/Library/LaunchAgents/com.eternalgy.gmapworker.plist
tail -f ~/Library/Logs/gmap-worker.log
```

`launchctl unload` to stop it, and re-run the two lines above after a `git pull` that
changes the worker.

> **System Settings → Energy:** turn on *Start up automatically after a power failure*
> and *Prevent automatic sleeping when the display is off*. A sleeping mini answers no
> polls, and the queue will simply say `pending` forever with no error anywhere.

## Reading the failure modes

| What you see | What it is |
|---|---|
| `FATAL: 401 — LAB_TOKEN is wrong or was rotated` | the worker exits on purpose. Retrying a bad token forever looks identical to working. |
| `poll failed (…) — retrying in 5s`, doubling to 60s | the lab is down or redeploying. It reconnects by itself; nothing to do. |
| a job sits `pending` and the worker log is silent | the mini is asleep, or the process is not running. `launchctl list \| grep gmapworker`. |
| a job goes back to `pending` on its own | its lease expired — the worker died mid-job. Three of those and the job fails with a message saying so. |

## Configuration

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; from `~/.gmap-worker.env` or the environment |
| `LAB_URL` | `https://ee-auto.up.railway.app` | |
| `WORKER_NAME` | `os.hostname()` | what `GET /api/jobs` reports |
| `WORKER_TYPES` | empty (any) | comma-separated, e.g. `gmap.scan` — set it once a second worker exists |
| `WORKER_ENV_FILE` | `~/.gmap-worker.env` | |
