# Lead blacklist — draft, not wired in

These are the leads to keep out of contact research, because a solar EPC cannot sell to them.
It was drafted on 2026-10-24 from the whole master list (12,307 leads from `GET /api/leads`).
Nothing reads this file yet. It is for review before step 3, the deep contact research.

A lead is excluded when **its Google category is on a list, or its name matches a pattern**.
Name patterns are whole words, case-insensitive, and allow one optional space (`99 ?speed ?mart`).

## Result on the existing leads

| Group | Excluded | By category | By name | Already contact-researched |
|---|---|---|---|---|
| Not a business (housing, condos, parks, places of worship) | 1,147 | 1,055 | 92 | 149 |
| Hypermarkets, malls and shops inside them | 434 | 112 | 322 | 223 |
| Telco, courier and petrol outlets | 230 | 201 | 29 | 37 |
| Other solar companies (competitors) | 207 | 197 | 10 | **199** |
| Chain stores | 172 | 0 | 172 | 19 |
| Franchise agents and MLM | 124 | 35 | 89 | 10 |
| Banks and finance | 121 | 110 | 11 | 20 |
| Government and utilities | 115 | 89 | 26 | 13 |
| Chain food and drink | 101 | 19 | 82 | 35 |
| **Total** | **2,651 (21.5%)** | | | **705 of the 2,662 already researched** |

9,656 leads remain. The largest categories left are Restaurant (330), Construction company
(328), Corporate office, Hardware store, Software company, Manufacturer, Wholesaler, Real estate
developer, Warehouse and Logistics service.

## The lists

### Government and utilities
- **Categories:** Government office, City Hall, City government office, Local government office,
  Police station, Fire station, Post office, Courthouse, Public health department, Public medical
  center, Embassy, Primary school, Secondary school, High school, Public school, Public library,
  Community center, Electric utility company, Water utility company, Social security financial
  department.
- **Names:**
  - Agencies, councils and offices: jabatan, kementerian, majlis bandaraya / perbandaran /
    daerah / agama, pejabat pos / daerah / tanah / kesihatan / agama / pendidikan, dewan orang
    ramai / serbaguna / bandaraya, lhdn, kwsp, perkeso, jpj, imigresen, mahkamah, kastam,
    kerajaan, pusat khidmat, adun.
  - Police and fire: balai polis, polis diraja, pdrm, bomba.
  - Public health: klinik kesihatan, hospital sultan / sultanah / permai / enche besar / temenggong.
  - Public education: sekolah kebangsaan / jenis kebangsaan / menengah / rendah / agama, tadika
    kemas, kemas, politeknik, giatmara.
  - Utilities and post: tenaga nasional, tnb, ranhill saj, indah water, pos malaysia, pos mini.

### Banks and finance
- **Categories:** Bank, ATM, Financial institution, Credit union, Money transfer service,
  Currency exchange service.
- **Names:** maybank, cimb, public bank, rhb, hong leong bank, ambank, bank islam, bank rakyat, bsn,
  affin, alliance bank, uob, ocbc, hsbc, standard chartered, citibank, agrobank, bank muamalat, mbsb,
  al rajhi, ar-rahnu, western union, merchantrade, aeon credit.

### Hypermarkets, malls and shops inside them
- **Categories:** Hypermarket, Shopping mall, Department store.
- **Names:**
  - Hypermarkets and supermarket chains: aeon, jusco, giant hyper / super, lotus's, tesco, mydin,
    econsave, the store, pacific hypermarket, village grocer, hero market, ninso, eco-shop.
  - Malls: ksl city, paradigm mall, city square, komtar, toppen, sogo, parkson, mid valley,
    ioi mall / city, sunway … mall.
  - Other: ikea.
