// The public company-dive report at /d/:publicId.
//
// One URL for the whole life of a report. While the research runs, it shows the
// stages and the live log, polling /d/:publicId/data every few seconds. Once the
// dossier is written it renders the report in place; the people step can still
// be finishing, and its section fills in when it does. The design is its own,
// not the operator console's: a reading page, built for phones first.
//
// The client script and styles are String.raw so their backslashes and regexes
// reach the browser untouched; the only interpolation is the data blob.

type View = Record<string, any> | null;

const STAGES: Array<[string, string]> = [
  ['discover', 'Discovering sources'],
  ['triage', 'Sorting what is relevant'],
  ['read', 'Reading pages'],
  ['analyse', 'Analysing'],
  ['fill', 'Filling gaps'],
  ['reflect', 'Double-checking'],
  ['write', 'Writing the report'],
  ['people', 'Finding linked people'],
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

const CSS = String.raw`
:root {
  --paper:#fbfaf7; --card:#ffffff; --ink:#16181d; --muted:#5f6571; --faint:#8a8f99; --line:#e6e2d9;
  --accent:#0e6b5c; --accent-ink:#0b5649; --accent-soft:#e2f0ec; --warn:#8a5300; --warn-soft:#fbf0dc; --bad:#b42318; --bad-soft:#fde8e6;
  --shadow:0 1px 2px rgba(22,24,29,.04), 0 8px 24px rgba(22,24,29,.06);
  --serif:"Newsreader", Georgia, "Times New Roman", serif;
  --sans:"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper:#111315; --card:#181b1f; --ink:#ecebe6; --muted:#a9aeb7; --faint:#7d838d; --line:#2a2e34;
    --accent:#5cc8b2; --accent-ink:#7fd8c6; --accent-soft:#16302b; --warn:#f0b45e; --warn-soft:#33270f; --bad:#ff8a7a; --bad-soft:#3a1714;
    --shadow:none; color-scheme: dark;
  }
}
* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; scroll-behavior:smooth; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.65 var(--sans); }
a { color:var(--accent-ink); text-underline-offset:2px; }
.wrap { max-width:1180px; margin:0 auto; padding:0 20px; }

/* masthead */
.mast { border-bottom:1px solid var(--line); background:var(--card); }
.mast .wrap { display:flex; align-items:center; justify-content:space-between; gap:12px; height:56px; }
.brand { font:600 13px/1 var(--sans); letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.brand b { color:var(--accent); }
.mast .actions { display:flex; gap:8px; }
.btn { font:500 13px/1 var(--sans); padding:9px 12px; border-radius:8px; border:1px solid var(--line); background:var(--paper); color:var(--ink); cursor:pointer; text-decoration:none; }
.btn:hover { border-color:var(--faint); }

/* hero */
.hero { padding:44px 0 28px; }
.kicker { font:600 12px/1 var(--sans); letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin:0 0 14px; }
h1.title { font:600 clamp(30px, 5vw, 48px)/1.08 var(--serif); letter-spacing:-.01em; margin:0 0 12px; }
.sub { color:var(--muted); font-size:15px; margin:0 0 18px; }
.pills { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none; }
.pills li { font:500 13px/1 var(--sans); padding:8px 11px; border-radius:999px; background:var(--card); border:1px solid var(--line); color:var(--muted); }
.pills li b { color:var(--ink); font-weight:600; }

/* layout */
.layout { display:grid; grid-template-columns:220px minmax(0, 1fr); gap:56px; padding:8px 0 80px; }
.toc { position:sticky; top:24px; align-self:start; font-size:14px; }
.toc p { font:600 11px/1 var(--sans); letter-spacing:.12em; text-transform:uppercase; color:var(--faint); margin:6px 0 12px; }
.toc a { display:block; padding:6px 0 6px 12px; border-left:2px solid var(--line); color:var(--muted); text-decoration:none; line-height:1.35; }
.toc a:hover, .toc a.on { color:var(--ink); border-left-color:var(--accent); }
.toc-mobile { display:none; margin:0 0 24px; border:1px solid var(--line); border-radius:12px; background:var(--card); }
.toc-mobile summary { padding:14px 16px; font-weight:600; cursor:pointer; list-style:none; }
.toc-mobile summary::-webkit-details-marker { display:none; }
.toc-mobile summary::after { content:"+"; float:right; color:var(--faint); }
.toc-mobile[open] summary::after { content:"–"; }
.toc-mobile nav { padding:0 16px 12px; }
.toc-mobile a { display:block; padding:8px 0; border-top:1px solid var(--line); color:var(--ink); text-decoration:none; }
main { max-width:760px; min-width:0; }

/* prose */
.prose h2 { font:600 26px/1.2 var(--serif); margin:52px 0 14px; padding-top:22px; border-top:1px solid var(--line); scroll-margin-top:20px; }
.prose h2:first-child { margin-top:0; }
.prose h3 { font:600 18px/1.3 var(--sans); margin:28px 0 10px; }
.prose p, .prose li { color:var(--ink); }
.prose p.lede { font:400 20px/1.55 var(--serif); color:var(--ink); margin:0 0 8px; }
.prose ul, .prose ol { padding-left:22px; }
.prose li { margin:4px 0; }
.prose strong { font-weight:600; }
.prose blockquote { margin:18px 0; padding:2px 18px; border-left:3px solid var(--accent); color:var(--muted); }
.table-wrap { overflow-x:auto; margin:18px 0; border:1px solid var(--line); border-radius:12px; background:var(--card); -webkit-overflow-scrolling:touch; }
.prose table { border-collapse:collapse; width:100%; min-width:520px; font-size:14px; }
.prose th { text-align:left; font:600 11px/1.3 var(--sans); letter-spacing:.06em; text-transform:uppercase; color:var(--muted); background:var(--paper); padding:10px 12px; border-bottom:1px solid var(--line); }
.prose td { padding:10px 12px; border-top:1px solid var(--line); vertical-align:top; }
.prose tr:first-child td { border-top:0; }
sup.cite { line-height:0; }
sup.cite a { display:inline-block; font:600 10px/1 var(--sans); padding:3px 5px; margin-left:2px; border-radius:6px; background:var(--accent-soft); color:var(--accent-ink); text-decoration:none; vertical-align:2px; }
sup.cite a:hover { background:var(--accent); color:#fff; }

/* people */
.people { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; margin:16px 0; }
.person { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; box-shadow:var(--shadow); }
.person h4 { font:600 18px/1.25 var(--serif); margin:0 0 4px; }
.person .role { color:var(--muted); font-size:14px; margin:0 0 10px; line-height:1.4; }
.tags { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 10px; }
.tag { font:600 11px/1 var(--sans); letter-spacing:.04em; text-transform:uppercase; padding:5px 8px; border-radius:6px; background:var(--accent-soft); color:var(--accent-ink); }
.tag.former { background:var(--warn-soft); color:var(--warn); }
.tag.conf-low { background:var(--bad-soft); color:var(--bad); }
.tag.plain { background:var(--paper); color:var(--muted); border:1px solid var(--line); }
.person .ev { font-size:13px; margin:0; padding:0; list-style:none; }
.person .ev a { color:var(--muted); word-break:break-all; }
.note { font-size:13px; color:var(--muted); }

/* sources */
.sources { font-size:14px; padding-left:0; list-style:none; counter-reset:none; }
.sources li { display:grid; grid-template-columns:40px 1fr; gap:6px; padding:8px 0; border-top:1px solid var(--line); scroll-margin-top:20px; }
.sources li:target { background:var(--accent-soft); border-radius:8px; }
.sources .n { font:600 12px/1.6 var(--sans); color:var(--faint); text-align:right; padding-right:6px; }
.sources a { color:var(--ink); text-decoration:none; }
.sources a:hover { text-decoration:underline; }
.sources .host { display:block; color:var(--faint); font-size:12px; word-break:break-all; }
.foot { margin-top:56px; padding-top:20px; border-top:1px solid var(--line); color:var(--faint); font-size:13px; }

/* generating */
.gen { max-width:680px; margin:40px auto 80px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; box-shadow:var(--shadow); }
.gen h1.title { font-size:clamp(26px, 5vw, 38px); }
.eta { color:var(--muted); margin:0 0 22px; }
.bar { height:6px; background:var(--line); border-radius:99px; overflow:hidden; margin:0 0 22px; }
.bar i { display:block; height:100%; width:4%; background:var(--accent); border-radius:99px; transition:width .6s ease; }
.steps { list-style:none; padding:0; margin:0 0 24px; display:grid; gap:2px; }
.steps li { display:flex; align-items:center; gap:12px; padding:9px 0; color:var(--faint); font-size:15px; }
.steps .dot { width:22px; height:22px; flex:none; border-radius:50%; border:2px solid var(--line); display:grid; place-items:center; font:700 12px/1 var(--sans); }
.steps li.done { color:var(--ink); }
.steps li.done .dot { background:var(--accent); border-color:var(--accent); color:#fff; }
.steps li.now { color:var(--ink); font-weight:600; }
.steps li.now .dot { border-color:var(--accent); border-top-color:transparent; animation:spin 0.9s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.logbox { background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:12px 14px; max-height:260px; overflow:auto; font:12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:var(--muted); white-space:pre-wrap; word-break:break-word; }
.logbox b { color:var(--ink); font-weight:600; }
.livehead { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin:0 0 8px; font-size:13px; color:var(--faint); }
.pulse { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--accent); margin-right:6px; animation:pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity:.25; } }
.alert { padding:14px 16px; border-radius:12px; background:var(--bad-soft); color:var(--bad); margin:0 0 18px; }
.pending { padding:16px; border:1px dashed var(--line); border-radius:12px; color:var(--muted); }

@media (max-width: 960px) {
  .layout { grid-template-columns:minmax(0, 1fr); gap:0; }
  .toc { display:none; }
  .toc-mobile { display:block; }
  main { max-width:none; }
}
@media (max-width: 560px) {
  body { font-size:15.5px; }
  .wrap { padding:0 16px; }
  .hero { padding:28px 0 18px; }
  .prose p.lede { font-size:18px; }
  .prose h2 { font-size:22px; margin-top:40px; }
  .card { padding:20px; border-radius:14px; }
  .gen { margin:20px auto 48px; }
  .mast .btn.print { display:none; }
}
@media print {
  .mast, .toc, .toc-mobile { display:none !important; }
  body { background:#fff; }
  .layout { display:block; }
  .person { box-shadow:none; break-inside:avoid; }
  .prose h2 { break-after:avoid; }
}
`;

const SCRIPT = String.raw`
(function () {
  var data = JSON.parse(document.getElementById('initial').textContent || 'null');
  var publicId = document.body.getAttribute('data-id');
  var STAGES = JSON.parse(document.getElementById('stages').textContent);
  var root = document.getElementById('root');
  var timer = 0, startedView = Date.now(), renderedReport = false, peopleDone = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function time(s) { try { return new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return ''; } }
  function finished(d) { return d.status === 'done' || d.status === 'partial' || d.status === 'failed'; }
  function slug(s, i) { return 's-' + i + '-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

  function stageIndex(stage) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i][0] === stage) return i;
    return 0;
  }

  // ---- generating ----------------------------------------------------------
  function renderGenerating(d) {
    var idx = d.status === 'queued' ? -1 : stageIndex(d.stage);
    var pct = d.status === 'queued' ? 3 : Math.max(6, Math.round(((idx + 0.5) / STAGES.length) * 100));
    var steps = STAGES.map(function (s, i) {
      var cls = i < idx ? 'done' : i === idx ? 'now' : '';
      return '<li class="' + cls + '"><span class="dot">' + (i < idx ? '&#10003;' : '') + '</span>' + esc(s[1]) + '</li>';
    }).join('');
    var lines = (d.log || []).slice(-60).map(function (l) { return '<b>' + esc(time(l.at)) + '</b>  ' + esc(l.msg); }).join('\n');
    var started = d.created_at ? Math.max(0, Math.round((Date.now() - Date.parse(d.created_at)) / 60000)) : 0;
    root.innerHTML =
      '<div class="wrap gen"><div class="card">' +
      '<p class="kicker">' + (d.status === 'failed' ? 'Report failed' : 'Generating report') + '</p>' +
      '<h1 class="title">' + esc(d.company) + '</h1>' +
      (d.status === 'failed'
        ? '<div class="alert">' + esc(d.error || 'The research stopped before the report was written.') + '</div>'
        : '<p class="eta">' + (d.status === 'queued' ? 'Waiting for the research slot. ' : '') + 'This usually takes 5–10 minutes' + (started ? ' (started ' + started + ' min ago)' : '') + '. This page updates by itself, so you can leave it open or come back to the same link.</p>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<ol class="steps">' + steps + '</ol>') +
      '<div class="livehead"><span>' + (finished(d) ? 'Log' : '<span class="pulse"></span>Live log') + '</span><span>' + (d.log && d.log.length ? 'updated ' + esc(time(d.log[d.log.length - 1].at)) : '') + '</span></div>' +
      '<div class="logbox" id="logbox">' + (lines || 'Starting…') + '</div>' +
      '</div></div>';
    var box = document.getElementById('logbox');
    if (box) box.scrollTop = box.scrollHeight;
    document.title = (d.status === 'failed' ? 'Failed: ' : 'Generating: ') + d.company;
  }

  // ---- report --------------------------------------------------------------
  function citeNodes(container, ids) {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) if (/\[\d+\]/.test(n.nodeValue) && !(n.parentNode.closest && n.parentNode.closest('a, code, pre'))) nodes.push(n);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment(), text = node.nodeValue, last = 0, m, re = /\[(\d+)\]/g;
      while ((m = re.exec(text))) {
        if (!ids[m[1]]) continue;
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var sup = document.createElement('sup'); sup.className = 'cite';
        var a = document.createElement('a'); a.href = '#src-' + m[1]; a.textContent = m[1]; a.title = ids[m[1]];
        sup.appendChild(a); frag.appendChild(sup); last = re.lastIndex;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function peopleSection(d) {
    var p = d.people;
    var h = '<h2 id="people">People linked to the company</h2>';
    if (!p || p.status === 'running') {
      return h + '<div class="pending"><span class="pulse"></span>Still searching for people linked to the company. This section fills in by itself.</div>';
    }
    if (!(p.people || []).length) return h + '<p class="note">No linked people were found beyond those named in the report.</p>';
    h += '<p class="note">' + p.people.length + ' people tied to the company by their profiles, the company site or registries' + (p.rejected ? '; ' + p.rejected + ' people at companies with similar names were left out' : '') + '.</p>';
    h += '<div class="people">' + p.people.map(function (x) {
      var tags = '<span class="tag">' + esc(x.relation) + '</span>' +
        (x.current === false ? '<span class="tag former">former</span>' : x.current === true ? '<span class="tag plain">current</span>' : '') +
        (x.confidence === 'low' ? '<span class="tag conf-low">low confidence</span>' : x.confidence === 'medium' ? '<span class="tag plain">medium confidence</span>' : '');
      var ev = (x.evidence || []).slice(0, 3).map(function (e) { return '<li><a href="' + esc(e.url) + '" target="_blank" rel="noopener" title="' + esc(e.quote) + '">' + esc(host(e.url)) + '</a></li>'; }).join('');
      return '<div class="person"><h4>' + esc(x.name) + '</h4><p class="role">' + esc(x.role) + '</p><div class="tags">' + tags + '</div>' +
        (x.notes ? '<p class="note">' + esc(x.notes) + '</p>' : '') + (ev ? '<ul class="ev">' + ev + '</ul>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }

  function renderReport(d) {
    var md = String(d.dossier || '').replace(/^\s*#\s+[^\n]*\n/, '');
    var html = window.DOMPurify ? DOMPurify.sanitize(marked.parse(md)) : '<pre>' + esc(md) + '</pre>';
    var ids = {};
    (d.sources || []).forEach(function (s) { ids[s.id] = s.title || host(s.url); });
    var id = d.identity || {};
    var stats = d.stats || {};
    var peopleCount = d.people && d.people.people ? d.people.people.length : null;
    var reg = (id.registration_numbers || []).slice(0, 2).join(' / ');
    var sub = [id.legal_name && id.legal_name !== d.company ? id.legal_name : '', reg ? 'Reg. ' + reg : '', d.country].filter(Boolean).join(' · ');
    var pills = [
      '<li>Generated <b>' + esc(fmtDate(d.finished_at || d.created_at)) + '</b></li>',
      stats.facts ? '<li><b>' + stats.facts + '</b> facts</li>' : '',
      stats.sources_cited ? '<li><b>' + stats.sources_cited + '</b> sources cited</li>' : '',
      peopleCount != null ? '<li><b>' + peopleCount + '</b> people linked</li>' : '',
      d.status === 'partial' ? '<li>Some steps used fallbacks</li>' : '',
    ].join('');

    root.innerHTML =
      '<header class="hero wrap"><p class="kicker">Company dossier</p><h1 class="title">' + esc(id.legal_name || d.company) + '</h1>' +
      (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '<ul class="pills">' + pills + '</ul></header>' +
      '<div class="wrap layout"><aside class="toc" id="toc"></aside><main>' +
      '<details class="toc-mobile" id="tocm"><summary>Contents</summary><nav></nav></details>' +
      '<article class="prose" id="prose">' + html + '</article>' +
      '<section class="prose" id="people-wrap">' + peopleSection(d) + '</section>' +
      '<section class="prose"><h2 id="sources">Sources</h2><ol class="sources">' +
      (d.sources || []).map(function (s) { return '<li id="src-' + s.id + '"><span class="n">' + s.id + '</span><span><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || host(s.url)) + '</a><span class="host">' + esc(host(s.url)) + '</span></span></li>'; }).join('') +
      '</ol></section>' +
      '<p class="foot">Researched from public sources with Brave, Tavily' + (stats.tavily_calls ? ' (' + stats.tavily_calls + ' calls)' : '') + (d.people && d.people.exa_calls ? ' and Exa (' + d.people.exa_calls + ' calls)' : '') + '; written by an AI model and cited to its sources. Check anything important against the source before relying on it.</p>' +
      '</main></div>';

    var prose = document.getElementById('prose');
    var first = prose.querySelector('p');
    if (first && first === prose.firstElementChild) first.className = 'lede';
    prose.querySelectorAll('table').forEach(function (t) {
      var w = document.createElement('div'); w.className = 'table-wrap'; t.parentNode.insertBefore(w, t); w.appendChild(t);
    });
    prose.querySelectorAll('a').forEach(function (a) { a.target = '_blank'; a.rel = 'noopener'; });
    citeNodes(prose, ids);
    citeNodes(document.getElementById('people-wrap'), ids);
    buildToc();
    document.title = (id.legal_name || d.company) + ' — Company dossier';
    renderedReport = true;
    peopleDone = finished(d);
  }

  function buildToc() {
    var heads = document.querySelectorAll('main h2');
    var links = [];
    heads.forEach(function (h, i) { if (!h.id) h.id = slug(h.textContent, i); links.push('<a href="#' + h.id + '">' + esc(h.textContent) + '</a>'); });
    document.getElementById('toc').innerHTML = '<p>Contents</p>' + links.join('');
    document.querySelector('#tocm nav').innerHTML = links.join('');
    document.querySelectorAll('#tocm nav a').forEach(function (a) { a.addEventListener('click', function () { document.getElementById('tocm').open = false; }); });
    if ('IntersectionObserver' in window) {
      var tocLinks = document.querySelectorAll('#toc a');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          tocLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); });
        });
      }, { rootMargin: '0px 0px -70% 0px' });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  // ---- loop ----------------------------------------------------------------
  function render(d) {
    if (!d) { root.innerHTML = '<div class="wrap gen"><div class="card"><p class="kicker">Not found</p><h1 class="title">This report does not exist</h1><p class="eta">Check the link. Report links are the full address you were given.</p></div></div>'; return; }
    if (d.dossier) {
      if (!renderedReport) renderReport(d);
      else if (!peopleDone) {
        var w = document.getElementById('people-wrap');
        if (w) { w.innerHTML = peopleSection(d); buildToc(); var ids = {}; (d.sources || []).forEach(function (s) { ids[s.id] = s.title; }); citeNodes(w, ids); }
        peopleDone = finished(d);
        var pc = d.people && d.people.people ? d.people.people.length : null;
        if (peopleDone && pc != null) { var pills = document.querySelector('.pills'); if (pills && !/people linked/.test(pills.textContent)) pills.insertAdjacentHTML('beforeend', '<li><b>' + pc + '</b> people linked</li>'); }
      }
    } else {
      renderGenerating(d);
    }
    if (!finished(d)) timer = setTimeout(poll, 4000);
  }

  function poll() {
    fetch('/d/' + publicId + '/data', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { data = d; render(d); })
      .catch(function () { timer = setTimeout(poll, 8000); });
  }

  document.getElementById('copy').addEventListener('click', function () {
    var b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1600); }, function () { prompt('Copy this link', location.href); });
  });
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  render(data);
})();
`;

export function reportPage(view: View, publicId: string): string {
  // </script> inside the data would end the tag early.
  const blob = JSON.stringify(view).replace(/</g, '\\u003c');
  const title = view ? (view.dossier ? `${view.identity?.legal_name || view.company} — Company dossier` : `Generating: ${view.company}`) : 'Report not found';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<style>${CSS}</style>
</head>
<body data-id="${escapeHtml(publicId)}">
<div class="mast"><div class="wrap"><span class="brand"><b>Eternalgy</b> · Company dossier</span><span class="actions"><button class="btn" id="copy">Copy link</button><button class="btn print" id="print">Print / PDF</button></span></div></div>
<div id="root"></div>
<script type="application/json" id="initial">${blob}</script>
<script type="application/json" id="stages">${JSON.stringify(STAGES)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}
