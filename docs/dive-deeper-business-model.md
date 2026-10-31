# Online Presence Audit: how the preview sells the full report

## In one line

We research a company **before** they pay, show them a free **preview** of their audit, and run the
**full audit** only after they order it.

## The three steps

| Step | When | What runs | What the client sees |
|---|---|---|---|
| 1. Company dive | Before the client pays | Stage 1: research from public sources only (web search, company registers, directories) | Nothing yet |
| 2. Preview | When the preview link is first opened | One AI pass over the company dive, run once and kept | The free preview landing page, at `/dp/<public id>` |
| 3. Full report | After the client pays | The dive-deeper pipeline: reviews, Google Maps, AI assistants, websites, registers, then advice and editing | The full report, at `/dd/<public id>` |

### 1. The company dive is done before the client buys

The company dive researches the company from public sources: who they are, their registration,
people, claims, projects and footprint. For Eternalgy it read 181 sources and recorded 91 facts.
It also lists where those sources disagree (13 places) and what they cannot answer (10 questions).

It is the cheap part: one company dive per prospect, and the preview adds a single AI pass. The
expensive work (Maps, reviews, AI questions, the website crawl, advice and editing) only runs
once the client has paid.

### 2. The preview is an early look at the full report

The preview is a one-page landing page for the owner, built from the company dive. It is
written to hook them in two ways, then ask for the order:

- **It is about them and nobody else.** The opening line names their company and how many
  sources we read about it. A "prepared for you" file card shows their registration, head office,
  websites and the people we found. A section of what public sources already say about them
  (founded, leadership, services, registrations, claimed projects, awards) makes it plain this is
  not a template.
- **It shows warning signs, and holds most of them back.** Each warning is tagged as a
  *contradiction*, *missing* information, *outdated* or *wrong information*, with what the
  sources say and who notices (a customer, a bank, a tender officer). Five are shown in full. The
  rest are counted on a locked card ("+18 more warning signs, shown in your full report"), and
  the five numbers customers decide on are shown **locked**: reviews answered, Google Maps rank,
  AI recommendations, urgent website faults, claims confirmed by the registers.

After that comes what each chapter of the full report unlocks, the work done for them
(the full analysis, the action plan by department, rewritten homepage, review replies, pages to add, AI plan, business data), how it
works, and the order panel. "Get my full report" buttons sit in the top bar, the opening, the
middle and the end.

One AI pass writes the opening line, the "what we know" items and the typed warnings from the
company dive. It runs the first time the preview link is opened (about a minute, behind a page
that refreshes itself) and is kept, so every later visit is instant and costs nothing. If it
fails, the page uses the company dive's own contradictions and gaps instead.

Sample: [dive-preview-eternalgy.html](dive-preview-eternalgy.html).

### 3. After payment, we run the full pipeline

When the client orders, we start the dive-deeper run on the **same** company dive, so nothing is
researched twice:

- Stage 1 checks what customers actually see:
  - every Google review on their Maps listings
  - their Google Maps and web rank in each town they serve
  - each licence and award, looked up in its official register
  - every page of their websites, with links, phone numbers and WhatsApp tested
  - what AI assistants say about them, from memory and with a web search
- Stage 2 writes the ready-to-use drafts: homepage copy, pages to add, review replies, the AI
  plan, the FAQ, and the business data for Google and AI.
- Stage 3 edits it into the report: plain English and screenshots of what is broken.
- Stage 4 writes one full analysis across all six research parts: the verdict, the three problems
  costing the most customers, each part assessed and the causes that run through several parts.
- Stage 5 compiles the action plan: one task list per department (website, social media, IT,
  other), each task with when, effort and the draft that does it.

The client receives one link with three versions: desktop, mobile, and A4 to print or save as PDF.

Sample: [dive-deeper-report-eternalgy.html](dive-deeper-report-eternalgy.html).

## What the client gets, chapter by chapter

| Chapter | The question it answers | Unlocked number |
|---|---|---|
| Reputation | Do reviews still decide who gets the call? | Reviews with a reply from you |
| Search and Maps | When a customer searches, do they find you? | Your rank on Google Maps |
| AI assistants | How important is an AI recommendation in today's market? | AI answers that recommend you |
| Your websites | Does your website win the customer, or lose them? | Urgent faults on your sites |
| Licences and awards | Can a stranger verify what you claim? | Claims the registers confirm |

## Fully automatic, on Railway

Everything runs inside the hub on Railway (`ee-auto`). Nothing needs this PC, and nothing calls
Claude: every AI step uses DeepSeek (`deepseek-v4.1-flash-1017`) on every enabled lane saved on
`/workers`, through the app's one LLM router ([core/README.md](../agy-lab/src/core/README.md)). MiniMax
is used only when every lane has failed.

| Step | Trigger | Runs where | AI used | Stored in (Postgres on Railway) | Link |
|---|---|---|---|---|---|
| Company dive | `POST /api/company-dive` (by whoever adds the prospect) | Hub, its own queue | DeepSeek | `company_dive` (research, dossier, sources) | `/d/<public id>` |
| Preview | Automatic: the hub checks every 2 minutes for finished company dives without a preview, one at a time | Hub | One DeepSeek call per company | `dive_preview` (the notes); the page is drawn from them on each visit, so design changes reach old previews too | `/dp/<public id>` |
| Full report | After payment: `POST /api/dive-deeper` with `{"dive_id": …}` (a payment webhook can call this once a provider is chosen) | Hub, one run at a time, with headless Chromium for the screenshots | DeepSeek for every stage | `dive_deeper`: every lane's results in `lanes`, the finished page in `report_html` | `/dd/<public id>` |

One list shows where every company stands: `GET /api/dive-deeper/pipeline` returns each company
dive with its preview status and link, and its full report status and link when one was ordered.

Both links are public: the long random ID in the link is the permission, as with company dives,
and the pages tell search engines not to index them. The API needs the hub token.

## How to run it

| Task | How |
|---|---|
| See every company, preview and report | `GET /api/dive-deeper/pipeline` |
| Get a preview link | Nothing to do: it is written within a few minutes of the company dive finishing. The link is the company dive's `/d/<public id>` with `/dp/`, and the dive-deeper console shows a **Preview** link next to each run. |
| Start the full report after payment | Dive-deeper console, or `POST /api/dive-deeper` with `{"dive_id": <company dive id>}`, so the run reuses that dive |
| Set the order panel on the preview | Hub settings `DD_PREVIEW_PRICE` (e.g. `RM 990`), `DD_PREVIEW_CONTACT` (how to order) and `DD_PREVIEW_ORDER_URL` (an order or payment page). Empty, the preview asks the client to reply to the message that brought it. |
| Switches | `DIVE_DEEPER_ENABLED` turns previews and full reports on; `DD_PREVIEW_AUTO=off` stops previews being written on their own (they are then written on first open) |
| Build either one on this PC | `node agy-lab/scripts/dive-deeper/preview.ts <diveId>` and `node agy-lab/scripts/dive-deeper/report.ts <diveId>`, from the files in `scripts/dive-deeper/out` |

## Not decided yet

- The price of the full report.
- How clients pay, and who receives the order.
- Whether the preview link goes out by WhatsApp, email or both, and who sends it.
