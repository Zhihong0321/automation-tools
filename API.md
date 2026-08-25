# The gateway — agy and ChatGPT as one API

Two engines behind one HTTP surface, in the OpenAI chat-completions shape, so a
tool that already talks to an LLM only has to change a base URL. Behind the same
token sit the research pipelines and the workers at home that do the crawling.

```
Base URL   https://ee-auto.up.railway.app/v1
API key    the LAB_TOKEN of this service
Models     agy | chatgpt | chatgpt:<session>
Locations  <model>@mini | <model>@container      (both engines run in both)
Reference  https://ee-auto.up.railway.app/docs   (the same surface, laid out to read)
```

| Engine | What it actually is | Typical |
|---|---|---|
| `agy` | the Antigravity CLI, signed in with a Google account, run with `-p` | ~14s container, ~9s mini |
| `chatgpt` | a signed-in ChatGPT session in a real Chrome, typed into and read back | ~15s container, ~6s mini |

Neither is a hosted API. Every call is a real CLI run or a real browser doing what
a person would do, and the limits at the bottom of this page follow from that.

> **`meta` is retired.** There is no Meta AI engine any more — not in the
> container, not on the mini. See [Meta AI — retired](#meta-ai--retired). The
> Facebook work it was wanted for is [`fb.*`](#facebook-lead-enrichment--fb),
> which crawls the pages instead of asking a model what it can see.

**Two locations.** Both engines run in two places: in this container, and on a Mac
mini at home that claims them off the [job queue](#jobs--work-sent-to-a-machine-at-home).
They are different machines with different accounts, not replicas. Suffix any
model with `@mini` or `@container` to pin it; a bare name is pooled — see
[Models](#models).

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
| `POST /api/ads-research` | capture the ads a company is running on Facebook and Google |
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
| *(empty)*, `auto` | `DEFAULT_MODEL`, which is `agy` unless set |
| `<any of the above>@container` | that engine here, in this container |
| `agy@mini`, `chatgpt@mini` | that engine on the Mac mini. `@macmini` is accepted too |
| `chatgpt:<id>@mini` | a ChatGPT account in the **mini's** registry — the two registries are separate, and a container session name means nothing there |

An unknown suffix is a 404 (`Unknown location "@x". Use @mini or @container.`).
`meta`, `meta:<id>` and `llama-*` still parse, so an un-updated caller gets a clear
refusal rather than a routing error, but nothing claims them.

`gpt-*` maps to ChatGPT because tools hard-code a model id far more often than
they let you pick one. The response always names the model that actually ran, so
the substitution is never silent: check `.model` and `.agy_lab.engine`.

A bare `chatgpt` resolves to `CGPT_DEFAULT_SESSION` if set, otherwise the first
session whose last probe said `ready`. A bare `chatgpt` that lands on the mini
takes `MINI_DEFAULT_SESSION` (`mini-main`) instead, because the two registries are
separate.

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
worker and falls back to the container.

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
- `round03`: Facebook evidence, crawled read-only by the `fb.*` worker;
- `round04`: Gemini synthesis plus fidelity validation.

Only rows with direct HTTPS evidence enter the validated ledger. If Round 04
changes validated person/contact ids or introduces a URL, the synthesis is
rejected and `synthesis_mode` is `validated_ledger_fallback`.

**Round 03 changed.** It used to ask Meta/Muse whether it could see live Meta
pages and, if it said yes, what was on them — a model reporting on its own
capability, which is unauditable and mostly answered `no_live_access` with empty
arrays. It is now the [`fb.*` crawler](#facebook-lead-enrichment--fb) on the mini.
Three consequences worth planning for:

- It costs **crawl jobs, not a model call**: one `fb.company`, plus one
  `fb.discover` when a page is confirmed. Budget 1–4 minutes for the round and
  give `/api/company-research` room accordingly.
- `round_status.round03` is `skipped` when no worker is claiming `fb.company` —
  distinct from `failed`. The run continues on the other three rounds.
- `round03.access_mode` is now `live_facebook_pages` or `no_live_access`, and
  `round03.company_lookup` / `round03.people_lookup` hold the raw worker
  envelopes, so every ledger row can be traced back to the crawl that produced it.

| Route | Auth | Returns |
|---|---|---|
| `POST /api/business-search` | bearer | `202` and report envelope |
| `GET /api/reports` | bearer | combined report library; filter by `type`, `status`, `limit`, `offset` |
| `GET /api/business-search/:reportId` | bearer | status and `data.companies` |
| `POST /api/company-research` | bearer | `202` and report envelope |
| `POST /api/ads-research` | bearer | `202` and report envelope |
| `POST /api/ads-market` | bearer | `202` and report envelope |
| `GET /api/company-research/:reportId` | bearer | status, `data.final`, and raw benchmark rounds |
| `GET /api/ads-research/:reportId` | bearer | status, `data.final`, and the raw per-network captures |
| `GET /api/ads-market/:reportId` | bearer | status, `data.final`, the digest, and the written report |
| `GET /r/:reportId` | opaque id | mobile human report |
| `GET /public/reports/:reportId` | opaque id | public final JSON, never raw rounds |

The Chinese edition is translated by `TRANSLATION_MODEL` (defaults to `agy`)
through this service's own gateway, so it needs no endpoint and no key of its
own. It is produced AFTER the report is published: `GET /api/company-research/
:reportId` returns `data.final` as soon as the English dossier is validated, and
`data.final_cn` fills in a minute or two later. `data.translation.status` says
which of `completed`, `completed_with_discrepancies`, `failed` it reached.

The Railway service should be linked to Postgres through `DATABASE_URL`. The
pg-proxy fallback is supported, but its short-lived bearer is not suitable as the
permanent production connection.

Set a separate 16+ character `PORTAL_TOKEN` before giving `/research` to end
users. That token is accepted only by the business-search, company-research, and
report-library routes; it cannot access the operator shell or model/session APIs.

---

## Ads market research — `ads-market`

`ads-research` answers *what is this company running?*. `ads-market` answers *what is
happening in this market?* — one product keyword, every live Facebook ad matching it,
rolled up and written into a report.

```bash
curl -s https://ee-auto.up.railway.app/api/ads-market \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"keyword":"solar panel","country":"Malaysia"}'
```

| Field | Default | Does |
|---|---|---|
| `keyword` | required | the product keyword. `keywords: []` is also accepted, up to 8, fetched concurrently |
| `country` | `Malaysia` | mapped to the Ad Library's 2-letter region |
| `pages` | `12` | pages per keyword, 30 ads each — so 12 is up to 360 ads |
| `effort` | `high` | agy reasoning tier: `low` \| `medium` \| `high` |

**Facebook only, and not by choice.** The Google Ads Transparency Center has no keyword
search of ad content — its search is autocomplete over advertisers and websites. There
is no Google half of this question to capture.

**There is no spend, impressions or reach data in it.** Measured over 672 ads: all three
are null on 100% of Malaysian commercial ads; they carry data only for political and
issue ads under disclosure mandates. Advertisers are therefore ranked by ad count,
distinct creatives, and how long an ad has been running — never by budget. The report
page states this on its face and the model is instructed never to infer spend from
volume.

**Two stages, reported separately.** `ads.market` on the mini runs the crawl (~90s for
three keywords) and then one model call (~95s). They fail for different reasons — a
browser lock versus a model call — so a run whose crawl succeeded and whose write failed
comes back `partial` with the digest and every count intact, not `failed`. The ads are
the expensive half and they are never thrown away over missing prose.

**A capped run says so.** `truncated` is set when any keyword hit its page limit, and it
surfaces as a banner on the report and a column in the library. A capped capture read as
a whole market is the failure this guards against.

No creatives travel. `ads-research` embeds downscaled images because a company report is
something you look at; a market report is hundreds of ads and something you read, and
that many data URIs fit in neither a job result nor a Postgres row.

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
| `fb.company` | `{name, city?, phone?, website?, address?, category?, budget?, timeoutMs?}` | `{engine, mode, lead, result, meta}` — the business's own Facebook Page |
| `fb.person` | `{person, company, city?, budget?}` | the same envelope; that person's profile, with `messenger_url` + `messenger_source`, if it is publicly linked to the company |
| `fb.discover` | `{name, city?, budget?}` | the same envelope, with `result.people[]` — each carrying `messenger_url` + `messenger_source` |
| `fb.probe` | none | `{status, detail, ms}` — whether ego lite still holds a Facebook session |
| `x.subject` | `{subject, since?, lang?, max?, budget?, timeoutMs?}` | `{engine, mode, lead, result, meta}` — what X is saying about the subject |
| `x.company` | `{name, city?, website?, phone?, category?, since?, budget?}` | the same envelope, shaped around a lead rather than a topic |
| `ads.company` | `{name, region?, fbMax?, gMax?, timeoutMs?}` | `{facebook, google, ads[], creatives_ok}` — every live ad the company is running, with the creatives downloaded |
| `ads.probe` | none | `{status, detail, ms}` — whether ego lite can still reach both ad libraries |
| `x.probe` | none | `{status, detail, account, ms}` — `ready`, `gated` or `logged_out` on grok.com |

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

### Competitor ads — `ads.*`

What a company is actually advertising, captured from the **Facebook Ad Library** and the
**Google Ads Transparency Center** by the `ads-recon` worker driving ego lite. It is a
crawl, not a model call — no tokens are spent and no key can fail the run.

| Type | Given | Returns |
|---|---|---|
| `ads.company` | a company or advertiser name, plus an optional region | its live ads on both networks, with the creative files downloaded |
| `ads.probe` | nothing | whether both ad libraries are still reachable |

**Google publishes no ad text.** Every Google row has a null `headline` and `body`, and
that is not a capture failure — the wording of a Google ad is rendered inside the creative
image and exists nowhere as text. Facebook rows carry the full copy: headline, body, CTA
and the unwrapped landing URL. Budget accordingly: Facebook is one page load for the whole
grid, while Google costs **one page load per ad**, which is why `gMax` defaults to 30.

```bash
curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"ads.company","timeoutMs":900000,
          "payload":{"name":"Solarvest","region":"MY","gMax":30}}'
```

Or as a research report, which stores it and gives it a permanent link:

```bash
curl -s -X POST $LAB/api/ads-research -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' -d '{"name":"Solarvest","region":"MY"}'
```

`report_type` is `ads_research`; the raw per-network captures live in `ads_research_run`.
When no worker is claiming `ads.company` the report finishes `partial` and says so, rather
than leaving a job pending until it times out.

**From a company dossier.** Every completed company report carries a *Research their ads*
button, so ads research is one click from the dossier rather than a separate lookup. It
posts the same endpoint with the dossier's `companyId`, which links the ads report to that
company and makes it appear on the dossier from then on:

```bash
curl -s -X POST $LAB/api/ads-research -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"name":"Solarvest","companyId":"42","requesterId":"report"}'
```

Passing `companyId` also makes the call safe to repeat: a capture **still in flight** for
that company is returned with `200` instead of a second crawl being started. A *completed*
one is not a reason to refuse — ads change week to week, so re-running produces a fresh
report, and the dossier links the newest.

### Facebook lead enrichment — `fb.*`

Takes a lead that came out of a Maps scan and finds its Facebook presence. Lives on
the mini for the same reason the scan does: the Facebook session is a login a human
performed once, in a browser profile on that machine, and there is no token to ship.

**How it is built, because it decides what you can trust.** A deterministic
read-only crawler drives the browser; a model decides only *which rung of a search
ladder to try next and when to stop*. That split is the point. The read-only
contract — a URL allowlist, a click whitelist, never typing into a field — lives
inside the crawler, so it is enforced code rather than a hope about model
behaviour. The model's whole tool surface is search / detail / posts, capped by a
crawl budget it cannot raise. Nothing in this worker can like, follow, comment or
message.

| Mode | Given | Finds |
|---|---|---|
| `fb.company` | a business name, plus whatever else the lead carries | its Page or Place — phone, email, website, address, category, followers, reviews |
| `fb.person` | a person's name **and** their company | that person's profile, if it is publicly linked to the company |
| `fb.discover` | a company name only | named humans on its public surface, in `result.people[]` |
| `fb.probe` | nothing | whether the browser still holds a Facebook session |

Facebook's own search shapes the ladder. People search matches *names only* — it
ignores a company token entirely — so "person + company" as one query does not
work, and `fb.person` resolves the company first and reads post text, which *is*
full-text. `places` beats `pages` for a local business: same query, all local
results with category, reviews and city, where `pages` will happily put a Florida
LLC in the top three for a Johor query.

```bash
ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"fb.company","timeoutMs":300000,
          "payload":{"name":"Riomation2u","city":"Johor Bahru","phone":"016-712 7666","budget":6}}' \
     | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result
```

```json
{"engine":"fb-recon","mode":"company",
 "result":{"found":true,"confidence":"confirmed",
           "facebook_url":"https://www.facebook.com/Riomation2u",
           "phone":"016-712 7666","email":"riomation.services@gmail.com",
           "messenger_url":"https://m.me/Riomation2u","messenger_source":"derived",
           "followers":"418","reviews":2,
           "matched_on":["phone","brand","city"],
           "runners_up":[],
           "searches_run":["places \"Riomation2u Johor Bahru\"","detail …"],
           "reasoning":"…"},
 "meta":{"cost_usd":0.075,"crawl_calls":2,"budget":4,"duration_s":31,"model":"claude-sonnet-5"}}
```

**Read `confidence`, not `found`.** It is `confirmed | likely | weak | none`, and the
worker is instructed never to inflate it — a `weak` honestly labelled is usable, a
wrong `likely` attached to a lead poisons the pipeline. `found: false` is a normal
outcome: plenty of real businesses have no Facebook presence, and `fb.discover`
returning zero people is the common case rather than a failure.

**`matched_on`, `runners_up` and `searches_run` are the audit trail.** They say which
rungs of the search ladder ran, what evidence decided it, and why the second-best
candidate lost. A result without them is not reviewable.

**Read `meta.engine`.** A lead the deterministic scorer can settle outright — an exact
phone or website-domain match, or brand plus city with no rival — never reaches a model
at all: `engine: "deterministic"`, `cost_usd: 0`, `turns: 0`, and about 16s instead of
40. Roughly half of leads carrying a phone or website land there. The rest come back
`engine` absent, having been ranked by the model, and carry `runners_up` explaining what
lost. A record is the same shape either way.

**`budget` is the cost dial.** Each unit is one crawl call — a page load plus a round
of model context — and it defaults to 10. Two calls settle a company whose lead carries
a phone or a website; a `discover` run uses five or more. A model-ranked lead costs
$0.05–0.15.

**Give it room.** A company lookup takes 16–55s and a discover run 60–120s, all of it
page loads the crawler paces on purpose, so pass a `timeoutMs` well above the default.
Only one lead runs at a time — ego lite has a single crawl space and the worker holds
a lock for the length of a run, which is why `fb.*` has its own lane. A second job
arriving early fails with `busy` and is worth retrying rather than reporting.

**A Messenger link, and where it came from.** Any result with a profile carries
`messenger_url` beside `messenger_source`:

- `detected` — the page published an `m.me` link itself. That is the account
  stating it takes messages.
- `derived` — nobody published one, so it was computed from the profile URL
  (`/<vanity>` → `m.me/<vanity>`, `profile.php?id=N` → `m.me/N`). It costs no crawl
  call and it is a **guess** that messages are accepted.

Neither is *verified*, and the distinction is why both are labelled. Whether a link
opens a normal thread or drops into the recipient's Message Requests depends on
that person's privacy settings, which is not observable read-only: `m.me` fails the
crawler's URL allowlist and `/messages/` sits on its denylist, so the worker can
never follow the link it emits. It hands a human a link to click; it does not open
conversations. `m.me/j/<code>` — a group-chat invite — is rejected outright, and a
research ledger admits only a `detected` link.

**`fb.probe` before a batch.** A lapsed Facebook session fails every lead with
`logged_out`, and the fix is a human signing in on the mini — so it is worth one cheap
page load to find that out first.

**This is also Round 03.** [Company research](#business-intelligence-pipeline) calls
`fb.company` — and, on a confirmed page, `fb.discover` — for its Facebook round.
Only a `confirmed` or `likely` match contributes rows: a `weak` match is a plausible
page that may belong to a different business, and attaching its phone number to this
company is exactly the poisoning the round exists to prevent. Every row carries the
facebook.com URL it was read from, which is what the ledger's evidence policy has
always demanded and, before this, never actually got.

### X research — `x.*`

Finds what X (x.com) is saying about a subject, or about a lead. It runs on the mini
for the gmap.scan reason — the grok.com session is a login a human performed once, in a
browser profile on that machine — plus one of its own, in *Read `gated`* below.

**Nothing here ever visits x.com.** Grok reads X on our behalf, so no session this job
opens is ever on a page with a Like button; there is no code path by which it can
repost, follow or reply. What that costs is directness, which is what the citation
fields below exist to price.

```bash
ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"x.subject","timeoutMs":600000,
          "payload":{"subject":"Grok 5 launch","since":"2026-06-01","budget":2}}' \
     | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result
```

```json
{"engine":"x-recon","mode":"subject",
 "result":{"found":true,"confidence":"likely","coverage":"moderate","sentiment":"mixed",
           "summary":"…",
           "threads":[{"url":"https://x.com/…/status/…","author":"@…","date":"2026-06-11",
                       "topic":"benchmark claims","stance":"negative","replies":212,
                       "cited":true,"excerpt":"…"}],
           "accounts":[{"handle":"@…","why":"…"}],
           "searches_run":["search \"Grok 5 launch\"","threads \"Grok 5 launch\""],
           "reasoning":"…"},
 "meta":{"cost_usd":0.061,"asks":2,"budget":4,"duration_s":190,"model":"claude-sonnet-5"}}
```

**Read `cited`, not just `url`.** Grok is a language model reading X, not a database of
X, and it will occasionally produce a plausible status URL it never opened. Grok is
asked the question a person would ask and answers in prose; the driver then separates
the permalinks it *rendered as links* — posts it actually opened — from those appearing
only in its text, and `cited` reflects that split rather than Grok's own claim. An
uncited thread is not automatically wrong, but a result where `cited` is 0 of 12 is one
to distrust, and the worker is told never to let uncited threads carry the confidence
rating alone.

**Read `confidence`, not `found`.** Same contract as `fb.*`: `confirmed | likely | weak
| none`, never inflated. And `found: false` is the *common* answer on `x.company` —
most local businesses are neither on X nor discussed on X, so a padded record there is
the only outcome that actually costs anything.

**Read `gated`.** `x.probe` has a third state the other probes do not, and the
distinction matters because the remedy differs: `logged_out` means nobody is signed in
to grok.com, while `gated` means the session is fine but grok.com is showing a dialog —
in practice its age confirmation, sometimes a cookie banner. **x-recon will not click
either.** An age attestation is a statement about a person, not a checkbox a job may
tick, so a human clears it on the mini (`./x login`) once per ego lite task space. A
run that meets one fails with code `gated`, not `logged_out`; treating them alike sends
someone to fix the wrong thing.

The gate appears on *send*, not on load, so a clean `x.probe` is good evidence and not
a guarantee — on a task space nobody has asked a question in yet, the first ask is the
real test.

**`budget` buys wall clock, not money.** Each unit is one Grok ask at 40–120 seconds,
and it defaults to 4 — so a lead working the whole ladder can run six minutes. This is
by far the slowest job type here: pass `timeoutMs` of at least `600000`, which is also
the handler's own default. Measured: a two-ask subject lands in ~180s for $0.41.

**The empty case is free.** A subject with no threads and no accounts on rung 1 is
settled by the deterministic pre-pass with no model call at all — `engine:
"deterministic"`, `cost_usd: 0`, one ask. A failed parse or a truncated stream is
deliberately *not* treated as absence: that is evidence the ask went wrong, and it goes
to the model instead.

**`searches_run` and `reasoning` are the audit trail**, and each run keeps the
`chat_url` of the Grok conversation itself in its run directory on the mini — open it
and read the exchange when an answer looks wrong. That separates a bad answer from a
bad question.

Only one x job runs at a time; a second arriving early fails with `busy` and is worth
retrying. `x.*` has its own lane and drives a different ego lite task space from
`fb.*`, so the two do not contend for a browser.

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
| `browser` | 1 | `chatgpt` - the container has one Chrome | 2s between calls |
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
- **Every browser call starts a new chat** — a temporary chat on ChatGPT. There is
  no server-side conversation to continue, so send the history you want considered.

Streaming is real for ChatGPT (the answer is polled as it renders, ~1.5s
granularity) and single-shot for agy, which prints only when it is done.

---

## Limits that will bite you

**One browser at a time.** `MAX_OPEN_BROWSERS=1`, LRU-evicted, closed after five
minutes idle. Every ChatGPT account shares that one slot: calls serialise, and
alternating between accounts evicts the other profile, which costs about a second
per call - measured 9.6s for a warm call against 10.4s for the same one right
after a different account. agy is a CLI and runs up to `AGY_MAX_CONCURRENT` (2)
alongside. This is a pipeline back-end, not a fan-out one.

**Answers are read from `innerText`.** A long fenced code block does not always
read back whole, and asking for one big JSON blob is the shape most likely to come
back truncated. Ask for line records instead.

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

## Meta AI — retired

**There is no Meta engine.** Do not route to `meta`, `meta:<id>`, `meta@mini` or
`llama-*`. They parse, so an old caller gets a clean refusal rather than a
confusing routing error, but nothing answers on any of them.

Both routes to it are gone, for different reasons:

- **The container is region-blocked.** Railway's address is served *"Meta AI isn't
  available yet in your country"* even with an imported, signed-in profile. The
  gate applies on ordinary page loads, not only at login, so replaying cookies
  there was never going to work. The measurements are in `META-AI.md`.
- **The mini never had it, and its stand-in is deleted.** Meta AI was never
  activated on that machine — no browser profile there ever held a `meta.ai`
  cookie — so a muse 1.2 engine answered under the `meta.*` job types through
  OpenCode instead. That worker (`worker/muse.mjs`) is removed and no lane claims
  `meta.ask` or `muse.ask`. A pinned `meta@mini` is refused up front rather than
  queueing a job nothing will take.

The container still understands a `meta` session *kind*, so importing a
storageState is not rejected — but no traffic is routed to it and none should be.

**What replaced it.** Meta was wanted for one thing this API actually needed: what
a company's Facebook presence says about it. That is
[`fb.*`](#facebook-lead-enrichment--fb) — a read-only crawler that visits the
pages and reports the facebook.com URL every field was read from, instead of a
model asked to describe what it can see. Company research **Round 03** was
re-pointed onto it, so the round now produces auditable rows rather than an
`access_mode` explaining why it produced none.

---

## Environment

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; the API key for everything under `/api` and `/v1` |
| `DEFAULT_MODEL` | `agy` | what an empty or `auto` model resolves to |
| `CGPT_DEFAULT_SESSION` | first `ready` | which account a bare `chatgpt` means |
| `AGY_ASK_TIMEOUT_MS` | 300000 | |
| `CGPT_ASK_TIMEOUT_MS` | 180000 | |
| `AGY_MAX_CONCURRENT` | 2 | agy runs in flight at once **in the container** (memory guard: agy plus a headed Chrome in 4GB). Does not apply to `agy@mini` — that is `AGY_LANES` on the worker |
| `MINI_MAX_CONCURRENT` | 5 | calls in flight on the mini - that lane's width. Keep it equal to the worker's lane count (3 ChatGPT accounts + `AGY_LANES`); wider only moves the queue into the job broker |
| `AGY_LANES` (worker) | 2 | dedicated `agy.ask` lanes on the mini. Measured 24 Aug: three concurrent `agy -p` answer in 7/9/12s against a 9s solo baseline with no contention; the ceiling is the single Google account, not the binary |
| `MINI_DEFAULT_SESSION` | `mini-main` | which of the mini's accounts a bare `chatgpt@mini` means |
| `ROUTING_PREFER` | `mini` | where a bare model name goes when both locations are live |
| `MAX_OPEN_BROWSERS` | 1 | Chrome profiles open at once - the browser lane's width |
| `CGPT_MIN_GAP_MS` | 2000 | spacing between calls to that account |
| `AGY_MIN_GAP_MS` | 0 | |
| `QUEUE_MAX_DEPTH` | 10 | waiting calls before 429; `CGPT_MAX_QUEUE` etc. override per engine |
| `QUEUE_MAX_WAIT_MS` | 300000 | longest wait the gateway will promise |
| `*_HOURLY_LIMIT` | off | calls per rolling hour, per engine |
| `LOG_MEMORY` | 1000 | records kept in memory |
| `LOG_PROMPTS` | on | `0` drops prompt previews |

The rest of the service — installing agy, driving a login, the DOM observation
layer — is in [agy-lab/README.md](agy-lab/README.md) and
[CHATGPT-PROGRESS.md](CHATGPT-PROGRESS.md).
