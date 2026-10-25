---
name: search-for-taman
description: SOP to search one daerah for tamans the territory list is missing, have the user approve each town's names, save them, and update the daerah master list. Use when the user says "search for taman", "find missing taman", "search taman in <daerah>", or asks which daerah are left. Never reruns a daerah the master list marks Done.
---

# Search for taman

Finds tamans that `ALL_TERRITORIES` (agy-lab/src/territories.ts) is missing, one daerah at a time.
Every name is approved by the user before it is saved. Saved tamans join the territory list under
"Newly found tamans", and the taman auto-scan then gives each one a Google Maps Business scan.

The master list is **docs/taman-search-master-list.md**, with one row per daerah. It is the source of
truth for which daerah are done. The hub keeps the town-level record (table `taman_finder_town`).

## Rules

- **Read the master list before anything else.** If the daerah is **Done**, stop and tell the user it
  was run on <date> with <n> tamans added. Do not search it again, even if asked, unless the user
  explicitly says to redo a Done daerah.
- **One daerah per run,** unless the user names several.
- **Nothing is saved without the user's approval** of that town's numbered list.
- **Run it from this machine.** It is not a hub job, and you must not add one. Do not change the
  finder code inside this SOP: report a problem instead, and fix it only when asked.

## Steps

1. **Pick the daerah.** Use the one the user names. With none named, take the first daerah in the
   master list that is **Partly run**, else the first **Not run** (Johor before Selangor). Say which
   one and its town count.

2. **Search every town in it.** From `agy-lab/`, with the credentials read from the vault
   (`D:\Tools\my-vault\vault.json`: `EE_AUTO_LAB_TOKEN`, `SCRAPER_TECH_KEY`):

   ```bash
   LAB_TOKEN=<EE_AUTO_LAB_TOKEN> SCRAPER_TECH_KEY=<SCRAPER_TECH_KEY> node scripts/find-tamans.ts check <state> "<Daerah>"
   ```

   - It skips towns the hub has already recorded. A Partly run daerah only searches what is left.
   - Each town costs 7 scraper.tech requests (14 at most with retries) and about a minute.
   - It writes one review file per town to `agy-lab/scripts/finder-review/`. Nothing goes to the hub.
   - If a town prints `failures:` and status `failed`, run `check` again for that town alone before
     showing it (`... check <state> "<Daerah>" "<Town>"`). A check is not recorded, so a repeat costs
     only the requests.

3. **Show each town's list to the user.** Keep the tool's numbering, and give the address count for
   each name. Flag the names that may already be listed under another name, and say why:
   - spelling variants (Muhibah / Muhibbah, Seri / Sri);
   - a developer or project name for a listed area (Taman Scientex Utama vs Scientex Senai);
   - an industrial park matching a listed zone (I-Park SAC vs Senai Airport City);
   - a name that belongs to a neighbouring town.

   Also show the "already listed", "too vague" and "one address" lines, so the user can see what was
   left out. Ask which numbers to save.

4. **Save each town as approved:**

   ```bash
   LAB_TOKEN=<EE_AUTO_LAB_TOKEN> node scripts/find-tamans.ts save scripts/finder-review/<file>.json --skip 2,9
   ```

   Use `--only 1,3` when that is shorter. The hub saves the approved names as verified tamans, logs
   the rejected ones, and records the town as searched. A name already in the list is not duplicated.

5. **Update the master list row** in docs/taman-search-master-list.md:
   - **Status:** Done when every town is saved, else Partly run.
   - **Run date:** today.
   - **Towns searched**, **Tamans added** (new + confirmed) and **Rejected**.
   - **Notes:** the rejected names with the reason, and the towns still left.

   Then commit and push.

6. **Report** in the job report format: say DONE first; then the daerah, towns searched, tamans added
   per town, rejected names, Maps requests used, and the next daerah on the list. Everything minor
   goes under one [NOT IMPORTANT] heading.

## How the names are found

See `agy-lab/src/taman-finder.ts`.

- **Sources:** 7 Google Maps list searches per town (taman, housing estate, shop, company, factory,
  kedai, services), plus the addresses of leads already saved in the hub.
- **What counts:** a name is a candidate only when **2 or more different addresses in that town**
  carry it as an address part ("…, Taman Dawani, 81400 Senai"). It is never taken from a place's own
  name: people file private houses on Maps as "Housing complex".
- **What is dropped:**
  - names the daerah already lists (Seri = Sri, brackets ignored, a listed name without its town
    counts in that town);
  - names that are only a common word (Kampung Baru, Taman Perindustrian, Taman Damai);
  - names seen in only one address.

## Check progress

```bash
LAB_TOKEN=<EE_AUTO_LAB_TOKEN> node scripts/find-tamans.ts status
```

This prints the towns searched per daerah in the hub. If it disagrees with the master list, trust the
hub for the towns and fix the master list row.
