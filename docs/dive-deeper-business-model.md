# Online Presence Audit: how the preview sells the full report

## In one line

We research a company **before** they pay, show them a free **preview** of their audit, and run the
**full audit** only after they order it.

## The three steps

| Step | When | What runs | What the client sees |
|---|---|---|---|
| 1. Company dive | Before the client pays | Stage 1: research from public sources only (web search, company registers, directories) | Nothing yet |
| 2. Preview | Right after the company dive | No extra work: the preview is built from the company dive alone | The free preview, at `/dp/<public id>` |
| 3. Full report | After the client pays | The dive-deeper pipeline: reviews, Google Maps, AI assistants, websites, registers, then advice and editing | The full report, at `/dd/<public id>` |

### 1. The company dive is done before the client buys

The company dive researches the company from public sources: who they are, their registration,
people, claims, projects and footprint. For Eternalgy it read 181 sources and recorded 91 facts.
It also lists where those sources disagree (13 places) and what they cannot answer (10 questions).

It is the cheap part: one company dive per prospect, and the preview adds no further cost. The
expensive work (Maps, reviews, AI questions, the website crawl, advice and editing) only runs
once the client has paid.

### 2. The preview is an early look at the full report

The preview turns the company dive into a short report in the same style as the full report:
A4, desktop and mobile versions, with the same chapters and look. It does three jobs:

- **It proves the work is real.** It shows the company's own details, the people linked to it and
  its claims, all from public sources. The owner recognises their business at once.
- **It raises the questions the owner cannot ignore.** For example, "13 places where your story
  changes from source to source": founding month, headcount, CIDB grade, project counts, warranty
  terms. Each claim is marked *Not yet checked* against its register.
- **It tells them exactly what they get when they order.** The five numbers customers decide on
  are shown **locked**: reviews answered, Google Maps rank, AI recommendations, urgent website
  faults, and claims confirmed by the registers. Each chapter of the full report is described
  with the question it answers, what we will do and what they will know. The ready-to-use work
  (rewritten homepage, review replies, pages to add, AI plan, business data, 30-day plan) is
  listed, and the page ends with how to order.

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
