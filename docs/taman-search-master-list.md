# Search for taman — master list

One row per daerah. The **search-for-taman** SOP (`.claude/skills/search-for-taman/SKILL.md`)
reads this list first and **skips any daerah marked Done**. Update the row when a daerah finishes.

Statuses:
- **Not run**: no town in this daerah has been searched.
- **Partly run**: some towns are searched. The next run finishes the rest; the tool skips towns already
  recorded in the hub.
- **Done**: every town is searched and saved. Never run it again.

The town-level record lives in the hub (`taman_finder_town`, read with `node scripts/find-tamans.ts status`).
This list is the daerah-level master.

## Johor

| # | Daerah | Towns | Status | Run date | Towns searched | Tamans added | Rejected | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Johor Bahru | 11 | Not run | | 0 | 0 | 0 | 3 tamans were added by hand on 2026-10-25, before this SOP: Bandar Uda Utama, Kampung Skudai Kiri, Taman Tan Sri Yaacob |
| 2 | Kulai | 6 | Partly run | 2026-10-25 | 1 (Senai) | 16 (7 new, 9 confirmed) | 3 | Senai rejected: Taman Scientex Utama, Taman Perindustrian I-Park SAC, Taman Muhibah (look like listed names). Remaining: Kulai, Saleng, Kelapa Sawit, Sedenak, Seelong |
| 3 | Batu Pahat | 9 | Not run | | 0 | 0 | 0 | |
| 4 | Kluang | 7 | Not run | | 0 | 0 | 0 | |
| 5 | Muar | 8 | Not run | | 0 | 0 | 0 | |
| 6 | Pontian | 6 | Not run | | 0 | 0 | 0 | |
| 7 | Kota Tinggi | 6 | Not run | | 0 | 0 | 0 | 4 tamans were added by hand on 2026-10-25, before this SOP: Taman Kota Selesa, Taman Muhibbah, Taman Permata Penawar, Taman R.E.M |
| 8 | Segamat | 8 | Not run | | 0 | 0 | 0 | |
| 9 | Tangkak | 5 | Not run | | 0 | 0 | 0 | |
| 10 | Mersing | 4 | Not run | | 0 | 0 | 0 | 2 tamans were added by hand on 2026-10-25, before this SOP: Taman Lagenda Suria, Taman Intan Jaya |

## Selangor

| # | Daerah | Towns | Status | Run date | Towns searched | Tamans added | Rejected | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Petaling | 8 | Not run | | 0 | 0 | 0 | |
| 2 | Klang | 6 | Not run | | 0 | 0 | 0 | |
| 3 | Hulu Langat | 6 | Not run | | 0 | 0 | 0 | |
| 4 | Gombak | 6 | Not run | | 0 | 0 | 0 | |
| 5 | Sepang | 4 | Not run | | 0 | 0 | 0 | |
| 6 | Kuala Langat | 7 | Not run | | 0 | 0 | 0 | |
| 7 | Kuala Selangor | 8 | Not run | | 0 | 0 | 0 | |
| 8 | Hulu Selangor | 6 | Not run | | 0 | 0 | 0 | |
| 9 | Sabak Bernam | 4 | Not run | | 0 | 0 | 0 | |
