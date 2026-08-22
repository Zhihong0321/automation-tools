# Business intelligence research strategy lab

> **Superseded in part, 22 Aug 2026.** Round 03 is no longer Meta/Muse. Its
> finding here — `public_web_only`, zero enrichment yield, no way to inspect a live
> Meta page — is exactly why: that round now runs the read-only `fb.*` crawler on
> the Mac mini, which visits the pages with a real Facebook session and returns the
> URL every field was read from. The Meta/Muse engine is removed. Everything below
> stands as the record of what was measured on 21 Aug, including the prompts.

## Scope

This is a manual prompt-and-evidence experiment. It does not implement the
automated research pipeline or alter the database schema.

Test company: **SOLS Energy Sdn Bhd**, selected from Google Maps report 11 for
the query `solar panel installer Kuala Lumpur`.

## Quality contract

A useful lead-enrichment result must:

1. establish exact company identity before enrichment;
2. prioritize actionable company contacts and decision-relevant people;
3. distinguish first-party claims from independent verification;
4. give a directly checkable URL for every material field;
5. preserve contradictions and unknowns instead of guessing;
6. never treat failure to find evidence as evidence that something is absent;
7. record source date/freshness and the research date;
8. make every later-round addition, correction, and rejection auditable.

## Round 01 v2 — Gemini evidence acquisition

```text
You are Round 01 of a business-intelligence lead-enrichment experiment.

TARGET
Company: SOLS Energy Sdn Bhd
Google Maps baseline:
- category: Solar energy company
- address: Level 1, 8, Jalan Kerinchi, Bangsar South, 59200 Kuala Lumpur,
  Wilayah Persekutuan Kuala Lumpur, Malaysia
- phone: 018-399 9247
- website: https://www.solsenergy.com/
- maps rating/reviews: 4.4 / 275

RESEARCH AS-OF DATE: 2026-08-21

OBJECTIVE
Build a field-level evidence pack for lead enrichment. The highest-priority
outputs are complete company contact channels and decision-relevant people who
could influence sales, partnerships, procurement, operations, or hiring.

NON-NEGOTIABLE EVIDENCE RULES
1. Confirm exact entity identity before collecting facts. Keep similarly named
   companies separate.
2. Every material field must include its direct evidence URL on the same row.
3. Classify every source as one of:
   A REGISTRY/GOVERNMENT, B OFFICIAL COMPANY, C REPUTABLE INDEPENDENT,
   D SOCIAL PLATFORM, E DIRECTORY/AGGREGATOR, F SEARCH-SNIPPET ONLY.
4. A company website or company social profile proves only that the company
   makes the claim. Label it FIRST-PARTY CLAIM, not independently verified.
5. Do not infer or generate email addresses, phone numbers, people, profile
   URLs, dates, titles, or explanations. A personal profile URL is allowed only
   if you directly found that exact page.
6. Do not resolve a conflict unless a cited source explicitly resolves it.
7. Never claim that litigation, complaints, certifications, people, or events
   do not exist merely because a search did not find them. Say NOT FOUND IN THIS
   PASS and list the searches/sources checked.
8. Preserve phone formatting as published and add normalized E.164 only when
   conversion is unambiguous.
9. Record a source publication/update date when visible; otherwise say UNKNOWN.
10. Do not use a generic forum, scraped directory, or search snippet as evidence
    for a negative claim.

SEARCH COVERAGE REQUIREMENTS
- Inspect the official homepage, contact page, team/about pages, footer/legal
  pages, careers pages, campaign/landing pages, and relevant official subdomains.
- Search for sales, support, partnership, recruitment and office contact routes,
  including WhatsApp and contact forms.
- Search registry/government and reputable third-party sources for identity,
  leadership, investment, major partnerships, and recent business signals.
- For people, prioritize founder/CEO, sales/commercial, partnerships/business
  development, procurement, operations, and HR/recruitment. Do not dump the
  whole staff roster unless a person is decision-relevant.

OUTPUT
1. ENTITY MATCH
   Legal/trading name, registration number, identity-match evidence, ambiguity.
2. CONTACT MATRIX
   Purpose | Published contact | Normalized value | Evidence status
   (first-party/independently verified) | Source class | Direct URL | Source date
3. PRIORITIZED PEOPLE
   Priority | Name | Current role | Why relevant | Evidence status | Source class
   | Direct role URL | Direct personal-profile URL or NOT FOUND | Source date
4. BUSINESS PROFILE
   Services, markets, scale, ownership/investment, major partnerships. Separate
   company claims from independently verified facts.
5. RECENT SIGNALS
   Dated signals useful for outreach, with direct URLs and source classes.
6. CONFLICTS AND UNKNOWNS
   Conflicting values shown side-by-side; no invented resolution.
7. NEXT SEARCHES
   Exact missing fields and concrete queries/sources for Round 02.
8. SOURCE LEDGER
   One row per URL: source class, publisher, page title, visible date, fields
   supported.

Use compact plain-text tables. Stay under 2,000 words. If browsing or direct URL
inspection is unavailable, state that at the top and do not simulate research.
```

