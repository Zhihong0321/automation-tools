// The whole front end: one static shell, rendered client-side.
//
// No framework and no build step, which is durability rather than minimalism —
// this page has to work on the day the thing it is inspecting does not, and a
// page with no toolchain cannot break because a toolchain changed.
export function page(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agy-lab</title>
<style>
  :root {
    --bg:#0f1115; --card:#171a20; --ink:#e8eaed; --muted:#9aa3af; --line:#262b33;
    --ok:#4ade9f; --bad:#ff8b80; --warn:#f0c065; --idk:#9aa3af; --accent:#7aa2f7;
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 64px; background:var(--bg); color:var(--ink);
    font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 2px; letter-spacing:-.01em; }
  .sub { color:var(--muted); font-size:13px; margin:0 0 22px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin-bottom:16px; }
  .card h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 12px; font-weight:600; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  button { font:inherit; font-size:13px; font-weight:550; padding:7px 14px; border-radius:8px;
    border:1px solid var(--line); background:#1e222a; color:var(--ink); cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--muted); }
  button:disabled { opacity:.5; cursor:default; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#0f1115; }
  input, textarea, select { font:inherit; font-size:13px; background:#0f1115; color:var(--ink);
    border:1px solid var(--line); border-radius:8px; padding:7px 10px; }
  input, textarea { width:100%; }
  textarea { font-family:ui-monospace,Consolas,monospace; resize:vertical; }
  pre { background:#0b0d11; border:1px solid var(--line); border-radius:8px; padding:12px;
    overflow:auto; max-height:420px; font:12px/1.5 ui-monospace,Consolas,monospace; white-space:pre-wrap;
    word-break:break-word; margin:12px 0 0; }
  .kv { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; font-size:12.5px; }
  .kv b { font-weight:500; color:var(--muted); }
  .kv span { font-family:ui-monospace,Consolas,monospace; word-break:break-all; }
  .pill { font-size:11.5px; font-weight:600; padding:2px 9px; border-radius:999px; border:1px solid currentColor; }
  .ready,.ok { color:var(--ok); } .logged_out,.bad { color:var(--bad); }
  .not_installed { color:var(--warn); } .unknown { color:var(--idk); }
  a { color:var(--accent); word-break:break-all; }
  .hint { color:var(--muted); font-size:12px; margin:8px 0 0; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:820px) { .grid2 { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>agy-lab</h1>
  <p class="sub">Install, authenticate and drive the Antigravity CLI inside this container.</p>

  <div class="card">
    <h2>Access</h2>
    <div class="row">
      <input id="token" type="password" placeholder="LAB_TOKEN" style="flex:1;min-width:220px">
      <button onclick="saveToken()">Save</button>
      <span id="authState" class="pill unknown">no token</span>
    </div>
    <p class="hint">Stored in this browser only. Sent as a bearer token with every call.</p>
  </div>

  <div class="card">
    <h2>Status</h2>
    <div class="kv" id="status"><b>loading</b><span>...</span></div>
    <div class="row" style="margin-top:14px">
      <button onclick="refresh()">Refresh</button>
      <button onclick="post('/api/install',{},'Installing agy')">1. Install agy</button>
      <button class="primary" onclick="login()">2. Log in</button>
      <button onclick="probe()">3. Probe auth</button>
    </div>
    <div id="probe"></div>
  </div>

  <div class="card">
    <h2>Terminal <span id="sessionLabel" style="color:var(--muted);text-transform:none;letter-spacing:0"></span></h2>
    <div class="row">
      <input id="stdin" placeholder="Paste the authorization code here, then press Send" onkeydown="if(event.key==='Enter')send()">
      <button class="primary" onclick="send()">Send</button>
      <button onclick="post('/api/session/'+cur+'/kill',{},'Killing')">Kill</button>
    </div>
    <pre id="term">No session yet. Install or Log in to start one.</pre>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>Run a prompt</h2>
      <textarea id="prompt" rows="3">Reply with exactly: OK</textarea>
      <div class="row" style="margin-top:8px">
        <button class="primary" onclick="run()">Run</button>
        <label class="hint"><input type="checkbox" id="tools" style="width:auto"> allow tools (--dangerously-skip-permissions)</label>
      </div>
    </div>

    <div class="card">
      <h2>Shell</h2>
      <textarea id="cmd" rows="3">ls -la $HOME; ls -la $HOME/.gemini/antigravity-cli 2>&1 | head -40</textarea>
      <div class="row" style="margin-top:8px"><button onclick="execCmd()">Exec</button></div>
      <pre id="execOut" style="display:none"></pre>
    </div>
  </div>

  <div class="card">
    <h2>Where does the credential land?</h2>
    <p class="hint" style="margin:0 0 10px">Snapshot every file under HOME, log in, then diff. Whatever appeared is the credential store — the one thing agy's docs never say.</p>
    <div class="row">
      <button onclick="post('/api/snapshot',{label:'pre-login'},'Snapshot taken')">Snapshot now</button>
      <button onclick="diff()">Diff vs pre-login</button>
      <input id="inspect" placeholder="/data/.gemini/... path to inspect" style="flex:1;min-width:200px">
      <button onclick="inspectFile()">Inspect</button>
    </div>
    <pre id="research" style="display:none"></pre>
  </div>

  <div class="card">
    <h2>Egress</h2>
    <p class="hint" style="margin:0 0 10px">What the outside world sees when this container connects. <b>A 403 with <code>cf-mitigated: challenge</code> is normal here</b> — a bare fetch is not a browser and Cloudflare says so from any address, including a home connection whose real Chrome works fine. What matters is the egress IP, and <code>challenge</code> (a browser can pass) versus <code>block</code> (only a residential proxy fixes it). The real verdict is a session probe.</p>
    <div class="row"><button onclick="netCheck()">Check egress + chatgpt.com</button></div>
    <pre id="net" style="display:none"></pre>
  </div>

  <div class="card">
    <h2>ChatGPT sessions</h2>
    <div class="row">
      <input id="newSession" placeholder="session id, e.g. openai-main" style="flex:1;min-width:180px">
      <button onclick="createSession()">Create</button>
      <button onclick="loadSessions()">Refresh</button>
    </div>
    <div id="sessionList" style="margin-top:14px"></div>
  </div>

  <div class="card">
    <h2>Log in <span id="rcLabel" style="color:var(--muted);text-transform:none;letter-spacing:0"></span></h2>
    <div class="row">
      <input id="loginId" placeholder="session id" style="min-width:150px">
      <input id="loginEmail" placeholder="email" autocomplete="off" style="flex:1;min-width:180px">
      <input id="loginPass" type="password" placeholder="password" autocomplete="new-password" style="flex:1;min-width:160px">
      <button class="primary" onclick="doLogin()">Log in</button>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="loginOtp" placeholder="one-time code (only if asked)" style="flex:1;min-width:200px"
             onkeydown="if(event.key==='Enter'){doOtp();event.preventDefault();}">
      <button onclick="doOtp()">Submit code</button>
      <button onclick="shot()">Screenshot</button>
      <button onclick="closeBrowser()">Close browser</button>
    </div>
    <p class="hint">Credentials are typed into the page and discarded with the request — the profile keeps the session cookies, nothing keeps the password. If a code is needed the login stops and holds the page; enter it above and the flow resumes where it left off.</p>
    <pre id="loginOut" style="display:none"></pre>
    <img id="rcFrame" style="display:none;width:100%;max-width:1280px;border:1px solid var(--line);border-radius:8px;margin-top:10px">
  </div>

  <div class="card">
    <h2>Import a session from your PC</h2>
    <p class="hint" style="margin:0 0 10px">Paste a Playwright <code>storageState</code> JSON. Cookies and localStorage are replayed into the profile. Importing succeeding is not the same as the session surviving — probe afterwards.</p>
    <textarea id="stateJson" rows="4" placeholder='{"cookies":[...],"origins":[...]}'></textarea>
    <div class="row" style="margin-top:8px">
      <input id="importTarget" placeholder="target session id" style="flex:1;min-width:160px">
      <button class="primary" onclick="importState()">Import</button>
      <button onclick="exportState()">Export that session</button>
    </div>
    <pre id="importOut" style="display:none"></pre>
  </div>

  <div class="card">
    <h2>Ask through a session</h2>
    <div class="row">
      <input id="askId" placeholder="session id" style="min-width:150px">
      <input id="askPrompt" value="Reply with exactly: OK" style="flex:1;min-width:220px">
      <button class="primary" onclick="ask()">Ask</button>
    </div>
    <pre id="askOut" style="display:none"></pre>
  </div>
</div>

<script>
let cur = null, offset = 0, poller = null;
const $ = (id) => document.getElementById(id);
const tok = () => localStorage.getItem('labToken') || '';

function saveToken() {
  localStorage.setItem('labToken', $('token').value.trim());
  refresh();
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() },
  });
  const body = await res.json().catch(() => ({ error: 'bad response' }));
  if (res.status === 401) {
    $('authState').className = 'pill bad';
    $('authState').textContent = 'token rejected';
  }
  return { status: res.status, body };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ago(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return Math.round(s) + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  return Math.round(s / 3600) + 'h ago';
}

// Strip the escape sequences a pty emits. agy in print mode is close to linear
// text, but it still colours and repositions; left raw the page fills with
// mojibake and the URL you need is buried in it.
function clean(s) {
  return s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][A-B0-2]/g, '')
    .replace(/\r(?!\n)/g, '\n');
}

// Any https://... in the output is the thing to click. Linkifying it is the
// difference between a login you can complete and a URL you have to hand-copy
// out of a scrolling terminal.
function linkify(s) {
  const esc = s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return esc.replace(/(https?:\/\/[^\s"'<>)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

async function refresh() {
  const { status, body } = await api('/api/status');
  if (status !== 200) { $('status').innerHTML = '<b>error</b><span>' + (body.error || status) + '</span>'; return; }
  $('authState').className = 'pill ok';
  $('authState').textContent = 'token ok';
  const rows = [
    ['agy installed', body.installed ? 'yes - ' + body.bin : 'NO - press Install'],
    ['version', body.version || '(unknown)'],
    ['HOME', body.home],
    ['app data', body.appData],
    ['D-Bus present', body.dbus ? 'yes' : 'no (keyring bypassed - file store expected)'],
    ['volume mounted', body.volume.mounted ? 'yes' : 'NO - a redeploy will wipe the login'],
    ['GEMINI_API_KEY', body.configured.geminiApiKey ? 'set' : 'not set'],
    ['modelProvider', body.configured.modelProvider || '(unset)'],
    ['GOOGLE_APPLICATION_CREDENTIALS', body.configured.adc ? 'set' : 'not set'],
    ['memory', body.memory
      ? body.memory.containerUsedMb + ' / ' + body.memory.containerLimitMb + ' MB, node ' +
        body.memory.rssMb + ' MB, browsers ' + body.memory.openBrowsers + '/' + body.memory.maxOpenBrowsers
      : '(unknown)'],
    ['uptime', body.uptimeSec != null ? Math.round(body.uptimeSec / 60) + 'm (since ' + body.startedAt + ')' : '(unknown)'],
  ];
  // A restart wipes every open browser and every in-memory snapshot, so a recent
  // one explains far more symptoms than it looks like it should.
  if (body.lastCrash) {
    rows.push(['LAST CRASH', body.lastCrash.kind + ' at ' + body.lastCrash.at + ' - ' +
      String(body.lastCrash.message).split('\n')[0]]);
  }
  $('status').innerHTML = rows.map(([k, v]) => '<b>' + k + '</b><span>' + v + '</span>').join('');
  if (body.sessions && body.sessions.length && !cur) attach(body.sessions[body.sessions.length - 1].id);
}

function attach(id) {
  cur = id; offset = 0;
  $('term').textContent = '';
  $('sessionLabel').textContent = '- ' + id;
  if (poller) clearInterval(poller);
  poller = setInterval(pump, 800);
  pump();
}

async function pump() {
  if (!cur) return;
  const { status, body } = await api('/api/session/' + cur + '?offset=' + offset);
  if (status !== 200) return;
  offset = body.offset;
  if (body.data) $('term').innerHTML += linkify(clean(body.data));
  $('term').scrollTop = $('term').scrollHeight;
  $('sessionLabel').textContent = '- ' + cur + (body.running ? ' (running)' : ' (exit ' + body.exitCode + ')');
  if (!body.running) { clearInterval(poller); poller = null; refresh(); }
}

async function post(path, payload, label) {
  $('term').textContent = label + '...\n';
  const { body } = await api(path, { method: 'POST', body: JSON.stringify(payload) });
  if (body.id) attach(body.id); else $('term').textContent = JSON.stringify(body, null, 2);
}

const login = () => post('/api/login', {}, 'Starting login - watch for a URL below');
const run = () => post('/api/run', { prompt: $('prompt').value, tools: $('tools').checked }, 'Running');

async function send() {
  if (!cur) return;
  const text = $('stdin').value;
  $('stdin').value = '';
  await api('/api/session/' + cur + '/input', { method: 'POST', body: JSON.stringify({ text }) });
  pump();
}

async function probe() {
  $('probe').innerHTML = '<p class="hint">Probing - this makes one real model call...</p>';
  const { body } = await api('/api/probe', { method: 'POST', body: '{}' });
  $('probe').innerHTML =
    '<p style="margin:12px 0 0"><span class="pill ' + body.status + '">' + body.status + '</span> ' +
    (body.detail || '') + '</p>';
}

async function execCmd() {
  const { body } = await api('/api/exec', { method: 'POST', body: JSON.stringify({ cmd: $('cmd').value }) });
  $('execOut').style.display = 'block';
  $('execOut').textContent = 'exit ' + body.code + '\n\n' + (body.stdout || '') + (body.stderr || '');
}

async function diff() {
  const { body } = await api('/api/snapshot/diff?from=pre-login');
  $('research').style.display = 'block';
  $('research').textContent = JSON.stringify(body, null, 2);
}

async function inspectFile() {
  const { body } = await api('/api/file?path=' + encodeURIComponent($('inspect').value));
  $('research').style.display = 'block';
  $('research').textContent = JSON.stringify(body, null, 2);
}

// ---- ChatGPT sessions ------------------------------------------------------
// Point the login form at a session and scroll it into view, so "Log in" on a row
// lands you on the form already filled in rather than somewhere below the fold.
function pickForLogin(id) {
  $('loginId').value = id;
  $('rcLabel').textContent = '- ' + id;
  $('loginId').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('loginEmail').focus();
}

const CGPT_LABEL = {
  ready: 'Signed in', logged_out: 'Needs sign-in', challenged: 'Bot check',
  busy: 'Profile in use', never_used: 'Never opened', unknown: 'Could not tell',
};

async function netCheck() {
  $('net').style.display = 'block';
  $('net').textContent = 'checking...';
  const { body } = await api('/api/net');
  $('net').textContent = JSON.stringify(body, null, 2);
}

async function loadSessions() {
  const { body } = await api('/api/cgpt');
  const rows = (body.sessions || []).map((s) => {
    const st = s.lastProbe ? s.lastProbe.status : 'never_used';
    return '<div style="border-top:1px solid var(--line);padding:10px 0">' +
      '<div class="row"><b style="font-family:ui-monospace,Consolas,monospace">' + s.id + '</b>' +
      '<span class="pill ' + (st === 'ready' ? 'ready' : st === 'logged_out' ? 'logged_out' : 'unknown') + '">' +
        (CGPT_LABEL[st] || st) + '</span>' +
      (s.open ? '<span class="pill ok">browser open</span>' : '') +
      '<span style="flex:1"></span>' +
      '<button onclick="cgpt(\'' + s.id + '\',\'probe\')">Probe</button>' +
      '<button onclick="pickForLogin(\'' + s.id + '\')">Log in</button>' +
      '<button onclick="cgpt(\'' + s.id + '\',\'close\')">Close</button>' +
      '<button onclick="delSession(\'' + s.id + '\')">Delete</button></div>' +
      (s.lastProbe ? '<p class="hint">' + esc(s.lastProbe.detail) + ' - ' + ago(s.lastProbe.at) + '</p>' : '') +
    '</div>';
  }).join('');
  $('sessionList').innerHTML = rows || '<p class="hint">No sessions yet. Create one above.</p>';
}

async function createSession() {
  const id = $('newSession').value.trim();
  if (!id) return;
  await api('/api/cgpt', { method: 'POST', body: JSON.stringify({ id }) });
  $('newSession').value = '';
  loadSessions();
}

async function delSession(id) {
  if (!confirm('Delete profile "' + id + '"? Its login is gone for good.')) return;
  await api('/api/cgpt/' + id + '/delete', { method: 'POST', body: '{}' });
  loadSessions();
}

async function cgpt(id, action, payload) {
  const el = $('sessionList');
  el.style.opacity = '.5';
  await api('/api/cgpt/' + id + '/' + action, { method: 'POST', body: JSON.stringify(payload || {}) });
  el.style.opacity = '1';
  loadSessions();
}

// Scripted login. No coordinates, no frame loop: fill the named fields, submit,
// and let the server walk the flow. The only picture taken is a diagnostic one,
// on demand, when the answer is "it stopped on a page I do not recognise".
async function doLogin() {
  const id = $('loginId').value.trim() || $('newSession').value.trim();
  if (!id) return alert('Which session?');
  $('loginId').value = id;
  $('rcLabel').textContent = '- ' + id;
  $('loginOut').style.display = 'block';
  $('loginOut').textContent = 'logging in - this drives a real browser and takes 20-60s...';
  const { body } = await api('/api/cgpt/' + id + '/login', {
    method: 'POST',
    body: JSON.stringify({
      email: $('loginEmail').value.trim(),
      password: $('loginPass').value,
      otp: $('loginOtp').value.trim() || undefined,
    }),
  });
  // Clear the password field on the way out. It is already sent; leaving it in a
  // form field only widens where it can be read from.
  $('loginPass').value = '';
  showLogin(body);
}

async function doOtp() {
  const id = $('loginId').value.trim();
  if (!id) return alert('Which session?');
  const code = $('loginOtp').value.trim();
  if (!code) return alert('No code entered.');
  $('loginOut').style.display = 'block';
  $('loginOut').textContent = 'submitting code...';
  const { body } = await api('/api/cgpt/' + id + '/otp', { method: 'POST', body: JSON.stringify({ code }) });
  $('loginOtp').value = '';
  showLogin(body);
}

function showLogin(body) {
  $('loginOut').textContent = JSON.stringify(body, null, 2);
  // A stall is the case where a picture actually earns its place, so take one
  // automatically rather than making someone think to ask.
  if (body.state === 'needs_otp') $('loginOtp').focus();
  else if (body.state === 'failed') shot();
  loadSessions();
}

function shot() {
  const id = $('loginId').value.trim();
  if (!id) return alert('Which session?');
  const img = $('rcFrame');
  img.style.display = 'block';
  img.src = '/api/cgpt/' + id + '/frame?token=' + encodeURIComponent(tok()) + '&t=' + Date.now();
}

async function closeBrowser() {
  const id = $('loginId').value.trim();
  if (!id) return;
  await api('/api/cgpt/' + id + '/close', { method: 'POST', body: '{}' });
  $('rcFrame').style.display = 'none';
  loadSessions();
}

async function importState() {
  const id = $('importTarget').value.trim();
  if (!id) return alert('Which session should it go into?');
  let state;
  try { state = JSON.parse($('stateJson').value); }
  catch (e) { return alert('That is not valid JSON.'); }
  $('importOut').style.display = 'block';
  $('importOut').textContent = 'importing...';
  const { body } = await api('/api/cgpt/' + id + '/import', { method: 'POST', body: JSON.stringify({ state }) });
  $('importOut').textContent = JSON.stringify(body, null, 2);
  loadSessions();
}

async function exportState() {
  const id = $('importTarget').value.trim();
  if (!id) return alert('Which session?');
  const { body } = await api('/api/cgpt/' + id + '/export');
  $('importOut').style.display = 'block';
  $('importOut').textContent = JSON.stringify(body, null, 2);
}

async function ask() {
  const id = $('askId').value.trim();
  if (!id) return alert('Which session?');
  $('askOut').style.display = 'block';
  $('askOut').textContent = 'asking - this drives the real UI and can take a minute...';
  const { body } = await api('/api/cgpt/' + id + '/ask', { method: 'POST', body: JSON.stringify({ prompt: $('askPrompt').value }) });
  $('askOut').textContent = JSON.stringify(body, null, 2);
}

$('token').value = tok();
refresh();
loadSessions();
setInterval(() => { if (!poller) refresh(); }, 15000);
</script>
</body>
</html>`;
}
