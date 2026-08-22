// The API reference, served by the thing it documents.
//
// It lives here rather than in a README because a reference that ships with the
// service cannot drift from the deploy: the page a caller reads at /docs came out
// of the same image that is answering their requests. API.md stays as the source
// a reader browsing the repo finds; this is the one a consumer hits.
//
// body() is the page without the document wrapper, so the same markup can be
// published elsewhere. page() is what the server sends.
//
// Single palette, no light theme, on purpose: this is the console's own dark
// surface (the same tokens as ui.ts), and the page is read next to a terminal.
export function body(): string {
  return String.raw`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
  :root {
    --bg:#0f1115; --panel:#161920; --sunk:#0b0d11; --ink:#e9ecf1; --muted:#98a1ae;
    --faint:#6c7684; --line:#242932; --line-soft:#1c2027;
    --accent:#7aa2f7; --accent-sunk:#1b2537;
    --ok:#5fd4a0; --warn:#eec06a; --bad:#ff8b80;
    --sans:"IBM Plex Sans",ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Consolas,"SF Mono",monospace;
  }
  * { box-sizing:border-box; }
  html, body { max-width:100%; overflow-x:clip; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans);
    font-size:15px; line-height:1.62; -webkit-font-smoothing:antialiased; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  a:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px; }
  code { font-family:var(--mono); font-size:0.885em; }

  .doc { display:grid; grid-template-columns:236px minmax(0,1fr); gap:0; width:100%; max-width:1180px; margin:0 auto; overflow:hidden; }

  /* --- side nav ------------------------------------------------------- */
  .nav { position:sticky; top:0; align-self:start; height:100vh; overflow-y:auto;
    padding:34px 20px 40px; border-right:1px solid var(--line-soft); }
  .brand { font-family:var(--mono); font-size:13px; font-weight:600; letter-spacing:.02em;
    display:flex; align-items:center; gap:8px; }
  .brand .dot { width:7px; height:7px; border-radius:50%; background:var(--ok);
    box-shadow:0 0 0 3px rgba(95,212,160,.14); }
  .brand-sub { color:var(--faint); font-size:12px; margin:2px 0 22px 15px; }
  .nav nav { display:flex; flex-direction:column; gap:1px; }
  .nav nav a { color:var(--muted); font-size:13.5px; padding:4px 8px; border-radius:6px; }
  .nav nav a:hover { color:var(--ink); background:var(--panel); text-decoration:none; }
  .nav-label { font-family:var(--mono); font-size:10.5px; text-transform:uppercase;
    letter-spacing:.12em; color:var(--faint); margin:16px 0 5px 8px; }

  /* --- main ----------------------------------------------------------- */
  main { padding:34px 40px 100px; min-width:0; }
  section { padding-top:14px; margin-bottom:46px; scroll-margin-top:20px; }
  h1 { font-size:34px; line-height:1.15; font-weight:600; letter-spacing:-.022em; margin:6px 0 12px; text-wrap:balance; }
  h2 { font-size:21px; font-weight:600; letter-spacing:-.014em; margin:0 0 6px; text-wrap:balance;
    padding-bottom:9px; border-bottom:1px solid var(--line); }
  h3 { font-size:15px; font-weight:600; margin:26px 0 8px; letter-spacing:-.005em; }
  p { margin:11px 0; max-width:68ch; }
  .eyebrow { font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.14em;
    color:var(--faint); margin:0; }
  .lede { font-size:16.5px; color:var(--muted); max-width:64ch; }
  ul { margin:11px 0; padding-left:18px; max-width:68ch; }
  li { margin:5px 0; }
  li::marker { color:var(--faint); }
  strong { font-weight:600; }

  /* --- hero facts ----------------------------------------------------- */
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:10px; margin:22px 0 4px; }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .fact .k { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.12em;
    color:var(--faint); display:block; margin-bottom:5px; }
  .fact code { font-size:13px; color:var(--ink); word-break:break-all; }

  /* --- endpoint header ------------------------------------------------ */
  .ep { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:24px 0 8px;
    padding:9px 12px; background:var(--panel); border:1px solid var(--line);
    border-left:3px solid var(--accent); border-radius:8px; }
  .ep .m { font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.06em;
    padding:2px 7px; border-radius:5px; }
  .ep .m.get { color:var(--accent); background:var(--accent-sunk); }
  .ep .m.post { color:var(--ok); background:rgba(95,212,160,.12); }
  .ep .path { font-size:14px; font-weight:500; color:var(--ink); }
  .ep .tag { font-size:12px; color:var(--faint); margin-left:auto; font-family:var(--mono); }

  /* --- tables --------------------------------------------------------- */
  .tbl { max-width:100%; overflow-x:auto; margin:14px 0; border:1px solid var(--line); border-radius:10px; }
  table { border-collapse:collapse; width:100%; font-size:13.5px; }
  th, td { text-align:left; padding:9px 13px; border-bottom:1px solid var(--line-soft); vertical-align:top; }
  th { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.1em;
    color:var(--faint); font-weight:500; background:var(--sunk); white-space:nowrap; }
  tr:last-child td { border-bottom:none; }
  td code { color:var(--ink); white-space:nowrap; }
  td.num { font-variant-numeric:tabular-nums; white-space:nowrap; font-family:var(--mono); font-size:12.5px; }
  .req { font-family:var(--mono); font-size:10px; letter-spacing:.08em; color:var(--warn); }

  /* --- code ----------------------------------------------------------- */
  pre { max-width:100%; background:var(--sunk); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; overflow-x:auto; margin:14px 0; }
  pre code { font-size:12.6px; line-height:1.65; color:#c9d4e7; white-space:pre; }
  .cmt { color:var(--faint); }
  .str { color:#a3d9a5; }

  /* --- callouts ------------------------------------------------------- */
  .call { border:1px solid var(--line); border-left:3px solid var(--muted);
    background:var(--panel); border-radius:8px; padding:12px 15px; margin:16px 0; max-width:72ch; }
  .call p { margin:0; max-width:none; font-size:14px; }
  .call p + p { margin-top:8px; }
  .call .h { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.12em;
    display:block; margin-bottom:5px; }
  .call.warn { border-left-color:var(--warn); } .call.warn .h { color:var(--warn); }
  .call.stop { border-left-color:var(--bad); } .call.stop .h { color:var(--bad); }
  .call.info { border-left-color:var(--accent); } .call.info .h { color:var(--accent); }

  .pill { font-family:var(--mono); font-size:11px; padding:2px 8px; border-radius:20px;
    border:1px solid var(--line); color:var(--muted); }
  .pill.ok { color:var(--ok); border-color:rgba(95,212,160,.35); }
  .pill.no { color:var(--bad); border-color:rgba(255,139,128,.35); }

  .flow { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; margin:20px 0;
    border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--line); }
  .flow-step { position:relative; background:var(--panel); padding:15px; min-height:112px; }
  .flow-step b { display:block; font-family:var(--mono); font-size:10px; letter-spacing:.12em;
    text-transform:uppercase; color:var(--accent); margin-bottom:8px; }
  .flow-step code { display:block; color:var(--ink); font-size:12px; line-height:1.5; }
  .flow-step p { margin:6px 0 0; color:var(--muted); font-size:12.5px; line-height:1.45; }
  .terminal { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; margin:14px 0; }
  .state { padding:9px 10px; border:1px solid var(--line); border-radius:7px; font-family:var(--mono);
    font-size:10.5px; text-align:center; color:var(--muted); }
  .state.done { color:var(--ok); border-color:rgba(95,212,160,.35); }
  .state.bad { color:var(--bad); border-color:rgba(255,139,128,.35); }

  footer { border-top:1px solid var(--line); padding-top:18px; color:var(--faint); font-size:13px; }

  @media (max-width:900px) {
    .doc { grid-template-columns:1fr; }
    .nav { position:static; height:auto; border-right:none; border-bottom:1px solid var(--line-soft);
      padding:20px 22px 16px; }
    .nav nav { flex-flow:row wrap; gap:2px 4px; }
    .nav-label { display:none; }
    main { padding:26px 22px 70px; }
    h1 { font-size:28px; }
    .flow { grid-template-columns:1fr 1fr; }
    .terminal { grid-template-columns:repeat(2,1fr); }
  }
  @media (max-width:560px) { .flow { grid-template-columns:1fr; } }
  @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
</style>

<div class="doc">
<aside class="nav">
  <div class="brand"><span class="dot"></span>EE Auto</div>
  <div class="brand-sub">business intelligence API</div>
  <nav>
    <a href="#start">Start here</a>
    <a href="#intel">Pipeline reference</a>
    <a href="#engines">The three engines</a>
    <span class="nav-label">Gateway</span>
    <a href="#chat">Chat completions</a>
    <a href="#stream">Streaming</a>
    <a href="#models">Models</a>
    <a href="#ask">Native ask</a>
    <a href="#queue">Queue &amp; backpressure</a>
    <span class="nav-label">Engines</span>
    <a href="#agy">agy</a>
    <a href="#chatgpt">ChatGPT</a>
    <a href="#meta">Meta AI &mdash; retired</a>
    <span class="nav-label">Home worker</span>
    <a href="#jobs">Jobs</a>
    <a href="#social">Social research</a>
    <span class="nav-label">Operating it</span>
    <a href="#sessions">Sessions</a>
    <a href="#observe">Observation layer</a>
    <a href="#logs">Logs</a>
    <a href="#service">Service</a>
    <span class="nav-label">Reference</span>
    <a href="#errors">Errors</a>
    <a href="#limits">Limits</a>
    <a href="#env">Environment</a>
  </nav>
</aside>

<main>
<header>
  <p class="eyebrow">Business discovery &middot; company enrichment &middot; published reports</p>
  <h1>EE Business Intelligence API</h1>
  <p class="lede">Search a market, persist a ranked business list, enrich any returned
  company through four research rounds, and give the requester a durable mobile report.
  Social research runs alongside it: Facebook presence, and what X (x.com) is saying,
  read through Grok. The lower-level model gateway is documented on the same page for
  operators.</p>
  <div class="facts">
    <div class="fact"><span class="k">Production origin</span><code>https://ee-auto.up.railway.app</code></div>
    <div class="fact"><span class="k">Auth</span><code>Authorization: Bearer LAB_TOKEN</code></div>
    <div class="fact"><span class="k">OpenAPI 3.1</span><code><a href="/openapi.json">/openapi.json</a></code></div>
    <div class="fact"><span class="k">End-user workspace</span><code><a href="/research">/research</a></code></div>
  </div>
</header>

<section id="start">
  <h2>Start here</h2>
  <p>The product API is asynchronous. Creating work returns HTTP <code>202</code> with a
  stable report id, an authenticated polling URL and a public viewing URL. Your client
  does not keep the POST connection open while Google Maps or the research engines run.</p>

  <div class="flow">
    <div class="flow-step"><b>01 &middot; Discover</b><code>POST /api/business-search</code><p>Business keyword, location, or both.</p></div>
    <div class="flow-step"><b>02 &middot; Poll</b><code>GET report.api_url</code><p>Wait for a terminal status and read <code>data.companies</code>.</p></div>
    <div class="flow-step"><b>03 &middot; Enrich</b><code>POST /api/company-research</code><p>Pass one returned <code>company.id</code>.</p></div>
    <div class="flow-step"><b>04 &middot; Publish</b><code>GET report.view_url</code><p>Send the permanent mobile report to the requester.</p></div>
  </div>

<pre><code>export EE_AUTO_TOKEN='replace-with-service-token'

curl -sS https://ee-auto.up.railway.app/api/business-search \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"solar installer","place":"Kuala Lumpur","max":40,"requesterId":"crm-42"}'</code></pre>

  <div class="call info"><span class="h">Authentication boundary</span>
  <p>Everything under <code>/api</code> and <code>/v1</code> requires the bearer token.
  <code>/r/:id</code> and <code>/public/reports/:id</code> are deliberately public through an
  opaque 20-character id. Never append the token to a report link. The end-user
  <a href="/research">research workspace</a> accepts a scoped <code>PORTAL_TOKEN</code>
  which can call only business-intelligence routes.</p></div>

  <h3>Lifecycle</h3>
  <div class="terminal">
    <div class="state">queued</div><div class="state">running</div><div class="state done">completed</div>
    <div class="state done">partial</div><div class="state bad">failed</div>
  </div>
  <p><code>completed</code>, <code>partial</code> and <code>failed</code> are terminal. A
  <code>partial</code> company report is still publishable: at least one round had a gap,
  but only evidence-ledger fields were released. Read <code>report.error</code> and
  <code>research_run.round_status</code> to see what happened.</p>
</section>

<section id="intel">
  <h2>Pipeline reference</h2>

  <h3>1. Create a business search</h3>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/business-search</code><span class="tag">Bearer &middot; returns 202</span></div>
  <p>Supply at least one of <code>keyword</code> or <code>place</code>/<code>location</code>. Location-only searches are valid.</p>
  <div class="tbl"><table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Meaning</th></tr></thead><tbody>
    <tr><td><code>keyword</code></td><td>string</td><td>conditional</td><td>Business category, service or keyword. May be omitted when a location is supplied.</td></tr>
    <tr><td><code>place</code></td><td>string</td><td>conditional</td><td>City, district, state or country. May be omitted when a keyword is supplied; <code>location</code> is an alias.</td></tr>
    <tr><td><code>max</code></td><td>integer</td><td>no</td><td>1–200; defaults to 100.</td></tr>
    <tr><td><code>requesterId</code></td><td>string</td><td>no</td><td>Your CRM/user/job correlation id. <code>userId</code> is accepted as an alias.</td></tr>
    <tr><td><code>timeoutMs</code></td><td>integer</td><td>no</td><td>Worker deadline; defaults to 600000. It does not make the POST synchronous.</td></tr>
  </tbody></table></div>
<pre><code>curl -s https://ee-auto.up.railway.app/api/business-search \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" -H 'content-type: application/json' \
  -d '{"keyword":"solar installer","place":"Kuala Lumpur","max":40,"requesterId":"crm-42"}'</code></pre>
<pre><code>HTTP/1.1 202 Accepted
{
  "report": {
    "id": "AbCdEfGhIjKlMnOpQrSt",
    "type": "business_search",
    "status": "queued",
    "title": "solar installer in Kuala Lumpur",
    "created_at": "2026-08-21T07:00:00.000Z",
    "updated_at": "2026-08-21T07:00:00.000Z",
    "completed_at": null,
    "view_url": "https://ee-auto.up.railway.app/r/AbCdEfGhIjKlMnOpQrSt",
    "api_url": "https://ee-auto.up.railway.app/api/business-search/AbCdEfGhIjKlMnOpQrSt",
    "error": null
  }
}</code></pre>

  <h3>2. Poll the business search</h3>
  <div class="ep"><span class="m get">GET</span><code class="path">/api/business-search/:reportId</code><span class="tag">Bearer &middot; returns 200</span></div>
<pre><code>curl -sS "$SEARCH_API_URL" \
  -H "Authorization: Bearer $EE_AUTO_TOKEN"</code></pre>
<pre><code>{
  "report": { "id":"AbCdEfGhIjKlMnOpQrSt", "status":"completed", "view_url":"https://.../r/AbCd...", "api_url":"https://.../api/business-search/AbCd...", "error":null, "...":"..." },
  "data": {
    "search": { "found":40, "blocked":false, "saved":{ "reportId":12, "companies":40, "linked":40 } },
    "companies": [{
      "id":"69", "place_id":"...", "name":"SOLS Energy Sdn Bhd",
      "rating":4.4, "reviews":275, "category":"Solar energy company",
      "address":"...", "phone":"018-399 9247",
      "website":"https://www.solsenergy.com/", "maps_url":"https://www.google.com/maps/...", "rank":2
    }]
  },
  "research_run": null
}</code></pre>
  <p>The important handoff is <code>data.companies[].id</code>. It is the persisted EE
  company id—not a Google place id and not the 20-character report id.</p>

  <h3>3. Create company deep research</h3>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/company-research</code><span class="tag">Bearer &middot; returns 202</span></div>
  <div class="tbl"><table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Meaning</th></tr></thead><tbody>
    <tr><td><code>companyId</code></td><td>numeric string</td><td><span class="req">yes</span></td><td><code>data.companies[].id</code> from a business-search response. <code>company_id</code> is accepted as an alias.</td></tr>
    <tr><td><code>requesterId</code></td><td>string</td><td>no</td><td>Your correlation id. <code>userId</code> is accepted as an alias.</td></tr>
  </tbody></table></div>
<pre><code>curl -s https://ee-auto.up.railway.app/api/company-research \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" -H 'content-type: application/json' \
  -d '{"companyId":"69","requesterId":"crm-42"}'</code></pre>

  <h3>4. Poll the company research</h3>
  <div class="ep"><span class="m get">GET</span><code class="path">/api/company-research/:reportId</code><span class="tag">Bearer &middot; returns 200</span></div>
<pre><code>{
  "report": { "id":"XyZaBcDeFgHiJkLmNoPq", "status":"completed", "view_url":"https://.../r/XyZa...", "error":null, "...":"..." },
  "data": {
    "final": {
      "entity": { "name":"SOLS Energy Sdn Bhd", "company_id":"69", "...":"..." },
      "summary":"...", "contacts":[...], "people":[...], "candidate_people":[...], "signals":[...],
      "outreach_angles":[...], "conflicts_and_unknowns":[],
      "synthesis_mode":"gemini_validated"
    },
    "final_cn": { "summary":"...", "contacts":[...], "people":[...], "candidate_people":[...], "signals":[...] },
    "translation": { "language":"zh-CN", "model":"step-3.7-flash", "status":"completed" }
  },
  "research_run": {
    "round01": {...}, "round02": {...}, "round03": {...}, "round04": {...},
    "validated_ledger": {...}, "final_report": {...},
    "round_status": { "round01":"completed", "round02":"completed", "round03":"completed", "round04":"completed" }
  }
}</code></pre>
  <p>The authenticated route exposes benchmark artifacts. The canonical English report is at
  <code>data.final</code>; the matching Simplified Chinese rendering is at <code>data.final_cn</code>.
  Chinese translation preserves evidence IDs, source URLs, email addresses, phone numbers and published contact values exactly.
  Raw rounds are at <code>research_run.round01</code> through <code>round04</code>:
  Gemini discovery, three split ChatGPT audits, the <a href="#social">Facebook crawl</a>,
  then Gemini synthesis with fidelity validation. Contacts, people and signals need direct HTTPS
  evidence to enter the validated ledger; <code>candidate_people</code> retains named public-source
  leads separately and never qualifies for VIP research until verified.
  If final Gemini synthesis changes a validated contact/person set or introduces a new URL,
  it is rejected and <code>synthesis_mode</code> becomes <code>validated_ledger_fallback</code>.</p>
  <p>As soon as the Round 02 people audit identifies the report's P01 person, the service
  creates a separate <code>person_research</code> report and starts it immediately. It runs
  concurrently while company signals, social checks, final synthesis, and Chinese translation
  continue. The child report is idempotent by source report and person id, and appears as its own
  line in the research library.</p>

  <h3>5. Create a VIP person brief</h3>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/person-research</code><span class="tag">Bearer &middot; returns 202</span></div>
  <p>Start only from a validated person in a completed company report with <code>POST /api/person-research</code>. Use
  <code>data.final.people[].id</code> as <code>personId</code>. An optional email is an
  in-memory identity hint only: it is not written to the report request or public output.</p>
<pre><code>curl -s https://ee-auto.up.railway.app/api/person-research \
  -H "Authorization: Bearer $EE_AUTO_TOKEN" -H 'content-type: application/json' \
  -d '{"companyResearchId":"XyZaBcDeFgHiJkLmNoPq","personId":"person_abc123","email":"owner@example.com"}'</code></pre>
  <p>Poll <code>GET /api/person-research/:reportId</code>. The authenticated response includes
  <code>research_run</code> from <code>person_research_run</code>, containing validated
  public-professional evidence, the final brief, and execution metadata. It never retains the
  optional email hint or raw model text.</p>

  <h3>6. Publish or consume the final report</h3>
  <div class="tbl"><table><thead><tr><th>Route</th><th>Auth</th><th>Use</th></tr></thead><tbody>
    <tr><td><code>GET /api/reports</code></td><td>Bearer</td><td>Combined paginated library. Filter with <code>type</code>, <code>status</code>, <code>limit</code>, and <code>offset</code>.</td></tr>
    <tr><td><code>GET /r/:reportId</code></td><td>none</td><td>Premium mobile HTML report for the requester.</td></tr>
    <tr><td><code>GET /public/reports/:reportId</code></td><td>none</td><td>Final public JSON. Search reports return <code>companies</code>; deep reports return English <code>final</code> plus <code>final_cn</code> when Chinese translation is complete. Raw rounds are excluded.</td></tr>
    <tr><td><code>GET /api/company-research/:reportId</code></td><td>Bearer</td><td>Private final output plus raw benchmark rounds.</td></tr>
    <tr><td><code>GET /api/person-research/:reportId</code></td><td>Bearer</td><td>Private VIP brief plus its validated-evidence audit record.</td></tr>
  </tbody></table></div>

  <h3>Reference polling helper</h3>
<pre><code><span class="cmt">// Node 18+ / TypeScript</span>
const origin = 'https://ee-auto.up.railway.app';
const headers = { Authorization: 'Bearer ' + EE_AUTO_TOKEN, 'Content-Type': 'application/json' };

async function waitForReport(apiUrl) {
  for (;;) {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) throw new Error('EE API ' + response.status + ': ' + await response.text());
    const body = await response.json();
    if (['completed', 'partial'].includes(body.report.status)) return body;
    if (body.report.status === 'failed') throw new Error(body.report.error || 'Research failed');
    await new Promise(resolve =&gt; setTimeout(resolve, 5000));
  }
}

const accepted = await fetch(origin + '/api/business-search', {
  method: 'POST', headers,
  body: JSON.stringify({ keyword:'solar installer', place:'Kuala Lumpur', max:40, requesterId:'crm-42' })
}).then(r =&gt; r.json());

const search = await waitForReport(accepted.report.api_url);
const companyId = search.data.companies[0].id;</code></pre>

  <div class="call warn"><span class="h">Operational expectation</span>
  <p>Poll every 5–10 seconds; do not retry the POST just because work is still running.
  A repeated POST creates a separate report. Keep the returned <code>report.id</code> and
  <code>api_url</code> in your own request record.</p></div>
</section>

<section id="engines">
  <h2>The three engines</h2>
  <p>None of them is a hosted model API. Each call is a real process doing what a person
  would do, and every limit further down follows from that.</p>
  <div class="tbl"><table>
    <thead><tr><th>Model</th><th>What actually runs</th><th>Short answer</th><th>Streams</th></tr></thead>
    <tbody>
      <tr><td><code>agy</code></td><td>the Antigravity CLI in print mode (<code>agy -p</code>), signed in with a Google account</td><td class="num">11–25 s</td><td><span class="pill">one chunk</span></td></tr>
      <tr><td><code>chatgpt</code></td><td>a signed-in chatgpt.com session in a real Chrome, typed into and read back</td><td class="num">13–15 s</td><td><span class="pill ok">incremental</span></td></tr>
    </tbody>
  </table></div>
  <p>Timings are measurements from 2026-08-20, not estimates: one-line answers over the
  public URL. A 4,751-character multi-line prompt answered in 12.7 s on <code>chatgpt</code>
  — prompt size costs almost nothing, because the text goes in through one insert rather
  than keystroke by keystroke.</p>
</section>

<section id="chat">
  <h2>Chat completions</h2>
  <div class="ep"><span class="m post">POST</span><code class="path">/v1/chat/completions</code><span class="tag">also /api/v1/chat/completions</span></div>
  <p>The OpenAI shape. What it accepts, and what it will not pretend to support:</p>
  <div class="tbl"><table>
    <thead><tr><th>Field</th><th>Type</th><th>Behaviour</th></tr></thead>
    <tbody>
      <tr><td><code>model</code> <span class="req">required</span></td><td>string</td><td>Routed as in <a href="#models">Models</a>. Empty or <code>auto</code> resolves to <code>DEFAULT_MODEL</code>.</td></tr>
      <tr><td><code>messages</code> <span class="req">required</span></td><td>array</td><td>Flattened into one prompt. <code>system</code> and <code>developer</code> parts come first verbatim, then <code>User:</code> / <code>Assistant:</code> / <code>Tool:</code> turns. A lone user message is passed through unlabelled.</td></tr>
      <tr><td><code>stream</code></td><td>boolean</td><td>Server-sent events. See <a href="#stream">Streaming</a>.</td></tr>
      <tr><td><code>timeoutMs</code></td><td>number</td><td>Per-call deadline. Defaults to 300000 for <code>agy</code>, 180000 for the browser engines. <code>timeout_ms</code> is accepted too.</td></tr>
      <tr><td><code>tools</code></td><td><code>true</code></td><td><strong>Not OpenAI function calling.</strong> Literal <code>true</code> runs agy with <code>--dangerously-skip-permissions</code>, letting it touch the container's filesystem. An OpenAI tools <em>array</em> is not <code>true</code>, so it does nothing — see the note below.</td></tr>
      <tr><td><code>n</code></td><td>number</td><td>Must be 1. Anything else is a 400: each call is one real model run, not a sample.</td></tr>
      <tr><td colspan="3" style="color:var(--faint)">Accepted, ignored, and listed back in <code>agy_lab.ignored</code>: <code>temperature</code>, <code>top_p</code>, <code>max_tokens</code>, <code>max_completion_tokens</code>, <code>presence_penalty</code>, <code>frequency_penalty</code>, <code>logprobs</code>, <code>logit_bias</code>, <code>seed</code>, <code>stop</code>, <code>tool_choice</code>, <code>response_format</code>.</td></tr>
    </tbody>
  </table></div>

  <div class="call stop"><span class="h">tools means something else here</span>
  <p>A browser session has no temperature knob and agy's <code>-p</code> takes none, so
  sampling parameters cannot be honoured and are never approximated. They come back in
  <code>agy_lab.ignored</code> so a caller can see they had no effect. <code>tools: true</code> is
  this service's own flag for agy's permission gate — off by default, per call, never
  inherited. No function calling, no logprobs, no image input: an image part in a message
  is replaced with <code>[unsupported content part: image_url]</code> rather than dropped, so a
  prompt that depended on it fails visibly instead of quietly.</p></div>

  <h3>Response</h3>
  <div class="tbl"><table>
    <thead><tr><th>Field</th><th>Means</th></tr></thead>
    <tbody>
      <tr><td><code>model</code></td><td>The model that <em>actually ran</em>, fully qualified — <code>chatgpt:openai-waynecollins</code>, not the alias you asked for. Substitution is never silent.</td></tr>
      <tr><td><code>choices[0].finish_reason</code></td><td><code>stop</code>, or <code>length</code> when a browser answer was still growing as the clock ran out — the text is real but partial.</td></tr>
      <tr><td><code>usage</code></td><td>Characters &divide; 4, marked <code>"estimated": true</code>. No engine here reports real token usage.</td></tr>
      <tr><td><code>agy_lab</code></td><td>Non-standard block: <code>engine</code>, <code>ms</code>, <code>settled</code> (browser engines), <code>ignored</code>.</td></tr>
    </tbody>
  </table></div>
  <p>Every call to a browser engine starts a new chat — a temporary chat on ChatGPT. There
  is no server-side conversation to continue, so send the history you want considered.</p>
</section>

<section id="stream">
  <h2>Streaming</h2>
  <p>Real for the browser engines: the answer is polled as it renders, so chunks arrive at
  roughly 1.5-second granularity. agy prints only when it is finished, so its answer arrives
  as a single content chunk. Both end the same way.</p>
<pre><code>data: {"object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":""},...}]}
data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"one\ntwo\nthree"},...}]}
data: {"object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}
data: {"object":"chat.completion.chunk","choices":[],"usage":{...},"agy_lab":{...}}
data: [DONE]</code></pre>
  <div class="call info"><span class="h">Failures arrive in-band</span>
  <p>Once a stream opens, the HTTP status is already sent, so an engine failure cannot be a
  status code. It arrives as a final <code>data: {"error":{...}}</code> chunk before
  <code>[DONE]</code>. A client that only watches the status line will see a 200 and an empty
  answer — read the chunks.</p>
  <p>Hanging up stops the work: the engine call is abandoned when the request closes,
  rather than running on into a dead socket.</p></div>
</section>

<section id="models">
  <h2>Models</h2>
  <div class="ep"><span class="m get">GET</span><code class="path">/v1/models</code><span class="tag">also /api/models</span></div>
  <p>Lists what this box can route to right now, with each browser session's last probe —
  which is how you tell a signed-in account from one that needs attention before you send it
  work.</p>
  <div class="tbl"><table>
    <thead><tr><th>Name</th><th>Routes to</th></tr></thead>
    <tbody>
      <tr><td><code>agy</code>, <code>antigravity</code></td><td>the agy CLI</td></tr>
      <tr><td><code>chatgpt</code>, <code>openai</code></td><td>the default ChatGPT session</td></tr>
      <tr><td><code>chatgpt:&lt;id&gt;</code></td><td>that ChatGPT session — one per account</td></tr>
      <tr><td><code>gpt-4o</code>, <code>gpt-*</code>, <code>o1*</code>, <code>o3*</code>, <code>o4*</code></td><td>the default ChatGPT session</td></tr>
      <tr><td><em>empty</em>, <code>auto</code></td><td><code>DEFAULT_MODEL</code>, which is <code>agy</code> unless set</td></tr>
    </tbody>
  </table></div>
  <p><code>gpt-*</code> maps to the signed-in ChatGPT account because tools hard-code a model
  id far more often than they let you choose one. A bare <code>chatgpt</code> resolves to
  <code>CGPT_DEFAULT_SESSION</code>, otherwise the first session whose last probe said
  <code>ready</code>. <code>@mini</code> and <code>@container</code> pin a location; a bare
  engine prefers a live mini worker and falls back to the container. <code>meta</code> and
  <code>llama-*</code> still parse, for callers that have not been updated, but nothing
  claims them &mdash; see <a href="#meta">Meta AI &mdash; retired</a>.</p>
</section>

<section id="ask">
  <h2>Native ask</h2>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/ask</code><span class="tag">no OpenAI envelope</span></div>
  <p>The honest shape for something written against this service directly: a prompt in, an
  answer out, no chat-completion wrapper to unpack.</p>
<pre><code>curl -s https://ee-auto.up.railway.app/api/ask \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"chatgpt","prompt":"...","timeoutMs":240000}'

{"model":"chatgpt:openai-waynecollins","engine":"chatgpt","answer":"...","ms":13024,"settled":true}</code></pre>
  <p>Takes <code>model</code> (or <code>engine</code>), <code>prompt</code> (or <code>messages</code>, flattened
  the same way), <code>timeoutMs</code> and <code>tools</code>. <code>settled: false</code> means the answer
  stopped growing because the clock ran out, not because the model had finished.</p>
</section>

<section id="queue">
  <h2>Queue &amp; backpressure</h2>
  <p>Every engine here is a personal account with a human usage limit attached, so
  calls are admitted rather than accepted. Ten at once do not make ten answers arrive
  faster — they make one Chrome profile thrash, and they make the traffic look like
  precisely what a bot-detection system is built to catch.</p>
  <p><strong>A call that is admitted waits; it does not fail.</strong> An answer at +40 s
  is worth more than an error at +0 s, so the request is held. It is refused up front
  only when waiting would be worse than being told no.</p>

  <h3>Lanes</h3>
  <div class="tbl"><table>
    <thead><tr><th>Lane</th><th>Runs at once</th><th>Engines</th><th>Spacing</th></tr></thead>
    <tbody>
      <tr><td><code>browser</code></td><td class="num">1</td><td><code>chatgpt</code> — the container has one Chrome</td><td class="num">2 s between calls</td></tr>
      <tr><td><code>agy</code></td><td class="num">2</td><td><code>agy</code></td><td class="num">none</td></tr>
    </tbody>
  </table></div>
  <p>Slots are per lane; spacing, caps and counters are per engine — because the lane
  is a machine limit and the account that gets rate-limited is not. The gap is not
  about capacity: two seconds against a twelve-second answer costs nothing and keeps a
  burst from arriving as a burst.</p>

  <h3>The three refusals</h3>
  <div class="tbl"><table>
    <thead><tr><th>type</th><th>Fires when</th><th>Retry-After</th></tr></thead>
    <tbody>
      <tr><td><code>rate_limit_exceeded</code></td><td>the engine's hourly cap is used up (off unless <code>*_HOURLY_LIMIT</code> is set)</td><td>when the oldest call ages out of the hour</td></tr>
      <tr><td><code>queue_full</code></td><td>more than <code>QUEUE_MAX_DEPTH</code> (10) are already waiting in that lane</td><td>the estimated drain time</td></tr>
      <tr><td><code>queue_too_slow</code></td><td>the queue is short but slow, and the estimate exceeds <code>QUEUE_MAX_WAIT_MS</code> (300 s)</td><td>the estimate</td></tr>
    </tbody>
  </table></div>
<pre><code>HTTP/1.1 429 Too Many Requests
retry-after: 47

{
  "error": { "message": "System busy: 10 calls are already waiting for the browser and the queue is capped at 10. Retry in about 47s.",
             "type": "queue_full", "code": 429, "retry_after": 47 },
  "queue": { "engine": "chatgpt", "lane": "browser", "minGapMs": 2000, "maxQueue": 10,
             "usedThisHour": 14, "estimatedWaitMs": 46800, "averageMs": 13100 }
}</code></pre>
  <p>Both numbers are on purpose: <code>retry-after</code> is what a client can act on
  without reading prose, and the <code>queue</code> block is what a person can. A response
  that waited reports it as <code>agy_lab.queuedMs</code> (native shape:
  <code>queuedMs</code>), present only when the wait was real.</p>

  <div class="call info"><span class="h">Streaming survives the wait</span>
  <p>A queued stream would otherwise sit silent long enough for an intermediary to
  assume it died. Instead it narrates, in SSE comment lines that every client ignores:</p>
<pre><code>: queued ahead=3 eta=41s
: waiting
: waiting
data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}</code></pre>
  <p>Hanging up during the wait cancels the work rather than leaving it to finish into
  a closed socket.</p></div>

  <div class="ep"><span class="m get">GET</span><code class="path">/api/queue</code></div>
  <p>Live: what is running, what is waiting, the rolling average per lane, and how much
  of each engine's hourly allowance is gone. The first thing to read when a call comes
  back 429 or takes a minute to start.</p>
  <p><code>POST /api/cgpt/:id/ask</code> — the older, per-session route — goes through the
  same queue. A path to an account that skips the spacing is not a shortcut; it is the
  one call that gets the account limited.</p>
</section>

<section id="agy">
  <h2>agy</h2>
  <p>The Antigravity CLI, installed on the volume at <code>/data/.local/bin/agy</code> and signed
  in with a consumer Google account. The credential survives a redeploy — the access token
  lasts an hour, the refresh token is what carries it — so a login is a one-time act, not a
  per-deploy chore.</p>
  <p>The gateway runs it with <code>-p</code> and reads stdout. Up to
  <code>AGY_MAX_CONCURRENT</code> (2) run at once; the rest queue rather than race the browser
  for a 4 GB container. If a run exits 0 having printed nothing — a known non-TTY behaviour —
  the same command is retried through a real pty before the call is called a failure.</p>

  <div class="ep"><span class="m post">POST</span><code class="path">/api/probe</code></div>
  <p>One real, tool-free model call: the only thing that proves the credential still works.
  Answers <code>ready</code>, <code>logged_out</code>, <code>not_installed</code> or <code>unknown</code> —
  four states rather than two, because "could not tell" and "signed out" send you to
  different places. Typically 11–14 s.</p>

  <div class="ep"><span class="m post">POST</span><code class="path">/api/install</code><span class="tag">202, returns a pty session</span></div>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/login</code><span class="tag">202, returns a pty session</span></div>
  <div class="ep"><span class="m post">POST</span><code class="path">/api/run</code><span class="tag">202, returns a pty session</span></div>
  <p>The asynchronous side. Each starts a command in a pseudo-terminal and hands back a
  session id to poll — <code>/api/run</code> takes <code>prompt</code>, <code>timeoutMs</code>,
  <code>format</code> and <code>tools</code>, and is the streaming-transcript form of what
  <code>/api/ask</code> does in one call. Use <code>/api/ask</code> unless you need to watch.</p>
  <div class="tbl"><table>
    <thead><tr><th>Route</th><th>Does</th></tr></thead>
    <tbody>
      <tr><td><code>GET /api/session/:id?offset=</code></td><td>output from a byte offset, plus whether it is still running</td></tr>
      <tr><td><code>POST /api/session/:id/input</code></td><td>write a line into the terminal — this is how an OAuth code is pasted</td></tr>
      <tr><td><code>POST /api/session/:id/kill</code></td><td>SIGHUP, then SIGKILL after 3 s</td></tr>
      <tr><td><code>POST /api/session</code></td><td>start an arbitrary command in a pty</td></tr>
      <tr><td><code>POST /api/settings/provider</code></td><td>switch agy between the Google login and <code>GEMINI_API_KEY</code></td></tr>
    </tbody>
  </table></div>
  <div class="call warn"><span class="h">Why a terminal</span>
  <p>agy reads its authorization code from the controlling terminal, so a plain pipe can
  never complete a login. The pty comes from util-linux's <code>script</code> rather than a
  native module — nothing to rebuild when Node's ABI moves.</p></div>
</section>

<section id="chatgpt">
  <h2>ChatGPT</h2>
  <p>One persistent Chrome profile per account on the volume, holding the session cookies.
  Asking sends the prompt into a fresh temporary chat and reads the answer back from the
  rendered page.</p>
  <p>Login is unattended: the TOTP secret is stored beside the profile and the code is
  derived in-container at the moment of submit, so nobody reads a phone. A clean run takes
  about 14 seconds.</p>
  <div class="tbl"><table>
    <thead><tr><th>Route</th><th>Does</th><th>Typical</th></tr></thead>
    <tbody>
      <tr><td><code>POST /api/cgpt</code></td><td>create a session: <code>{id, label, kind}</code></td><td class="num">instant</td></tr>
      <tr><td><code>POST /api/cgpt/:id/totp</code></td><td>store the shared secret — base32, <code>otpauth://</code> or an authenticator export link. Answers with a live code, the only honest proof it matches the phone.</td><td class="num">instant</td></tr>
      <tr><td><code>POST /api/cgpt/:id/login</code></td><td><code>{email, password}</code>, unattended</td><td class="num">~14 s</td></tr>
      <tr><td><code>POST /api/cgpt/:id/otp</code></td><td>resume a login that stopped for a code</td><td class="num">~5 s</td></tr>
      <tr><td><code>POST /api/cgpt/:id/probe</code></td><td>is it still signed in</td><td class="num">~4 s</td></tr>
      <tr><td><code>POST /api/cgpt/:id/ask</code></td><td>the pre-gateway ask, still here</td><td class="num">~13 s</td></tr>
    </tbody>
  </table></div>
  <div class="call stop"><span class="h">A signed-out session is a 503, deliberately</span>
  <p>Logged out, chatgpt.com still ships a working composer. A naive wrapper types into it
  and returns an anonymous answer that looks completely fine and is worthless. The gateway
  checks for a sign-in wall first and refuses instead. Fix it with
  <code>POST /api/cgpt/:id/login</code> — nothing re-authenticates on its own.</p>
  <p>If a login reports that the code was submitted twice and the page stayed put, the
  challenge has gone stale: navigate to <code>auth.openai.com/log-out</code> first and run it
  again. A stale challenge rejects every correct code and renders no error at all.</p></div>
</section>

<section id="meta">
  <h2>Meta AI &mdash; retired</h2>
  <p><b>There is no Meta engine any more.</b> Do not route to <code>meta</code>,
  <code>meta:&lt;id&gt;</code>, <code>meta@mini</code> or <code>llama-*</code>; nothing
  answers on any of them.</p>
  <div class="call stop"><span class="h">Both routes to it are gone</span>
  <p><b>The container is region-blocked.</b> Railway's address is served
  <em>"Meta AI isn't available yet in your country."</em> even with an imported signed-in
  profile. The gate applies on ordinary page loads, not only at login, so replaying cookies
  there was never going to be enough.</p>
  <p><b>The mini no longer claims it.</b> Meta AI was never activated on that machine — no
  browser profile there ever held a <code>meta.ai</code> cookie — and the muse 1.2 stand-in
  that answered under the <code>meta.*</code> job types through OpenCode has been removed.
  No lane claims <code>meta.ask</code>, so <code>meta@mini</code> is refused up front rather
  than queueing a job nothing will take.</p></div>
  <p>The container's session machinery still understands a <code>meta</code> profile kind,
  so an imported storageState is not rejected — but no traffic is routed to it and none
  should be. The measurements behind the region gate are kept in
  <code>META-AI.md</code>.</p>
  <div class="call"><span class="h">What replaced it</span>
  <p>Meta was wanted for one thing this API actually needed: what a company's Facebook
  presence says about it. That is <a href="#social"><code>fb.*</code></a> now — a read-only
  crawler that visits the pages and returns the facebook.com URL every field was read from,
  rather than a model asked to describe what it can see. Company research Round 03 was
  re-pointed onto it.</p></div>
</section>

<section id="jobs">
  <h2>Jobs &mdash; work sent to a machine at home</h2>
  <p>Google Maps cannot be scanned from here. Google does not block a datacenter IP, it
  <strong>degrades</strong> it: the search that returns ~100 businesses from a home line
  returns ~60 from a rented one, with no error and no captcha. A scan run in this
  container is thin and looks complete.</p>
  <p>So the scan runs on a Mac mini at home, and this is the queue that reaches it. The
  mini is behind NAT with no public address, so the direction is inverted &mdash; it
  long-polls for work rather than being called. No tunnel, no port forwarding, no dynamic
  DNS.</p>
  <div class="tbl"><table>
    <thead><tr><th>Route</th><th>Does</th></tr></thead>
    <tbody>
      <tr><td><code>POST /api/jobs</code></td><td><code>{type, payload, timeoutMs}</code> &rarr; 201 with the job, status <code>pending</code></td></tr>
      <tr><td><code>GET /api/jobs/next?worker=&amp;wait=&amp;types=</code></td><td>the worker's claim. Held open up to 25s; <code>204</code> when there is nothing, <code>200</code> with the job when there is. Answers instantly if a job is already queued.</td></tr>
      <tr><td><code>POST /api/jobs/heartbeat</code></td><td><code>{worker, types}</code>. The worker's check-in while a job is in its hands. A claim is silent for as long as the handler runs, so without this a lane on a multi-minute research round ages out of the live table and the gateway refuses engines that machine is serving.</td></tr>
      <tr><td><code>POST /api/jobs/:id/result</code></td><td><code>{ok, result, error}</code> &rarr; the job becomes <code>done</code> or <code>failed</code></td></tr>
      <tr><td><code>GET /api/jobs/:id</code></td><td>status and result</td></tr>
      <tr><td><code>GET /api/jobs</code></td><td>the queue, plus every worker and when it last checked in</td></tr>
    </tbody>
  </table></div>
  <pre><code>ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' -d '{"type":"ping"}' | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result

{
  "hostname": "macmini",
  "platform": "darwin 24.5.0 arm64",
  "publicIp": "…the home line…"
}</code></pre>
  <p><code>publicIp</code> is the field worth reading: it is what the internet sees when
  that machine makes a request. A Railway address there would mean the job never left the
  container.</p>
  <h3>Job types</h3>
  <table>
    <tr><th>type</th><th>payload</th><th>returns</th></tr>
    <tr><td><code>ping</code></td><td>none</td><td><code>{hostname, platform, node, publicIp, uptimeSec, at}</code></td></tr>
    <tr><td><code>gmap.scan</code></td><td><code>{keyword, place?, max?, userId?}</code></td><td><code>{businesses[], found, capped, blocked, blockedReason, limitedView, saved}</code></td></tr>
    <tr><td><code>fb.company</code></td><td><code>{name, city?, phone?, website?, category?, budget?}</code></td><td><code>{engine, mode, lead, result, meta}</code> &mdash; the business's own Facebook Page</td></tr>
    <tr><td><code>fb.person</code></td><td><code>{person, company, city?, budget?}</code></td><td>the same envelope; that person's profile if it is publicly linked to the company</td></tr>
    <tr><td><code>fb.discover</code></td><td><code>{name, city?, budget?}</code></td><td>the same envelope, with <code>result.people[]</code></td></tr>
    <tr><td><code>fb.probe</code></td><td>none</td><td><code>{status, detail, ms}</code> &mdash; whether ego lite still holds a Facebook session</td></tr>
    <tr><td><code>x.subject</code></td><td><code>{subject, since?, lang?, max?, budget?}</code></td><td><code>{engine, mode, lead, result, meta}</code> &mdash; what X (x.com) is saying about the subject</td></tr>
    <tr><td><code>x.company</code></td><td><code>{name, city?, website?, phone?, since?, budget?}</code></td><td>the same envelope, shaped around a lead rather than a topic</td></tr>
    <tr><td><code>x.probe</code></td><td>none</td><td><code>{status, detail, account, ms}</code> &mdash; <code>ready</code>, <code>gated</code> or <code>logged_out</code> on grok.com</td></tr>
  </table>
  <pre><code>ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"gmap.scan","timeoutMs":600000,
          "payload":{"keyword":"aircon service","place":"Johor Bahru","max":40}}' \
     | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result</code></pre>
  <p>A scan takes 12&ndash;60s depending on <code>max</code>, so pass a <code>timeoutMs</code>
  above the default; <code>600000</code> is the working figure. <code>max</code> defaults to 200.</p>
  <div class="call"><span class="h">Read <code>found</code>, not <code>businesses.length</code></span>
  <p><code>found</code> is <code>null</code> whenever <code>blocked</code> is true, and that is
  deliberate rather than missing. Google degrades a throttled search instead of erroring, so an
  empty feed and a town with no such trade are the same observation &mdash; recording either as
  <code>0</code> is the one thing that would quietly poison the dataset. A blocked scan therefore
  carries no count, and <code>blockedReason</code> names the signal that fired.
  <code>limitedView</code> marks a signed-out page, which is also why <code>reviews</code> comes
  back null.</p></div>
  <p>The worker writes each scan to Postgres itself &mdash; <code>company_data</code>,
  <code>search_report</code> and the link between them, deduped on Google's place id. The schema
  is checked in at <code>agy-lab/schema.sql</code>. <code>saved</code> reports what landed; when
  it is null, <code>saveError</code> says why and the rows still come back in the response.</p>
  <div class="call"><span class="h">In memory, and leased</span>
  <p>Jobs live in a Map and are lost on redeploy &mdash; about six minutes of exposure,
  accepted while the transport is being proven. Each job carries a lease instead: one that
  is still <code>running</code> past its <code>timeoutMs</code> goes back to
  <code>pending</code>, up to three times, then fails with a message saying so. A queue
  that strands work silently is worse than one that loses it visibly.</p></div>
  <div class="call"><span class="h">The social research types run on the mini</span>
  <p><code>fb.*</code> and <code>x.*</code> enrich a lead that came out of a scan &mdash; its
  Facebook presence, and what X is saying about it. Both live on the mini for the
  <code>gmap.scan</code> reason: the session is a login a human performed once in a browser
  profile on that machine, and there is no token to ship. Both are documented in
  <a href="#social">Social research</a> below.</p></div>
  <p>The long poll is not written to <a href="#logs">the request log</a>. One request every
  25 s forever would be ~3,500 records a day burying everything else; result posts and
  failures are still recorded.</p>
</section>

<section id="social">
  <h2>Social research &mdash; Facebook, and X through Grok</h2>
  <p>Two job families that take a lead out of a Maps scan and find what the social web
  already says about it. Both run on the machine at home, for the same reason
  <code>gmap.scan</code> does: the session is a login a human performed once, in a browser
  profile on that machine, and there is no token to ship to a container.</p>
  <p>Both answer in the same envelope &mdash; <code>{engine, mode, lead, result, meta}</code>
  &mdash; and both put a <code>confidence</code> of
  <code>confirmed&nbsp;|&nbsp;likely&nbsp;|&nbsp;weak&nbsp;|&nbsp;none</code> on the result.
  <b>Read that, not <code>found</code>.</b> The workers are instructed never to inflate it,
  because a <code>weak</code> honestly labelled is usable downstream and a wrong
  <code>likely</code> attached to a lead poisons everything built on it.
  <code>found: false</code> is a normal outcome, not a failure: plenty of real businesses
  have no Facebook page, and most are not discussed on X at all.</p>

  <h3><code>fb.*</code> &mdash; the business's own Facebook presence</h3>
  <p>A read-only crawler drives the browser and a model decides only <i>which rung of a
  search ladder to try next and when to stop</i>. The split is deliberate: the read-only
  contract &mdash; URL allowlist, click whitelist, never types into a field &mdash; lives
  inside the crawler, so it is enforced code rather than a hope about model behaviour. The
  model's entire tool surface is search / detail / posts, capped by a crawl budget.</p>
  <div class="tbl"><table>
    <thead><tr><th>Mode</th><th>Given</th><th>Finds</th></tr></thead>
    <tbody>
      <tr><td><code>fb.company</code></td><td>a business name, plus whatever the lead carries</td><td>its Page or Place: phone, email, website, address, followers, reviews</td></tr>
      <tr><td><code>fb.person</code></td><td>a person's name <b>and</b> their company</td><td>that person's profile, if it is publicly linked to the company</td></tr>
      <tr><td><code>fb.discover</code></td><td>a company name only</td><td>named humans on its public surface, in <code>result.people[]</code></td></tr>
      <tr><td><code>fb.probe</code></td><td>nothing</td><td>whether the browser still holds a Facebook session</td></tr>
    </tbody>
  </table></div>
  <div class="call"><span class="h">Half of the leads never reach a model</span>
  <p>An exact phone or website-domain match settles a company outright, and the deterministic
  scorer takes it: <code>meta.engine: "deterministic"</code>, <code>cost_usd: 0</code>,
  <code>turns: 0</code>, about 16 s instead of 40. The record is the same shape either way,
  so a caller never has to branch on which path ran. Model-ranked leads cost $0.05&ndash;0.15
  and carry <code>runners_up</code> explaining what lost.</p></div>
  <div class="call"><span class="h">Messenger links say where they came from</span>
  <p>A result with a profile carries <code>messenger_url</code> and
  <code>messenger_source</code>. <code>detected</code> means the page published an
  <code>m.me</code> link itself &mdash; the account stating it takes messages.
  <code>derived</code> means it was computed from the profile URL and is a <b>guess</b> that
  messages are accepted. Neither is verified: whether a link opens a normal thread or lands
  in Message Requests depends on the recipient's settings, and that is not observable
  read-only. The crawler cannot follow the link it emits &mdash; <code>m.me</code> fails its
  URL allowlist and <code>/messages/</code> is on its denylist &mdash; so this hands a human
  a link to click, it does not open conversations. Only a <code>detected</code> link is
  admitted to a research ledger.</p></div>
  <p>A lead is 16&ndash;120 s. <code>budget</code> is the cost dial: one unit is one page
  load plus a round of model context, default 10, two are enough for a company carrying a
  phone. This is also company research <b>Round 03</b> &mdash; the round that used to ask
  Meta AI what it could see now crawls the pages and reports the URL each field came from.</p>

  <h3><code>x.*</code> &mdash; what X is saying, asked through Grok</h3>
  <p>This one never visits x.com. It drives <b>grok.com</b> in the browser and lets Grok read
  X on our behalf, which buys a property a crawler cannot have: <b>no session it opens is
  ever on a page with a Like button</b>, so there is no code path by which it can repost,
  follow or reply.</p>
  <p>Grok is asked the question a person would ask &mdash; <i>what is being said on X about
  this, who is talking, what are the threads arguing about</i> &mdash; and answers in prose.
  A model then turns that reply into the record. The prompt is a frozen template inside the
  driver and the caller supplies only a subject string, so <b>&ldquo;search x.com and nothing
  else&rdquo; is a property of the code</b>, not a hope about model behaviour.</p>

  <div class="call"><span class="h">Read <code>cited</code>, not just <code>url</code></span>
  <p>Grok is a language model reading X, not a database of X, and it will occasionally
  produce a plausible status URL it never opened. The driver separates the permalinks Grok
  <i>rendered as links</i> &mdash; posts it actually opened, read off the page rather than
  off Grok's say-so &mdash; from those appearing only in its prose, and <code>cited</code>
  reflects that split. An uncited thread is not automatically wrong, but a result where
  <code>cited</code> is 0 of 12 is one to distrust, and the worker is told never to let
  uncited threads carry the confidence rating alone.</p></div>

  <pre><code>ID=$(curl -s -X POST $LAB/api/jobs -H "authorization: Bearer $LAB_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"x.subject","timeoutMs":600000,
          "payload":{"subject":"Grok 5 launch","since":"2026-06-01","budget":2}}' \
     | jq -r .job.id)
curl -s $LAB/api/jobs/$ID -H "authorization: Bearer $LAB_TOKEN" | jq .job.result</code></pre>

  <p><code>result.threads[]</code> carries <code>url</code>, <code>author</code>,
  <code>date</code>, <code>topic</code>, <code>stance</code>, <code>replies</code>,
  <code>excerpt</code> and <code>cited</code>; <code>result.accounts[]</code> carries the
  handles worth knowing about and why. <code>searches_run</code> and <code>reasoning</code>
  are the audit trail, and each run keeps the URL of the Grok conversation itself on the
  mini &mdash; open it and read the exchange when an answer looks wrong. That separates a
  bad answer from a bad question.</p>

  <div class="call"><span class="h">Three things that will bite you</span>
  <p><b>It is slow.</b> One Grok ask is 40&ndash;120s and the default budget is four of them,
  so a lead can run six minutes. Pass <code>timeoutMs</code> of <code>600000</code>; that is
  also the handler's own default. Measured: a two-ask subject lands in ~180s for $0.41.</p>
  <p><b><code>gated</code> is not <code>logged_out</code>.</b> <code>x.probe</code> answers
  <code>ready</code>, <code>gated</code> or <code>logged_out</code>, and the remedies differ.
  <code>gated</code> means the grok.com session is fine but a dialog &mdash; in practice an
  age confirmation &mdash; is in the way, and the driver will not click it: an age
  attestation is a statement about a person, not a checkbox a job may tick. A human clears
  it on the mini, once per browser task space, and it is a <b>two-step</b> dialog whose
  second step is easy to miss. It appears on send rather than on load, so a clean probe is
  evidence and not a guarantee.</p>
  <p><b>The empty case is free.</b> A subject with no post links at all on the first ask is
  settled without a model call &mdash; <code>engine: "deterministic"</code>,
  <code>cost_usd: 0</code>. A truncated or empty answer is deliberately <i>not</i> treated as
  absence: that is evidence the ask went wrong, and it goes to the model instead.</p></div>

  <p>Each family has its own lane and its own browser space, running one job at a time; a
  second arriving early fails with <code>busy</code> and is worth retrying.</p>
</section>

<section id="sessions">
  <h2>Sessions</h2>
  <p>Both browser engines share one session surface. <code>kind</code> is
  <code>chatgpt</code> or <code>meta</code> and decides which site a profile is driven against,
  which probe runs, and which model name it is published under.</p>
  <div class="tbl"><table>
    <thead><tr><th>Route</th><th>Does</th></tr></thead>
    <tbody>
      <tr><td><code>GET /api/cgpt</code></td><td>every session, its kind, last probe, and whether its browser is open</td></tr>
      <tr><td><code>POST /api/cgpt/:id/import</code></td><td>apply a Playwright storageState — cookies through CDP, localStorage per origin. How a session minted on another machine gets here at all.</td></tr>
      <tr><td><code>GET /api/cgpt/:id/export</code></td><td>lift the session out, unredacted. Treat the response as the credential it is.</td></tr>
      <tr><td><code>POST /api/cgpt/:id/open</code> &middot; <code>/close</code> &middot; <code>/goto</code></td><td>hold a browser open on a URL, release it, or drive it somewhere</td></tr>
      <tr><td><code>POST /api/cgpt/:id/delete</code></td><td>remove the profile and its manifest entry</td></tr>
      <tr><td><code>GET /api/cgpt/:id/frame</code></td><td>a JPEG of the page, read-only</td></tr>
    </tbody>
  </table></div>
  <div class="call warn"><span class="h">An imported session is not a portable one</span>
  <p>What an import cannot carry is the fingerprint the session was created under. A cookie
  minted at a residential IP and replayed from a datacenter is exactly the pattern account
  security looks for. The import succeeding is not the same claim as the session surviving —
  the probe afterwards is the real test.</p></div>
</section>

<section id="observe">
  <h2>Observation layer</h2>
  <div class="ep"><span class="m get">GET</span><code class="path">/api/cgpt/:id/dom</code><span class="tag">?goto= ?click= ?wait= ?steps=</span></div>
  <p>Everything the automation decides from, dumped from the <em>server's own</em> browser —
  same profile, same launch args as a real login. A fresh local Chrome is a different
  experiment and proves nothing about this one.</p>
  <p>Returns <code>url</code>, <code>title</code>, <code>bodyText</code>, every clickable and every
  input (with value, readOnly, disabled, focused), plus four things no screenshot can show:
  <code>focus</code> (activeElement, <code>document.hasFocus()</code>, and
  <code>elementFromPoint</code> at the viewport centre — where a top-layer dialog or an
  invisible overlay appears), <code>frames</code> (every frame including cross-origin ones,
  with rects in viewport coordinates), <code>console</code>, and <code>tabs</code>.</p>
  <div class="tbl"><table>
    <thead><tr><th>Step</th><th>Does</th></tr></thead>
    <tbody>
      <tr><td><code>{goto}</code> <code>{click}</code> <code>{fill, value}</code> <code>{press}</code></td><td>the ordinary ones; each takes an optional <code>wait</code></td></tr>
      <tr><td><code>{type, delay}</code> <code>{selectall}</code></td><td>real keystrokes, and a clear that works where <code>fill('')</code> does not</td></tr>
      <tr><td><code>{insert}</code></td><td><code>Input.insertText</code> — hands text to the focused node and fires <code>beforeinput</code>/<code>input</code> without key events. What makes a react-controlled field accept a value.</td></tr>
      <tr><td><code>{mouse:[x,y]}</code></td><td>a CDP click at viewport coordinates. The only way into a cross-origin iframe, and the only way to solve a Turnstile checkbox.</td></tr>
      <tr><td><code>{eval}</code></td><td>an expression against the live page. Turns the next question into one API call instead of one deploy.</td></tr>
    </tbody>
  </table></div>
  <div class="call info"><span class="h">A field that reads back correct is not proof</span>
  <p>The DOM value and the app's own state are two different claims. <code>fill()</code>
  satisfies the first and not the second, which is why both composers here are filled with
  <code>insertText</code> and then <em>verified</em> by reading them back before the prompt is
  sent.</p></div>
</section>

<section id="logs">
  <h2>Logs</h2>
  <div class="ep"><span class="m get">GET</span><code class="path">/api/logs</code><span class="tag">?limit= ?errors=1 ?engine= ?status= ?since= ?date= ?path=</span></div>
  <div class="ep"><span class="m get">GET</span><code class="path">/api/logs/errors</code><span class="tag">the same thing, pre-filtered</span></div>
  <p>One record per request, newest first. Two lifetimes, because two different
  questions are being asked: the last thousand calls stay in memory for
  <em>what just broke</em>, and every call is appended to
  <code>/data/logs/api-YYYY-MM-DD.jsonl</code> for <em>what happened on Tuesday</em>. Pass
  <code>date=</code> to read a day off the volume instead of memory; the response lists
  which days exist.</p>
  <div class="tbl"><table>
    <thead><tr><th>Field</th><th>Is</th></tr></thead>
    <tbody>
      <tr><td><code>at</code> <code>method</code> <code>path</code> <code>status</code> <code>ms</code></td><td>the request, and how it ended</td></tr>
      <tr><td><code>engine</code> <code>model</code> <code>stream</code></td><td>which engine ran, fully qualified</td></tr>
      <tr><td><code>queuedMs</code> <code>engineMs</code></td><td>time split between waiting for a turn and doing the work — the pair that says whether the gateway or the engine is slow</td></tr>
      <tr><td><code>promptChars</code> <code>promptHead</code> <code>answerChars</code></td><td>size, and the first 140 characters of the prompt</td></tr>
      <tr><td><code>error</code></td><td><code>{type, message}</code> when the call failed</td></tr>
      <tr><td><code>ip</code> <code>ua</code></td><td>from <code>x-forwarded-for</code> and the user agent</td></tr>
    </tbody>
  </table></div>
<pre><code>curl -s "https://ee-auto.up.railway.app/api/logs?errors=1&amp;limit=20" -H "Authorization: Bearer $LAB_TOKEN"

{"source":"memory","count":3,"entries":[
  {"id":214,"at":"2026-08-20T09:14:02.111Z","method":"POST","path":"/v1/chat/completions",
   "engine":"chatgpt","model":"chatgpt:openai-waynecollins","promptChars":88,
   "queuedMs":41230,"ms":54900,"status":429,
   "error":{"type":"queue_full","message":"System busy: 10 calls are already waiting..."}}
]}</code></pre>
  <div class="call warn"><span class="h">What is not in the log</span>
  <p>The token. It arrives in a header and, for clients that cannot set one, in
  <code>?token=</code> — so the query string is stored with that parameter redacted. A log
  that leaks the credential is worse than no log.</p>
  <p>Records start <em>before</em> the auth check, so rejected tokens appear as 401s: a
  misconfigured client that nobody can see stays misconfigured. Set
  <code>LOG_PROMPTS=0</code> to keep sizes and drop prompt previews.</p></div>
  <p><code>GET /api/status</code> carries a summary — counts by status class, how many
  errors are in the ring, how many days are on disk, and any failure to write.</p>
</section>

<section id="service">
  <h2>Service</h2>
  <div class="tbl"><table>
    <thead><tr><th>Route</th><th>Does</th></tr></thead>
    <tbody>
      <tr><td><code>GET /healthz</code></td><td>unauthenticated liveness</td></tr>
      <tr><td><code>GET /api/status</code></td><td>agy version, container memory, open browsers, uptime, and the last crash it survived</td></tr>
      <tr><td><code>GET /api/net</code></td><td>egress IP and what Cloudflare says to a bare fetch. A 403 here is the expected answer to something that is obviously not a browser — read it for the address and the mitigation, not as a verdict.</td></tr>
      <tr><td><code>POST /api/exec</code></td><td>run a shell command in the container</td></tr>
      <tr><td><code>GET /api/file?path=</code></td><td>inspect a file; secrets redacted unless <code>reveal=1</code></td></tr>
      <tr><td><code>POST /api/snapshot</code> &middot; <code>GET /api/snapshot/diff</code></td><td>what a login wrote, and where</td></tr>
      <tr><td><code>GET /</code></td><td>the operator console</td></tr>
    </tbody>
  </table></div>
  <div class="call stop"><span class="h">This token is a root shell</span>
  <p><code>/api/exec</code> runs arbitrary commands in a container holding live Google and
  ChatGPT sessions, and <code>/api/cgpt/:id/export</code> hands out the cookies.
  <code>LAB_TOKEN</code> is not an API key in the ordinary sense — treat it as SSH access.
  The service refuses to start if it is shorter than 16 characters.</p></div>
</section>

<section id="errors">
  <h2>Errors</h2>
  <p>OpenAI's envelope: <code>{"error":{"message","type","code"}}</code>.</p>
  <div class="tbl"><table>
    <thead><tr><th>Status</th><th>type</th><th>Means</th></tr></thead>
    <tbody>
      <tr><td class="num">401</td><td><code>invalid_request_error</code></td><td>bad or missing token</td></tr>
      <tr><td class="num">400</td><td><code>invalid_request_error</code></td><td>a request the gateway will not fake — <code>n&gt;1</code>, empty messages, a prompt with no text</td></tr>
      <tr><td class="num">404</td><td><code>model_not_found</code></td><td>unknown model name, or a session that does not exist</td></tr>
      <tr><td class="num">429</td><td><code>queue_full</code> &middot; <code>queue_too_slow</code> &middot; <code>rate_limit_exceeded</code></td><td>system busy — see <a href="#queue">Queue</a>. Carries <code>Retry-After</code> and a queue snapshot.</td></tr>
      <tr><td class="num">503</td><td><code>engine_unavailable</code></td><td>the engine exists but is signed out or not installed</td></tr>
      <tr><td class="num">503</td><td><code>no_session</code></td><td>no session of that kind exists yet</td></tr>
      <tr><td class="num">504</td><td><code>timeout</code></td><td>the engine ran past <code>timeoutMs</code></td></tr>
      <tr><td class="num">502</td><td><code>engine_error</code></td><td>it ran and failed — the message says how</td></tr>
    </tbody>
  </table></div>
  <p>In a stream, all of these arrive as a final error chunk instead, because the status line
  has already gone out.</p>
</section>

<section id="limits">
  <h2>Limits</h2>
  <h3>One browser, one slot</h3>
  <p><code>MAX_OPEN_BROWSERS=1</code>, least-recently-used eviction, closed after five idle
  minutes. Every ChatGPT account competes for that one slot: calls serialise, and
  alternating between accounts evicts the other profile — measured at about a second,
  9.6 s for a warm call against 10.4 s for the same one straight after a different
  account. agy is a CLI and runs alongside. This is a pipeline back-end, not a fan-out one — send work at it
  as fast as you like and the <a href="#queue">queue</a> will hold it, but the throughput
  ceiling is roughly one browser answer every fifteen seconds.</p>

  <h3>Answers are read from a rendered page</h3>
  <p>Both browser engines read <code>innerText</code>, minus the buttons the page renders
  inside a message. Consequences worth designing around: a long fenced code block does not
  always read back whole, and a prompt asking for one big JSON blob is the shape most likely
  to come back truncated. <strong>Ask for line records instead.</strong></p>

  <h3>Nothing re-authenticates itself</h3>
  <p><code>GET /v1/models</code> reports each session's last probe. A pipeline that cares
  should probe and re-login on a schedule rather than discover a dead session as a 503 in the
  middle of a run.</p>

  <h3>Cloudflare passes, for now</h3>
  <p>ChatGPT's bot check clears from this container's address today, and the interactive
  Turnstile checkbox is solved with a coordinate click. If that is ever escalated to
  something harder, this stops working and a residential proxy
  (<code>PROXY_URL</code>) becomes the next move.</p>
</section>

<section id="env">
  <h2>Environment</h2>
  <div class="tbl"><table>
    <thead><tr><th>Variable</th><th>Default</th><th></th></tr></thead>
    <tbody>
      <tr><td><code>LAB_TOKEN</code></td><td class="num">&mdash;</td><td>required, 16+ characters; the key for everything under <code>/api</code> and <code>/v1</code></td></tr>
      <tr><td><code>PORTAL_TOKEN</code></td><td class="num">unset</td><td>optional 16+ character end-user key; authorizes only report listing, business search, and company research routes</td></tr>
      <tr><td><code>DATABASE_URL</code></td><td class="num">&mdash;</td><td>preferred durable Postgres connection for published reports; link the Railway database service</td></tr>
      <tr><td><code>PG_PROXY_URL</code> &middot; <code>PG_DB_NAME</code> &middot; <code>PG_PROXY_TOKEN</code></td><td class="num">unset</td><td>HTTP database fallback; the token expires and is not preferred for production</td></tr>
      <tr><td><code>TRANSLATION_BASE_URL</code></td><td class="num">e-router /v1</td><td>optional OpenAI-compatible endpoint override for the Chinese company-report copy</td></tr>
      <tr><td><code>TRANSLATION_API_KEY</code></td><td class="num">&mdash;</td><td>required bearer key for Chinese company-report translation; set as a Railway secret only</td></tr>
      <tr><td><code>TRANSLATION_MODEL</code></td><td class="num">step-3.7-flash</td><td>model for the Simplified Chinese company-report translation</td></tr>
      <tr><td><code>DEFAULT_MODEL</code></td><td class="num">agy</td><td>what an empty or <code>auto</code> model resolves to</td></tr>
      <tr><td><code>CGPT_DEFAULT_SESSION</code></td><td class="num">first ready</td><td>which account a bare <code>chatgpt</code> means</td></tr>
      <tr><td><code>AGY_ASK_TIMEOUT_MS</code></td><td class="num">300000</td><td></td></tr>
      <tr><td><code>CGPT_ASK_TIMEOUT_MS</code></td><td class="num">180000</td><td></td></tr>
      <tr><td><code>AGY_MAX_CONCURRENT</code></td><td class="num">2</td><td>agy runs in flight at once</td></tr>
      <tr><td><code>MAX_OPEN_BROWSERS</code></td><td class="num">1</td><td>Chrome profiles open at once — the browser lane's width</td></tr>
      <tr><td><code>CGPT_MIN_GAP_MS</code></td><td class="num">2000</td><td>spacing between calls to that account</td></tr>
      <tr><td><code>AGY_MIN_GAP_MS</code></td><td class="num">0</td><td></td></tr>
      <tr><td><code>QUEUE_MAX_DEPTH</code></td><td class="num">10</td><td>waiting calls before 429; <code>CGPT_MAX_QUEUE</code> etc. override per engine</td></tr>
      <tr><td><code>QUEUE_MAX_WAIT_MS</code></td><td class="num">300000</td><td>longest wait the gateway will promise; past it, 429</td></tr>
      <tr><td><code>CGPT_HOURLY_LIMIT</code> &middot; <code>AGY_HOURLY_LIMIT</code></td><td class="num">off</td><td>calls per rolling hour, per engine</td></tr>
      <tr><td><code>LOG_MEMORY</code></td><td class="num">1000</td><td>records kept in memory for <code>/api/logs</code></td></tr>
      <tr><td><code>LOG_PROMPTS</code></td><td class="num">on</td><td><code>0</code> drops prompt previews from the log</td></tr>
      <tr><td><code>BROWSER_IDLE_MS</code></td><td class="num">300000</td><td>close a profile nobody has touched</td></tr>
      <tr><td><code>PROXY_URL</code></td><td class="num">unset</td><td><code>http://user:pass@host:port</code> for the browser</td></tr>
    </tbody>
  </table></div>
</section>

<footer>
  <p>Served by the deploy it documents. The repo's <code>API.md</code>,
  <code>CHATGPT-PROGRESS.md</code> and <code>META-AI.md</code> carry the measurements behind
  every claim here.</p>
</footer>
</main>
</div>`;
}

/** The served document: the same markup, wrapped. */
export function page(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>EE Business Intelligence API</title>
</head>
<body>
` + body() + `
</body>
</html>`;
}