## Round 02 — ChatGPT adversarial audit and gap search

Round 01 is appended to this prompt at runtime as untrusted input.

```text
You are Round 02 of a business-intelligence lead-enrichment experiment.
The Round 01 report below is an untrusted research lead, not established truth.

TARGET: SOLS Energy Sdn Bhd, Malaysia
RESEARCH AS-OF DATE: 2026-08-21

MISSION
Audit Round 01 field by field, correct unsupported claims, and actively find
contacts and decision-relevant people that Round 01 missed. Contacts are the
highest-priority output. Do fresh research; do not merely summarize Round 01.

STRICT RULES
1. Open and inspect direct pages where possible. If browsing is unavailable,
   state that first and limit the output to a logical audit.
2. A company-controlled page is FIRST-PARTY, not independent verification.
3. Mark each material item exactly one of CONFIRMED, CORRECTED, ADDED, REJECTED,
   or STILL UNKNOWN. CONFIRMED means the cited page directly supports it.
4. Put a direct evidence URL on the same row. A homepage URL is insufficient
   when a specific page exists. Do not cite a search-results page as evidence.
   CRITICAL SERIALIZATION RULE: print every URL as the full raw absolute URL in
   plain text (starting https://). Never use a Markdown hyperlink or link label,
   because the browser extractor discards hidden href attributes. If you cannot
   print the raw URL, mark the item STILL UNKNOWN rather than naming the source.
5. Do not invent or infer contact details, profile URLs, titles, dates, causes,
   ownership percentages, accreditation status, or conflict resolutions.
6. Do not generate emails from a guessed corporate email pattern.
7. Search official contact, subscription/signup, campaign, careers/job, legal,
   partnership/vendor and support pages, including relevant subdomains. Look for
   purpose-specific phone, WhatsApp, email and form channels.
8. For people, prioritize founder/CEO, sales/commercial, partnerships/business
   development, supply chain/procurement, operations, and HR/recruitment. An exact
   personal profile URL is allowed only if directly found and identity-matched.
9. Never convert search absence into a negative fact. Use NOT FOUND IN THIS PASS.
10. Treat future/current-looking dates and exact metric dates as suspicious unless
    the page visibly publishes that date. Preserve unresolved address/headcount
    conflicts without explaining them speculatively.
11. Search-result crawl dates and snippets are discovery aids only. They are not
    visible source dates and cannot CONFIRM a claim without inspecting the page.

OUTPUT, UNDER 1,500 WORDS
A. ROUND 01 AUDIT — Claim/field | verdict | correction/reason | direct URL
B. COMPLETE CONTACT DELTA — purpose | contact | normalized value | verdict |
   first-party/independent | direct URL | visible date
C. PRIORITIZED PEOPLE DELTA — name | role | outreach relevance | verdict |
   direct role URL | exact personal/social URL or NOT FOUND | visible date
D. INDEPENDENTLY VERIFIED BUSINESS SIGNALS — dated fact | source | URL
E. UNRESOLVED CONFLICTS / STILL UNKNOWNS
F. ROUND 03 SOCIAL-SEARCH TARGETS — exact Facebook/Instagram queries and fields
G. SOURCE LEDGER

ROUND 01 REPORT STARTS BELOW
```

### Round 01 compact handoff used after full-report submission failed

