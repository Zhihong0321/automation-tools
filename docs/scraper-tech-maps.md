# scraper.tech Google Maps — reference notes

Tested by hand on 2026-10-24 to see whether it can replace the Mac mini's `gmap.scan`
([worker/gmap.mjs](../worker/gmap.mjs)). Nothing in the hub uses it yet.

scraper.tech's docs list the endpoints and response fields and nothing else: no parameter
meanings, no caps, no rate limits per plan. Everything under **Behaviour** comes from
calls made on the free plan. That was 56 search and place calls in total, with 0 errors.

## Access

- MCP over streamable HTTP. One URL carries the key in its path:
  `https://mcp.scraper.tech/<key>`. It is a plain JSON-RPC `POST`, and
  `tools/call` returns the API's JSON as a string in `result.content[0].text`.
- Treat that URL as a secret: anyone who has it spends the quota. It belongs in the vault and
  in a Railway env var, never in the repo.
- Tools: `search_maps`, `place_info`, `reviews`, `place_photos`, `what_is_here`. Every argument
  is a string.

## Pricing ([ref](https://scraper.tech/panel/pricing/maps/))

| Plan | Price / month | Requests |
|---|---|---|
| Free | $0 | 1,000 |
| Basic | $4 | 30,000 |
| Advanced | $19 | 300,000 |
| Premium | $104 | 3,000,000 |

- Only successful requests are billed.
- Going over the plan's limit blocks access until you upgrade or buy credits. Credits do not
  expire, but using them needs an active plan.
- There is no rate limit on Maps. scraper.tech asks for warning before going over 100 req/s
  ([ref](https://scraper.tech/en/docs/rate-limits/)).
- Open check: the dashboard showed 8 requests after 24 calls. Compare it with the call count
  before deciding whether one call always costs one request.

## Behaviour (measured)

**One call, `limit: "500"`, no paging.**
- `limit` is honoured above 100. One call returned 182 rows for "restaurant in Johor Bahru" and
  20 rows when asked for 20.
- `offset` past the first call adds almost nothing: offset 182 returned 8 rows, 1 of them new,
  and offset 500 returned 0.
- Paging in steps of 100 is worse. Each page is a separate Google search, so the same query gave
  100 one time and 122 the next.
- A single call is stable: two `limit: 500` runs of "factory in Taman Daya" returned the same 154
  places.

**One query tops out around 150–190 places.** That is Google's ceiling per search, not
scraper.tech's. A whole area needs several keywords (see the sweep below).

**Use a text query, never coordinates.**
- `"<keyword> in <taman>, <district>, <state>"` keeps about 90% of results inside the target
  area (checked against `full_address`).
- `lat`/`lng`/`zoom` (tried zoom 14, 15, 16 and 18) barely localises: 17 of 159 rows were in
  Taman Daya, and the rest were spread across Johor.

**A query that is only a place name returns that one place**, not the businesses in it.
"Taman Daya, Tebrau, Johor" alone returned 1 row. The hub's `location_only` mode has to become a
keyword sweep.

**Nothing is ever an error.**
- An empty query returns `{"status":"ok","data":[]}`.
- A nonsense query returns the nearest real business.
- So a small count is Google's real answer to the query. It is not throttling: the throttling
  `gmap.mjs` guards against comes from a datacenter IP, and that does not apply here.
- Treat a transport error or `status !== "ok"` as a failure. Treat `[]` as found 0.

**Latency** is a median of 6.3s, p90 15s, max 28s. Eight calls in parallel finished in 17s with no errors.
Use a 60s timeout and one retry.

**`place_info` is not worth a call** for list building. Over a search row it adds only `cid`,
`plus_code`, `website_full` and empty `details` and review stats.

## Coverage: the keyword sweep

Taman Daya, Tebrau, one `limit: 500` call per keyword. The last column counts unique places with
"Taman Daya" in `full_address`:

| Keyword | Rows | New in-area places | Running in-area total |
|---|---|---|---|
| business | 71 | 66 | 67 |
| factory | 152 | 94 | 161 |
| shop | 176 | 60 | 221 |
| restaurant | 159 | 136 | 357 |
| company | 172 | 79 | 436 |
| services | 134 | 53 | 489 |
| store | 191 | 16 | 505 |
| office | 110 | 22 | 527 |
| clinic | 29 | 15 | 542 |
| manufacturer | 99 | 38 | 580 |
| supplier | 151 | 4 | 584 |
| + salon, wholesale, sdn bhd, trading, logistics, workshop, kedai, hardware | | 318 | **902** |

The Mac mini's single scan of the same area found 118. Twenty requests found 902, and the total
was still rising: salon alone added 103. Rank keywords by how many new places they add and drop
the ones that add few. `store`, `supplier`, `hardware` and `kedai` mostly repeat earlier
results.

## Mapping a row onto the `gmap.scan` business shape

| `gmap.scan` field | scraper.tech field |
|---|---|
| `name` | `name` |
| `rating` | `rating` |
| `reviews` | `review_count`. This is always present, unlike the mini, which gets null under limited view. |
| `category` | `types[0]` |
| `address` | `full_address`. This is the full address with postcode. The mini only has the street. |
| `phone` | `phone_number` |
| `website` | `website` |
| `mapsUrl` | `place_link` |
| `place_id` | `place_id`. `scanPlaceKey` ([reportdb.ts](../agy-lab/src/reportdb.ts)) already prefers it, and it is the same value as the mini's `!19s` id. All 118 mini rows for Taman Daya carry one, and 61 of them turned up in the 20-keyword sweep under the same `place_id`, so new rows merge with the existing `company_data` rows. |

Also returned and currently dropped: `latitude`, `longitude`, `city`, `working_hours`,
`verified`, `is_claimed`, `is_permanently_closed`, `is_temporarily_closed` and `business_id`.
`business_id` can change over time, so key on `place_id`.

Filter out `is_permanently_closed` rows before they reach contact research.
