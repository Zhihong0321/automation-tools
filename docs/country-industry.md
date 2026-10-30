# Country industry research

The operator page at `/country-industry` starts a `country.industry` job using a country and industry keyword. It polls the job, shows worker connection and progress, and downloads `result.csv` as a CSV. The page shell is public like the other operator pages; the job API still requires `LAB_TOKEN`.

**The hub runs the job itself** (since 2026-10-30), in the `hub-country` lane (`agy-lab/src/country-research.ts`). The pipeline is the one in [gmap-country-insdusty](https://github.com/Zhihong0321/gmap-country-insdusty), copied into `agy-lab/src/country/`, and runs in that repo's order:

1. Cities: the World Cities list (GeoNames) for the country.
2. Maps: one search per city, `<industry> in <city>`. Each search is a `gmap.scan` job on the hub queue, four at a time, so whichever Maps worker is free answers it:
   - the scraper.tech lanes (`scraper-tech-maps*`, one request per city),
   - a Gmap Local Worker PC (`pc-*`, free),
   - the Mac mini's Chrome scan (`m4-mini`). The mini is handed these city searches only, never a business search or taman scan (`countryScanOnly` in `jobs.ts`).
   A failed or blocked search is asked once more; one that fails twice is counted in `summary.failedSearches` and the run goes on.
3. Merge: one row per Google place (place id), keeping every city that found it.
4. Website contacts: the repo's deterministic batch (homepage plus up to three same-site contact, team or about pages; emails, phones, social links, people). No LLM.
5. CSV: the repo's `companies.csv` columns.

The result also carries `summary.searchesByWorker`, how many city searches each Maps worker answered.

Every step checkpoints under `$HOME/.agy-lab/country-runs/<job id>/` (`COUNTRY_RUN_DIR` overrides it). A redeploy mid-run loses the lane, the job's five-minute lease lapses, the lane takes the job again and resumes: finished searches and website checks are kept.

The Mac mini's own country lane (`m4-mini-country`) is retired from `country.industry` by `RETIRED_TYPES` in `jobs.ts`, so it no longer claims these jobs.

Completed CSVs and country job state are saved atomically under `$HOME/.agy-lab/country-jobs` in production; Railway must mount the persistent `/data` volume. `COUNTRY_JOB_STORE_DIR` overrides the location.

The broker's worker result limit is controlled by `RESULT_BODY_LIMIT` (32 MiB by default). Google Maps may return capped, incomplete, geographically imprecise or irrelevant listings; `summary.possibleLimits` counts the searches that may have hit a result cap. Website access failures and missing websites are included in the CSV's status fields. Search and contact information should be reviewed before use.