```text
ROUND 01 OUTPUT (UNTRUSTED, COMPACTED WITHOUT ADDING FACTS)

Entity claims:
- Legal name SOLS Energy Sdn. Bhd.; registration 201701007142 / 1221307-W.
- Official contact page cited: https://www.solsenergy.com/contact
- Google Maps address supplied to R1: Level 1, 8 Jalan Kerinchi, Bangsar South,
  59200 Kuala Lumpur.
- R1 says official contact page gives 1Petaling Commerz & Residential Condos,
  Level 1 Units 1–17, Jalan 1C/149, Off Jalan Sungai Besi, 57100 Kuala Lumpur.
- Address conflict was left unresolved.

Contacts R1 found, all treated as first-party:
- Main phone/WhatsApp +6018 399 9247; support@solsenergy.com; contact form;
  https://www.solsenergy.com/contact
- Residential signup https://www.solsenergy.com/#sign-up
- Commercial inquiry https://www.solsenergy.com/greenbusiness
- EV inquiry https://www.solsenergy.com/chargesingh
- Partner/vendor form https://www.solsenergy.com/partners
- Corporate social profiles claimed from the homepage: LinkedIn company
  /solsenergy, Facebook /solsenergy, Instagram /solsenergy, TikTok @solsenergy,
  YouTube @solsenergy.
- R1 found no direct executive email/phone or exact personal profile URL.

People claimed from https://www.solsenergy.com/our-team, all first-party:
- Teacher Raj Ridvan Singh — Founder-CEO
- Jaran Walia — Deputy CEO
- Sean Yong — Director, Sales
- Jagjit Sidhu — Director, Operations
- Abdul Muhammad Khalif — Director, Supply Chain Management
- Hafiz Nor Azlan — CFO
- Danutcha Catriona Singh — Impact Director
- Yoggini Vignesvaran — Director, Human Resources
- Mohd Shahizan Shafiq — Director, Technical
- Syaeista Khanum — Director, Legal & Energy Access
- Anand Bhandari — CTO
- Premanathan Jaganathan — Director, Stakeholder Management
- Ash Luques — Director, Performance
- Dr. Ishvin Kaur — Supply Chain Manager
- Zul Syafiq Jasni — Head, Sales
- Nisa Farhana Shamsuri — Senior Talent Acquisition Executive

Business claims:
- Services: residential and commercial/industrial solar, EV charging,
  indigenous electrification and solar training.
- R1 claims 8,941+ installations, 4,055+ homes, 4,886+ indigenous homes,
  34.9 MW and 210 staff, sourced only to company pages.
- R1 claims the team page says over 160 staff; headcount conflict unresolved.
- R1 claims PETRONAS Ventures investment in July 2020 after FutureTech and says
  500 Global is also an investor. It cited
  https://www.petronas.com/media/media-releases/petronas-ventures-invests-sols-energy
- Hardware, customer, bank and accreditation lists were sourced only to company
  pages; R1 sometimes described these as independently verified despite no
  independent URL.

Suspicious or unresolved R1 items requiring explicit audit:
- It assigned “Q2 2026 / May 2026” to metrics on company pages without showing
  where that publication date appears.
- It treated a 2026 copyright/current-looking text as page freshness.
- It suggested “likely” explanations for headcount and review-count conflicts,
  contrary to the no-speculation rule.
- It stated official website and “registration filings” consistently support the
  Sungai Besi address but cited no registry filing.
- It suggested searching corporate email formats; inferred emails are prohibited.
- It claimed SEDA registration/accreditation without a direct SEDA source.
- It found no litigation/sanctions; this must not become a negative fact.

Round 02 must freshly search for missed purpose-specific contact channels,
especially subscription/campaign and careers/job pages, then return the required
verdict-based audit and deltas.
ROUND 01 OUTPUT ENDS
```

### Round 02 URL-serialization follow-up

```text
You are repairing the evidence serialization from a lead-enrichment research
pass for SOLS Energy Sdn Bhd. Freshly inspect the pages; do not trust the
candidate facts merely because they are listed here.

Candidate contacts to verify:
- +60 18-399 9247 and support@solsenergy.com
- +60 18-355 5247 and +60 3-8408 1600
- careers@solsenergy.com and +60 18-227 4247
- solar@solsenergy.com

Candidate people to verify and prioritize:
- Raj Ridvan Singh, Jaran Walia, Sean Yong, Abdul Muhammad Khalif,
  Yoggini Vignesvaran, Liyana Azizi, Dr. Ishvin Kaur, Lian Kong Chian.

Return exactly one JSON object inside one fenced code block and no prose before
or after it. JSON must have arrays `contacts`, `people`, and `independent_signals`.
Each contact object must have:
`purpose`, `value_as_published`, `normalized_value`, `verdict`, `source_type`,
`evidence_url`, `visible_source_date`, `evidence_note`.
Each people object must have:
`name`, `current_role`, `outreach_priority`, `verdict`, `role_evidence_url`,
`personal_profile_url`, `visible_source_date`.
Each signal object must have:
`date`, `fact`, `publisher`, `evidence_url`.

CRITICAL:
- Every URL value must be a literal full absolute URL string beginning `https://`.
- Do not use Markdown hyperlinks or source labels anywhere inside the JSON.
- Use null when a URL or date was not directly found.
- Do not use search-results URLs, snippets, inferred emails or guessed profiles.
- Company pages are `first_party`; independent issuer/news pages are
  `independent`; social platforms are `social_platform`.
