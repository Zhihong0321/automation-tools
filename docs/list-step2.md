# List processing step 2: the best contact method

A search list (step 1, see `country-industry.md`) finds businesses on Maps and
reads their websites for emails, phones and social links. Step 2 decides how
to reach each one. Every business gets one `best_contact_method`:

| Priority | `best_contact_method` | When |
|---|---|---|
| 1 | `contact-via-website` | Its website has a contact form a bot can submit |
| 2 | `unknown-hosting-email` | It has an email whose domain's mail is not on a major provider |
| 3 | `major-brand-email-hosting` | It has an email on Google, Microsoft, Zoho, ... |
| 4 | `mobile-phone` | A mobile number on Maps or the website, or a WhatsApp link |
| 5 | `social-media` | A Facebook, Instagram, LinkedIn, X, TikTok, YouTube, Discord, Telegram, LINE, ... page |
| 6 | `no-viable-contact-method` | None of the above |

The highest that applies wins. All the evidence is kept beside it, so a lead
marked `contact-via-website` still has its emails, phones and social links.

No LLM, no browser, nothing is sent. Code: `agy-lab/src/list-step2.ts`, tests
in `list-step2.test.ts`.

## How one lead is checked

1. **Website read again.** The homepage plus up to three contact, team or
   about pages it links, with the country pipeline's reader (the same pages
   step 1 read). When the homepage links no contact page, `/contact-us` and
   then `/contact` are tried. A Facebook or marketplace page given as the
   website is not read; it counts as a social link.
2. **Contact form.** The HTML of those pages is searched for a form with a
   message box plus an email or phone box. The form picker is the one
   contact-form delivery uses (`contact-form-delivery.ts` `pickForm`), so a
   newsletter, search or login form never counts. The first page with a
   contact form decides, as in delivery. Then:
   - `bot_can_submit`: no captcha on the form or the page. This is
     `contact-via-website`.
   - `captcha`: reCAPTCHA, hCaptcha, Turnstile, a Cloudflare check, or a
     "what is 3 + 4" question, with the same markers delivery looks for.
     Delivery would refuse it, so it does not count.
   - `script_form`: no form in the HTML, but the site is built on Wix,
     Squarespace, Webflow or Weebly, or embeds a HubSpot, Jotform, Typeform,
     Google or similar form. Those forms only exist after the page's script
     runs. Not checked (see below).
   - `no_form`, `unreachable`, `no_website`, `not_own_site`.
3. **Emails.** Every email step 1 stored for the business, plus every email on
   the pages read now (mailto links, Cloudflare-protected addresses, plain
   text), cleaned of placeholders such as `you@example.com`.
4. **MX check.** Each email domain's MX records, once per domain. The most
   preferred MX host names the provider:

   | Provider | MX host ends in |
   |---|---|
   | Google | `google.com`, `googlemail.com` |
   | Microsoft | `outlook.com`, `hotmail.com`, `office365.us` |
   | Yahoo | `yahoodns.net` |
   | Apple iCloud | `icloud.com`, `me.com` |
   | Zoho | `zoho.com`, `zohomail.com` and the country Zoho domains |
   | Proton | `protonmail.ch`, `proton.me` |
   | Yandex, Mail.ru | `yandex.net`/`.ru`/`.com`, `mail.ru` |
   | Tencent, NetEase, Alibaba | `qq.com`; `163.com`, `126.com`, `netease.com`; `mxhichina.com`, `aliyun.com` |
   | GMX / Web.de, Fastmail | `gmx.net`, `web.de`, `mail.com`; `messagingengine.com` |
   | Naver, Kakao | `naver.com`; `daum.net`, `kakao.com` |

   Any other MX host is `unknown` (`mx_class: 'unknown'`): the company's own
   server, a web host's mail, or a filter in front of the mailbox. A domain
   with no MX record, or one that does not exist, is `none` and is not a
   contact method (mail to it bounces). A lookup that fails twice is
   `unknown`, with the error kept. The list is `MAJOR_MX` in the code.
5. **Phones.** The Maps phone, the website's phones and WhatsApp links, read
   with libphonenumber for the business's country (the country of the first
   search that found it). Only numbers libphonenumber calls `MOBILE`, and
   WhatsApp numbers, count as `mobile-phone`.
6. **Social links.** Company pages on social networks. Share buttons, embeds
   and bare network homepages are left out. At most 20 per lead.

## Running it

A job runs on the hub, over one search-list run. **A new job starts paused**
unless it is created with `start: true`. All behind `LAB_TOKEN`.

| Call | Does |
|---|---|
| `POST /api/list-step2` `{run_id, start?}` | a job over every business of the run that step 1 has finished |
| `POST /api/list-step2` `{run_id, sample: 50}` | a random sample, 1 to 5,000 |
| `POST /api/list-step2` `{run_id, place_keys: [...]}` | chosen businesses |
| `GET /api/list-step2` | the last 20 jobs with their counts |
| `GET /api/list-step2/<job>` | counts: done, by `best_contact_method`, by form verdict, emails by provider |
| `POST /api/list-step2/<job>/start`, `/pause` | |
| `GET /api/list-step2/<job>/leads?limit=50&after=<place_key>` | the results as JSON, a page at a time |
| `GET /api/list-step2/<job>/leads.csv` | the results as CSV |
| `GET /api/list-step2/browse?run=&status=&offset=` | every business of the search lists with its latest contact status, 100 at a time by name |

