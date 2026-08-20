# The gateway — agy, ChatGPT and Meta AI as one API

Three engines behind one HTTP surface, in the OpenAI chat-completions shape, so a
tool that already talks to an LLM only has to change a base URL.

```
Base URL   https://ee-auto.up.railway.app/v1
API key    the LAB_TOKEN of this service
Models     agy | chatgpt | chatgpt:<session> | meta | meta:<session>
Reference  https://ee-auto.up.railway.app/docs   (the same surface, laid out to read)
```

| Engine | What it actually is | Typical |
|---|---|---|
| `agy` | the Antigravity CLI, signed in with a Google account, run with `-p` | ~14s for a one-line answer |
| `chatgpt` | a signed-in ChatGPT session in a real Chrome, typed into and read back | ~15s for a short answer |
| `meta` | a signed-in meta.ai session in a real Chrome, same way | ~10s for a short answer |

None of the three is a hosted API. Every call is a real CLI run or a real browser
doing what a person would do, and the limits at the bottom of this page follow
from that.

---

## Call it

```bash
curl -s https://ee-auto.up.railway.app/v1/chat/completions \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"agy","messages":[{"role":"user","content":"Capital of Malaysia? One word."}]}'
```

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "agy",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Kuala Lumpur" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 11, "completion_tokens": 4, "total_tokens": 15, "estimated": true },
  "agy_lab": { "engine": "agy", "ms": 13708 }
}
```

With the OpenAI SDK, unchanged:

```python
from openai import OpenAI
client = OpenAI(base_url="https://ee-auto.up.railway.app/v1", api_key=LAB_TOKEN)
client.chat.completions.create(model="chatgpt", messages=[{"role": "user", "content": "..."}])
```

```ts
const client = new OpenAI({ baseURL: 'https://ee-auto.up.railway.app/v1', apiKey: LAB_TOKEN });
await client.chat.completions.create({ model: 'agy', messages: [{ role: 'user', content: '...' }] });
```

Set the client's timeout to at least 3 minutes. A default of 60s will cut off
answers this thing can produce.

---

## The endpoints

| Call | Does |
|---|---|
| `POST /v1/chat/completions` | the OpenAI shape, `stream: true` supported |
| `GET /v1/models` | what this box can currently route to, and whether each is signed in |
| `POST /api/ask` | the native shape: `{model, prompt}` in, `{answer, ms}` out |

`/api/v1/chat/completions` is the same route, for a client that insists on
appending `/v1` to a base URL that already has it.

### Models

| Name | Routes to |
|---|---|
| `agy`, `antigravity` | the agy CLI |
| `chatgpt`, `openai` | the default ChatGPT session |
| `chatgpt:<id>` | that ChatGPT session by name — one per account |
| `gpt-4o`, `gpt-*`, `o1*` … | the default ChatGPT session |
| `meta`, `metaai`, `llama-*` | the default Meta AI session |
| `meta:<id>` | that Meta AI session by name |
| *(empty)*, `auto` | `DEFAULT_MODEL`, which is `agy` unless set |

`gpt-*` maps to ChatGPT because tools hard-code a model id far more often than
they let you pick one. The response always names the model that actually ran, so
the substitution is never silent: check `.model` and `.agy_lab.engine`.

A bare `chatgpt` or `meta` resolves to `CGPT_DEFAULT_SESSION` / `META_DEFAULT_SESSION`
if set, otherwise the first session of that kind whose last probe said `ready`.
Sessions of the two kinds are separate: `meta:` names never resolve against a
ChatGPT profile, or the reverse.

### The native shape

```bash
curl -s https://ee-auto.up.railway.app/api/ask \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"chatgpt","prompt":"...","timeoutMs":240000}'

{"model":"chatgpt:openai-waynecollins","engine":"chatgpt","answer":"...","ms":15389,"settled":true}
```

`settled: false` means the answer stopped growing because the clock ran out, not
because the model had finished — the text is real but partial. In the OpenAI shape
the same fact appears as `finish_reason: "length"`.

`tools: true` on either shape runs agy with `--dangerously-skip-permissions`, so
it can touch the filesystem inside the container. Off by default, per call, never
inherited.

---

## Jobs — work sent to a machine at home

Google Maps cannot be scanned from this container. Google does not block a
datacenter IP, it **degrades** it: the search that returns ~100 businesses from a
home line returns ~60 from a rented one, with no error and no captcha. A scan run
here is thin and looks complete, which is worse than one that fails.

So the scan runs on a Mac mini at home and this queue is how it is reached. The
mini is behind NAT with no public address, so the direction is inverted — it
long-polls for work rather than being called. No tunnel, no port forwarding, no
dynamic DNS, nothing on the home router.

| Route | Does |
|---|---|
| `POST /api/jobs` | `{type, payload, timeoutMs}` → 201 with the job, status `pending` |
| `GET /api/jobs/next?worker=&wait=&types=` | the worker's claim. Held open up to 25s; `204` when idle, `200` with the job otherwise. Answers instantly if one is already queued. |
| `POST /api/jobs/:id/result` | `{ok, result, error}` → the job becomes `done` or `failed` |
| `GET /api/jobs/:id` | status and result |
| `GET /api/jobs` | the queue, plus every worker and when it last checked in |

```bash
ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' -d '{"type":"ping"}' | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result
```

```json
{"hostname":"macmini","platform":"darwin 24.5.0 arm64","publicIp":"…the home line…"}
```

`publicIp` is the field worth reading: it is what the internet sees when that machine
makes a request, and a Railway address there would mean the job never left this
container.

### Job types

| type | payload | returns |
|---|---|---|
| `ping` | none | `{hostname, platform, node, publicIp, uptimeSec, at}` |
| `gmap.scan` | `{keyword, place?, max?, userId?}` | `{businesses[], found, capped, blocked, blockedReason, limitedView, saved}` |

```bash
ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"gmap.scan","timeoutMs":600000,
          "payload":{"keyword":"aircon service","place":"Johor Bahru","max":40,"userId":"u-123"}}' \
     | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result