- If direct browsing is unavailable, return valid JSON with an `error` field and
  empty arrays. Never simulate URL verification.
```

## Round 03 — Meta/Muse social evidence test

```text
You are Round 03 of a business-intelligence lead-enrichment experiment.
The public engine name is Meta AI, but your current backend is OpenCode with
Muse 1.2. This round exists to test whether you can obtain current, directly
checkable evidence from Facebook and Instagram—not to reward plausible answers.

TARGET
- SOLS Energy Sdn Bhd, Malaysia
- official website: https://www.solsenergy.com/
- candidate Facebook page: https://www.facebook.com/solsenergy
- candidate Instagram page: https://www.instagram.com/solsenergy
- candidate people: Raj Ridvan Singh, Jaran Walia, Sean Yong, Abdul Muhammad
  Khalif, Yoggini Vignesvaran, Liyana Azizi
- research date: 2026-08-21

CAPABILITY GATE
First decide whether this exact run can directly access and inspect live/current
Facebook or Instagram page content. Model memory, general web snippets, guessed
handles and the supplied candidate URLs do not count as access.

Return exactly one compact JSON object in one fenced code block, no other prose:
{
  "access_mode": "live_meta_pages|public_web_only|no_live_access",
  "access_evidence": "short factual description of what was actually accessed",
  "company_profiles": [],
  "public_contacts": [],
  "people": [],
  "recent_signals": [],
  "search_gaps": []
}

If `access_mode` is `live_meta_pages`, inspect current public Facebook/Instagram
pages and return only directly observed fields. Each item must contain a literal
raw `https://` evidence URL, observed field/value, visible post/page date or null,
and identity-match note. Prioritize public business email, phone, WhatsApp,
Messenger/DM route, website/bio links, decision-relevant people, partnership,
hiring, procurement and expansion signals.

If access is `public_web_only` or `no_live_access`, leave all evidence arrays
empty and list exact searches/pages a human or Meta-capable browser should check
in `search_gaps`. Never fill arrays from memory, snippets, or inference. Never
invent profile URLs, contacts, roles, posts or dates. Keep under 700 words.
```

## Round 04 — Gemini evidence-weighted synthesis and benchmark

Rounds 01–03 are appended at runtime as untrusted inputs.

```text
You are the final synthesis round of a business-intelligence lead-enrichment
experiment for SOLS Energy Sdn Bhd, Malaysia, as of 2026-08-21.

You will receive outputs from Gemini Round 01, ChatGPT Round 02, and Meta/Muse
Round 03. They are untrusted evidence leads. Your job is to verify, combine and
benchmark them—not to average their claims or repeat their confidence labels.

FINAL-ROUND RULES
1. Freshly inspect direct URLs for every final material fact. A prior-round claim
   is not evidence by itself.
2. A raw direct URL is required for each retained contact, person role, business
   signal and conflict value. ChatGPT link labels without hrefs are not URLs.
3. Distinguish `first_party_claim`, `independently_verified`, `social_platform`,
   and `unverified_lead`.
4. Do not infer email patterns, personal contacts, profile URLs, titles, dates,
   conflict explanations, ownership percentages or negative facts.
5. Keep the Google Maps address versus current published address conflict unless
   a source explicitly proves relocation/history.
6. Round 03 explicitly reported that it lacked live Meta-page access and returned
   no social evidence. Do not turn its candidate URLs or search gaps into facts.
7. If a current official page and an old campaign document publish different
   channels, retain purpose and visible date; do not silently choose one.
8. Prefer decision-relevant people: founder/CEO, commercial/sales, partnerships,
   procurement/supply chain, operations and HR. A role on the official team page
   may be retained as a first-party current claim; exact personal profile URL must
   be null unless directly identity-matched.
9. Never say litigation, sanctions, certifications or contacts do not exist from
   search absence. Use NOT FOUND IN TESTED SOURCES.