The operator page `/research-leads` shows that list: company, industry,
country (from the searches that found it) and contact status, with a filter
per status (`not-checked` for businesses no job has finished) and per search
list. A row opens to its website, Maps link, form verdict, emails with their
mail provider, typed phones and social links.

Its **Run step 2 on unchecked leads** button (`POST /api/list-step2/run-unchecked
{run?}`) works on the list picked in the page, or on every list: paused step-2
jobs carry on, and one new job per list takes every business no job holds yet
(and whose step-1 website check is finished). Pressing it again later only adds
what is new, such as businesses a still-running list found since. The page shows
each active job's progress with a Pause button.

A job takes only businesses whose step-1 website check is finished. Over a run
that is still going, make a later job for the rest.

Ten leads are worked at a time on the hub. A lead is a few page loads and a
few DNS lookups. The first full run did about 110 leads a minute on the hub
alone, so 79,000 businesses take about 12 hours; a PC worker beside it (below)
adds about 50 a minute.

### A Windows PC shares the work: the Step 2 Worker

`agy-lab/step2-worker/` turns a Windows PC into a second step-2 worker. While
the PC is on and a step-2 job is running, it takes a batch of leads from the
hub, works each one with the same `processLead` on the PC's own internet line,
and sends each result back as soon as it is ready. With no job running it asks
again every minute. Only outbound requests.

Each slot takes its next lead from a small local queue as soon as it is free,
and the queue is topped up while the slots still have work, so a slow page or a
slow send holds up only its own slot. (Until 2026-10-31 the slots waited for the
whole batch; one send that hung for 36 minutes left the other 11 slots idle.) A
request to the hub that gets no answer in a minute is dropped and tried again,
up to three times; a result that still cannot be sent is left to the lead's lease.

- **Runs from the repo checkout** with the PC's Node 24 (`node worker.ts`), so
  it always runs the repo's current step-2 code. `Start Step 2 Worker.cmd`
  keeps it running and restarts it if it stops.
- **Settings** in `%LOCALAPPDATA%\Step2Worker\worker.env`: `LAB_URL`,
  `GMAP_WORKER_KEY` (the Gmap Local Worker's key, an HMAC of LAB_TOKEN that
  reaches only the worker routes; the PC never holds LAB_TOKEN), and optional
  `WORKER_NAME` (default `pc-<computer name>`) and `CONCURRENCY` (default 6).
  The log is `worker.log` beside it.
- **Autostart:** `Enable autostart.cmd` puts a shortcut in the Windows Startup
  folder, so the worker starts minimised at every sign-in; `Disable
  autostart.cmd` removes it.
- **Leases:** every taken lead records who took it (`taken_by`: the hub's
  `hub-…` or the PC's name) and until when (`taken_until`: 10 minutes for the
  hub, 15 for a PC). The hub and any number of PCs take from the same running
  job without overlap. A PC that goes offline leaves its leads until their lease
  ends; then the hub or another PC takes them. A job is done when no lead is
  pending or held.
- **Routes** (worker key only): `POST /api/list-step2/worker/take
  {worker, limit}` (up to 50 leads with their business, step-1 contacts and
  country) and `POST /api/list-step2/worker/done {worker, job_id, place_key,
  result}`. A job's status (`GET /api/list-step2/<job>`) has `doneBy`: leads
  done per worker, the hub as `hub`.

This PC (`pc-desktop-camhl16`) joined the first full run on 2026-10-31 at 06:17
and did 12 leads every 5–15 seconds, about 50 a minute.

### The Mac mini shares it too

The Mac mini that runs the Maps scans runs the same `worker.ts` as a third worker,
`mac-mini`. `worker.ts` is written for any OS, so nothing about it is Windows-only:
on macOS it reads `~/.step2-worker/worker.env` and logs to `worker.log` beside it.

- **It uses LAB_TOKEN, not a worker key.** The mini already holds LAB_TOKEN for the
  Maps lanes, and LAB_TOKEN reaches the worker routes too, so there is no second
  secret to mint or store. A PC that should never hold LAB_TOKEN still uses
  `GMAP_WORKER_KEY`; `worker.ts` takes whichever of the two the env file has.
- **Autostart:** the LaunchAgent `worker/com.eternalgy.step2worker.plist`, with
  `RunAtLoad` and `KeepAlive`, so it starts at login and is restarted if it dies.
  Install and stop lines are in `worker/README.md` under "The Step 2 Worker".