- A shop inside a mall names the mall ("Bata AEON Taman Universiti", "Toyako Salon @ Paradigm
  Mall"). It rents its space and has no roof of its own, so it is excluded too.

### Chain stores
- **Convenience:** 99 speedmart, 7-eleven, familymart, kk mart, mynews, emart24, cu mart.
- **Pharmacy and beauty:** watsons, guardian, caring pharmacy, big pharmacy, alpro pharmacy,
  aa pharmacy, health lane, am pm pharmacy, sasa.
- **Electronics and home:** senheng, harvey norman, senq, mr diy, daiso.
- **Fashion and shoes:** uniqlo, padini, brands outlet, the body shop, bata, crocs.
- **Books and toys:** popular book, mph, toys"r"us.
- **Jewellery:** poh kong, habib jewel, wah chan, tomei, sk jewellery.

### Chain food and drink
- **Category:** Fast food restaurant.
- **Coffee, tea and dessert:** starbucks, zus coffee, tealive, chatime, coolblog, gigi coffee,
  kenangan, bask bear, mixue, luckin, richiamo, jom chá, bingxue, baskin, llaollao, inside scoop.
- **Fast food:** mcdonald's, kfc, pizza hut, domino's, subway, marrybrown, texas chicken, a&w,
  burger king, richeese, dunkin', krispy kreme.
- **Restaurant chains:** secret recipe, oldtown, sushi king, sukiya, nando's, tea garden,
  thai odyssey, absolute thai.

### Telco, courier and petrol
- **Categories:** Petrol Station, Gas station, Telecommunications service provider, Courier
  service, Shipping and mailing service.
- **Petrol:** petronas, shell, petron, caltex, bhpetrol.
- **Telco:** u mobile, celcom / celcomdigi, digi, maxis, unifi, redone, onexox, tunetalk, hotlink,
  tm point.
- **Courier:** ninja van, j&t, dhl, pos laju, gdex, city-link, flash express, shopee express, spx,
  lazada express, lalamove, mail boxes etc, skynet, best express, collectco.

### Franchise agents and MLM
- **Categories:** Insurance agency, Life insurance agency.
- **MLM and direct sales:** amway, coway, cuckoo, tupperware, herbalife, shaklee, elken, cosway.
- **Insurance:** great eastern, prudential, aia, allianz, etiqa.
- **Franchises:** tyreplus, tayaria, anytime fitness, celebrity fitness, laundrybar, cuci express,
  dobi king.

### Not a business
- **Categories:** Housing Estate, Housing complex, Housing society, Apartment building, Apartment
  complex, Condominium complex, Serviced apartment, Housing development, Residential complex, Park,
  Playground, Bus stop, Bus station, Parking lot, Free parking lot, Parking garage, Tourist
  attraction, Electronics vending machine, Vending machine, Mosque, Church, Hindu temple, Buddhist
  temple, Chinese temple, Taoist temple, Place of worship, Cemetery, Neighborhood, Lake,
  Hiking area.
- **Names**, only when the lead has no category: a name that starts with taman, flat, pangsapuri,
  rumah pangsa, kampung, kg, jalan, apartment, kondominium, residensi, kuarters or kuaters.
  These are place names Google returned, not businesses.

### Other solar companies
- **Categories:** Solar energy company, Solar energy equipment supplier, Solar energy system
  service, Solar photovoltaic power plant, Solar hot water system supplier.
- **Names:** "solar" together with energy / power / pv / photovoltaic / panel / system /
  renewable / tenaga / epc / install, or "tenaga solar" / "sistem solar".
- "Solar" on its own is deliberately not enough. It also matches window-tint shops ("Solar Gard",
  "Solar Film"), watch shops ("Solar Time") and an LPG plant ("Solar Gas"). Those are not
  competitors.

## Left in, but your call

1,179 of the remaining leads are office or shop-lot tenants. They have small power bills and
rent their roof, so a solar sale goes through the building owner. They are not excluded above,
but they are the next group to consider dropping:

| Category | Count |
|---|---|
| Software company | 162 |
| Business management consultant | 145 |
| Business center (mostly virtual offices) | 135 |
| Lawyer and law firm | 111 |
| Hair, barber and beauty salon | 146 |
| Interior designer | 67 |
| Advertising and marketing agency | 95 |
| Accountant and accounting firm | 57 |
| Event planner | 32 |
| Training center | 32 |
| Real estate agency and consultant | 37 |
| Coworking space | 25 |
| Others (consultants, designers, travel and insurance companies) | 135 |

## Known misses

- **A brand named as a landmark.** "HS TYRES AND SERVICE CENTRE (beside burger king)" matches
  burger king. Stripping "beside / near / opposite / sebelah …" from names before matching fixes
  this. It only affects a handful of leads.
- **Uncategorised leads.** 539 leads have no category and no matching name. They are kept, and
  the name rules are the only check on them.