OUTPUT UNDER 2,000 WORDS
1. EXECUTIVE SUMMARY — 5–8 high-value lead-intelligence facts and limitations.
2. FINAL CONTACT MATRIX — purpose | published value | normalized value | status |
   raw direct evidence URL | visible date | introduced/confirmed by round(s).
3. PRIORITIZED PEOPLE — priority | person | current role | outreach relevance |
   status | raw role URL | raw personal profile URL or null | contributing rounds.
4. VERIFIED BUSINESS SIGNALS — date | fact | source class | raw URL | outreach use.
5. CONFLICTS / UNKNOWNS — competing values and URLs, no speculative resolution.
6. ROUND BENCHMARK — for each round: unique valid additions, corrections caught,
   unsupported/hallucinated items, evidence usability, and a 0–5 score.
7. SYNTHESIS AUDIT — list any prior-round claim rejected by the final report and
   why; explicitly state whether the final used Round 03 evidence (expected: no).

Print full raw absolute URLs, never hidden Markdown link labels. If browsing is
unavailable, state that first and do not claim fresh verification.
```

### Round 04 v2 — controlled-evidence correction

This rerun corrects a stale Google Maps fixture and tests a strict source
allowlist after the first synthesis reintroduced speculation and generic URLs.

```text
Revise the final SOLS Energy lead-enrichment synthesis. This is a controlled
evidence test. Use ONLY the direct sources listed below; do not add facts from
memory, search snippets, generic domain homepages, or prior-round prose.

CORRECTED IMMUTABLE GMAP RECORD (report 11)
- name: SOLS Energy Sdn Bhd
- address: 1Petaling Commerz & Residential Condos #1-9, Jalan 1 C/149, Off,
  Jln. Sungai Besi
- phone: 018-399 9247
- website: https://www.solsenergy.com/
- rating/reviews: 4.4 / 275
- maps URL: https://www.google.com/maps/place/SOLS+Energy+Sdn+Bhd/data=!4m7!3m6!1s0x31cc488358dc3e2d:0xbf13ccf5a0e2394f!8m2!3d3.0679417!4d101.7053559!16s%2Fg%2F11f_4s62zw!19sChIJLT7cWINIzDERTznioPXME78?authuser=0&hl=en&rclk=1

PREVALIDATED DIRECT SOURCES
- identity, HQ, main phone/WhatsApp, support email and official-profile links:
  https://www.solsenergy.com/contact
- subscription support WhatsApp and phone:
  https://go.solsenergy.com/subscription-signup
- recruitment email and phone:
  https://www.solsenergy.com/careers/sales-engineer
- current official team names/roles and the `over 160 full-time` claim:
  https://www.solsenergy.com/our-team
- May/Q2 2026 company-claimed metrics and `210-strong` claim:
  https://www.solsenergy.com/solutions
- PETRONAS investment, date, services and 500 Startups investor statement:
  https://www.petronas.com/ventures/bm/node/1434
- BSN promotion, address, +6018 355 5247 and +603 8408 1600, valid
  15 April–31 October 2024:
  https://www.bsn.com.my/cms/upload/pdf/promotion/2024/sols_energy_tnc.pdf
- MPIA/MPSEA membership and +603 8408 1600:
  https://mpia.org.my/wp-content/uploads/2025/05/mpsea-membership-master-listing.pdf
- UNDP Climate Venture Scaler cohort:
  https://www.undp.org/asia-pacific/projects/climate-finance-network/climate-venture-scaler
- historical Mesra campaign contact solar@solsenergy.com and campaign dates
  25 July–31 December 2023:
  https://cdn.builder.io/o/assets%2F93d21f93faa94675bf81a34904d70ec3%2Fb04fe5bffc3647769e270c7dfd8d3dde?alt=media&apiKey=93d21f93faa94675bf81a34904d70ec3&token=c72f354d-933e-41c8-ad10-1bc28302d0e4

KNOWN CORRECTIONS TO ENFORCE
1. There is NO supported Maps/HQ address conflict in report 11. The prior
   Bangsar South fixture was stale/incorrect and must be listed as rejected.
2. Copyright year is never a source publication/update date. Use null unless a
   source visibly provides a date.
3. Do not explain the 160 vs 210 workforce conflict; retain both first-party
   claims with no causal theory.
4. Do not describe review-count differences as lag or assign any cause.
5. Do not call a generic domain homepage direct evidence. Use the exact URLs
   above or omit the row.
