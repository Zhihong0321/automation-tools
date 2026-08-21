# Product requirements — Railway research pipeline

## Deployment context

`ee-auto` is hosted on Railway. The Railway service is the public API and
orchestration layer; the Mac mini worker remains the residential-IP execution
point for Google Maps reconnaissance.

Production endpoint: <https://ee-auto.up.railway.app/>. Authentication uses the
`LAB_TOKEN` secret, which must be stored in Railway or a local protected
environment file and never committed to this repository.

## Production database connection

The application database is reached through the Railway Postgres proxy:

| Setting | Value |
|---|---|
| Proxy URL | <https://pg-proxy-production.up.railway.app/> |
| API documentation | <https://pg-proxy-production.up.railway.app/docs> |
| SQL endpoint | `POST https://pg-proxy-production.up.railway.app/api/sql` |
| Database | `pg_2nd` |
| Granted access | full |
| Current credential expiry | `2026-08-21T13:56:07.018Z` |

SQL requests use `Authorization: Bearer <PG_PROXY_TOKEN>` and a JSON body shaped
as `{"db_name":"pg_2nd","sql":"...","params":[]}`. The credential is
short-lived and grants full database access, so its value must be supplied via
the protected `PG_PROXY_TOKEN` environment variable and never committed. The
worker also requires `PG_PROXY_URL` and `PG_DB_NAME=pg_2nd`.

## Available tools

The application exposes four research tools:

| Tool | Purpose |
|---|---|
| Gemini Antigravity CLI | Latest Gemini model; primary research and final synthesis |
| ChatGPT ask | A second research pass that goes deeper using Gemini's first-round report |
| Meta AI | Research inside the Meta/Facebook network |
| Gmap recon scout | Business discovery and Google Maps contact data |

## User workflows

### 1. Business scan

A user supplies a keyword, a location, or both. The system runs a Google Maps
scan and returns a business list with every available Maps field, including
business name, category, address, rating, review count, phone, website and Maps
URL.

The scan must then create and save a search report using the existing
`search_report`, `company_data` and `search_report_company` schema in
`agy-lab/schema.sql`.

### 2. Company deep research

A user selects one or more companies from a saved business list and requests
deep research. The system enriches each company, with contact information and
related people as the highest-priority output.

The required research sequence for each company is:

1. **Round 01 — Gemini:** establish the initial company research report.
2. **Round 02 — ChatGPT:** receive the Round 01 report as context and research
   deeper.
3. **Round 03 — Meta AI:** search for relevant company and people information
   within the Meta/Facebook network.
4. **Round 04 — Gemini:** combine the previous three reports, resolve or call
   out conflicts, and produce the final company research report.

## Persistence and benchmarking requirements

Every round is an independently saved artifact. This is a product requirement,
not merely logging: the stored round reports make it possible to benchmark
whether the final Gemini synthesis properly uses and improves on the previous
research.

For each researched company, the database must retain at least:

| Field | Meaning |
|---|---|
| `round01` | Raw/structured Round 01 Gemini research output |
| `round02` | Raw/structured Round 02 ChatGPT research output, including Round 01 as its input context |
| `round03` | Raw/structured Round 03 Meta AI research output |
| `round04` | Final Gemini synthesis built from Rounds 01–03 |
| status and timestamps | Execution status, failure details and timing for every round |
| engine/model metadata | Which account/model/location produced each round |

The existing schema does **not** yet contain `round01`–`round04` or a company
research-run table. The next implementation must add a durable schema and API
for these fields. The user has specified named round columns; if the design is
normalized into a separate table, it must still preserve those four stable,
queryable round identities.

`person_data` already exists as the place for related people, but it is not yet
written by the current worker. Deep research must create or update those people
records and preserve the source of each contact detail.

## Completion contract

For a user-requested scan or deep-research job:

1. The user receives the report/result through the API.
2. The report and all underlying round artifacts are saved in the database.
3. Partial failures are explicit: a completed earlier round remains saved, and
   the failed round records its status/error rather than discarding the job's
   evidence.
