# automation-tools

Lead generation for a Malaysian solar EPC sales team. It builds business lists from Google Maps,
filters out leads we cannot sell to, finds a phone number and a person for each lead, and hands the
leads to telemarketers by taman.

## Services

| Service | Where | Runs |
|---|---|---|
| Hub, `agy-lab` | Railway, https://ee-auto.up.railway.app | the API, the research portal (`/research`), telemarketing (`/telemarketing`), workers status (`/workers`), the database, and the whole lead pipeline below |
| Mac mini worker | home line, [worker/](worker/) | jobs that need a login held on that machine: ChatGPT (`chatgpt.*`), Facebook (`fb.*`), X (`x.*`) and ads research. It no longer runs Google Maps scans. |

All `/api/*` calls need `Authorization: Bearer $LAB_TOKEN`. Keys and the token live in the Railway
variables and the local vault, never in this repo.

## The lead pipeline

Full reference, with every switch, status endpoint and cost: [docs/pipeline.md](docs/pipeline.md).

1. **Territory list.** Johor (771 tamans) and Selangor (1,060). The **search-for-taman** SOP adds tamans the list misses, one daerah at a time, tracked in [docs/taman-search-master-list.md](docs/taman-search-master-list.md).
2. **Taman auto-scan** queues a Business scan for each taman in turn, inside a monthly request budget.
3. **Google Maps business list** comes from scraper.tech, in the hub. Buttons: Business, Factory, Shop.
4. Each business becomes a lead in **`company_data`**.
5. The **lead blacklist** keeps out government, banks, malls, chains, competitors and similar.
6. The **contact auto-queue** sends clean, never-researched leads to research, 3 at a time.
7. **Contact research** searches with Exa (Tavily when Exa runs out) and reads pages with deepseek.
8. The **contact report** holds the phones, emails and people found.
9. **Telemarketing** assigns tamans to telemarketers, who call the leads.
10. Pause switches: `AUTO_SCAN_PAUSED=1`, `AUTO_CONTACT_PAUSED=1`.

The taman auto-scan went live on 2026-10-25. Missing tamans are found with the search-for-taman SOP (`.claude/skills/search-for-taman/`), run by hand.

## Docs

| Doc | What |
|---|---|
| [docs/pipeline.md](docs/pipeline.md) | how a lead flows, stage by stage |
| [docs/scraper-tech-maps.md](docs/scraper-tech-maps.md) | scraper.tech Google Maps: tests, pricing, keyword sweep |
| [docs/lead-blacklist.md](docs/lead-blacklist.md) | the blacklist groups and what each one caught |
| [docs/search-providers.md](docs/search-providers.md) | Tavily and Exa for contact research, with the benchmark |
| [API.md](API.md) | the hub's HTTP API |
| [worker/README.md](worker/README.md) | the Mac mini worker: lanes, install, failure modes |
| [agy-lab/README.md](agy-lab/README.md) | how the hub is set up on Railway |

`HANDOFF.md`, `CHATGPT-PROGRESS.md`, `META-AI.md`, `STUPID-LOG.md`, `progress-08-20.md` and
`AUTO-QUEUE-NEXT-STEP.MD` are older working notes. Treat them as history.