6. `solar@solsenergy.com` is a historical 2023 campaign channel, not confirmed
   current. The BSN contact evidence is a 2024 promotion; MPIA is the newer
   independent support for the landline.
7. Facebook and Instagram URLs linked by the official contact page are
   `first_party_profile_link`; they were not live-inspected. Meta/Muse R03
   contributed zero evidence.
8. Limit people to the eight most decision-relevant roles. All are first-party
   role claims; personal profile URL must be null.
9. Never infer direct executive contacts, SEDA registry status, litigation,
   sanctions, ownership percentages, or negative facts.

ROUND PROVENANCE LEDGER
- R01 found legal identity, main contact/WhatsApp, support email, official team
  roles, company metrics, service profile, PETRONAS/500 investor lead and social
  profile links. It missed purpose-specific subscription/recruitment contacts.
- R02 uniquely found +6018 355 5247, +603 8408 1600,
  careers@solsenergy.com, +6018 227 4247, solar@solsenergy.com, the BSN/MPIA
  evidence, additional current team roles and the UNDP cohort. Its first two
  narrative attempts hid URLs behind rendered link labels; compact JSON retained
  raw URLs but was truncated by the browser wrapper.
- R03 (Meta/Muse) reported `public_web_only`, could not inspect Facebook or
  Instagram, and returned no evidence facts.

Return exactly one valid compact JSON object inside one fenced code block, no
prose outside it. Required keys:
- `entity`
- `contacts` (purpose, value_as_published, normalized_value, current_status,
  evidence_class, evidence_url, source_date, contributing_rounds)
- `people` (priority, name, role, relevance, evidence_class, role_url,
  personal_profile_url, contributing_rounds)
- `business_signals` (date, fact, evidence_class, evidence_url, outreach_use)
- `conflicts_and_unknowns`
- `rejected_claims`
- `round_benchmark` (round, valid_unique_additions, errors, evidence_usability,
  score_0_to_5)
- `meta_round_evidence_used` (must be false)

Acceptance check before answering: every non-null evidence URL must exactly
match one of the direct sources above; no causal explanation may appear for an
unresolved difference; source dates must come from visible source content; and
the JSON must parse without repair. Stay under 1,700 words.
```

### Round 04 v3 — validated field-ledger synthesis

```text
Produce the final benchmark JSON for SOLS Energy using ONLY the validated field
ledger below. Do not browse, enrich, substitute, correct from memory, or add any
name/value not present in the ledger. The objective is faithful evidence
synthesis, not new discovery.

VALIDATED ENTITY LEDGER
- legal_name: SOLS Energy Sdn. Bhd.
- registration: 201701007142 (1221307-W)
- current official and Report-11 Maps address: 1Petaling Commerz & Residential
  Condos, Level 1, Units 1 to 17, Jalan 1C/149, Off Jalan Sungai Besi, 57100
  Kuala Lumpur, Malaysia
- Maps rating/reviews: 4.4 / 275
- Maps evidence: https://www.google.com/maps/place/SOLS+Energy+Sdn+Bhd/data=!4m7!3m6!1s0x31cc488358dc3e2d:0xbf13ccf5a0e2394f!8m2!3d3.0679417!4d101.7053559!16s%2Fg%2F11f_4s62zw!19sChIJLT7cWINIzDERTznioPXME78?authuser=0&hl=en&rclk=1
- Official evidence: https://www.solsenergy.com/contact

VALIDATED CONTACT LEDGER
1. main call/WhatsApp | +6018 399 9247 | +60183999247 | currently published,
   first-party | https://www.solsenergy.com/contact | source_date null | R01,R02
2. support email | support@solsenergy.com | same | currently published,
   first-party | https://www.solsenergy.com/contact | source_date null | R01,R02
3. subscription WhatsApp | 018-355 5247 | +60183555247 | currently published,
   first-party | https://go.solsenergy.com/subscription-signup | source_date null | R02
4. subscription/company phone | +603 8408 1600 | +60384081600 | currently
   published first-party and in 2025 MPSEA list |
   https://go.solsenergy.com/subscription-signup and
   https://mpia.org.my/wp-content/uploads/2025/05/mpsea-membership-master-listing.pdf
   | source_date 2025 for association evidence | R02
5. recruitment email | careers@solsenergy.com | same | currently published,
   first-party | https://www.solsenergy.com/careers/sales-engineer | source_date null | R02
