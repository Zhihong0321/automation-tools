// /company-dive: a form, the recent dives, and the selected dive's live log,
// dossier and sources. It uses the operator token the other console pages keep
// in localStorage ('labToken'), and asks for it once if it is not there.
import { OPERATOR_NAV, navHtml } from './nav.ts';

export const page = (): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Company Dive</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<style>
:root { --bg:#111317; --card:#181b21; --ink:#e8e9ec; --muted:#9aa0aa; --line:#2a2f38; --accent:#4cc79a; --bad:#f2786d; color-scheme:dark; }
.sitenav { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 20px; padding-bottom:16px; border-bottom:1px solid var(--line); }
.sitenav a { color:var(--muted); font-size:13px; font-weight:550; padding:5px 10px; border:1px solid transparent; border-radius:8px; text-decoration:none; }
.sitenav a:hover, .sitenav a[aria-current="page"] { color:var(--ink); background:#1e222a; border-color:var(--line); }
.wrap { max-width:1100px; margin:0 auto; padding:24px 16px 0; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:1100px; margin:0 auto; padding:0 16px 64px; display:grid; grid-template-columns:280px 1fr; gap:20px; }
@media (max-width: 800px) { main { grid-template-columns:1fr; } }
h1 { font-size:20px; margin:0 0 12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
form { display:grid; gap:8px; margin-bottom:16px; }
input, button { font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
button { background:var(--accent); color:#fff; border:0; cursor:pointer; font-weight:600; }
.list a { display:block; padding:8px 6px; border-bottom:1px solid var(--line); color:inherit; text-decoration:none; }
.list a.on { background:var(--bg); }
.muted { color:var(--muted); font-size:13px; }
.bad { color:var(--bad); }
.log { font:12px/1.5 ui-monospace, Menlo, Consolas, monospace; max-height:260px; overflow:auto; white-space:pre-wrap; background:var(--bg); padding:10px; border-radius:8px; }
.dossier table { border-collapse:collapse; width:100%; display:block; overflow-x:auto; }
.dossier th, .dossier td { border:1px solid var(--line); padding:4px 8px; text-align:left; vertical-align:top; }
.dossier a.cite { font-size:11px; vertical-align:super; text-decoration:none; color:var(--accent); }
.sources li { margin:2px 0; word-break:break-all; }
.sources li:target { background:color-mix(in srgb, var(--accent) 18%, transparent); }
.stats { display:flex; gap:16px; flex-wrap:wrap; margin:8px 0 12px; }
details summary { cursor:pointer; font-weight:600; margin:12px 0 6px; }
</style>
</head>
<body>
<div class="wrap"><nav class="sitenav" aria-label="Site">${navHtml(OPERATOR_NAV, '/company-dive')}</nav></div>
<main>
  <section>
    <h1>Company Dive</h1>
    <form id="f" class="card">
      <input id="company" placeholder="Company name, e.g. Eternalgy Sdn Bhd" required>
      <input id="country" placeholder="Country" value="Malaysia">
      <button>Start dive</button>
      <span class="muted">Brave for discovery, up to 15 Tavily calls, deepseek for the thinking.</span>
    </form>
    <div class="card list" id="list"></div>
  </section>
  <section class="card" id="view"><p class="muted">Pick a dive or start one.</p></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let token = '';
try { token = localStorage.getItem('labToken') || ''; } catch {}
function ask() {
  token = prompt('Operator token (LAB_TOKEN)') || '';
  try { localStorage.setItem('labToken', token); } catch {}
}
if (!token) ask();
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
  if (res.status === 401) { ask(); throw new Error('unauthorized'); }
  return res.json();
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
let current = Number(location.hash.slice(1)) || 0, timer = 0;

async function loadList() {
  const rows = (await api('/api/company-dive')).dives || [];
  $('list').innerHTML = rows.map((r) => '<a href="#' + r.id + '" class="' + (r.id === current ? 'on' : '') + '"><b>' + esc(r.company) + '</b><br><span class="muted">#' + r.id + ' · ' + esc(r.status) + (r.status === 'running' ? ' · ' + esc(r.stage) : '') + ' · ' + r.tavily_calls + ' Tavily</span></a>').join('') || '<p class="muted">No dives yet.</p>';
}

async function show(id) {
  clearTimeout(timer);
  current = id;
  if (!id) return;
  const d = await api('/api/company-dive/' + id);
  const log = (d.log || []).map((l) => l.at.slice(11, 19) + '  ' + l.stage.padEnd(8) + ' ' + l.msg).join('\\n');
  let html = '<h1>' + esc(d.company) + ' <span class="muted">(' + esc(d.country) + ')</span></h1>'
    + '<div class="stats muted"><span>Status: <b class="' + (d.status === 'failed' ? 'bad' : '') + '">' + esc(d.status) + '</b></span>'
    + '<span>Tavily: ' + d.tavily_calls + ' calls / ' + d.tavily_credits + ' credits</span><span>Brave: ' + d.brave_calls + '</span><span>LLM: ' + d.llm_calls + '</span></div>';
  if (d.error) html += '<p class="bad">' + esc(d.error) + '</p>';
  if (d.result && d.result.warnings && d.result.warnings.length) html += '<p class="bad">Finished with fallbacks:</p><ul>' + d.result.warnings.map((w) => '<li class="muted">' + esc(w) + '</li>').join('') + '</ul>';
  if (d.dossier) {
    const md = DOMPurify.sanitize(marked.parse(d.dossier));
    html += '<div class="dossier">' + md.replace(/\\[(\\d+)\\]/g, '<a class="cite" href="#src-$1" onclick="event.preventDefault();document.getElementById(\\'src-$1\\')?.scrollIntoView({block:\\'center\\'});">[$1]</a>') + '</div>';
  }
  const r = d.result;
  if (r) {
    const cited = new Set(r.facts.flatMap((f) => f.sources));
    html += '<details open><summary>Sources (' + cited.size + ' cited, ' + r.sources.length + ' found)</summary><ol class="sources">'
      + r.sources.filter((s) => cited.has(s.id)).map((s) => '<li id="src-' + s.id + '" value="' + s.id + '"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + '</a> <span class="muted">' + esc(s.url) + ' · ' + esc(s.found.join(', ')) + '</span></li>').join('') + '</ol></details>';
    html += '<details><summary>Tavily calls</summary><ol>' + r.tavily.map((c) => '<li>/' + esc(c.path) + ' — ' + esc(c.label) + ' · ' + c.credits + ' credits · ' + (c.ms / 1000).toFixed(1) + 's' + (c.ok ? '' : ' · <span class="bad">' + esc(c.note) + '</span>') + '</li>').join('') + '</ol></details>';
    html += '<details><summary>LLM calls (' + r.llm.length + ')</summary><ol>' + r.llm.map((u) => '<li>' + esc(u.step) + ' — ' + esc(u.engine || '') + ' · ' + (u.ms / 1000).toFixed(0) + 's</li>').join('') + '</ol></details>';
    html += '<details><summary>Facts (' + r.facts.length + ')</summary><ul>' + r.facts.map((f) => '<li><b>' + esc(f.topic) + '</b> ' + esc(f.fact) + ' <span class="muted">[' + f.sources.join(', ') + '] ' + esc(f.confidence) + '</span></li>').join('') + '</ul></details>';
  }
  if (r) html += peopleHtml(d);
  html += '<details ' + (d.status === 'running' || d.status === 'queued' ? 'open' : '') + '><summary>Log</summary><div class="log">' + esc(log) + '</div></details>';
  $('view').innerHTML = html;
  const peopleRunning = d.result && d.result.people && d.result.people.status === 'running';
  if (d.status === 'running' || d.status === 'queued' || peopleRunning) timer = setTimeout(() => { show(id); loadList(); }, 4000);
}

function peopleHtml(d) {
  const p = d.result.people;
  const canRun = (d.status === 'done' || d.status === 'partial') && !(p && p.status === 'running');
  let h = '<h2 style="margin-top:24px">People linked (Exa)</h2>';
  if (canRun) h += '<p><button onclick="findPeople(' + d.id + ')">' + (p ? 'Search Exa again' : 'Find linked people with Exa') + '</button> <span class="muted">Uses the saved research; nothing is re-run.</span></p>';
  if (!p) return h;
  const dollars = (p.exa || []).reduce((n, c) => n + (c.dollars || 0), 0);
  h += '<div class="stats muted"><span>Status: <b class="' + (p.status === 'failed' ? 'bad' : '') + '">' + esc(p.status) + '</b></span><span>Exa: ' + (p.exa || []).length + ' calls / $' + dollars.toFixed(3) + '</span><span>People: ' + (p.people || []).length + '</span></div>';
  if (p.error) h += '<p class="bad">' + esc(p.error) + '</p>';
  if ((p.people || []).length) {
    h += '<div class="dossier"><table><thead><tr><th>Name</th><th>Role</th><th>Link</th><th>Now?</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>'
      + p.people.map((x) => '<tr><td><b>' + esc(x.name) + '</b>' + (x.notes ? '<br><span class="muted">' + esc(x.notes) + '</span>' : '') + '</td><td>' + esc(x.role) + '</td><td>' + esc(x.relation) + '</td><td>' + (x.current === true ? 'yes' : x.current === false ? 'former' : '?') + '</td><td>' + esc(x.confidence) + '</td><td>'
        + (x.evidence || []).map((e) => '<a href="' + esc(e.url) + '" target="_blank" rel="noopener" title="' + esc(e.quote) + '">' + esc(e.url.replace(/^https?:\\/\\/(www\\.)?/, '').slice(0, 48)) + '</a>').join('<br>') + '</td></tr>').join('')
      + '</tbody></table></div>';
  }
  if ((p.rejected || []).length) h += '<details><summary>Rejected lookalikes (' + p.rejected.length + ')</summary><ul>' + p.rejected.map((x) => '<li>' + esc(x.name) + ' <span class="muted">' + esc(x.reason) + '</span></li>').join('') + '</ul></details>';
  if ((p.warnings || []).length) h += '<p class="bad">Finished with fallbacks:</p><ul>' + p.warnings.map((w) => '<li class="muted">' + esc(w) + '</li>').join('') + '</ul>';
  h += '<details ' + (p.status === 'running' ? 'open' : '') + '><summary>People log</summary><div class="log">' + esc((p.log || []).map((l) => l.at.slice(11, 19) + '  ' + l.msg).join('\\n')) + '</div></details>';
  return h;
}

async function findPeople(id) {
  const out = await api('/api/company-dive/' + id + '/people', { method: 'POST' });
  if (out.error) alert(out.error);
  show(id);
}

$('f').onsubmit = async (e) => {
  e.preventDefault();
  const out = await api('/api/company-dive', { method: 'POST', body: JSON.stringify({ company: $('company').value, country: $('country').value }) });
  if (out.id) location.hash = '#' + out.id;
  loadList();
};
window.onhashchange = () => { show(Number(location.hash.slice(1)) || 0); loadList(); };
loadList(); show(current);
</script>
</body>
</html>`;
