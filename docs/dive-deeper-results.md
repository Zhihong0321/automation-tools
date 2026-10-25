# Dive-deeper — step 1 results (prototype, not final)

**Round 1** (2026-10-25) ran on one company only, Eternalgy Sdn Bhd (company-dive #4). **Round 2** (2026-10-26)
came after the user approved 4 more dives: #5 Everest Tent Technologies (tents, Kajang), #6 Hou Sent Renovation
& Construction (Klang), #7 Rienzo (gates and security doors, Kajang, 754 reviews) and #8 MNA Solar / MNA Green
Tech (solar shop, Kajang). Round 2 reran only the lanes kept in round 1. Its totals come first; the round 1 detail
follows.

## Round 3: after the Step 2 fixes (same 5 companies)

Every kept lane got the fixes listed under round 2, ran again on dives #4–8, and was graded by hand again.
C's two lanes were merged into one, C-merged (rule checks plus an LLM on the company's own prose; LanguageTool dropped).

| Section · lane | Round 2: findings · precision · owner-cares yes | Round 3: findings · precision · owner-cares yes | Verdict |
|---|---|---|---|
| E · maps reviews | 44 · 89% · 12 | **48 · 94% · 19** | **Keep** |
| H · maps rank | 39 · 97% · 21 | **31 · 97% · 15** (merged per area) | **Keep** |
| H · web | 62 · 89% · 26 | **31 · 90% · 10** (deduped; noise 35% → 26%) | **Keep** |
| G · fixed questions | 103 · 93% · 44 | 108 · **88%** · 46 | **Keep, fix the domain check** |
| G · grounded | 125 · 70% · 45 | **143 · 83% · 52** | **Keep, fix the domain check** |
| C · merged (rules + LLM) | 454 · 59% · 40 (two lanes) | **157 · 78% · 32**; noise 68% → 38% | **Keep; retire C-rules and C-llm** |
| D · registers + CIDB sweep | 64 · 91% · 7 | **54 · 96% · 12**, 0 wrong | **Keep** |

Fewer "yes" findings in H and C is mostly merging: one finding per area, or one hijack alert, now stands for what used to be several.

What the fixes bought:
- **Repeatable.**
  - H stores its trade words and towns per company.
  - D stores its claim list per company.
  - G asks every question 3 times and reports the majority answer.
- **Wrong verdicts fall:**
  - D: 4 → 0.
  - G grounded judge: 33 false "wrong" → 4. 0 of 101 claims graded "sourced, not in dive" were wrong.
  - C: 97 → 10.
- **New, checked findings.**
  - Dead own pages that search still lists (eternalgy.com/admin; 3 Rienzo pages, all 404).
  - Same-address duplicate listings (Everest + "Sri SSK Canvas"; MNA Solar + "MNA Green Tech", with different phones).
  - Eternalgy has no KL listing despite its KL office.
  - CIDB sweep for every company: Rienzo G2 expired, Everest not registered, Hou Sent's old firm expired; Eternalgy and MNA undersell, since they show G3/G5 while the register says G7.
  - Reviews hidden deeper in the list: a 2★ model-swap complaint with no reply at Rienzo (2023).
  - Defensive replies to 1★ reviews at MNA.
  - Review widgets on the sites (Rienzo Trustindex, Everest Elfsight).
  - MNA's shop shows RM 0.00 prices.
  - A leaked internal note on Eternalgy's news page is now caught by a rule.
  - The everesttent.com gambling takeover: now one top alert in H-web, C and G.
- **gpt runaway answers are gone.** Asking for brevity in the prompt, with no cap, brought the longest answer down to 2.4k characters (it was 868k). The models also invented less, which may change what G measures.

