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
  ];
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

$('token').value = tok();
refresh();
setInterval(() => { if (!poller) refresh(); }, 15000);
</script>
</body>
</html>`;
}