- **Settings:** `LAB_URL`, `LAB_TOKEN`, `WORKER_NAME=mac-mini`, `CONCURRENCY=8`.
- **Speed:** it joined the full run on 2026-10-31 at 06:39 UTC and settled at 16
  leads every 6–12 seconds — **357 leads in 4 measured minutes, 89 a minute**, about
  three fifths again as fast as the PC's ~50. Its first few batches ran at half that
  while nothing was cached; judge it after a minute, not on batch one.

Nothing about the hub changed to admit it: it takes leases from the same two routes
as the PC, and a reboot of the mini just leaves its last batch to its 15-minute lease.

### Where the results are stored

In the report database, beside `search_list_place`:

| Table | One row per | Holds |
|---|---|---|
| `list_step2_job` | job | name, source run, status (`paused`, `running`, `done`), lease |
| `list_step2_lead` | business in the job | `run_id`, `place_key`, `place_id`, `status`, `best_contact_method`, `form`, `emails`, `phones`, `social`, `error` |

`emails` is a list of `{email, domain, source, mx_class, mx_provider, mx}`, so
email outreach can be planned by provider. `phones` is a list of
`{phone, e164, type, source}`. `place_id` is indexed, for deduping across runs
later; the Maps fields stay in `search_list_place`, joined on
`(run_id, place_key)`.

### When something goes wrong

**Freak pages.** On 2026-10-31 the hub froze twice: at 07:42 UTC, and again
15 seconds after a restart. A page in flight sent a page-reading pattern into
quadratic time on the main thread, so every pipeline on the hub stopped
answering. Since then:

- Each lead's pages are read in a worker thread (`list-step2-thread.ts`, via
  `makeReader`), one per loop, on the hub and on the PC and Mac workers.
- A lead still being read after 2 minutes is let go. Its thread is stopped,
  and the lead is worked without its website, from what step 1 stored. Its
  form detail says so.
- The page-reading patterns in `list-step2.ts`, `site-emails.ts` and
  `country/country-industry-research.mjs` are bounded or single-pass. A
  300,000-character run of digits, spaces, letters, `<` or unclosed tags reads
  in about 0.1 s. The test is "freak pages are read in linear time".

Each finished lead is one saved row, so a redeploy or a pause loses only the
leads in flight, and they are taken again. A lead taken three times without
finishing (a hub that kept dying on it) is closed with an error and
`no-viable-contact-method`. A website that does not load leaves what step 1
stored: its emails and phones still count. The job lease is the one search
lists use: one hub works a job, and another takes it over two minutes after
the first stops. Each lead also has its own lease (see the Step 2 Worker), so
a lead held by a PC that went offline comes back after 15 minutes.

## The first test: five leads (2026-10-31)

Job `a1e8dab86a1f` over run `376382ba4ee4`, five chosen businesses: 13 seconds.

| Business | Form | Emails (MX) | Phones | Best |
|---|---|---|---|---|
| JUN Architect (MY) | `bot_can_submit` on /contact: name, email, phone, message | junarchitectmy@gmail.com (Google) | Maps 011-5428 0948 MOBILE, site landline | `contact-via-website` |
| 8CLICKS (SG) | `captcha`: reCAPTCHA | sales@, support001@, support01@8clicks.com.sg (own server, unknown); a gmail (Google) | +65 8588 2566 MOBILE, Maps landline | `unknown-hosting-email` |
| AE Accountancy (UK) | `no_form`: no form, no contact page | none | Maps landline | `no-viable-contact-method` |
| Hughes Pettit (AU) | `unreachable`: HTTP 500 | none | Maps landline | `no-viable-contact-method` |
| SKL & Co (MY) | `no_website` | none | Maps landline | `no-viable-contact-method` |

Checked by hand: JUN Architect's contact page has a plain form with no
captcha (its hidden `bot-field` is a honeypot, which delivery never fills), and
AE Accountancy's site has no form and links no contact page. 8CLICKS's social
links include its WordPress theme maker's pages, which the step does not tell
apart from the company's own.

## Skipped as too complex

- **Forms drawn by script.** Wix, Squarespace, Webflow and Weebly sites, and
  HubSpot, Jotform, Typeform or Google forms, have no form in their HTML.
  Seeing them needs a browser per site, which the 79,000-lead run cannot
  afford. They are marked `script_form` and fall through to email, phone or
  social. Contact-form delivery, which does use a browser, can still send to
  them one at a time.
- **Captchas added late.** A reCAPTCHA that a page's script loads after it
  opens is not in the HTML, so a few `bot_can_submit` forms will turn out to
  be guarded. Delivery checks again before sending and reports `captcha`.
- **Mobile or landline in the US and Canada** (and other countries where the
  number itself does not tell). libphonenumber calls these
  `FIXED_LINE_OR_MOBILE`. Telling them apart needs a paid carrier lookup, so
  they do not count as mobile. They stay in `phones` with their type.
- **The mailbox behind a mail filter.** Mimecast, Proofpoint, Barracuda and
  similar sit in front of Google or Microsoft mailboxes. The MX shows only the
  filter, so these are `unknown`.
- **Whether an address exists.** No SMTP check: many mail servers block or lie
  to it, and it risks the sending IP's reputation.
