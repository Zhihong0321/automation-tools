# How a lead flows

One page from "a taman on the list" to "a number a telemarketer can call". Everything below runs in
the Railway hub (`agy-lab`, https://ee-auto.up.railway.app). The Mac mini takes no part in it any more.

Checked against the code on 2026-10-25. The taman auto-scan and the missing-taman finder were being
added that day, so their names can still change: read the files before relying on them.

All `/api/*` calls need `Authorization: Bearer $LAB_TOKEN`. Env vars are Railway variables on the
hub. Changing one redeploys the hub.

```
Territory list  (+ missing-taman finder)
   -> taman auto-scan
   -> Google Maps business list (scraper.tech)
   -> company_data
   -> lead blacklist
   -> contact auto-queue
   -> Exa (or Tavily) search + deepseek page reading
   -> contact report
   -> telemarketing
```

## 1. Territory list

| | |
|---|---|
| File | [territories.ts](../agy-lab/src/territories.ts) (`ALL_TERRITORIES`) |
| Size | Johor: 10 districts, 771 tamans. Selangor: 9 districts, 1,060 tamans. |
| Status | `GET /api/territories?state=johor` |
| Cost | none |

The list was built by hand once, so tamans opened in the last few years are missing.

### Missing tamans: the search-for-taman SOP

| | |
|---|---|
| How | the **search-for-taman** skill ([SKILL.md](../.claude/skills/search-for-taman/SKILL.md)), run from a person's machine, one daerah at a time |
| Master list | [taman-search-master-list.md](taman-search-master-list.md): one row per daerah. A daerah marked Done is never searched again |
| Tool | `agy-lab/scripts/find-tamans.ts` (`check`, `save`, `status`), on top of [taman-finder.ts](../agy-lab/src/taman-finder.ts) |
| Saved in | table `territory_discovered` (tamans) and `taman_finder_town` (towns searched), through `POST /api/territories/finder` |
| Cost | 7 scraper.tech requests per town (14 at most with retries). All 125 towns are about 875 requests, once. |
| Pause | nothing to pause: it runs only when someone runs the SOP |

For each town, the tool reads the addresses from 7 Google Maps list searches and from the saved leads.
An area name is a candidate only when 2 or more different addresses in that town carry it, and the
daerah does not list it yet. The user approves each town's numbered list before anything is saved.
A saved taman joins the territory list under "Newly found tamans", so the auto-scan scans it too.

It is not a hub job on purpose: Google Maps answers vary from run to run, so a person reads each
town's result first. The first, automatic version trusted Maps' housing categories, and on Senai 95
of its 115 "verified" names were private houses, rooms for rent and house numbers.

## 2. Taman auto-scan

| | |
|---|---|
| File | [autoscan.ts](../agy-lab/src/autoscan.ts) |
| Switches | `AUTO_SCAN_PAUSED`, `MAPS_MONTHLY_BUDGET` (default 25,000), `AUTO_SCAN_CONCURRENT` (default 1), `AUTO_SCAN_STATES` (default `johor,selangor`) |
| Status | `GET /api/territories/auto-scan`: tamans, scanned, remaining, next five, requests used this month, budget, and why it is holding |
| Cost | one Business scan per taman: about 100–420 scraper.tech requests |
| Pause | `AUTO_SCAN_PAUSED=1` |

- Every 2 minutes it queues a Business scan (max 2000) for the next taman.
- It spreads the scans evenly over all 19 daerah of Johor and Selangor. The next taman always comes
  from the daerah with the fewest scanned so far, so no daerah waits for another to finish.
- One scan at a time, unless `AUTO_SCAN_CONCURRENT` says more.
- It skips a taman that already has a Business scan since the scraper.tech switch (2026-10-24).
  Older Mac mini scans do not count: they found far less (Taman Daya 118 against 1,838).
- It stops starting scans when this month's requests plus one more scan (420) would pass
  `MAPS_MONTHLY_BUDGET`. The month count lives in table `maps_usage`. Manual scans count against the
  same number but are never held. 25,000 of the plan's 30,000 leaves room for manual scans.
- It also holds while no Maps worker is live.

At 100–420 requests a taman, 25,000 requests cover roughly 60–250 tamans a month. The 1,831 listed
tamans take several months on the $4 plan.

## 3. Google Maps business list (scraper.tech)

| | |
|---|---|
| File | [maps-worker.ts](../agy-lab/src/maps-worker.ts): the hub's `gmap.scan` worker, named `scraper-tech-maps` |
| Switches | `SCRAPER_TECH_KEY` (vault name `SCRAPER_TECH_KEY`), `MAPS_LANES` (default 3), `SCRAPER_TECH_BASE_URL` (default `https://mcp.scraper.tech`) |
| Start by hand | taman buttons **Business**, **Factory**, **Shop**, or the Business list form, or `POST /api/business-search` |
| Status | `GET /api/jobs` (lanes `scraper-tech-maps`, `-2`, `-3`); each scan is a report at `/r/<id>` |
| Cost | $4/month for 30,000 requests. Business taman scan about 100–420 requests, Factory 19, Shop 16. |
| Pause | unset `SCRAPER_TECH_KEY`: the lanes go idle and a business search fails at once with "worker is offline" |

How a scan works:
- The MCP URL is `https://mcp.scraper.tech/<key>`, tool `search_maps`. One call per query, `limit` 500.
- One Google search tops out around 150–190 places, so a scan sweeps a family of keywords,
  "`<word> in <taman>`":

  | Button | Family | Words |
  |---|---|---|
  | Business | every kind of business | 45 |
  | Factory | factories, manufacturers, suppliers | 19 |
  | Shop | shops, restaurants, services | 16 |

  A search with a location only sweeps the Business family. Any other keyword is one call.
  The old "All" button is now Shop.
- After a Business sweep it searches street by street: "shop in `<street>`" and "company in `<street>`",
  2 requests per street. This is why a Business scan costs 100–420 requests.
- Rows whose address does not name the taman are dropped (they are found again when their own taman
  is scanned). Permanently closed places are dropped.
- Max results go up to 2000. A business search times out after 20 minutes by default (also the ceiling).

Measured:

| Scan | scraper.tech | Mac mini |
|---|---|---|
| Taman Daya, Business | 1,838 businesses, 417 requests, 4.6 min | 118 |
| Taman Universiti, Factory | 969 | 114 |

The Mac mini no longer runs `gmap.scan`: `RETIRED_TYPES` in [jobs.ts](../agy-lab/src/jobs.ts) drops it
from any worker whose name starts with `m4-mini`. Details and raw tests:
[scraper-tech-maps.md](scraper-tech-maps.md).

## 4. company_data

Each business from a scan becomes a lead in table `company_data`, merged on Google's `place_id` so a
second scan of the same place does not make a duplicate. `GET /api/leads` lists them.

## 5. Lead blacklist

| | |
|---|---|
| File | [lead-blacklist.ts](../agy-lab/src/lead-blacklist.ts) |
| Stored in | `company_data.blacklist_reason` (empty when the lead may be researched) |
| Runs | every lead at boot; new leads right after each scan and before each auto-queue cycle |
| Cost | none |
| Pause | no switch. Starting research on one company by hand still works on a blacklisted lead. |

The groups (government, banks, malls, chains, competitors and so on) and what each one caught are in
[lead-blacklist.md](lead-blacklist.md).

## 6. Contact auto-queue

| | |
|---|---|
| File | [autocontact.ts](../agy-lab/src/autocontact.ts) |
| Switches | `AUTO_CONTACT_PAUSED` |
| Status | `GET /api/contact-research/auto-queue` |
| Cost | none itself; each job costs what step 7 costs |
| Pause | `AUTO_CONTACT_PAUSED=1` |

- Every 60 seconds it queues up to 3 contact research jobs, and none while 3 are still waiting.
- It takes only leads that were checked against the blacklist, came out clean, and were never
  researched (a lead whose earlier research failed goes first).
- It holds itself while no contact worker is live, and while every Exa and Tavily key is resting.
- New leads from a scan reach it on their own: scan, blacklist check, then the next cycle.

First live run: 22 jobs in 10 minutes, 19 completed, 1 failed and then succeeded on a re-run,
0 blacklisted. About 2 jobs a minute.

## 7. Contact deep research

| | |
|---|---|
| Files | [contact-worker.ts](../agy-lab/src/contact-worker.ts), [contact-exa.ts](../agy-lab/src/contact-exa.ts), [core/llm.ts](../agy-lab/src/core/llm.ts) (the app's one LLM router, rules in [core/README.md](../agy-lab/src/core/README.md)) |
| Switches | LLM lanes on `/workers` (the `llm_lane` table; `CONTACT_LLM_*` only when it is empty), `CONTACT_LANES` (default 3), `CONTACT_TIMEOUT_MS` (default 180,000) |
| Keys | Exa and Tavily keys are kept in the hub: `GET /api/contact-keys`, or the `/workers` page. `EXA_API_KEYS` / `TAVILY_API_KEYS` are read only when the hub has none stored. |
| Status | `GET /api/jobs` (lanes `pi-contact`), `GET /api/contact-keys` (quota per key), `GET /api/contact-stats` (finds per provider) |
| Cost | Exa about $0.017 a company. Tavily fallback about 4 credits a company, on free keys. |
| Pause | pause the auto-queue (step 6). Jobs already queued still run. |

Two steps per company:
1. **Search.** The Exa pipeline runs while any Exa key has credits (23 keys). If every Exa key is
   resting, or Exa fails, the job falls back to the v2 pipeline on Tavily (19 free keys, 1,000
   credits a month each).
2. **Read.** A model reads the pages found and pulls out people, phones and emails. It may only return
   what is printed on those pages. The model is **deepseek-v4.1-flash-1017** on every enabled lane
   saved on `/workers`, through the app's one LLM router (`core/llm.ts`): the lanes take turns, a lane
   that answers 429 rests and the call moves to the next. Pi on MiniMax serves report rounds and
   translation, and is the router's last resort for other callers.

Search providers compared: [search-providers.md](search-providers.md).

## 8. Contact report and telemarketing

The result is saved as a contact research report linked to the lead: the phones, emails and people
found, each with the page it came from. On `/telemarketing` the team lead assigns tamans to telemarketers. Each taman
row shows its scans, the Business / Factory / Shop scan buttons, and "Research N pending" for leads
still waiting for contact research.

## 9. Website emails (no LLM)

`agy-lab/src/site-emails.ts` reads the homepage and contact page of each lead with its own website
(social pages, marketplaces and link shorteners do not count) and keeps every email printed there:
mailto links, plain text, `&#64;` entities, Cloudflare-protected addresses and `[at]` spellings.
Emails go to the `company_email` table with the page they came from, and show in Contacts Master
labelled **Website**. Each lead gets `company_data.site_email_status`: `found`, `none`,
`unreachable` or `no_site`.

- A host listed as the website of 3 or more leads is a directory (myinfo.my) or a chain's head
  office, so it is skipped as `no_site`. Otherwise one email would land on hundreds of leads.
- Blacklisted, do-not-call, hidden and merged leads are skipped.
- Each page waits up to 20 s. A DNS or connection blip gets one more try, then https falls back to
  http. A page that still fails is recorded with its reason, and the lane moves on.
- It costs nothing per lead: plain page fetches from the hub, 4 leads at a time.
- **Off by default.** `POST /api/site-emails/run {"company_id": N}` checks one lead.
  `POST /api/site-emails/start` and `/stop` run or halt the lane until the next deploy.
  `GET /api/site-emails` shows the counts.

## Switches

All Railway variables on the hub.

| Variable | Default | Does |
|---|---|---|
| `SCRAPER_TECH_KEY` | not set | scraper.tech key. Unset, the Maps worker is idle. Vault name `SCRAPER_TECH_KEY`. |
| `SCRAPER_TECH_BASE_URL` | `https://mcp.scraper.tech` | scraper.tech MCP address |
| `MAPS_LANES` | 3 | Maps scans run at once |
| `AUTO_SCAN_PAUSED` | off | `1` holds the taman auto-scan |
| `MAPS_MONTHLY_BUDGET` | 25,000 | auto-scan stops starting scans at this many requests this month |
| `AUTO_SCAN_CONCURRENT` | 1 | auto-scans in flight at once |
| `AUTO_SCAN_STATES` | `johor,selangor` | states the auto-scan walks |
| `AUTO_CONTACT_PAUSED` | off | `1` holds the contact auto-queue |
| `CONTACT_LLM_URL` | not set | page-reading model's address (OpenAI-compatible) |
| `CONTACT_LLM_KEY` | not set | its key. Vault name `ZM_AI_FIXED_KEY`. |
| `CONTACT_LLM_MODEL` | not set | `deepseek-v4.1-flash-1017`. With any of the three unset, reading falls back to Pi on MiniMax. |
| `CONTACT_LANES` | 3 | contact research jobs at once |
| `CONTACT_TIMEOUT_MS` | 180,000 | time limit per contact job |
| `EXA_API_KEYS`, `TAVILY_API_KEYS` | not set | search keys, used only when none are stored in the hub |
| `SITE_EMAIL_AUTO` | off | `1` runs the website email lane from boot |
| `MINIMAX_API_KEY` | not set | Pi on MiniMax: report rounds, translation, and the reading fallback |

## Where the money goes

| What | Provider | Plan | Use |
|---|---|---|---|
| Google Maps business lists | scraper.tech | $4/month, 30,000 requests | Business taman scan 100–420 requests, Factory 19, Shop 16; finder 1 per candidate. Auto-scan capped at 25,000 a month. |
| Contact search, first choice | Exa | 23 keys | about $0.017 a company |
| Contact search, fallback | Tavily | 19 free keys, 1,000 credits a month each | about 4 credits a company; finder 2 credits a district |
| Reading contact pages, finder names | deepseek-v4.1-flash-1017 (`ZM_AI_FIXED_KEY`) | not measured here | 1 call per company (a second, smaller try when the first stalls), 1 per finder district |
| Report rounds, translation | Pi on MiniMax | Token Plan, ran out 2026-10-24 | also the reading fallback |