6. recruitment phone | +60 18-227 4247 | +60182274247 | currently published,
   first-party | https://www.solsenergy.com/careers/sales-engineer | source_date null | R02
7. Mesra campaign email | solar@solsenergy.com | same | historical only,
   campaign ended | https://cdn.builder.io/o/assets%2F93d21f93faa94675bf81a34904d70ec3%2Fb04fe5bffc3647769e270c7dfd8d3dde?alt=media&apiKey=93d21f93faa94675bf81a34904d70ec3&token=c72f354d-933e-41c8-ad10-1bc28302d0e4
   | campaign 2023-07-25 through 2023-12-31 | R02

VALIDATED PEOPLE LEDGER — EXACT ALLOWLIST, FIRST-PARTY ROLES
Source for every row: https://www.solsenergy.com/our-team
Personal profile URL for every row: null
1. Teacher Raj Ridvan Singh | Founder-CEO | strategy/partnerships | R01,R02
2. Jaran Walia | Deputy CEO | executive operations/strategy | R01,R02
3. Sean Yong | Director - Sales | commercial/sales | R01,R02
4. Abdul Muhammad Khalif | Director - Supply Chain Management |
   procurement/vendors | R01,R02
5. Jagjit Sidhu | Director - Operations | delivery/operations | R01
6. Yoggini Vignesvaran | Director - Human Resources | HR/recruitment | R01,R02
7. Liyana Azizi | Head - Marketing | marketing/lead generation | R02
8. Dr. Ishvin Kaur | Supply Chain Manager | procurement/logistics | R01,R02

VALIDATED SIGNAL LEDGER
1. 2020-07-03: PETRONAS Ventures announced it had inked an agreement to invest
   in SOLS Energy; completion was expected at end-July 2020. The same PETRONAS
   source says SOLS Energy counted 500 Startups as an investor. Do NOT say the
   transaction completed. Evidence:
   https://www.petronas.com/ventures/bm/node/1434 | independent | R01,R02
2. 2024-04-15 through 2024-10-31: BSN SOLS Energy promotion; evidence:
   https://www.bsn.com.my/cms/upload/pdf/promotion/2024/sols_energy_tnc.pdf |
   independent partner document | R02
3. 2026 cohort: SOLS Energy appears in UNDP Climate Venture Scaler Malaysia
   cohort; evidence:
   https://www.undp.org/asia-pacific/projects/climate-finance-network/climate-venture-scaler
   | independent program page | R02
4. As-of-May/Q2-2026 company claims: 8,941 installations, 4,055+ residential
   homes, 4,886 indigenous homes, 34.9 MW and 210-strong workforce; evidence:
   https://www.solsenergy.com/solutions | first-party claim | R01,R02
5. Current team page separately claims over 160 full-time members; evidence:
   https://www.solsenergy.com/our-team | first-party claim | R01,R02

VALIDATED ROUND LEDGER
- R01: strong identity/main-contact/team discovery; missed purpose-specific
  contacts; accepted stale Bangsar South fixture; overclaimed some independent
  verification and used unsupported negative-search reasoning. Score 3.2/5.
- R02: uniquely added subscription, office, recruitment and historical campaign
  contacts plus exact independent sources; narrative output hid URL hrefs and JSON
  output truncated, so use compact split JSON. Score 4.0/5.
- R03: honestly reported public_web_only and returned no Meta evidence. Score
  1.0/5 for honesty, 0/5 enrichment yield.
- R04 v1: retained useful deltas but reintroduced speculation/generic URLs.
- R04 v2: fixed evidence controls but hallucinated Melissa Tan, Rayan Singh,
  Joshua Lim, Daniel Wong, Michelle Lee, Amirul Izwan and Farah Halim. All are
  REJECTED because they are absent from the validated people ledger.

OUTPUT
Return exactly one valid JSON object in one fenced code block and no other prose.
Keys: `entity`, `contacts`, `people`, `signals`, `conflicts_and_unknowns`,
`rejected_claims`, `round_benchmark`, `meta_round_evidence_used`.

