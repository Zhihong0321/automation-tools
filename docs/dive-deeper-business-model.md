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
(rewritten homepage, review replies, pages to add, AI plan, business data, 30-day plan), how it
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
- Stage 2 writes the advice: fixes in order, a 30-day plan, homepage copy, pages to add, review
  replies, the AI plan, the FAQ, and the business data for Google and AI.
- Stage 3 edits it into the report: plain English, the three problems costing the most customers,
  and screenshots of what is broken.

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

## How to run it

| Task | How |
|---|---|
| Get a preview link | Run a company dive; its report link `/d/<public id>` becomes `/dp/<public id>` for the preview. The dive-deeper console lists a **Preview** link next to each company dive. |
| Start the full report after payment | Dive-deeper console, or `POST /api/dive-deeper` with `{"dive_id": <company dive id>}`, so the run reuses that dive |
| Set the order panel on the preview | Hub settings `DD_PREVIEW_PRICE` (e.g. `RM 990`), `DD_PREVIEW_CONTACT` (how to order) and `DD_PREVIEW_ORDER_URL` (an order or payment page). Empty, the preview asks the client to reply to the message that brought it. |
| Switch on | `DIVE_DEEPER_ENABLED` on the hub (the preview and the full report are both off without it) |
| Build either one on this PC | `node agy-lab/scripts/dive-deeper/preview.ts <diveId>` and `node agy-lab/scripts/dive-deeper/report.ts <diveId>`, from the files in `scripts/dive-deeper/out` |

## Not decided yet

- The price of the full report.
- How clients pay, and who receives the order.
- Whether the preview link goes out by WhatsApp, email or both, and who sends it.
