# Dive-deeper — plan (draft, to be shaped by trial and error)

Status: **proposal only.** Nothing here is built. Every section list, price and threshold below is a
starting guess, to be tested and changed.

## 1. What it is

A second, paid research stage that starts from a finished **company-dive** report and goes further.

```
company-dive (exists, free, the bait)   ->   client pays   ->   dive-deeper (new)
  who the company is, cited facts,             full report: every finding, with
  contradictions, gaps, people                 sources, scores and fixes
```

The report answers one question from three angles, from the company's own point of view:

| Angle | Question it answers |
|---|---|
| **How AI sees you** | What AI assistants say when someone asks about the company, or about its trade in its area |
| **How the internet sees you** | Whether the company's details agree across its website, Google Maps, social media and directories |
| **How the public sees you** | What customers say, and whether the company answers them |

Who it is for: the company itself, as a business presence audit ("here is what customers see, and how
to fix it"). The same report could later serve a second buyer, people checking a company before
dealing with it, but that is out of scope for now.

### The funnel

1. **Bait.** The company-dive report, with about 75% of the critical findings masked. It shows counts
   and section titles, never the hidden values. For example: "7 contradictions found (1 shown)", "38
   reviews found, 5 negative with no reply", "last Facebook post 14 months ago".
2. **Pay.** The client unlocks the report, at around $49 (to be tested).
3. **Dive-deeper.** It runs on that company and delivers the full report.

Two rules for the bait, from the start:
- **Every number the bait shows has already been found.** A teaser that promises more than the paid
  report delivers means refunds and a bad name. So any count the bait shows for a dive-deeper section
  (reviews, social posts) is measured cheaply before the bait is sent.
- **People and exposed contacts are a warning, never bait.** "3 staff personal numbers are publicly
  listed — here's how to remove them" is fine. Partly masked names or numbers ("T** A**", "016-7*** ****")
  are not: they read as "we hold your data", and they invite PDPA trouble.

## 2. Hard rule: company-dive must not break

**Company-dive is working, and it is the bait. Dive-deeper must not change its behaviour, its data
or its speed in any way.**

How that is enforced:

| Rule | Detail |
|---|---|
| **New files only** | Dive-deeper lives in new files (`agy-lab/src/divedeeper*.ts`, its own tests, page and routes). It never edits `companydive.ts`, `companydive-people.ts`, `companydive-report.ts`, `companydive-page.ts` or `companydive.test.ts`. |
| **Read-only on company-dive data** | It reads a finished dive through `GET /api/company-dive/:id` or a plain `select` on `company_dive`. It never writes to that table, never adds columns to it, and never changes its rows or statuses. |
| **Its own storage** | A new table, `dive_deeper`, linked by `dive_id`. Its own public link prefix (not `/d/`). |
| **No shared helpers changed** | If it needs logic that lives inside company-dive, it copies it into its own file rather than refactoring company-dive to share it. Moving code out of company-dive counts as changing it. |
| **Its own queue** | Company-dive runs one dive at a time. Dive-deeper runs on its own queue, so a deep run never makes a dive wait. |
| **Its own quota** | The Tavily key pool is shared by company-dive and contact research. Dive-deeper prefers sources the bait does not use (scraper.tech, Exa, direct page reads), and gets its own small Tavily budget so it cannot drain the pool. |
| **Behind a switch** | `DIVE_DEEPER_ENABLED`, off by default. With it off, the hub behaves exactly as today. |
| **Proof before every push** | `companydive.test.ts` passes unchanged. One existing dive's public page (`/d/:id`) is checked to load the same before and after the deploy. A `git diff --stat` must show no `companydive*` file. |

It also follows the no-kill-gates rule: no timeouts, `max_tokens` caps or throw-on-fail inside the
pipeline. A section that cannot finish falls back, logs a warning, and the report ends `partial`.

## 3. Sections to try

Each section is its own small module with one input (the dive result plus the company's links) and
one output (findings, each with a source link and the date it was checked). That way each section can
be tested, tuned or dropped on its own.

| # | Section | What it looks for | Likely sources | First guess at the method |
|---|---|---|---|---|
| A | **Contradictions** | Different phones, addresses, hours, names or registration numbers across sources | The dive's `contradictions` and sources, Maps `place_info`, the website, Facebook | Start from the dive's list; add a field-by-field comparison table |
| B | **Outdated next to current** | 2019 details shown beside 2026 ones; closed outlets still listed; old logo or old address | Same sources, plus page dates | Tag each fact with the newest date seen for it |
| C | **Website health** | Grammar and spelling, broken links, SSL, mobile, "© 2019", dead WhatsApp links or forms, a missing SSM registration number, a Gmail contact | Direct read of the site's pages | Fetch and check the pages; the LLM checks grammar page by page |
| D | **Unproven claims** | Grades, certificates, awards and client logos with no proof (for example a CIDB G7 claim) | CIDB public search, SEDA registered PV providers, ISO certification bodies, SSM | One lookup per claim; "verified", "not found" or "can't check" |
| E | **Customer feedback** | Bad reviews with no reply, reply speed, rating trend, and whether good reviews are reused on the site or social media | scraper.tech `reviews`, the website, social pages | Count, classify, and match quotes across sites |
| F | **Imbalance** | Strengths the website claims that social media never mentions, and the other way round | Website, Facebook, Instagram, LinkedIn | The LLM compares the two claim lists |
| G | **How AI sees you** | What AI models answer to "Is X reliable?", "Who does Y in Z?" and "What is X's phone number?" | The models on our keys (deepseek, gpt-6.1-sol); others later | Ask a fixed set of questions; score each answer against the dive's verified facts |
| H | **Findability** | Where the company ranks on Google Maps for "<trade> in <area>"; what a search for its name shows | scraper.tech `search_maps` | Rank among its competitors |
| I | **Social activity** | When each platform last posted, dead pages, duplicate or unofficial pages | Exa, Tavily, the pages themselves | The latest date per platform |
| J | **Risks, reported privately** | Impersonation, scam listings, complaint threads, staff personal numbers exposed publicly | Exa or Tavily web search, the dive's people step | A private alert with how to fix it; never published, never used as bait |

The output adds:
- a **score** for each section and an **overall score** out of 100;
- the **top 5 fixes**, each with how much effort it takes and how much it helps.

## 4. How to test and try (kick-start)

Nothing below is final. Each step is meant to teach us what to change.

### Step 0 — Pick the test set
Five companies, each with a finished company-dive:
- **Eternalgy**, our own. We know the true answers, and it has the G7 claim to check.
- 2 Sdn Bhd firms from the lead list: a manufacturer and a contractor.
- 1 shop with Google reviews.
- 1 company whose dive already found contradictions.

### Step 1 — Prototype each section as a local script
Run it from this machine, like `find-tamans.ts`, reading the dive through the hub API. Nothing is
deployed, and the hub is not touched.
- One command per section: `node scripts/dive-deeper.ts <section> <diveId>`, which prints the findings.
- Order to build: **E, H, G, C, D** first. They are new information the bait does not have, and they
  are cheap to check. **A, B, F, I, J** come after.
- For each section and company, write down:
  - how many findings it made;
  - how many were right, judged by hand;
  - what it cost (requests and credits);
  - how long it took;
  - whether a business owner would care.

### Step 2 — Keep, change or drop each section
- Keep a section only if most of its findings are right and an owner would care about at least one
  of them.
- Drop or rework the ones that are noisy. (The taman finder showed how fast noise creeps in, which is
  why every section is judged by hand first.)

### Step 3 — Write the full report by hand-assembly
Put the kept sections together into one report for each of the 5 companies, as an HTML page. Show
them to 2 or 3 business owners. Their reactions answer three questions: what they'd pay for, which
section hooks them, and whether $49 feels right.

### Step 4 — Build the bait mask
From the same 5 company-dive reports, produce the masked version, with the counts taken from step 1.
- Test it on a few owners: does it make them want the rest?
- It is a new view over existing dive data. It does **not** change the company-dive report or page.

### Step 5 — Move it into the hub as its own pipeline
Only once steps 1–4 hold up:
- new files, the `dive_deeper` table, its own queue, routes and page;
- behind `DIVE_DEEPER_ENABLED`;
- with the "proof before every push" checks from section 2.

### Step 6 — Payment and unlock (later)
- FPX or card through a Malaysian gateway (Billplz, ToyyibPay or Stripe). Payment starts dive-deeper
  and unlocks the link.
- Promise "within 24 hours" while a person still checks each report before it is sent.
- Later: a monthly re-check ("your score went from 54 to 71").

## 5. Open questions (answer during testing)

- Which sections do owners value most? Probably AI view, reviews and findability, but that needs checking.
- Is $49 right, or does a cheaper first report sell more?
- How much does one deep run cost once every section runs? It has to stay far below the price.
- Which outside registers (CIDB, SEDA, SSM) can be checked automatically, and which need a person?
- Which AI assistants should we ask, given the Gemini ban? Only the models on our keys, or real
  ChatGPT and Perplexity accounts? (Since 2026-10-25 Cloudflare refuses ChatGPT chats from the
  Railway IP, so a real ChatGPT account would have to be asked from somewhere else.)
- PDPA: get a one-hour check from a Malaysian lawyer before the first paid report. Keep personal data
  to what the company publishes itself.
- Delivery: an HTML link only, or a PDF as well?