Hard checks before responding:
- The people names in output MUST be set-equal to the eight-name allowlist above.
- Every value and URL must be copied from this ledger; no generic domain URLs.
- No reason/cause may be assigned to the 160-vs-210 difference.
- The stale Bangsar South address is rejected, not a current conflict.
- Source dates are null unless explicitly supplied above.
- Meta evidence used must be false.
- Keep under 1,500 words and valid JSON without comments or trailing commas.
```

## Experiment findings

### Outcome by round

| Round | Useful outcome | Main failure | Tested disposition |
|---|---|---|---|
| Google Maps | Report 11 produced the correct SOLS Energy Maps record and saved it to Postgres. | A stale Bangsar South address was manually copied into the first research prompt instead of the report-11 value. Every later model propagated the false conflict. | The raw scan record must be an immutable machine-generated input block. Never retype it. |
| R01 Gemini | Strong identity, main-contact, service and team discovery. It learned to label company pages as first-party and stopped guessing personal profile URLs. | Missed purpose-specific contacts on campaign/careers pages, used unsupported freshness/conflict explanations, and overclaimed some independent verification. | Use R01 for broad discovery, not truth. Require field-level source class and direct URL. |
| R02 ChatGPT | Found the highest-value delta: subscription WhatsApp `+6018 355 5247`, landline `+603 8408 1600`, recruitment `careers@solsenergy.com` / `+6018 227 4247`, and historical campaign email `solar@solsenergy.com`. It also found BSN, MPIA and UNDP evidence. | Narrative answers rendered URLs as hidden hyperlink labels; the wrapper extracts text but not hrefs. A larger JSON answer was truncated. | Request JSON in a fenced code block and split contacts, people and signals into separate compact calls. |
| R03 Meta/Muse | Correctly disclosed `public_web_only` and returned no fabricated Meta facts. | Facebook returned an error and Instagram exposed a login wall. No live Meta-network evidence was available. | Keep a capability gate. Score this round as zero enrichment yield until a logged-in Meta-capable browser is available. |
| R04 Gemini v1/v2 | Combined valid contact deltas and rejected hidden LinkedIn labels. | Reintroduced causal speculation and generic URLs; v2 hallucinated seven executives while claiming the official team page supported them. | Never synthesize raw narrative reports directly. |
| R04 Gemini v3 | Preserved all validated contacts, exactly the eight allowed people, exact URLs/statuses, the workforce conflict and the zero-evidence Meta result. | It copied one instruction phrase into a signal description; this is a presentation defect, not a fact error. | Final synthesis must consume a validated field ledger with exact value/name allowlists and set-equality checks. |

### Recommended manual search strategy

1. **Freeze discovery input.** Pass the exact Gmap JSON fields, report ID and
   Maps URL directly from the saved report. Add an input hash later so the
   research run can prove which scan record it used.
2. **R01 discovers candidates.** Gemini searches broadly and returns claims at
   field level with raw URL, source class, visible date and `first_party` versus
   `independent` status. It must inspect contact, campaign, careers, team,
   vendor and official third-party pages.
3. **Validate before R02.** Reject malformed/generic URLs, unsupported dates,
   inferred contacts, negative claims from search absence, and uncited conflict
   explanations. Preserve both the raw round and its validation ledger.
4. **R02 audits and fills gaps.** ChatGPT receives the validated R01 ledger, not
   the prose report. Run three compact JSON calls: contacts, people, and business
   signals. Every row is a delta with `confirmed`, `corrected`, `added`,
   `rejected` or `unknown`.
5. **R03 starts with a capability gate.** Meta/Muse may contribute facts only
   after proving it inspected a live Meta page. Otherwise it returns empty
   evidence arrays and explicit search gaps. Search suggestions are never facts.
6. **Build a validated final ledger.** Deterministically merge only accepted
   rows, preserve conflicts and historical contact status, and create exact
   allowlists for people and contacts.
7. **R04 writes, it does not discover.** Gemini receives only the validated
   ledger. It must pass set-equality checks for people/contacts and may not add
   any value or URL. Keep the raw R04 output for benchmarking.

### Acceptance metrics

Score each test company on:

- contact recall against a manually verified gold set;
- purpose labeling and current-versus-historical contact status;
- exact raw-URL retention and successful URL resolution;
- people precision, role currency and decision relevance;
- first-party versus independent evidence classification;
- unsupported-claim and invented-person rate;
- freshness accuracy (copyright/crawl date must not become source date);
- conflict preservation without causal speculation;
- unique valid additions by round;
- final-ledger fidelity, including exact set equality and rejected-claim handling.

The strategy is ready for more manual company tests. It is **not** ready for an
automated pipeline yet: R01 contact recall and unconstrained R04 hallucination
need cross-company benchmarking, and R03 currently has no live Meta access.
