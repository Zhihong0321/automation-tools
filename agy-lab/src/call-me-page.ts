// The public "Call me" page. One self-contained module: HTML, CSS and JS inline,
// like the other pages. Light, bright Eternalgy look: white, vivid blue, amber button.
// The behaviour behind it is in call-me.ts.

const MESSAGES = {
  success: 'Calling you now — please keep WhatsApp open and answer the call from Eternalgy.',
  busy: 'Our agent is on another call right now. Please try again in a few minutes.',
  invalid: 'That does not look like a valid WhatsApp mobile number. Please check it and try again.',
  nameOrCompany: 'Please enter your name or your company name.',
  limited: 'You have already requested a call recently.',
  generic: 'We could not place the call right now. We saved your request.',
};

export function callMePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<title>Let Eternalgy Telemarketing AI Agent call You</title>
<style>
  :root {
    --blue: #1d4ed8; --blue-dark: #1e3a8a; --blue-soft: #eff6ff; --blue-line: #bfdbfe;
    --amber: #facc15; --amber-dark: #eab308; --ink: #0f172a; --muted: #475569;
    --ok: #166534; --ok-bg: #f0fdf4; --warn: #92400e; --warn-bg: #fffbeb; --bad: #b91c1c; --bad-bg: #fef2f2;
  }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0; background: #fff; color: var(--ink);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", "PingFang SC", sans-serif;
  }
  main { max-width: 34rem; margin: 0 auto; padding: 28px 16px 48px; }
  .brand { color: var(--blue); font-weight: 700; letter-spacing: .04em; font-size: .85rem; text-transform: uppercase; }
  h1 { color: var(--blue); font-size: 1.75rem; line-height: 1.2; margin: .35rem 0 .25rem; }
  .zh { margin: 0 0 1.25rem; color: var(--muted); font-size: 1rem; }
  form { border: 1px solid var(--blue-line); border-top: 4px solid var(--blue); border-radius: 12px; padding: 18px 16px; background: #fff; }
  .field { margin-bottom: 16px; }
  label { display: block; font-weight: 600; color: var(--blue-dark); margin-bottom: 4px; }
  .opt { font-weight: 400; color: var(--muted); }
  input[type=text], input[type=tel] {
    width: 100%; font: inherit; color: var(--ink); background: #fff;
    border: 1.5px solid #94a3b8; border-radius: 8px; padding: 12px; min-height: 48px;
  }
  input:focus-visible, button:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-color: var(--blue); }
  .hint { margin: 4px 0 0; font-size: .875rem; color: var(--muted); }
  button {
    width: 100%; min-height: 52px; font: inherit; font-weight: 700; font-size: 1.1rem; cursor: pointer;
    color: #1c1917; background: var(--amber); border: 2px solid var(--amber-dark); border-radius: 10px; padding: 12px 16px;
  }
  button:hover:not(:disabled) { background: #fde047; }
  button:disabled { opacity: .6; cursor: not-allowed; }
  #status { margin-top: 14px; min-height: 1.5em; }
  #status .msg { border-radius: 8px; padding: 12px 14px; border: 1px solid; font-weight: 600; }
  .msg.ok { color: var(--ok); background: var(--ok-bg); border-color: #86efac; }
  .msg.warn { color: var(--warn); background: var(--warn-bg); border-color: #fcd34d; }
  .msg.bad { color: var(--bad); background: var(--bad-bg); border-color: #fca5a5; }
  .note { margin-top: 20px; background: var(--blue-soft); border: 1px solid var(--blue-line); border-radius: 12px; padding: 14px 16px; font-size: .95rem; }
  .note ul { margin: 0 0 10px; padding-left: 1.2rem; }
  .note li { margin-bottom: 6px; }
  .note p { margin: 0; color: var(--blue-dark); }
  .hp { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
</style>
</head>
<body>
<main>
  <div class="brand">Eternalgy</div>
  <h1>Let Eternalgy Telemarketing AI Agent call You</h1>
  <p class="zh" lang="zh">让恒浩能源的 AI 电话助理给您来电</p>

  <form id="f" novalidate autocomplete="on">
    <div class="field">
      <label for="name">Name <span class="opt">(optional)</span></label>
      <input id="name" name="name" type="text" maxlength="120" autocomplete="name">
    </div>
    <div class="field">
      <label for="company">Company name <span class="opt">(optional)</span></label>
      <input id="company" name="company" type="text" maxlength="120" autocomplete="organization">
    </div>
    <div class="field">
      <label for="whatsapp">WhatsApp number</label>
      <input id="whatsapp" name="whatsapp" type="tel" inputmode="tel" maxlength="40" autocomplete="tel" required aria-describedby="wa-hint">
      <p class="hint" id="wa-hint">e.g. 012-345 6789 or +60 12-345 6789</p>
    </div>
    <div class="hp" aria-hidden="true">
      <label for="website">Leave this field empty</label>
      <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
    </div>
    <button type="submit" id="go">Call me</button>
    <div id="status" role="status" aria-live="polite"></div>
  </form>

  <section class="note" aria-label="Notes">
    <ul>
      <li>WhatsApp number only.</li>
      <li>You must provide at least your name or your company name. We do not call a number when we don't know who or which company it belongs to.</li>
    </ul>
    <p>By pressing Call me you agree that our AI agent calls this WhatsApp number once, now.</p>
  </section>
</main>
<script>
(function () {
  var M = ${JSON.stringify(MESSAGES)};
  var f = document.getElementById('f'), go = document.getElementById('go'), st = document.getElementById('status');
  function show(kind, text) {
    st.textContent = '';
    var d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    st.appendChild(d);
  }
  var KIND = { requested: 'ok', busy: 'warn', limited: 'warn', invalid_number: 'bad', missing_name_or_company: 'bad' };
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (id) { return document.getElementById(id).value.trim(); };
    if (!v('name') && !v('company')) { show('bad', M.nameOrCompany); document.getElementById('name').focus(); return; }
    if (!v('whatsapp')) { show('bad', M.invalid); document.getElementById('whatsapp').focus(); return; }
    go.disabled = true;
    go.setAttribute('aria-busy', 'true');
    show('warn', 'Sending your request\\u2026');
    var done = false;
    fetch('/call-me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: v('name'), company: v('company'), whatsapp: v('whatsapp'), website: document.getElementById('website').value })
    }).then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (j && typeof j.message === 'string' && j.code) {
          show(j.ok ? 'ok' : (KIND[j.code] || 'bad'), j.message);
          done = !!j.ok;
        } else show('bad', M.generic);
      })
      .catch(function () { show('bad', M.generic); })
      .then(function () {
        go.removeAttribute('aria-busy');
        if (!done) go.disabled = false;
      });
  });
})();
</script>
</body>
</html>`;
}
