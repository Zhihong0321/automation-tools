# Country industry research

Latest update: 2026-10-31.

Give the hub a country and an industry ("Malaysia", "advertising agency"). It
returns one CSV of every business Google Maps lists for that industry in that
country's cities, with the emails, phones, social links and people published
on their websites.

Start it from the operator page `/country-industry`. The page shows progress
for two phases, Maps and contacts, and offers the CSV when the job is done.
The page shell is public; the job API needs `LAB_TOKEN`.

## What changed

| | Before (until 2026-10-29) | Now |
|---|---|---|
| Who runs the job | the Mac mini, start to finish | **the hub** (`hub-country` lane) |
| Who searches Google Maps | the mini's Chrome only | **three workers**, whichever is free |
| The pipeline | [gmap-country-insdusty](https://github.com/Zhihong0321/gmap-country-insdusty) on the mini | the same code, copied into `agy-lab/src/country/` |
| If the mini is off | jobs wait in the queue | jobs run on the other two workers |
| A redeploy mid-run | the mini kept going | the job resumes from its checkpoint |

## The hub's three Maps workers

The hub sends every city search to its Maps queue (`gmap.scan`). Three
workers take searches from that queue:

| | Mac mini | scraper.tech | Windows PC |
|---|---|---|---|
| Worker name | `m4-mini` | `scraper-tech-maps`, `-2`, `-3` | `pc-<computer name>`, e.g. `pc-desktop-camhl16` |
| Runs on | the Mac mini at home | inside the hub (Railway) | any Windows PC with the Gmap Local Worker |
| How it reads Maps | Chrome scrolls the Maps feed, and it also pages Google's result list | scraper.tech's paid Maps API | pages Google's result list directly, no browser |
| Cost per search | free | 1 scraper.tech request | free |
| Takes country searches | yes, **only** these | yes | yes |
| Takes taman scans and business searches | no | yes | yes |

The mini is kept out of taman scans and business searches on purpose. Its old
Chrome scan found 118 businesses in Taman Daya where scraper.tech found 1,838.
The broker hands it only searches marked `source: 'country.industry'`
(`countryScanOnly` in `agy-lab/src/jobs.ts`).

### How the same search compares

"advertising agency" in Johor Bahru, Johor, Malaysia, max 300. Each job was
pinned to one worker and all three ran at the same time on 2026-10-31,
through the live hub:

| | Mac mini | scraper.tech | Windows PC |
|---|---|---|---|
| Businesses | **254** | 148 | 201 |
| Time | 14 s | **5 s** | 13 s |
| Phone | 95% | 95% | 94% |
| Website | **53%** | 43% | 47% |
| Address with postcode | 65% | 88% | 88% |

- **The mini found the most.** It reads both the Maps feed and Google's result
  list, so it has every business the PC found plus 58 that neither other
  worker found. Those 58 come from the feed, whose addresses are only the
  street.
- **scraper.tech is the fastest,** and it costs a request.
- **The PC** finds nothing the mini doesn't on this search, but it is a second
  free worker for when the mini is off or resting.
- **Together** the three found 265.

## How a country job runs

1. **Cities.** The World Cities list (GeoNames) for the country. Malaysia has
   355 entries; Brunei Darussalam has 7. This list is not every town.
2. **Maps.** One search per city, `<industry> in <city>`, as a `gmap.scan` job
   on the queue. Four searches are in flight at once, so every free worker gets
   one. A search that fails or is blocked is asked again once, usually of
   another worker. One that fails twice is counted in
   `summary.failedSearches`, and the run goes on.
3. **Merge.** One row per Google place id, keeping every city that found it
   (`search_locations`).
4. **Website contacts.** For each business with a website, the homepage and up
   to three same-site contact, team or about pages. It collects emails, phones,
   social links and people from structured data. Plain code, no LLM.
5. **CSV.** The pipeline's own `companies.csv` columns: `name`, `category`,
   `address`, `phone`, `website`, `emails`, `email_sources`, `website_phones`,
   `phone_sources`, `people`, `people_sources`, `contact_links`, `mapsUrl`,
   `search_locations`, `research_status`, `research_errors`.

The job result carries the CSV and a summary:

- `processed`, `withEmail`, `withPhone`, `failed`, `noWebsite`: the website step
- `searches` and `failedSearches`: the Maps step
- `possibleLimits`: searches that may have hit Google's result cap
- `searchesByWorker`: how many city searches each worker answered

## When something goes wrong

- **A worker is off.** It stops checking in, and the other workers take its
  searches.
- **Google refuses a worker's line.** The mini and the PC each post what they
  have, ask the hub for a 30-minute cooldown (`retryAfterMs`), and rest. The
  hub gives the next searches to the others.
- **The hub redeploys mid-run.** Every finished search and website check is
  saved under `$HOME/.agy-lab/country-runs/<job id>/` (`COUNTRY_RUN_DIR`
  overrides it). The job's five-minute lease lapses, `hub-country` takes it
  again, and the run resumes where it stopped.

## Cost

A run costs one scraper.tech request for each city search scraper.tech
answers. Searches answered by the mini or a PC cost nothing. Malaysia is 355
city searches, so at most 355 requests, and fewer when the mini and the PC are
online.

## Where the code is

| What | Where |
|---|---|
| The country lane: plan, Maps through the queue, contacts, CSV | `agy-lab/src/country-research.ts` |
| The pipeline's steps, copied from gmap-country-insdusty | `agy-lab/src/country/` |
| Queue rules: mini only for country searches, its old country lane retired | `agy-lab/src/jobs.ts` (`countryScanOnly`, `RETIRED_TYPES`) |
| scraper.tech lanes | `agy-lab/src/maps-worker.ts` |
| Windows Gmap Local Worker (download on `/workers`) | `agy-lab/local-worker/worker.ps1` |
| The mini's Maps scan | `gmap.mjs` in [gmap-country-insdusty](https://github.com/Zhihong0321/gmap-country-insdusty) |
| How the mini's scan was improved | [docs/improve-mac-mini-maps.md](https://github.com/Zhihong0321/gmap-country-insdusty/blob/main/docs/improve-mac-mini-maps.md) in that repo |

The mini's own country lane, `m4-mini-country`, no longer takes
`country.industry` jobs; the hub runs them.

## Storage and limits

Completed CSVs and country job state are saved under
`$HOME/.agy-lab/country-jobs` (`COUNTRY_JOB_STORE_DIR` overrides it). Railway
must mount the persistent `/data` volume. The broker's result limit is
`RESULT_BODY_LIMIT`, 32 MiB by default.

Google Maps results are not a census. Searches can be capped, incomplete,
imprecise about location or off-topic. Website checks miss sites that need
JavaScript or a login. Emails are not checked for deliverability. Review the
results before use.

**Not yet measured:**

- how many searches Google allows the mini or a PC before refusing them, over
  a full 355-city Malaysia run
- whether the mini's feed-only businesses are all inside the searched city
