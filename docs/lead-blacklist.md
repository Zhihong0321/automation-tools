# Lead blacklist — how `lead-blacklist.ts` works

[`agy-lab/src/lead-blacklist.ts`](../agy-lab/src/lead-blacklist.ts) decides which leads a solar EPC will
not sell to, so contact research never spends money on them. It was approved on 2026-10-24 and has been
live since then (73561ef).

## Count today (2026-10-26)

Read straight from the hub database (`company_data.blacklist_reason`, merged leads excluded):

| | Leads |
|---|---|
| All leads | **123,727** |
| Blacklisted | **17,386 (14.1%)** |
| Not blacklisted, so contact research may run | 106,341 |
| Not checked yet | 0 |
| Blacklisted, but contact research had already run on them (mostly before the blacklist went live) | 722 |

By group, in the order the code checks them:

| Group | Leads | Share of blacklisted | What it is |
|---|---|---|---|
| `not_a_business` | 8,164 | 47.0% | Housing estates, apartments, condos, parks, places of worship, and place names with no category |
| `telco_courier_fuel` | 1,660 | 9.5% | Petrol stations, telco outlets, courier counters |
| `hypermarket_mall` | 1,653 | 9.5% | Hypermarkets and malls, and shops inside them |
| `franchise_agent` | 1,548 | 8.9% | Insurance agents, MLM distributors (Coway, Amway, Shaklee), franchise outlets |
| `chain_store` | 1,439 | 8.3% | Convenience, pharmacy, electronics and fashion chains |
| `government` | 1,112 | 6.4% | Government offices, police, post offices, public schools and clinics, utilities |
| `chain_fnb` | 1,000 | 5.8% | Coffee, tea, dessert and fast-food chains |
| `bank_finance` | 558 | 3.2% | Banks, ATMs, pawn (Ar-Rahnu), money transfer |
| `competitor_solar` | 252 | 1.4% | Other solar companies |

The categories that contribute most:

| Leads | Group | Google category |
|---|---|---|
| 1,973 | not_a_business | Housing society |
| 1,865 | not_a_business | Housing complex |
| 1,613 | not_a_business | Housing Estate |
| 974 | not_a_business | Apartment building |
| 804 | chain_store | Convenience store (matched by name: 99 Speedmart, 7-Eleven, KK Mart…) |
| 619 | franchise_agent | Insurance agency |
| 602 | not_a_business | no category (a place name such as "Taman …" or "Kampung …") |
| 571 | telco_courier_fuel | Courier service |
| 466 | telco_courier_fuel | Telecommunications service provider |
| 415 | hypermarket_mall | Shopping mall |
| 360 | chain_fnb | Fast food restaurant |
| 271 | telco_courier_fuel | Petrol Station |
| 243 | bank_finance | Bank |
| 201 | government | Government office |
| 175 | competitor_solar | Solar energy company |
| 175 | government | Post office |

To count again, run this read-only query on the hub database:
`select blacklist_reason, count(*) from company_data where merged_into is null group by 1 order by 2 desc;`

## How one lead is judged

`blacklistReason(name, category)` returns a group name, or `null` when the lead may be researched.

1. **Strip the landmark from the name.** Text such as "(beside Burger King)", "- opposite Maybank",
   "sebelah …", "depan …", "belakang …" or "berhampiran …" says where a business is, not what it is,
   so it is removed before matching. "HS TYRES (beside burger king)" is therefore not Burger King.
2. **Go through the groups in order.** The first group that matches wins. For each group:
   - **Category:** if the lead's Google category is exactly one on the group's list, it matches.
   - **Name:** if the name contains one of the group's words, it matches.
3. **No group matched:** the result is `null`, and the lead is clean.

How the name words are matched:
- **Whole words only,** ignoring case. `aia` matches "AIA Agency" but not "Malaia".
- **Spacing and punctuation variants are written into each word,** for example `99 ?speed ?mart`,
  `mr\.? ?diy`, `j ?& ?t` and `celcom(?:digi)?`.
