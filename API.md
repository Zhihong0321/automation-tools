# The gateway — agy, ChatGPT and Meta AI as one API

Three engines behind one HTTP surface, in the OpenAI chat-completions shape, so a
tool that already talks to an LLM only has to change a base URL.

```
Base URL   https://ee-auto.up.railway.app/v1
API key    the LAB_TOKEN of this service
Models     agy | chatgpt | chatgpt:<session> | meta | meta:<session>
Locations  <model>@mini | <model>@container      (agy and chatgpt run in both)
Reference  https://ee-auto.up.railway.app/docs   (the same surface, laid out to read)
```

| Engine | What it actually is | Typical |
|---|---|---|
| `agy` | the Antigravity CLI, signed in with a Google account, run with `-p` | ~14s container, ~9s mini |
| `chatgpt` | a signed-in ChatGPT session in a real Chrome, typed into and read back | ~15s container, ~6s mini |
| `meta` | OpenCode + Muse 1.2 on the Mac mini; capability-gated when Meta pages require login | ~5–45s |

None of the three is a hosted API. Every call is a real CLI run or a real browser
doing what a person would do, and the limits at the bottom of this page follow
from that.

**Two locations.** `agy` and `chatgpt` each run in two places: in this container,
and on a Mac mini at home that claims them off the [job queue](#jobs--work-sent-to-a-machine-at-home).
They are different machines with different accounts, not replicas. `meta` is
container-only. Suffix any model with `@mini` or `@container` to pin it; a bare
name is pooled — see [Models](#models).

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
| `POST /api/business-search` | start a Google Maps business-list report |
| `POST /api/company-research` | start a multi-round company deep-research report |
| `GET /r/:id` | mobile-first public report page; opaque share id, no bearer token |

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
| `meta@mini`, `meta:<id>@mini` | Meta AI on the residential Mac mini |
| *(empty)*, `auto` | `DEFAULT_MODEL`, which is `agy` unless set |
| `<any of the above>@container` | that engine here, in this container |
| `agy@mini`, `chatgpt@mini` | that engine on the Mac mini. `@macmini` is accepted too |
| `chatgpt:<id>@mini` | a ChatGPT account in the **mini's** registry — the two registries are separate, and a container session name means nothing there |

An unknown suffix is a 404 (`Unknown location "@x". Use @mini or @container.`),
and `meta@mini` is a 404 because the mini does not run it.

`gpt-*` maps to ChatGPT because tools hard-code a model id far more often than
they let you pick one. The response always names the model that actually ran, so
the substitution is never silent: check `.model` and `.agy_lab.engine`.

A bare `chatgpt` or `meta` resolves to `CGPT_DEFAULT_SESSION` / `META_DEFAULT_SESSION`
if set, otherwise the first session of that kind whose last probe said `ready`.
Sessions of the two kinds are separate: `meta:` names never resolve against a
ChatGPT profile, or the reverse. A bare `chatgpt` that lands on the mini takes
`MINI_DEFAULT_SESSION` (`mini-main`) instead, for the same reason.

**Which location a bare name gets.** An explicit `@mini` / `@container` always
wins. A bare name is pooled and **prefers the mini whenever a mini worker is
live**, because the mini is the capacity that was added — sending pooled traffic
to the container first would leave the new machine idle and keep the old
bottleneck. It falls back to the container the moment the mini stops polling.
`ROUTING_PREFER=container` inverts it.

"Live" is not configuration: it is the job types the mini's lanes claimed when
they last checked in, which `GET /v1/models` reports per entry as `ready` plus the
`workers` claiming it. A pinned `@mini` call to an engine nothing is claiming is a
503 up front (`No mini worker is claiming agy.ask right now.`) rather than a job
that sits `pending` until it times out. The mini's own side of this — which
process advertises what, and why they are separate — is
[worker/README.md](worker/README.md).

`@mini` and `@container` pin a location. A bare engine prefers a live mini
worker and falls back to the container. For Meta AI the mini is the production
path: Railway is currently served the country-unavailable page even with a
signed-in imported profile.

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

## Business intelligence pipeline

Human reference: <https://ee-auto.up.railway.app/docs>

OpenAPI 3.1: <https://ee-auto.up.railway.app/openapi.json>

End-user workspace: <https://ee-auto.up.railway.app/research>

Both workflows are asynchronous. A POST returns HTTP `202` with a stable opaque
report id, an authenticated `api_url` for polling, and a public mobile `view_url`.

```
POST business-search → poll api_url → data.companies[].id
                     → POST company-research → poll api_url → data.final
                                             → share view_url
```

Terminal statuses are `completed`, `partial`, and `failed`. `partial` is still
publishable: one or more rounds had a gap, but only evidence-ledger fields were
released. Poll every 5–10 seconds; repeating a POST creates a separate report.

### 1. Search for a business list

```bash
curl -sS https://ee-auto.up.railway.app/api/business-search \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" -H 'content-type: application/json' \
  -d '{"keyword":"solar installer","place":"Kuala Lumpur","max":40,"requesterId":"crm-42"}'
```

Request fields:

At least one of `keyword` or `place`/`location` is required. A location-only
request such as `{"place":"Petaling Jaya","max":25}` is valid.

| Field | Required | Meaning |
|---|---:|---|
| `keyword` | conditional | business category, service, or keyword; omit when searching only by location |
| `place` | conditional | city, district, state, or country; omit when searching only by keyword; `location` is an alias |
| `max` | no | 1–200, default 100 |
| `requesterId` | no | caller-owned correlation id; `userId` is an alias |
| `timeoutMs` | no | worker deadline, default 600000; the POST remains asynchronous |

```json
{
  "report": {
    "id": "AbCdEfGhIjKlMnOpQrSt",
    "type": "business_search",
    "status": "queued",
    "api_url": "https://ee-auto.up.railway.app/api/business-search/AbCdEfGhIjKlMnOpQrSt",
    "view_url": "https://ee-auto.up.railway.app/r/AbCdEfGhIjKlMnOpQrSt"
  }
}
```

Poll `GET report.api_url` with the bearer token. Completed results are under
`data.companies`. Each row includes `id`, `place_id`, `name`, `rating`, `reviews`,
`category`, `address`, `phone`, `website`, `maps_url`, and `rank`.

The `id` at `data.companies[].id` is the input to deep research. It is not the
Google place id and not the 20-character report id.

### 2. Deep-research one company

```bash
curl -sS https://ee-auto.up.railway.app/api/company-research \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" -H 'content-type: application/json' \
  -d '{"companyId":"69","requesterId":"crm-42"}'
```

Poll the returned `report.api_url`. Final requester output is at `data.final`:
`entity`, `summary`, `contacts`, `people`, `signals`, `outreach_angles`,
`conflicts_and_unknowns`, and `synthesis_mode`.

Company dossiers are bilingual. `data.final` is the canonical English report;
`data.final_cn` is the matching Simplified Chinese (`zh-CN`) translation. The
Chinese version preserves source URLs, evidence IDs, email addresses, phone
numbers and published contact values exactly. Translation status and model
metadata are in `data.translation`; a missing `final_cn` means the report is
`partial` and the English evidence report remains available.

The authenticated response also includes `research_run.round01` through
`round04`, `validated_ledger`, `final_report`, and `round_status` for benchmarking:

- `round01`: Gemini discovery;
- `round02`: split ChatGPT audits for contacts, people, and signals;
- `round03`: capability-gated Meta/Muse social evidence;
- `round04`: Gemini synthesis plus fidelity validation.

Only rows with direct HTTPS evidence enter the validated ledger. If Round 04
changes validated person/contact ids or introduces a URL, the synthesis is
rejected and `synthesis_mode` is `validated_ledger_fallback`.

| Route | Auth | Returns |
|---|---|---|
| `POST /api/business-search` | bearer | `202` and report envelope |
| `GET /api/reports` | bearer | combined report library; filter by `type`, `status`, `limit`, `offset` |
| `GET /api/business-search/:reportId` | bearer | status and `data.companies` |
| `POST /api/company-research` | bearer | `202` and report envelope |
| `GET /api/company-research/:reportId` | bearer | status, `data.final`, and raw benchmark rounds |
| `GET /r/:reportId` | opaque id | mobile human report |
| `GET /public/reports/:reportId` | opaque id | public final JSON, never raw rounds |

Set `TRANSLATION_API_KEY` and optionally `TRANSLATION_BASE_URL` (defaults to
the configured e-router `/v1` endpoint) and `TRANSLATION_MODEL` (defaults to
`step-3.7-flash`) on the Railway service to enable the Chinese report
translation. Keep these service variables out of the repository.

The Railway service should be linked to Postgres through `DATABASE_URL`. The
pg-proxy fallback is supported, but its short-lived bearer is not suitable as the
permanent production connection.

Set a separate 16+ character `PORTAL_TOKEN` before giving `/research` to end
users. That token is accepted only by the business-search, company-research, and
report-library routes; it cannot access the operator shell or model/session APIs.

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
| `POST /api/jobs/heartbeat` | `{worker, types}`. The worker's check-in while a job is in its hands. The claim above is silent for as long as the handler runs, and a research round runs minutes — past that, the lane ages out of the live table and the gateway starts refusing engines this machine is serving. Types are re-sent every beat so a restarted lab learns the lane again. Not logged. |
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
| `chatgpt.ask` | `{id, prompt, timeoutMs?}` | `{ok, answer, ms}` — what `chatgpt@mini` is underneath |
| `chatgpt.probe` | `{id}` | `{status, detail}` |
| `agy.ask` | `{prompt, tools?, timeoutMs?}` | `{engine, answer, ms}` — what `agy@mini` is underneath |
| `agy.probe` | none | `{status, detail, sample}` |

The four wrapper types are the transport for the mini's half of `/v1`; a caller
that wants an answer should use `/v1/chat/completions` with `@mini` and let the
gateway do the queueing. They are listed because a job that failed is read here,
and because the worker reports engine failure *inside* a `done` job — `ok: false`
with a `code`, which the gateway maps to 503 (`signed_out`, `no_space`), 504
(`answer_timeout`) or 502.

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
| `mini` | 2 | everything routed `@mini` | per engine, as above |

The mini is its own lane rather than extra width on `browser`: it is a different
machine with a different account and its own browser, so sharing would serialise
two things that have no reason to wait for each other. Its ceiling is accounts,
not browsers — ego lite runs each account in its own task space, and two side by
side is what has been measured (8.9s for a pair, not 16.1s serial).

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

**Meta AI runs on the residential mini.** The Railway address is currently served
"Meta AI isn't available yet in your country" even for the previously imported,
signed-in profile. The mini worker claims `meta.ask` and drives a Meta task space
through ego-browser. `meta@container` remains available for diagnosis, but it is
not expected to answer while that address gate is active.

**A signed-out ChatGPT session is a 503, deliberately.** The logged-out page still
has a working composer, so a naive wrapper types into it and returns an anonymous
answer that looks fine and is worthless. The gateway checks for a sign-in wall and
refuses instead. Fix it with `POST /api/cgpt/:id/login`.

**Nothing re-logs-in on its own.** `GET /v1/models` reports each session's last
probe; a monitor that cares should probe and re-login rather than wait for a 503.

**The mini is a machine in a house, and it answers only while it is polling.**
Nothing here can start it. If its worker is not running — the process died, the
mini slept, the login session ended — `@mini` entries drop out of `/v1/models`,
a pinned `@mini` call is a 503, and a bare name silently goes back to the
container at container speed. That last one is the failure worth naming, because
it looks like nothing at all: check `.model` in the response, which always says
where the answer actually came from.

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
| `MINI_META_DEFAULT_SESSION` | `meta-main` | which mini task-space registry entry a bare `meta@mini` means |
| `META_ASK_TIMEOUT_MS` | `CGPT_ASK_TIMEOUT_MS` | |
| `AGY_ASK_TIMEOUT_MS` | 300000 | |
| `CGPT_ASK_TIMEOUT_MS` | 180000 | |
| `AGY_MAX_CONCURRENT` | 2 | agy runs in flight at once |
| `MINI_MAX_CONCURRENT` | 2 | calls in flight on the mini - that lane's width |
| `MINI_DEFAULT_SESSION` | `mini-main` | which of the mini's accounts a bare `chatgpt@mini` means |
| `ROUTING_PREFER` | `mini` | where a bare model name goes when both locations are live |
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