```

```json
{"query":"aircon service Johor Bahru","found":40,"blocked":false,"capped":true,
 "limitedView":true,"saved":{"reportId":3,"companies":40,"linked":40},
 "businesses":[{"name":"…","rating":4.7,"category":"…","address":"…","phone":"…","website":"…","mapsUrl":"…"}]}
```

**Give it room.** A scan takes 12-60s depending on `max`, so pass a `timeoutMs` above
the default — `600000` is the working figure. `max` caps the results and defaults to 200.

**Read `found` before `businesses.length`.** `found` is `null` whenever `blocked` is
true, and that is deliberate rather than missing: Google degrades a throttled search
instead of erroring, so an empty feed and a town with no such trade are the same
observation. Recording either as `0` is the one thing that would quietly poison the
dataset, so a blocked scan carries no count and `blockedReason` says which signal
fired. `limitedView` marks a signed-out page, which is also why `reviews` comes back
null.

**Results are persisted.** The worker writes each scan to Postgres itself —
`company_data`, `search_report` and the link between them, deduped on Google's place
id. `saved` reports what landed; if it is null, `saveError` says why and the rows
still come back in the response.

**In memory, and leased.** Jobs live in a Map and are lost on redeploy — about six
minutes of exposure, accepted while the transport is still being proven. Each job
carries a lease instead: one still `running` past its `timeoutMs` returns to
`pending`, up to three times, then fails with a message saying so. A queue that
strands work silently is worse than one that loses it visibly.

The long poll is not written to the request log — one request every 25s forever
would be ~3,500 records a day burying everything else. Result posts and failures
still are.

The worker itself is `worker/macmini.mjs`; `worker/README.md` is how it is installed
and `docs/plan-macmini-worker.md` is why it exists and what comes next.

---

## The queue

Every engine here is a personal account with a human usage limit, so calls are
admitted rather than accepted. **An admitted call waits; it does not fail** - an
answer at +40s beats an error at +0s. It is refused up front only when waiting
would be worse than being told no.

| Lane | At once | Engines | Spacing |
|---|---|---|---|
| `browser` | 1 | `chatgpt` + `meta` - the container has one Chrome | 2s between calls |
| `agy` | 2 | `agy` | none |

Slots are per lane; spacing, caps and counters are per engine, because the lane is
a machine limit and the account that gets rate-limited is not.

Three refusals, all 429 with `Retry-After` and a `queue` snapshot in the body:

| `type` | Fires when |
|---|---|
| `rate_limit_exceeded` | the engine's hourly cap is used up (off unless `*_HOURLY_LIMIT` is set) |
| `queue_full` | more than `QUEUE_MAX_DEPTH` (10) are already waiting in that lane |
| `queue_too_slow` | the estimate exceeds `QUEUE_MAX_WAIT_MS` (300s) |

A call that waited reports `agy_lab.queuedMs` (native shape: `queuedMs`). A queued
**stream** narrates the wait in SSE comment lines - `: queued ahead=3 eta=41s`, then
`: waiting` every 15s - so no intermediary mistakes a silent socket for a dead one.
Hanging up cancels the work. `GET /api/queue` shows what is running, waiting and
spaced right now.

`POST /api/cgpt/:id/ask` goes through the same queue. A path to an account that
skips the spacing is not a shortcut; it is the one call that gets it limited.

---

## Logs

| Call | Does |
|---|---|
| `GET /api/logs` | one record per request, newest first |
| `GET /api/logs/errors` | the same, filtered to 4xx/5xx and anything that recorded a failure |

Filters: `limit`, `errors=1`, `engine`, `status`, `since`, `path`, and `date=YYYY-MM-DD`
to read a day off the volume instead of memory. The last 1000 records stay in
memory; every record is appended to `/data/logs/api-YYYY-MM-DD.jsonl`.

Each record carries `engine`, `model`, `stream`, `promptChars`, `promptHead` (first
140 chars), `answerChars`, `queuedMs` and `engineMs` - the last pair is what says
whether the gateway or the engine was slow - plus `status`, `ms`, `ip`, `ua` and
`error: {type, message}`.

**The token is never logged.** It arrives in a header and, for clients that cannot
set one, in `?token=` - so the query string is stored with that parameter redacted.
Records start before the auth check, so a rejected token shows up as a 401 rather
than as nothing at all. `LOG_PROMPTS=0` keeps sizes and drops previews.

---

## What the OpenAI shape promises and this cannot keep

- **Sampling parameters do nothing.** `temperature`, `top_p`, `max_tokens`, `seed`,
  `stop`, `response_format` — a browser session has no such knobs and agy's `-p`
  takes none. They are accepted, ignored, and listed back in `agy_lab.ignored` so
  a caller can see they had no effect rather than assume they worked.
- **Token counts are an estimate**, characters ÷ 4, marked `"estimated": true`.
  No engine here reports real usage.
- **`n > 1` is refused**, not faked. Each call is one real model run.
- **No function calling, no logprobs, no image input.** An image part in a message
  is replaced with `[unsupported content part: image_url]` rather than dropped, so
  a prompt that depended on it fails visibly.
- **History is flattened into one prompt.** No engine here takes a message array:
  system messages come first verbatim, then `User:` / `Assistant:` turns. A single
  user message is passed through unlabelled.
- **Every browser call starts a new chat** — a temporary chat on ChatGPT, a new
  thread on Meta AI. There is no server-side conversation to continue, so send the
  history you want considered.

Streaming is real for the two browser engines (the answer is polled as it renders,
~1.5s granularity) and single-shot for agy, which prints only when it is done.

---

## Limits that will bite you

**One browser at a time, across both browser engines.** `MAX_OPEN_BROWSERS=1`,
LRU-evicted, closed after five minutes idle. ChatGPT and Meta AI share that one
slot: calls to them serialise, and alternating between them evicts the other
profile, which costs about a second per call - measured 9.6s for a warm Meta AI
call against 10.4s for the same one right after a ChatGPT call. agy is a CLI and runs up to
`AGY_MAX_CONCURRENT` (2) alongside. This is a pipeline back-end, not a fan-out one.

**Answers are read from `innerText`.** A long fenced code block does not always
read back whole, and asking for one big JSON blob is the shape most likely to come
back truncated. Ask for line records instead.

**A Meta AI session cannot be re-logged-in from here.** meta.ai refuses a login
from this container's address — "Meta AI isn't available in your region" — while
the same account signs in fine from a residential connection, and a session minted
there replays from here without complaint. So the session is minted locally and
imported: `node scripts/meta-login.mjs --token $LAB_TOKEN` in the eter-browser
project. Full measurements in [META-AI.md](META-AI.md).

**A signed-out ChatGPT session is a 503, deliberately.** The logged-out page still
has a working composer, so a naive wrapper types into it and returns an anonymous
answer that looks fine and is worthless. The gateway checks for a sign-in wall and
refuses instead. Fix it with `POST /api/cgpt/:id/login`.

**Nothing re-logs-in on its own.** `GET /v1/models` reports each session's last
probe; a monitor that cares should probe and re-login rather than wait for a 503.

### Status codes

| Code | Means |
|---|---|
| 401 | bad or missing token |
| 404 | unknown model, or a session that does not exist |
| 400 | a request the gateway will not fake (`n>1`, empty messages) |
| 503 | the engine exists but is not signed in / not installed |
| 504 | the engine took longer than `timeoutMs` |
| 502 | the engine ran and failed — the message says how |

In a stream the status line is already sent, so a failure arrives as a final
`data: {"error":{...}}` chunk before `data: [DONE]`.

---

## Environment

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; the API key for everything under `/api` and `/v1` |
| `DEFAULT_MODEL` | `agy` | what an empty or `auto` model resolves to |
| `CGPT_DEFAULT_SESSION` | first `ready` | which account a bare `chatgpt` means |
| `META_DEFAULT_SESSION` | first `ready` | which account a bare `meta` means |
| `META_ASK_TIMEOUT_MS` | `CGPT_ASK_TIMEOUT_MS` | |
| `AGY_ASK_TIMEOUT_MS` | 300000 | |
| `CGPT_ASK_TIMEOUT_MS` | 180000 | |
| `AGY_MAX_CONCURRENT` | 2 | agy runs in flight at once |
| `MAX_OPEN_BROWSERS` | 1 | Chrome profiles open at once - the browser lane's width |
| `CGPT_MIN_GAP_MS`, `META_MIN_GAP_MS` | 2000 | spacing between calls to that account |
| `AGY_MIN_GAP_MS` | 0 | |
| `QUEUE_MAX_DEPTH` | 10 | waiting calls before 429; `CGPT_MAX_QUEUE` etc. override per engine |
| `QUEUE_MAX_WAIT_MS` | 300000 | longest wait the gateway will promise |
| `*_HOURLY_LIMIT` | off | calls per rolling hour, per engine |
| `LOG_MEMORY` | 1000 | records kept in memory |
| `LOG_PROMPTS` | on | `0` drops prompt previews |

The rest of the service — installing agy, driving a login, the DOM observation
layer — is in [agy-lab/README.md](agy-lab/README.md) and
[CHATGPT-PROGRESS.md](CHATGPT-PROGRESS.md).