- **Two groups have special rules:**
  - `not_a_business` checks its name rule (a name *starting* with Taman, Flat, Pangsapuri, Kampung,
    Jalan, Apartment, Residensi, Kuarters…) **only when the lead has no category.** So "Taman Daya
    Hardware" (category Hardware store) stays in.
  - `competitor_solar` does **not** match the word "solar" alone. It needs "solar" together with
    energy, power, PV, panel, system, renewable, tenaga, EPC or install…, or the phrase "tenaga solar"
    or "sistem solar". That keeps window-tint ("Solar Gard"), watch ("Solar Time") and LPG ("Solar
    Gas") shops in.

## The groups

The lists below are the code's own words, shortened only where marked "…".

| Group | Matched by category | Matched by name |
|---|---|---|
| `government` | Government office, City Hall, City government office, Local government office, Police station, Fire station, Post office, Courthouse, Public health department, Public medical center, Embassy, Primary school, Secondary school, High school, Public school, Public library, Community center, Electric utility company, Water utility company, Social security financial department | jabatan, kementerian, majlis bandaraya / perbandaran / daerah / agama, pejabat pos / daerah / tanah / kesihatan / agama / pendidikan, balai polis, polis diraja, pdrm, bomba, klinik kesihatan, hospital sultan / sultanah / permai / enche besar / temenggong, sekolah kebangsaan / jenis kebangsaan / menengah / rendah / agama, tadika kemas, kemas, dewan orang ramai / serbaguna / bandaraya, lhdn, kwsp, perkeso, jpj, imigresen, mahkamah, kastam, tenaga nasional, tnb, ranhill saj, indah water, pos malaysia, pos mini, politeknik, giatmara, kerajaan, pusat khidmat, adun |
| `bank_finance` | Bank, ATM, Financial institution, Credit union, Money transfer service, Currency exchange service | maybank, cimb, public bank, rhb, hong leong bank, ambank, bank islam, bank rakyat, bsn, affin, alliance bank, uob, ocbc, hsbc, standard chartered, citibank, agrobank, bank muamalat, mbsb, al rajhi, ar-rahnu, western union, merchantrade, aeon credit |
| `hypermarket_mall` | Hypermarket, Shopping mall, Department store | aeon, jusco, giant hyper… / super…, lotus's, tesco, mydin, econsave, the store, pacific hypermarket, ksl city, paradigm mall, city square, komtar, toppen, sogo, parkson, mid valley, ioi mall / city, sunway … mall, ikea, village grocer, hero market, ninso, eco-shop. A shop inside a mall names the mall ("Bata AEON Taman Universiti"); it rents a roof it doesn't own, so it is out too |
| `chain_store` | (none) | 99 speedmart, 7-eleven, familymart, kk mart, mynews, emart24, cu mart, mr diy, daiso, watsons, guardian, caring / big / alpro / aa / am pm pharmacy, health lane, senheng, harvey norman, senq, uniqlo, padini, brands outlet, the body shop, bata, popular book, mph, toys"r"us, poh kong, habib jewel, wah chan, tomei, sk jewellery, sasa, crocs |
| `chain_fnb` | Fast food restaurant | starbucks, zus coffee, tealive, chatime, coolblog, gigi coffee, kenangan, bask bear, mixue, luckin, secret recipe, oldtown, mcdonald's, kfc, pizza hut, domino's, subway, marrybrown, texas chicken, a&w, burger king, sushi king, sukiya, nando's, baskin, llaollao, inside scoop, dunkin', krispy kreme, richiamo, tea garden, thai odyssey, absolute thai, jom chá, bingxue, richeese |
| `telco_courier` | Telecommunications service provider, Courier service, Shipping and mailing service | u mobile, celcom / celcomdigi, digi, maxis, unifi, redone, onexox, tunetalk, hotlink, tm point, ninja van, j&t, dhl, pos laju, gdex, city-link, flash express, shopee express, spx, lazada express, lalamove, mail boxes etc, skynet, best express, collectco |
| `franchise_agent` | Insurance agency, Life insurance agency | amway, coway, cuckoo, tupperware, herbalife, shaklee, elken, cosway, great eastern, prudential, aia, allianz, etiqa, tyreplus, tayaria, anytime fitness, celebrity fitness, laundrybar, cuci express, dobi king |
| `not_a_business` | Housing Estate, Housing complex, Housing society, Apartment building, Apartment complex, Condominium complex, Serviced apartment, Housing development, Residential complex, Park, Playground, Bus stop, Bus station, Parking lot, Free parking lot, Parking garage, Tourist attraction, Electronics vending machine, Vending machine, Mosque, Church, Hindu temple, Buddhist temple, Chinese temple, Taoist temple, Place of worship, Cemetery, Neighborhood, Lake, Hiking area | Only when the lead has no category: a name starting with taman, flat, pangsapuri, rumah pangsa, kampung, kg, jalan, apartment, kondominium, residensi, kuarters or kuaters |
| `competitor_solar` | Solar energy company, Solar energy equipment supplier, Solar energy system service, Solar photovoltaic power plant, Solar hot water system supplier | "solar" plus energy / power / pv / photovoltaic / panel / system / renewable / tenaga / epc / install…, or "tenaga solar" / "sistem solar" |

## Where it runs

The result is stored per lead in `company_data.blacklist_reason`, set by `applyLeadBlacklist()` in
[reportdb.ts](../agy-lab/src/reportdb.ts). It runs:

| When | Which leads | Where |
|---|---|---|
| Every time the hub starts (every deploy) | **all** leads, so a rule change reaches the old ones | [server.ts](../agy-lab/src/server.ts) |
| Right after each business scan | leads never checked | `runBusinessSearch` in [intel.ts](../agy-lab/src/intel.ts) |
| Before every contact auto-queue cycle | leads never checked | `tick` in [autocontact.ts](../agy-lab/src/autocontact.ts) |
| When a taman's "Research N pending" button is pressed | leads never checked | the `/api/territories/contact-research` route in intel.ts |

What a blacklisted lead is kept out of:
- **The contact auto-queue.** The backlog only takes leads that are checked *and* clean, so a new lead
  can never reach research before it is checked.
- **A taman's "Research N pending" count, and that button.**

What it is **not** kept out of:
- **Starting research on one company by hand.** That still works, on purpose.
- **The lead list and telemarketing.** Blacklisted leads stay visible and can still be assigned. The
  blacklist only stops contact research.

## Changing the rules

1. Edit the lists in `lead-blacklist.ts`. Each group has a category list and a name pattern.
2. Add a case to [lead-blacklist.test.ts](../agy-lab/src/lead-blacklist.test.ts) for every lead the
   change should catch, and for every lead it must leave in.
3. Deploy. At boot the hub re-checks **every** lead with the new rules, and its log shows
   `[blacklist] checked N leads, M kept out of contact research`.

A lead's group changes on that re-check. A lead that becomes clean is picked up by the contact
auto-queue like any other.

## Known limits

- **Name rules see only the name.** A real factory called "Taman Jaya Steel" with no category would be
  caught by the place-name rule. That is rare, because Maps almost always gives a category.
- **"Shop inside a mall" is judged by the name only.** A mall tenant whose name doesn't mention the
  mall stays in.
- **Office and shop-lot tenants are not blacklisted:** software firms, consultants, virtual offices,
  lawyers, salons and agencies. They rent their roof, so they are weak solar leads, but they were left
  in on purpose ("cannot block too much", 2026-10-25).
- **The 722 already researched** before the rules existed keep their contact reports. Nothing is undone.
