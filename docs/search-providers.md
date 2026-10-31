# Tavily and Exa for contact research — reference notes

Read from the official docs on 2026-10-24. The agy-lab pipelines built on these notes are
[contact-tavily.ts](../agy-lab/src/contact-tavily.ts) and [contact-exa.ts](../agy-lab/src/contact-exa.ts). Both call
Tavily and Exa through [src/core/](../agy-lab/src/core/README.md), the app's one door to outside APIs.
Benchmark results are at the end of this note.

## Tavily

Base `https://api.tavily.com`, auth `Authorization: Bearer tvly-…`. Every endpoint takes `include_usage: true`
and returns `usage.credits`.

### Search `POST /search` ([ref](https://docs.tavily.com/documentation/api-reference/endpoint/search))
- `search_depth`: `basic`, `fast` and `ultra-fast` cost 1 credit, and `advanced` costs 2.
  - `advanced`, `basic` and `fast` return reranked chunks per URL: about 800 characters each on advanced, about 500 on the others.
  - Since July 2026, `basic` returns chunks too ([changelog](https://docs.tavily.com/changelog)).
- `chunks_per_source`: 1-3, default 3.
- `max_results`: 0-20, default 10.
- `country`: `"malaysia"` is supported, but only with `topic: "general"`. It boosts results and does not filter them.
- `include_raw_content`: `true`, `markdown` or `text`. It returns the whole page text and costs **no extra credits**
  ([credits](https://docs.tavily.com/documentation/api-credits)). A search therefore reads its pages for free.
- `include_domains` (max 300) and `exclude_domains` (max 150) take plain domains only. Paths and wildcards stopped working in Aug 2026.
  - `include_domains_mode: "prefer"` boosts the listed domains instead of restricting results to them.
- `exact_match: true`: only results that contain the quoted phrase. This can return nothing for a small shop.
- `time_range`, `start_date` and `end_date` exist. There is no `days` parameter and no request timeout.
- Queries can be up to 1500 characters. The docs advise short, focused queries and splitting a multi-part question into several searches
  ([best practices](https://docs.tavily.com/documentation/best-practices/best-practices-search)).

### Extract `POST /extract` ([ref](https://docs.tavily.com/documentation/api-reference/endpoint/extract))
- Takes up to 20 `urls`. `extract_depth: basic` costs 1 credit per 5 successful URLs, and `advanced` costs 2 per 5 (for JavaScript-rendered pages and tables). Failed URLs are free.
- `format` is `markdown` or `text`. `timeout` is 1-60 s.
- `query` plus `chunks_per_source` (1-5) returns only the matching chunks. Leave it off for contact pages, because footer phone numbers can be reranked away.
- Failed URLs come back in `failed_results[]`. An HTTP 200 can carry an empty `results` list.

### Map and Crawl ([map](https://docs.tavily.com/documentation/api-reference/endpoint/map), [crawl](https://docs.tavily.com/documentation/api-reference/endpoint/crawl))
- Map lists a site's URLs. It costs 1 credit per 10 pages, or 2 per 10 with `instructions`.
  - Parameters: `max_depth` (1-5), `max_breadth`, `limit`, `select_paths`/`select_domains` (regex), and `allow_external`. Set `allow_external` to false yourself, because it defaults to **true**.
- Crawl costs the Map price plus the Extract price. 10 pages on basic cost 1 + 2 = 3 credits.
  - Crawl has its own 100 RPM limit. There is no `categories` parameter.
- Map followed by a targeted Extract gives more control than Crawl and costs the same or less
  ([crawl best practices](https://docs.tavily.com/documentation/best-practices/best-practices-crawl)).

### Usage, limits, errors
- `GET /usage` returns `key.{usage,limit}` and `account.{plan_usage,plan_limit,…}`. It allows **10 calls per 10 minutes**
  ([rate limits](https://docs.tavily.com/documentation/rate-limits)).
- Dev (free) keys get 100 RPM and prod keys get 1000 RPM. Credits reset on the 1st of the month.
- `429` is a rate limit and honours `Retry-After`. `432` means the plan or key credits are spent, and `433` means the PayGo cap was hit.
- Price: $0.008 per credit pay-as-you-go. A free key gets 1000 credits a month.

## Exa

Base `https://api.exa.ai`, header `x-api-key`. The docs moved to `exa.ai/docs`, and the schema source is
[exa-spec.yaml](https://exa.ai/docs/exa-spec.yaml). Every response carries `costDollars.total`.

### Search `POST /search` ([ref](https://exa.ai/docs/reference/search))
- `type` can be `auto` (default, $0.007), `lite` ($0.004, cache only, new 2026-10-19), or `deep-lite`/`deep` ($0.012).
  - `fast`, `instant` and `deep-reasoning` are legacy. `neural` and `keyword` are gone from the spec ([changelog](https://exa.ai/docs/changelog)).
  - The base price covers 10 results, and each result above 10 adds $0.001. **Text and highlights for the first 10 results are included**
    ([pricing](https://exa.ai/docs/admin/pricing)).
- `category` can be `company`, `people`, `news`, `publication`, `personal site` or `financial report`.
  - `people` replaced `linkedin profile` (Dec 2025). It covers 1B+ profiles.
  - Company and people results carry `entities[]`. A person entity has name, location and `workHistory[{title, company{name}, dates{from,to}}]`.
    A company entity has headquarters, workforce and financials. **Neither has a phone or an email.**
  - `company` and `people` reject published-date filters with a 400, and `people` also rejects `excludeDomains`.
- `userLocation: "MY"` biases the results and does not filter them.
- `includeDomains`/`excludeDomains` accept a host, a path prefix (`linkedin.com/in`) or a wildcard.
- `outputSchema` returns structured output with grounding citations on non-`lite` types, with at most 10 properties.
- Exa answers in the query's own language: a Malay query returns Malay pages.
- Best practice: describe the page you want ("professional profiles of the directors of X in Johor Bahru") rather than a bag of keywords
  ([best practices](https://exa.ai/docs/search/best-practices), [companies and people](https://exa.ai/docs/search/data/companies-people)).

### Contents (inline in `/search` under `contents`, or top level on `POST /contents`) ([ref](https://exa.ai/docs/contents/quickstart))
- `text: {maxCharacters, verbosity, includeSections/excludeSections}`. Keep `footer`, because contact lines live there.
- `highlights: {query, maxCharacters}` returns the passages that answer `query`. `numSentences` and `highlightsPerUrl` are deprecated.
  [core/exa.ts](../agy-lab/src/core/exa.ts) still sends both.
- `summary: {query, schema}` returns a JSON *string* and costs $0.001 per page.
- `extras: {links}` returns the page's links, including `tel:`, `mailto:` and `wa.me` links.
- `maxAgeHours` (0 means always fresh, -1 means cache only) replaces the deprecated `livecrawl`. `livecrawlTimeout` is in ms, default 10000.
- `subpages` plus `subpageTarget` are deprecated on `/search` and still work on `/contents`.
  On our sites they picked `mailto:` and `wa.me` links instead of `/contact` and `/about-us`, so the Exa pipeline picks subpages itself from `extras.links`.
- `/contents` costs $0.001 per page per content type. Per-URL failures come back with HTTP 200 in `statuses[]`.

### Other endpoints
- `/answer` costs $5 per 1k calls. `/findSimilar` is deprecated. `/research` was retired on 2026-04-01.
- Exa Agent (`POST /agent/runs`) replaces Websets for enrichment. It can return emails ($0.02 each) and phones ($0.07 each) via Fiber.ai, which adds about $0.1-0.2 per company.
  The docs make no claim about coverage in Malaysia ([agent](https://exa.ai/docs/agent/quickstart)).
  Websets needs a separate paid plan.

### Limits, errors
- Limits are **per team, across all keys**: 10 QPS for search, 5 for deep, and 100 for `/contents` ([billing](https://exa.ai/docs/admin/billing)).
  Several keys on one team add no throughput.
- `401` means a bad key. `402` (`NO_MORE_CREDITS`, `*_BUDGET_EXCEEDED`) means the key is spent. `429` honours `Retry-After`.
- A free team gets $10 a month.

## What each pipeline does

| step | Tavily pipeline | Exa pipeline |
|---|---|---|
| find | 3 searches with `country: malaysia`: the name and address (advanced, raw content), the name with roles and contact words (advanced, raw content), and LinkedIn only (basic) | `auto` search with `userLocation: MY` and contents (text, plus highlights aimed at phones, emails and roles); a `people` category search, whose work history becomes the snippet; a `company` category search when the lead has no website |
| official site | the lead's website, or a hit whose host spells the name | the same, then the Malaysian `company` hit |
| read | Map the site, then Extract the home page and up to 5 contact, about or team pages (basic, with an advanced retry when nothing comes back); search raw content stands in for the other pages | `/contents` on the home page with `extras.links`, then on its contact, about and team pages; search text stands in for the other pages; tel, mailto and wa.me links are added to the page text |
| extract | Pi, with the same prompt and grounding as v2 (`extractResult` in contact-worker.ts) | the same |
| cost per company | 5 search credits + about 2 Map + 1-2 Extract = about 8-9 credits (about $0.07 PAYG, free on the 1000-credit keys) | $0.007 + $0.007 (+ $0.007 company search) + about $0.001-0.005 contents = about $0.015-0.025 |

Neither pipeline fetches a page itself: the provider reads every page.

## Benchmark, 2026-10-24

Twelve prod leads went through all three pipelines: 6 Sdn Bhd firms or chains and 6 small shops and restaurants, in Johor, Nilai and Shah Alam.
- v2 is today's prod job: two Tavily advanced searches, one Exa LinkedIn search, and pages fetched by our own process.
- The Tavily and Exa pipelines each ran twice, pass 1 and pass 2. The table shows pass 2, which ran after the site guesser fix. Pass 1 is in brackets.
- All three use the same Pi extract and grounding.
- A "new phone" is one that is not already on the lead.

| | v2 (prod) | Tavily pipeline | Exa pipeline |
|---|---|---|---|
| finished | 12/12 | 11/12 (Pi stalled on KSL Holdings in both passes) | 12/12 |
| companies with a new phone | 10 | 9 (9) | 10 (10) |
| companies with a named person | 8 | 6 (8) | 8 (8) |
| companies with an email | 8 | 6 (6) | 7 (7) |
| new phones / people / emails | 22 / 23 / 10 | 14 / 14 / 8 (16 / 13 / 7) | 27 / 27 / 11 (37 / 26 / 11) |
| median time | 46 s | 32 s | 28 s |
| cost per company | 4 Tavily credits + $0.007 Exa (about $0.039 PAYG, $0.007 on free Tavily keys) | about 7 credits (about $0.055 PAYG, $0 on free keys) | $0.017 |

Manual spot check of every phone and person:
- **v2.** For KSL Properties (Johor), it took two numbers from KSL's Klang mall site (kslkl.com.my, area 03), a sister business.
  It also used one Hill&Chill number and email from a waiterio page that could not be confirmed. There were no masked or foreign numbers.
- **Tavily pipeline.**
  - Pass 1 took two Philippine mobiles (0915…, 0929…) from a mall's Facebook post.
  - It read multec.co.uk, a UK firm, as Multec Machinery's site. The site guesser now needs a .my domain or a Malaysian hit.
  - Pass 2 had no flagged numbers.
- **Exa pipeline.**
  - One number was garbled: Sarvani 016-725 9964, where the real number is 016-790 9964.
  - For Thai Odyssey it returned the KL head-office line and 11 other-outlet numbers. They are the same company's numbers, but not this outlet's.
  - It found extra directors from annual reports (KSL Holdings) and Agribusiness's office line and two emails from its own project page.
- Run to run, Pi's output moves by about ±25% on the same evidence (Exa pass 1 found 37 new phones, pass 2 found 27). Small gaps between pipelines are noise.

Findings:
- The people come from an index of profiles. Exa's `people` category and Exa's LinkedIn search find them, and Tavily's LinkedIn search finds far fewer. That is why Tavily alone is weakest on people.
- Tavily's free raw content makes long prompts. Both Pi stalls happened on the Tavily pipeline's pages for KSL Holdings.
- Exa reads the company's site cheaply ($0.001 a page). `extras.links` gives the WhatsApp and mailto links that page text leaves out.
