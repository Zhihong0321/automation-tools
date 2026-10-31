# Country-specific deeper-dive pipelines (planning record)

Status: recorded 2026-10-27. On 2026-10-30 the Malaysia pipeline was redone around the five parts below; the
folder split and other countries are not built yet.

## malaysia-deeper-dive: the report's parts (2026-10-30)

The user set the report's focus. Each part is fed by its own lanes (`editor.ts` AREAS); C-merged's website checks are
sorted into the part each one is about (`partOfCheck`).

| Part | What it answers | Lanes |
|---|---|---|
| 1 Contact and reachability | Every phone, email, WhatsApp and address published about the company: does each still reach it, or an ex-employee, another business, a dead line? | **R-contacts** (new), C-merged contact checks |
| 2 How the internet understands you | Do search, Maps, AI assistants and directories know what it sells and why choose it; up to date; selling points with proof | **B-brand** (new), G-fixed, G-grounded, H-maps, H-web, C-merged content checks |
| 3 Reviews, discussion and news | Google reviews, plus news, forums and social talk about the company, brand and key people | E-maps, **N-news** (new) |
| 4 Credibility and official records | BNM and SC alert lists, court judgments, winding-up notices, Bursa, .gov.my mentions, published financials; licences in their registers | **K-credibility** (new), D-registry, C-merged SSM check |
| 5 Digital assets | Domains (MYNIC whois / RDAP), expiry, registrant, DNS, hosting network, email (MX, SPF, DMARC), certificate, CMS, subdomains (crt.sh), lookalike domains | **A-assets** (new, no LLM), C-merged SSL checks |
| 6 Website speed and quality | Google PageSpeed Insights on the official homepages, mobile and desktop, plus 28 days of real Chrome visitors | **W-speed**, C-merged speed checks |
| 7 Full analysis | One read across all six parts: verdict, the three problems costing the most customers, each part assessed, the causes that run through several parts, what to build on, risks, opportunities, what does not add up | **S4-analysis** |
| 8 Action plan | Every urgent and needs-work finding as a task for the department that does it (website: content and speed; social media: reviews, replies, listings; IT: domains and email; other: legal and records), with when, effort and the ready-to-use draft that does it | **S5-plan**, drafts from S2-consult |

S3-editor writes the plain titles and the proof screenshots every part uses. S5 checks the plan is complete: an urgent or
needs-work finding no task covers is still listed under its department (`editor.ts` DEPTS, `deptOf`).

Run order on the hub: H-maps, H-web, D-registry, G-fixed, G-grounded, K-credibility, N-news together; E-maps and C-merged
after H-maps; then R-contacts, A-assets and B-brand (they read C-merged, H-maps, H-web and G-fixed); then S2, S3, S4 and S5, one after another.

Not checked automatically, stated as such in the report: SSM e-Info documents, CTOS/CCRIS, MDI insolvency search (paid),
PDRM Semak Mule. bnm.gov.my sits behind a bot check, so its alert list is read through Exa and Brave, never by passing it.

## Context

The plan is to sell the dive-deeper report to advertising and media agencies, first in Malaysia and then in
other countries, and later to make those agencies resellers. Every country has its own registries, job sites,
social media, legal rules and report language.

**User's decision:** deeper-dive becomes a country-specific pipeline. Today's pipeline is renamed
`malaysia-deeper-dive`. Each new country gets its own `{country}-deeper-dive`, so each country's dive strategy can
be managed on its own.

## What the user wants decided per country

1. which sites the deep dive and the deeper dive read (registries, directories)
2. which job sites to explore
3. which social media matter in that country
4. which language the report is written in

## Structure

