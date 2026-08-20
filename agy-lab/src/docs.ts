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
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans);
    font-size:15px; line-height:1.62; -webkit-font-smoothing:antialiased; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  a:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px; }
  code { font-family:var(--mono); font-size:0.885em; }

  .doc { display:grid; grid-template-columns:236px minmax(0,1fr); gap:0; max-width:1180px; margin:0 auto; }

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
  .tbl { overflow-x:auto; margin:14px 0; border:1px solid var(--line); border-radius:10px; }
  table { border-collapse:collapse; width:100%; font-size:13.5px; }
  th, td { text-align:left; padding:9px 13px; border-bottom:1px solid var(--line-soft); vertical-align:top; }
  th { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.1em;
    color:var(--faint); font-weight:500; background:var(--sunk); white-space:nowrap; }
  tr:last-child td { border-bottom:none; }
  td code { color:var(--ink); white-space:nowrap; }
  td.num { font-variant-numeric:tabular-nums; white-space:nowrap; font-family:var(--mono); font-size:12.5px; }
  .req { font-family:var(--mono); font-size:10px; letter-spacing:.08em; color:var(--warn); }

  /* --- code ----------------------------------------------------------- */
  pre { background:var(--sunk); border:1px solid var(--line); border-radius:10px;
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

  footer { border-top:1px solid var(--line); padding-top:18px; color:var(--faint); font-size:13px; }

  @media (max-width:900px) {
    .doc { grid-template-columns:1fr; }
    .nav { position:static; height:auto; border-right:none; border-bottom:1px solid var(--line-soft);
      padding:20px 22px 16px; }
    .nav nav { flex-flow:row wrap; gap:2px 4px; }
    .nav-label { display:none; }
    main { padding:26px 22px 70px; }
    h1 { font-size:28px; }
  }
  @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
</style>

<div class="doc">
<aside class="nav">
  <div class="brand"><span class="dot"></span>agy-lab</div>
  <div class="brand-sub">gateway API</div>
  <nav>
    <a href="#start">Start here</a>
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
    <a href="#meta">Meta AI</a>
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
  <p class="eyebrow">HTTP API &middot; three engines &middot; one token</p>
  <h1>Gateway API</h1>
  <p class="lede">A Google account's CLI, a signed-in ChatGPT and a signed-in Meta AI,
  served over one HTTP surface in the OpenAI chat-completions shape. Point an
  existing tool at it by changing a base URL.</p>
  <div class="facts">
    <div class="fact"><span class="k">Base URL</span><code>https://ee-auto.up.railway.app/v1</code></div>
    <div class="fact"><span class="k">Auth</span><code>Authorization: Bearer LAB_TOKEN</code></div>
    <div class="fact"><span class="k">Models</span><code>agy &middot; chatgpt &middot; meta</code></div>
  </div>
</header>

<section id="start">
  <h2>Start here</h2>
  <p>Every route under <code>/v1</code> and <code>/api</code> takes the service's
  <code>LAB_TOKEN</code> as a bearer token — the same header an OpenAI client already
  sends, which is the whole reason the shape was chosen. <code>?token=</code> as a query
  parameter works too, for a client that cannot set headers. <code>/healthz</code> and
  this page are the only unauthenticated routes.</p>

<pre><code>curl -s https://ee-auto.up.railway.app/v1/chat/completions \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"meta","messages":[{"role":"user","content":"Capital of Malaysia? One word."}]}'</code></pre>

<pre><code>{
  "id": "chatcmpl-3cb7efa5b1294c4ab2cf01f8e01da0d8",
  "object": "chat.completion",
  "model": "meta:metaai",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Kuala Lumpur" },
                "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 14, "completion_tokens": 3, "total_tokens": 17, "estimated": true },
  "agy_lab": { "engine": "meta", "ms": 11568, "settled": true }
}</code></pre>

  <h3>With the OpenAI SDK</h3>
<pre><code><span class="cmt"># python</span>
from openai import OpenAI
client = OpenAI(base_url="https://ee-auto.up.railway.app/v1", api_key=LAB_TOKEN, timeout=300)
client.chat.completions.create(model="chatgpt", messages=[{"role": "user", "content": "..."}])</code></pre>

<pre><code><span class="cmt">// typescript</span>
const client = new OpenAI({ baseURL: 'https://ee-auto.up.railway.app/v1', apiKey: LAB_TOKEN, timeout: 300000 });
await client.chat.completions.create({ model: 'agy', messages: [{ role: 'user', content: '...' }] });</code></pre>

  <div class="call warn"><span class="h">Set a long client timeout</span>
  <p>Answers take 9–30 seconds because each one is a CLI run or a browser typing into a
  real page. An SDK default of 60s will cut off work that would have finished.</p></div>
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
      <tr><td><code>meta</code></td><td>a signed-in meta.ai session in the same Chrome, same way</td><td class="num">9–12 s</td><td><span class="pill ok">incremental</span></td></tr>
    </tbody>
  </table></div>
  <p>Timings are measurements from 2026-08-20, not estimates: one-line answers over the
  public URL. A 4,751-character multi-line prompt answered in 9.3 s on <code>meta</code> and
  12.7 s on <code>chatgpt</code> — prompt size costs almost nothing, because the text goes in
  through one insert rather than keystroke by keystroke.</p>
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
  <p>Every call to a browser engine starts a new chat — a temporary chat on ChatGPT, a new
  thread on Meta AI. There is no server-side conversation to continue, so send the history
  you want considered.</p>
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
      <tr><td><code>meta</code>, <code>metaai</code>, <code>meta.ai</code>, <code>llama-*</code></td><td>the default Meta AI session</td></tr>
      <tr><td><code>meta:&lt;id&gt;</code></td><td>that Meta AI session</td></tr>
      <tr><td><em>empty</em>, <code>auto</code></td><td><code>DEFAULT_MODEL</code>, which is <code>agy</code> unless set</td></tr>
    </tbody>
  </table></div>
  <p><code>gpt-*</code> and <code>llama-*</code> map to the signed-in accounts because tools hard-code
  a model id far more often than they let you choose one. A bare <code>chatgpt</code> or
  <code>meta</code> resolves to <code>CGPT_DEFAULT_SESSION</code> / <code>META_DEFAULT_SESSION</code> if
  set, otherwise the first session of that kind whose last probe said <code>ready</code>. The two
  kinds never cross: a <code>meta:</code> name will not resolve against a ChatGPT profile, or the
  reverse.</p>
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
      <tr><td><code>browser</code></td><td class="num">1</td><td><code>chatgpt</code> + <code>meta</code> — the container has one Chrome</td><td class="num">2 s between calls</td></tr>
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
  <h2>Meta AI</h2>
  <p>The same machinery as ChatGPT — a persistent profile, an ask that types into the real
  editor — with one structural difference that cannot be worked around from inside the
  container.</p>
  <div class="call stop"><span class="h">The login cannot happen here</span>
  <p>Measured from the container: meta.ai loads fine logged out, Facebook accepts the
  password with no checkpoint, and then the hop back to Meta AI answers <em>"Meta AI isn't
  available in your region."</em> The same account, the same sequence, from a home connection
  in Malaysia: signs in and chats. The gate is on the address the login comes from.</p>
  <p>It is evaluated once, at login. A session minted at a residential IP, exported and
  imported here, answers prompts from this container with no region error — cookies replay
  fine, only the login is refused. So: sign in locally with
  <code>scripts/meta-login.mjs</code>, then
  <code>POST /api/cgpt/&lt;id&gt;/import</code> with <code>{"kind":"meta"}</code> and the
  storageState. <code>POST /api/cgpt/:id/login</code> refuses a meta session outright rather
  than driving a login that cannot succeed.</p></div>
  <p>Everything else works the way the ChatGPT engine does: <code>probe</code> (~0.7 s),
  <code>ask</code>, <code>dom</code>, <code>frame</code>. Meta AI ships stable
  <code>data-testid</code>s, so the selectors are steadier than ChatGPT's — with one trap:
  <code>[data-testid="composer-input"]</code> is a zero-sized textarea mirror, not the
  editor. Filling it reads back correct and types into nothing.</p>
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
      <tr><td><code>POST /api/cgpt/:id/import</code></td><td>apply a Playwright storageState — cookies through CDP, localStorage per origin. How a Meta AI session gets here at all.</td></tr>
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
  <p><code>/api/exec</code> runs arbitrary commands in a container holding live Google,
  ChatGPT and Meta sessions, and <code>/api/cgpt/:id/export</code> hands out the cookies.
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
  <h3>One browser, shared by two engines</h3>
  <p><code>MAX_OPEN_BROWSERS=1</code>, least-recently-used eviction, closed after five idle
  minutes. ChatGPT and Meta AI compete for that one slot: calls serialise, and alternating
  between them evicts the other profile. Measured, that costs about a second — 9.6 s for a
  warm Meta AI call against 10.4 s for the same one straight after a ChatGPT call. agy is a
  CLI and runs alongside. This is a pipeline back-end, not a fan-out one — send work at it
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
      <tr><td><code>DEFAULT_MODEL</code></td><td class="num">agy</td><td>what an empty or <code>auto</code> model resolves to</td></tr>
      <tr><td><code>CGPT_DEFAULT_SESSION</code></td><td class="num">first ready</td><td>which account a bare <code>chatgpt</code> means</td></tr>
      <tr><td><code>META_DEFAULT_SESSION</code></td><td class="num">first ready</td><td>which account a bare <code>meta</code> means</td></tr>
      <tr><td><code>AGY_ASK_TIMEOUT_MS</code></td><td class="num">300000</td><td></td></tr>
      <tr><td><code>CGPT_ASK_TIMEOUT_MS</code></td><td class="num">180000</td><td></td></tr>
      <tr><td><code>META_ASK_TIMEOUT_MS</code></td><td class="num">= CGPT</td><td></td></tr>
      <tr><td><code>AGY_MAX_CONCURRENT</code></td><td class="num">2</td><td>agy runs in flight at once</td></tr>
      <tr><td><code>MAX_OPEN_BROWSERS</code></td><td class="num">1</td><td>Chrome profiles open at once — the browser lane's width</td></tr>
      <tr><td><code>CGPT_MIN_GAP_MS</code> &middot; <code>META_MIN_GAP_MS</code></td><td class="num">2000</td><td>spacing between calls to that account</td></tr>
      <tr><td><code>AGY_MIN_GAP_MS</code></td><td class="num">0</td><td></td></tr>
      <tr><td><code>QUEUE_MAX_DEPTH</code></td><td class="num">10</td><td>waiting calls before 429; <code>CGPT_MAX_QUEUE</code> etc. override per engine</td></tr>
      <tr><td><code>QUEUE_MAX_WAIT_MS</code></td><td class="num">300000</td><td>longest wait the gateway will promise; past it, 429</td></tr>
      <tr><td><code>CGPT_HOURLY_LIMIT</code> &middot; <code>META_HOURLY_LIMIT</code> &middot; <code>AGY_HOURLY_LIMIT</code></td><td class="num">off</td><td>calls per rolling hour, per engine</td></tr>
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
<title>Gateway API &middot; agy-lab</title>
</head>
<body>
` + body() + `
</body>
</html>`;
}
