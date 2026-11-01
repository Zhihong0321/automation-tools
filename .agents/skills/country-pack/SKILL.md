---
name: country-pack
description: Research one country and write its country pack for company dive
  (agy-lab/src/countries/<CC>/research.md and pack.json). Use when asked to build,
  research or fix the pack for a country, e.g. "build the Singapore pack".
---

# Build one country pack

You research how to look up companies in ONE country, and write it down in two files. You
do not change the pipeline. Read `agy-lab/src/countries/README.md` first: it explains what a
pack is, every field of `pack.json`, and why the rules below exist.

## The one rule

**Create and edit files only inside `agy-lab/src/countries/<CC>/`.** Do not edit any other
file: no `.ts` file, not `countries/README.md`, not `_template/`, not `MY/`, not
`package.json`, not tests. Do not install anything. Do not commit, push or switch branches.
If you think code must change, write it under "Notes for the reviewer" at the end of
`research.md` and stop there.

## Steps

1. **Start the folder.** Copy `agy-lab/src/countries/_template/` to
   `agy-lab/src/countries/<CC>/`, where `<CC>` is the two-letter code from the README table.
2. **Learn what Malaysia already has.** Read `agy-lab/src/countries/MY/research.md`. Your
   country needs the same kinds of sources: the company number, the register, business
   information sites, reviews, jobs, news, credibility checks, website rules.
3. **Research, and test every source.** Fill in every section of `research.md`.
   - Open every source yourself in the browser. In "Tested", write what you saw and the date:
     free and readable, search form, login, CAPTCHA, paid, bot block.
   - Never get past a CAPTCHA, a login or a paywall. Write it down instead.
   - Write "unknown" when you cannot find out. Never guess.
   - Pick 3 real companies (one listed, one mid-size, one small) and look each one up in
     every source. Fill in section 11.
   - Write in English. Keep local-language words in their script with the English after them.
4. **Write pack.json from the research.** Keep `"status": "draft"`.
   - `names`: every lowercase way someone could type the country.
   - `languages`: `["en"]`, plus the local language code(s) from the README table.
   - `search`: the country codes. Brave and Exa take two capital letters; Tavily takes the
     lowercase English country name.
   - `discover`: at most 8 Brave queries that find the company in the sources that matter
     most for this country (the register, the top business information site, the local
     words for director or CEO, reviews). Use `{short}` or `{company}`. Prefer
     `site:` queries on sites from section 4 that Brave indexes.
   - `walled`: the hosts from section 10 that need a login or block bots.
   - `notes`: short, concrete instructions for each step, built from sections 1 to 7: the ID
     format and where to find it, which sites to search with `include_domains`, the local
     words to use, where people (directors, staff) are listed. Leave a note `""` if you have
     nothing specific for that step.
   - Fill in section 12 of `research.md`: one line per query and note, naming the section it
     comes from.
5. **Check.** In a terminal:
   ```
   cd agy-lab
   node scripts/check-country.ts <CC>
   ```
   Fix everything it reports and run it again until it ends with "All checks passed".
   Read its part 5: it prints exactly what your pack adds to a dive. Check that it makes sense.
6. **Hand over.** Reply with: the check's last line, your 3 sample companies, and the one
   company you suggest for the test dive (a real, mid-size company with a website). Do not
   run `scripts/country-dive.ts` yourself: the reviewer runs the test dive.
