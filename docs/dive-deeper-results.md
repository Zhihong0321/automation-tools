# Dive-deeper — step 1 results (prototype, not final)

Run on 2026-10-25/26 against **one company only, Eternalgy Sdn Bhd (company-dive #4)**. The user chose that
test set: only Eternalgy had a finished dive, and the user asked for no new dives yet. So every number
below is n = 1. It shows which methods work, not how they behave across companies.

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

## Summary: keep / change / drop

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

1. **Run the other 4 test companies?** (They need new company-dives: ~37 Tavily credits each.) The n = 1 caveat applies to everything above.
2. **gpt-6.1-sol runaway answers in section G**: allow a length cap in that one section, or ask gpt only the fixed questions?
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