New problems the fixes introduced (not built yet):
- **G: the domain check matches generic name words** ("tent", "gate", "hou"). It gave 13 wrong "AI gives a non-existent or other site" findings and one false gambling alarm. It is the reason G-fixed precision fell from 93% to 88%; without it, both G lanes would be about 90%.
- **H: a listing whose name is part of an alias** ("AutoGate System" ⊂ "Rienzo Autogate System") was taken as Rienzo's. Found during grading and fixed before E ran; it now requires the brand word.
- **C lost most cross-page contradictions** (11.5 GWh vs 1.65 GWh, the two KL addresses).
- Smaller ones:
  - E counts staff names with the LLM, which got worse; count them in code.
  - H skips thin queries, so Eternalgy lost its #1 rank in Kluang.
  - H read Rienzo's old Cheras address as a current office.

Cost per company, round 3:
- **Maps:** ~19 requests (H 9, E ~10). E reused round-2 review pages through a cache this round; it needs ~10 without it. About 230 of the 1,000 free requests are used this month.
- **Brave and Exa:** 11 Brave, 9 Exa (~$0.06).
- **LLM:** ~190 calls, about 1M gpt-6.1-sol input tokens; G-fixed's 3 asks per question are most of it.
- **Time:** the lanes run in parallel, so the longest one, 4–5 min, sets the total.

---

## Round 2: kept lanes on all 5 companies

Precision is correct / findings, for all 5 companies. "Owner cares" counts the yes verdicts.

| Section · lane | Findings | Correct | Precision | Owner cares (yes) | Per company: requests | Per company: time | Verdict now |
|---|---|---|---|---|---|---|---|
| E · maps reviews | 44 | 39 | 89% | 12 | 5–9 Maps, 3 Brave, 1 LLM | 1.5–2 min | **Keep, change** |
| H · maps rank | 39 | 38 | 97% | 21 | 3–9 Maps, 1 LLM | 0.5 min | **Keep** |
| H · web rank + name search | 62 | 55 | 89% | 26 | 5–11 Brave, 2 LLM | 1 min | **Keep, change** (noise) |
| G · fixed questions | 103 | 96 | 93% | 44 | 45 LLM (~250k gpt tokens) | 3.5–4 min | **Keep** |
| G · grounded (Exa first) | 125 | 88 | 70% | 45 | 45 LLM, 9 Exa | 4 min | **Keep, fix the judge first** |
| C · rule checks | 83 | 77 | 93% | 12 | 14–65 GETs, 0 LLM | 0.1–1 min | **Keep**, add a defacement check |
| C · LanguageTool grammar | 62 | 19 | 31% | ~1 | 1–12 calls | – | **Drop** |
| C · LLM page by page | 309 | 171 | 55% | 27 | 2–31 LLM | 1–8 min | **Keep, change** |
| D · registers | 64 | 58 | 91% | 7 | 2–14 GETs, 1–2 LLM | 1.5–3 min | **Keep, rebuild as a CIDB sweep** |

Cost per company:
- Inputs: ~15 Maps requests, ~10 Brave, 9 Exa (~$0.06) and ~110 LLM calls. Most of the tokens are gpt-6.1-sol in section G.
- Time: the lanes run in parallel, so the longest lane, about 4.5 min, sets the total. The company-dive before them takes 7–12 min.
- Maps budget: about 160 of the 1,000 free requests used this month.

### What the 4 new companies taught us

**Correct is not the same as worth paying for.** Outside solar, most findings are true but dull. D found nothing an owner would care about for Everest, Hou Sent or Rienzo, because its registers are solar ones. LLM findings in C were mostly "no".

**The best finding per company came from different sections each time:**
- **Everest:** its official domain everesttent.com now serves an Indonesian gambling site (ROYAL123) and still ranks for the company's name (H-web; checked live). C-llm saw it but buried it among grammar notes, and C-rules missed it. A LinkedIn page in Everest's name carries the same "ROYAL 123" text (G).
- **Hou Sent:** a duplicate Maps listing with no website (H), and the only unanswered review is a written 1★ (E). A lookup by SSM number shows its old sole proprietorship in CIDB as expired G3 (found by hand in D grading; the lane missed it).
- **Rienzo:** 754 reviews at 5★, yet only #6–#8 in Kajang and Cheras (H). Facebook and directories still show the old address and the old "Rienzo Home" name (H-web). The footer registration number doesn't match the registry (C). Its CIDB G2 registration has expired (found by hand in D grading).
- **MNA Solar:** rating down to 4.0★ in the last 6 months, and the owner replies only to 1★ reviews, defensively (E). A second Maps listing at the same address has a different phone (H). The footer still says "© 2023 MNA Gadgetz", the old brand (C; checked live). CIDB says G7 while its own listings say G5 (D grading).