```
agy-lab/src/deeper-dive/
  shared/                  <- country-neutral plumbing, one copy
    lib.ts                 (ctx, llm queue, maps, exa, brave, page, vault)
    runner.ts              (runLane, stageDive)
    report-shell.ts        (HTML frame and styles; text comes from the country)
  malaysia/                <- today's pipeline, renamed
    pipeline.ts            (lane list and order, Brave/Maps codes, language)
    sections/              (H-maps, H-web, D-registry, C-merged, E-maps, G-*, S2 ...)
    report.ts              (labels and wording, English)
  singapore/               <- future: copy malaysia/, then change what differs
  ...
```

### What belongs to each country (its own copy, managed alone)
- the lane list and order
- registries (MY: SSM, CIDB and the other registers in `D-registry.ts`)
- website legal rules (MY: Companies Act s.70 company number)
- phone and address formats
- job sites (MY: JobStreet, Hiredly, Maukerja)
- social media and review sites (MY: Facebook, Instagram, TikTok, Xiaohongshu, Lowyat, recommend.my)
- search languages
- consultant persona and report language
- report wording

### What stays shared (one copy)
- **Plumbing:** the runner, the vault, the page fetcher and the report frame. LLM, Exa, Brave and Maps calls are not
  lane plumbing at all: every country calls them through `agy-lab/src/core/` (the app-wide LLM router with every lane
  on /workers, and the key pools; [core/README.md](../agy-lab/src/core/README.md)).
- **Why:** a fix there (like the Vectide 429 queue) then reaches every country at once, instead of being copied N
  times.
- **Rule of thumb:** a lane only moves into `shared/` when two countries are byte-identical, and the user decides that.

## Rename: dive-deeper -> malaysia-deeper-dive

Files today:
- `agy-lab/src/divedeeper.ts`: API, queue, DB table `dive_deeper`
- `agy-lab/src/divedeeper/{lib,runner,report-html}.ts`
- `agy-lab/src/divedeeper/sections/*`
- `agy-lab/scripts/dive-deeper/{run,report}.ts`

Places that hard-code Malaysia today (they stay as they are inside `malaysia/`):
- `divedeeper.ts:121` sends `country: 'Malaysia'`
- `lib.ts:212` Maps `'my'`
- `lib.ts:270` Brave `'MY'`
- `lib.ts:64` CA workaround for MY government hosts
- `H-web.ts:67,80`
- `S2-consult.ts:118`
- `report-html.ts:108,275`

Decide before renaming:
- **API path:** keep `/api/dive-deeper` working (old links and callers) and add `/api/{country}-deeper-dive`, or route
  `/api/dive-deeper` with a `country` field.
- **DB:** keep the one `dive_deeper` table plus a `country` column (simplest), or one table per country.
- **Public report links** already sent out must keep working.
- **Queue:** one queue shared by all countries, or one queue per country.

company-dive (the first-stage deep dive, `agy-lab/src/companydive.ts`) already takes a country (`COUNTRY_CODES`
at :80). Its search sites per country can later follow the same pattern.

## Per-country additions (inside each country's pipeline)

### J-jobs lane
- open roles and how long they stay up
- which roles: marketing hires mean ad budget, a strong sales signal for agencies
- employer reviews

### E-social lane
- the country's social list: presence, last post, followers
- handles that don't match the website
- reuse ideas from the inactive `sections/E-web.ts`

### Report language
- Lanes work in English so quote checks still match page text; evidence quotes stay in the original language.
- A final pass translates the titles, details and S2 text into the country's report language.
- Model: Vectide deepseek-v4.1-flash-1017 (no Gemini; MiniMax is out).

## Build order (when execution is allowed)

1. Rename to `malaysia-deeper-dive` and split out `shared/`, with no behaviour change. Rerun one company and diff its
   findings against its last run.
2. Add J-jobs and E-social to the Malaysia pipeline.
3. Pick the second country (by sales priority), copy `malaysia/`, and change its registries, legal rules, job sites,
   socials and language.
4. Each later country follows step 3.

## Verification (per step)

- Run one company, and only the changed lane. Never fan out.
- The rename must produce the same findings on the same dive.
- For a new country, run one real company from that country and check every registry and legal finding by hand
  before it goes to a client.