**AI invents websites:** for 3 of 4 companies, both models gave domains that do not exist (everesttent.com.my, rienzohome.com.my, mnagreentech.com; DNS-checked by the lead session). Without search, AI named the company in 1 of 16 trade answers; with search, in 6 of 16.

### Changes each section needs (Step 2 material, not done)

- **E:**
  - Rienzo's 9-page budget covers only its newest ~4 weeks of reviews. Sample across time instead of taking the newest pages.
  - Reserve part of the budget for small alias listings.
  - Detect review widgets on the site. Rienzo shows 8 Google reviews through Trustindex, so "reviews not reused" was wrong.
  - Tag the tone of owner replies (MNA's are defensive).
- **H:**
  - Pick the trade words and areas once per company and store them. Today each run picks new ones, so ranks can't be compared between runs.
  - Dedupe by URL across the 3 name queries.
  - Keep "a different company shows up" only for the same trade in Malaysia (Minnesota "MN Solar" and Houston "Heaven Sent" are noise).
  - Skip thin queries that return fewer than 10 results.
- **G:**
  - Give the grounded judge the search snippets and a "sourced, not in dive" verdict. 33 of 41 of its "wrong" verdicts were real facts the dive lacked.
  - Add a DNS check on every domain an AI answer names.
- **C:**
  - Add a defacement check (gambling or spam keywords, a title that doesn't match the company) that stops the crawl and raises one top alert.
  - Read JS-filled values properly (Rienzo's counters show "0 %" in raw HTML).
  - Run after H so Maps phones get compared.
- **D:**
  - Always sweep CIDB CIMS by SSM number, then by name, with the valid and expired filters run separately.
  - Make "value not shown means can't check" a rule in code (all 3 of its wrong verdicts were this bug).
  - Drop identity facts from the claim list.
  - Next registers to test: ST ECOS (down both days), SIRIM, MyIPO.

### Errors found in company-dive output (company-dive not changed)
- Eternalgy: the dive treats MyDigital Kontraktor (the company's own page, G3) as CIDB. CIMS says G7.
- Rienzo: the dive's address is Dun & Bradstreet's, so G asked trade questions about the wrong town.
- MNA: the dive shows CIDB as "active", but MyDigital Kontraktor says it has expired, and CIMS says G7 valid.

---

## Round 1 detail (Eternalgy only)

Plan: [dive-deeper-plan.md](dive-deeper-plan.md). Code: `agy-lab/scripts/dive-deeper/`. Nothing deployed,
nothing written to the hub, no `companydive*` file touched.

```
cd agy-lab
node scripts/dive-deeper/run.ts <section> <lane> <diveId>     # e.g.  H maps 4
```
Each lane is its own file, `sections/<section>-<lane>.ts`. Raw output goes to `out/` (gitignored, since it
holds review text and people data).

Grading: every finding was checked by hand against its source, either by the lane's agent or by the lead
session (spot checks below). "Correct" means the finding states what the source really shows.

Cost units:
- scraper.tech Maps: on the free 1,000/month plan; $0.00013 per request at Basic pricing.
- Exa: $0.007 per call, as measured on 2026-10-24.
- Brave: about $0.005 per call at list price.
- LLM: tokens only; the router's price per token is not known.

### Round 1 summary: keep / change / drop

| Section | Lane | Verdict | Why, in one line |
|---|---|---|---|
| **E** customer feedback | E-maps (scraper.tech `reviews`) | **Keep** | 11/12 correct, 7 an owner cares about, ~$0.001 |
| | E-web (Exa + Brave) | **Drop as a lane**, keep as an add-on | Mostly found copies of the Google reviews; its "no complaint on the web" verdict was wrong |
| **H** findability | H-maps (search_maps rank) | **Keep, change** | 9/10 correct, stable on re-run, 9 requests |
| | H-web (Brave rank + name search) | **Keep, change** | 10/11 correct; "your site is invisible for 7 of 8 searches" |
| **G** how AI sees you | G-fixed (11 template questions) | **Keep, change** | 20/22 correct, repeatable across companies; ask each question 3× |
| | G-free (customer-voice prompts) | **Merge into G-fixed** | 11/11 correct, but most of the cost; 2–3 of its prompts are worth keeping |
| | G-grounded (Exa results, then the questions) | **Keep, change** | Simulates a search-enabled assistant; judge errors 5/25 |
| **C** website health | C-rules (deterministic + LanguageTool) | **Keep the rules, drop LanguageTool** | Rule checks 23/23 correct; LanguageTool 5/16 |
| | C-llm (page-by-page LLM) | **Change, merge** | Found ~20 real copy errors the rules missed, but 52% precision |
| **D** unproven claims | D-registry (issuer registers) | **Keep** | 15/18 correct; found the single biggest fact of the run |
| | D-web (search evidence) | **Drop as a verdict lane** | 9/18 correct; registers are not indexed, so it says "not found" for real registrations |

Proposed next shape, for the user to decide: **E-maps, H-maps + H-web merged, G-fixed (+ grounded), C merged, D-registry.**
That is 5 sections, about 2 Exa calls, ~25 Maps requests, ~100 LLM calls and roughly 10–15 minutes per company,
with sections running in parallel.

## E — customer feedback

| Lane | Findings | Correct | Wrong | Unsure | Owner cares (yes/maybe/no) | Maps | Exa | Brave | LLM calls (tok in/out) | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| E-maps | 12 | 11 | 0 | 1 | 7 / 4 / 1 | 9 `reviews` | 0 | 3 | 1 (1.9k / 11.6k) | 107 s |
| E-web | 6 | 4 | 1 | 1 | 0 / 4 / 2 | 0 | 6 ($0.04) | 12 | 7 (38.8k / 10.4k) | 208 s |

Best findings (verified by the lead session against the raw review JSON):
- **0 owner replies across all 44 Google reviews**, including a 1★ complaint (Aug 2025) about a roof leak after installation. It is still unanswered 14 months later.
- **17 of 44 reviews were posted on one day** (2026-05-16, when the Kluang branch opened), 8 of them star only. 3 accounts reviewed both branches, one 16 seconds apart. To a customer or to Google, this looks like solicited reviews.
- A 1★ review with no text (2026-08-18) is from an account with the same name as a staff member listed in the dive. The user should check this.
- None of the good written reviews are reused on the websites, and there is no testimonials page.

Limits:
- The reviews API returns 5 per page whatever `limit` says, and pages overlap, so the lane dedupes by `review_id`.
- The API gives no reply date, so reply speed cannot be measured.
- `sort: newest` sorts by the last-edit date.
- Neither lane can read Facebook reviews.

## H — findability

| Lane | Findings | Correct | Wrong / noise | Owner cares (yes/maybe/no) | Requests | LLM calls (tok in/out) | Time |
|---|---|---|---|---|---|---|---|
| H-maps | 10 | 9 | 1 | 7 / 2 / 1 | 9 Maps | 1 (1.3k / 0.3k) | 29 s |
| H-web | 11 | 10 | 1 | 8 / 2 / 1 | 11 Brave | 2 (5.4k / 5.4k) | 72 s |

Best findings:
- On Maps, Eternalgy ranks #11 for "solar panel installer in Johor Bahru" and #15 for "solar company in Johor Bahru". Ahead of it are firms with up to 203 reviews.
- It does not appear in the top 60 in Kuala Lumpur, although the websites list a KL branch. There is no KL Maps listing at all.
- The Seremban listing has 0 reviews.
- In web search (Brave), the official site is not in the top 20 for 7 of 8 trade × area searches.
- A search for "Eternalgy review" shows no customer reviews. 6 of the 10 results are about other things (a film, an energy drink).

Fixes for the next round:
- Merge the per-area results.
- Drop "the branch phones differ", which is noise: each branch having its own phone is normal.
- Count Facebook and Instagram as the company's own results.
- Add "claims a branch in X but has no listing there".
- Say in the report that Maps has no location bias and that Brave stands in for Google.

## G — how AI sees you

| Lane | Findings | Correct | Wrong | Unsure | Owner cares (yes/maybe/no) | LLM calls | Tokens in / out | Exa | Time | Repeatability |
|---|---|---|---|---|---|---|---|---|---|---|
| G-fixed | 22 | 20 | 2 | 0 | 11 / 9 / 2 | 45 | deepseek 0.7k/22k · gpt 347k/19k | 0 | 259 s | 15–18 of 22 outcomes repeat |
| G-free | 11 | 11 | 0 | 0 | 9 / 2 / 0 | 26 | deepseek 1.2k/26k · gpt **538k/195k** | 0 | 332 s | 10–11 of 12 |
| G-grounded | 25 | 19 | 5 | 1 | 12 / 10 / 3 | 45 | deepseek 21k/11k · gpt 353k/50k | 9 | 297 s | 19 of 22 |

Best findings (lead spot check: the "founded in 2016" and "Dato' Seri Dr" founder claims are in the raw answers):
- **deepseek invents the company's history, differently on each run.** It gives founding years from 2013 to 2016, made-up "Dato' Seri Dr" founders, a 51% parent company and a Kuching office.
- **AI almost never names Eternalgy for "solar installer in JB"**: once in about 60 answers.
- The two websites give AI different addresses and phones (see C).

Limits:
- **Every wrong finding came from the judge LLM.** It marked true details as invented when they were on the company's sites but not in the dive. The fix is to give the judge the site text as well as the dive.
- gpt-6.1-sol does its own web search, so "AI has no web access" holds only for deepseek.
- gpt-6.1-sol sometimes runs away and writes answers of 389k–868k characters (in 3 of 4 free-lane runs). Under the no-kill-gates rule there is no cap, so this is a **cost risk the user needs to decide on**: allow a cap for this one section, or drop gpt from the free prompts.
- Temperature 0 is not repeatable, so ask each question 3 times and report the majority answer.

## C — website health

| Lane | Findings | Correct | Wrong | Unsure | Owner cares (yes/maybe) | Pages | LLM calls (tok in/out) | LanguageTool | Time |
|---|---|---|---|---|---|---|---|---|---|
| C-llm | 132 | 69 | 34 | 29 | 17 / 37 | 30 | 31 (53k / 157k) | 0 | 502 s |
| C-rules | 39 | 28 | 10 | 1 | 13 / 7 | 30 (65 GETs) | 0 | 12 | 61 s |
| ↳ rule checks only | 23 | 23 | 0 | 0 | 12 / 7 | | | | |
| ↳ LanguageTool only | 16 | 5 | 10 | 1 | 1 / 0 | | | | |

Best findings (lead spot check: the masked phone, both HQ unit numbers and the 287x/289x phones are all on the live pages):
- **The tap-to-call number on eternalgy.me is masked (`+601****0099`)**, and so is the copy in the structured data that Google reads.
- solarpanels.my shows 011-2067 2875 next to the main 011-2067 2895, which looks like a typo.
- eternalgy.me's WhatsApp link opens a personal chat, not the company's.
- **The two sites disagree.** The HQ unit is 23-01 on one and 21-01 on the other. The KL address, the founding month and the generation figures also differ.
- On solarpanels.my, the Products menu goes to a 404 page, 4 service pages say only "Coming Soon!", and the homepage headings have errors ("DISCOVERY MORE", "Renewal Energy").

Grammar, head to head:
- The LLM found about 20 real errors that LanguageTool missed.
- 18 of the LLM's false alarms come from turning HTML into text (values shown as formula images, stray spaces), and 11 are matters of taste.
- LanguageTool flags brand and technical words.
- Next: one merged lane, made of the rule checks, an LLM reading only the company's own pages with cleaner text, and the LLM's findings shown only when it quotes the exact text.

## D — unproven claims

| Lane | Claims | Verified | Contradicted | Not found | Can't check | Correct | Wrong | Unsure | Owner cares | Exa | Brave | Pages | LLM calls (tok in/out) | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D-registry | 18 | 6 | 3 | 1 | 8 | 15 | 1 | 2 | 5 + 1 private | 0 | 0 | 14 | 2 (8k / 22k) | 177 s |
| D-web | 18 | 3 | 0 | 15 | 0 | 9 | 6 | 3 | 0 | 12 ($0.08) | 12 | 5 | 13 (35k / 47k) | 467 s |

Best findings:
- **CIDB's own register (CIMS) lists Eternalgy as G7.** The lead session re-ran the check and the result reproduced. eternalgy.me and the MyDigital Kontraktor page still say G3. **The company-dive had this backwards.** It treated MyDigital Kontraktor as CIDB evidence, but that is the company's own portfolio page ("© ETERNALGY SDN. BHD."). So the "G3 vs G7" contradiction in the bait points the wrong way: the site undersells, it does not overclaim.
- The SEDA RPVSP listing has every market segment unticked, and its unit number is reversed (01-23 instead of 23-01).
- MyHijau MyHS00025/25 is a **service** certificate (solar EPCC), not the inverter certificate eternalgy.me presents it as.
- **Private, never bait:**
  - The SEDA and MyHijau public directory data include staff MyKad numbers.
  - Indexed customer-invoice links (`eternalgy.com/inv-m2/…`) turned up in search, and now return 404. That is section J material.

Registers:
- Can be read automatically: CIDB CIMS (POST search, no CAPTCHA), SEDA RPVSP and RPVI (JSON embedded in the page), MyHijau (by certificate number only), Golden Bull winners, the MPSEA member PDF.
- Cannot: Suruhanjaya Tenaga ECOS (down for maintenance), Maybank installer list (none public), SSM e-Info (paid), SAJ distributor list (none).

Fixes:
- Extract the claim list once per dive and share it between lanes; it changes on each run, even at temperature 0.
- Say which way a contradiction points: undersell or overclaim.

## Open items for the user

1. ~~Run the other 4 test companies?~~ Done in round 2 (dives #5–8).
2. **gpt-6.1-sol runaway answers in section G** (round 2: 5 answers over 20k characters, the largest 202k): allow a length cap in that one section, or ask gpt only the fixed questions?
3. The company-dive's G3/G7 reading is wrong. It is a company-dive accuracy issue, so it is for you to decide; nothing in company-dive was changed.
4. Facts only you can settle:
   - is the HQ at unit 23-01 or 21-01?
   - is the Golden Bull award from the 2025 edition, or for 2024 performance?
   - the Maybank, SHRDC and ST registrations;
   - the staff-name 1★ review.

[NOT IMPORTANT]
- The per-lane write-ups with every finding's verdict are in the session notes folder (`E-, G-, C-, D-, H-results.md`). They are not in the repo, because they quote reviewers and staff by name.
- Fixed in `lib.ts` during the run: `ctx.maps('reviews')` returned null, because the reviews payload has no `status` field.
- `ctx.page` reads bodies as text, so it corrupts PDFs. D-registry fetches binary files itself.
- C's first runs had a chunking bug that invented typos at the cut points. It was fixed before the graded runs.
- The C-rules lane made 65 GETs. Lowering the link-check cap from 25 to 15 brings it under 50.
- `D_ONLY=CIDB` limits a D run to one issuer, for small tests.
