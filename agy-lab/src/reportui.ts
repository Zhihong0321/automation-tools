import type { PublishedReport } from './reportdb.ts';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

const arr = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[] : [];

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())) : [];

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const value = (row: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) if (row[key] != null && row[key] !== '') return String(row[key]);
  return '';
};

const reportDate = (report: PublishedReport): string => {
  const raw = report.completed_at ?? report.updated_at ?? report.created_at;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 'Undated' : new Intl.DateTimeFormat('en', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
};

const rank = (n: unknown): string => String(n ?? '—').padStart(2, '0');

function link(url: unknown, label: string, className = 'text-link'): string {
  const href = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
  return href ? `<a class="${className}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}<span aria-hidden="true">↗</span></a>` : '';
}

/**
 * Wire the per-company Research buttons on a shared market scan.
 *
 * Posts to the report-scoped public route rather than /api/company-research:
 * this page carries no token by design, and the report's own id is what proves
 * the caller may research the businesses listed in it.
 *
 * A dossier takes minutes, so the button hands over a link the moment the run
 * is accepted instead of pretending to wait. A company already being researched
 * comes back 200 with the existing report — the button then points at that,
 * which is why a second click is harmless.
 */
/**
 * The evidence grade, shown where the reader can act on it.
 *
 * `classifyEvidence` stopped deleting weakly-sourced rows and started tagging
 * them instead -- but the page rendered every row identically, so the judgement
 * the grade exists to support never actually reached the reader. A `domain_only`
 * row cites a homepage rather than a page that states the fact. It is worth
 * publishing, and it is worth publishing as weaker.
 *
 * Rows without the field (candidate people carry `verification_status`, and
 * conflicts are not evidence rows) render exactly as before.
 */
const GRADES: Record<string, { en: string; zh: string; weight: string }> = {
  direct_page: { en: 'Direct page', zh: '直接页面', weight: 'strong' },
  domain_only: { en: 'Domain only', zh: '仅域名', weight: 'weak' },
  insecure_page: { en: 'Direct page · http', zh: '直接页面 · http', weight: 'weak' },
  insecure_domain: { en: 'Domain only · http', zh: '仅域名 · http', weight: 'weak' },
  search_result: { en: 'Search result', zh: '搜索结果', weight: 'thin' },
  unsourced: { en: 'Unsourced', zh: '无来源', weight: 'thin' },
};

/**
 * The zh-CN translation pass rewrites some of these values into Chinese -- 7 of
 * 39 on run `4RIySbBlPLYHJRlJ_KQ8`. That is a defect in the translator, which
 * should leave an enum alone, but the reader should not lose a badge over it, so
 * the translated forms map back to their canonical grade.
 */
const GRADE_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(GRADES).flatMap(([key, g]) => [[g.zh, key], [g.en, key]]),
);

function grade(row: Record<string, unknown>, zh = false): string {
  const raw = value(row, 'evidence_strength');
  if (!raw) return '';
  const found = GRADES[raw] ?? GRADES[GRADE_ALIASES[raw] ?? ''];
  // An unrecognised grade is still information the research produced. Show it
  // plainly rather than dropping the row's only sourcing signal.
  if (!found) return `<span class="grade">${esc(raw)}</span>`;
  return `<span class="grade ${found.weight}">${esc(zh ? found.zh : found.en)}</span>`;
}

/**
 * The evidence tally, stated on the report itself.
 *
 * The ledger computes this, but Round 04's synthesis returns its own empty
 * `validation` object and that output becomes the published final -- so the
 * count never reached the page. It is recomputed from the published rows here,
 * which is both simpler and truer: it counts what the reader is actually
 * looking at rather than what an earlier stage said it would be.
 */
function evidenceTally(collections: Record<string, unknown>[][], zh = false): string {
  const tally = new Map<string, number>();
  for (const rows of collections) {
    for (const row of rows) {
      const raw = value(row, 'evidence_strength');
      if (!raw) continue;
      const key = GRADES[raw] ? raw : GRADE_ALIASES[raw] ?? raw;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  if (!tally.size) return '';
  const order = Object.keys(GRADES);
  const items = [...tally.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
    .map(([key, n]) => {
      const found = GRADES[key];
      const label = found ? (zh ? found.zh : found.en) : key;
      return `<span class="grade ${found?.weight ?? ''}">${n} · ${esc(label)}</span>`;
    }).join('');
  const note = zh
    ? '每一行研究结果均予保留并标注来源强度；“直接页面”指链接直达陈述该事实的页面，“仅域名”指仅链接到主页。'
    : 'Every row the research returned is kept and labelled. Direct page links to a page stating the fact; domain only links just to a homepage.';
  return `<section class="breakdown"><div class="breakdown-label">${zh ? '证据强度' : 'Evidence quality'}</div><div><div class="breakdown-badges">${items}</div><p class="breakdown-note">${esc(note)}</p></div></section>`;
}

function researchScript(publicId: string): string {
  return `<script>
(function(){
  var id=${JSON.stringify(publicId)};
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('button.research');
    if(!b||b.disabled)return;
    var company=b.getAttribute('data-company');
    if(!company)return;
    b.disabled=true;var was=b.textContent;b.textContent='Starting\\u2026';
    fetch('/public/reports/'+id+'/research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company})})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j})})
      .then(function(j){
        var link=j.report&&j.report.view_url;
        if(!link){throw new Error('no report link returned')}
        var a=document.createElement('a');
        a.className='button';a.href=link;a.textContent='Open dossier \\u2192';
        a.setAttribute('target','_blank');a.setAttribute('rel','noopener');
        b.replaceWith(a);
      })
      .catch(function(e){b.disabled=false;b.textContent=was;alert('Could not start research: '+e.message)});
  });
})();
</script>`;
}

function shell(report: PublishedReport, body: string): string {
  const active = report.status === 'queued' || report.status === 'running';
  const isSearch = report.report_type === 'business_search';
  const isPerson = report.report_type === 'person_research';
  const statusLabel = report.status === 'completed' ? 'Research complete'
    : report.status === 'partial' ? 'Complete · noted gaps'
    : report.status === 'failed' ? 'Research failed'
    : report.status;
  // How many of the four round pips are lit. Driven by status because this page
  // never loads round_status. `failed` lights none: the honest floor for a run
  // that produced nothing is nothing, and it used to light two.
  const roundsLit = report.status === 'failed' ? 0
    : report.status === 'completed' ? 4
    : report.status === 'partial' ? 3
    : report.status === 'queued' ? 1 : 2;
  const reportLabel = isSearch ? 'Market scan' : isPerson ? 'VIP brief' : 'Company dossier';
  // A re-researched company keeps every earlier dossier. Say which pass this is,
  // in the kicker and the masthead folio, so two open tabs are never ambiguous.
  const version = Number(report.version) > 1 ? 'V' + Number(report.version) : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f3f0e8"><title>${esc(report.title ?? 'Business intelligence report')}</title>
<style>
:root{--paper:#f3f0e8;--sheet:#fbfaf6;--ink:#151515;--muted:#6b6a65;--faint:#9c9a92;--line:#cbc7bc;--soft:#e8e4da;--accent:#2457ff;--accent-soft:#e8edff;--danger:#a43b31;--warning:#a06b00;--display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:Inter,"Helvetica Neue",Arial,sans-serif;--mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}html{background:var(--paper);scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--paper);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}body.company-research{--accent:#7d42f5;--accent-soft:#eee7ff}
a{color:inherit}.wrap{max-width:1180px;margin:0 auto;padding:0 30px 84px}.mast{height:74px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ink)}.wordmark{display:flex;align-items:center;gap:12px;font:700 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase}.mark{display:grid;place-items:center;width:29px;height:29px;background:var(--ink);color:var(--sheet);font:800 10px/1 var(--sans)}.folio{font:500 10px/1.3 var(--mono);color:var(--muted);text-align:right;text-transform:uppercase;letter-spacing:.07em}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:40px;padding:68px 0 54px;border-bottom:1px solid var(--ink)}.kicker{display:flex;align-items:center;gap:10px;margin-bottom:18px;font:700 11px/1 var(--sans);text-transform:uppercase;letter-spacing:.16em;color:var(--accent)}.kicker:before{content:"";width:28px;height:2px;background:var(--accent)}.hero h1{max-width:880px;margin:0;font:400 clamp(44px,7vw,88px)/.91 var(--display);letter-spacing:-.055em;text-wrap:balance}.hero-copy{max-width:700px;margin:24px 0 0;font-size:16px;line-height:1.6;color:var(--muted)}.hero-meta{align-self:end;border-top:1px solid var(--ink);padding-top:13px}.status{display:flex;align-items:center;gap:9px;font:700 11px/1.2 var(--sans);letter-spacing:.08em;text-transform:uppercase}.status-dot{width:8px;height:8px;border-radius:50%;background:#d1981d;box-shadow:0 0 0 4px rgba(209,152,29,.12)}.completed .status-dot,.partial .status-dot{background:#16815d;box-shadow:0 0 0 4px rgba(22,129,93,.12)}.failed .status-dot{background:var(--danger);box-shadow:0 0 0 4px rgba(164,59,49,.12)}.meta-line{margin-top:18px;display:grid;gap:7px;font:500 10px/1.2 var(--mono);color:var(--muted);text-transform:uppercase}.rounds{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:18px}.round{height:3px;background:var(--soft)}.round.on{background:var(--accent)}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--ink)}.metric{min-width:0;padding:28px 24px 24px 0}.metric+.metric{padding-left:24px;border-left:1px solid var(--line)}.metric strong{display:block;overflow:hidden;text-overflow:ellipsis;font:400 clamp(31px,4vw,50px)/.9 var(--display);letter-spacing:-.04em}.metric span{display:block;margin-top:10px;font:700 9px/1.2 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
.section{padding-top:58px}.section-head{display:grid;grid-template-columns:1fr minmax(180px,320px);align-items:end;gap:30px;margin-bottom:21px}.section h2{margin:0;font:400 clamp(28px,3vw,40px)/1 var(--display);letter-spacing:-.035em}.section-note{font-size:12px;line-height:1.45;color:var(--muted);text-align:right}.sheet{background:var(--sheet);border:1px solid var(--ink)}.empty,.message{padding:52px 24px;text-align:center;color:var(--muted)}.message.error{border:1px solid var(--danger);background:#fff2ef;color:#742920}.message.warning{border:1px solid #c38a24;background:#fff9e8;color:#684600}
.records{border-top:1px solid var(--ink)}.company{display:grid;grid-template-columns:64px minmax(210px,1.1fr) minmax(220px,1fr) minmax(240px,.9fr);gap:22px;align-items:start;padding:28px 0;border-bottom:1px solid var(--line)}.record-no{font:500 12px/1 var(--mono);color:var(--accent)}.company h3,.person h3{margin:0;font:600 19px/1.18 var(--sans);letter-spacing:-.025em}.record-meta{margin-top:7px;font-size:12px;color:var(--muted)}.record-address{font-size:13px;color:var(--muted);max-width:380px}.record-contact{display:grid;gap:15px}.phone{font:500 16px/1.2 var(--mono);letter-spacing:-.035em}.actions{display:flex;gap:13px;align-items:center;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;background:var(--ink);border:1px solid var(--ink);color:var(--sheet);font:700 10px/1 var(--sans);text-decoration:none;text-transform:uppercase;letter-spacing:.1em;transition:background .18s,color .18s}.button:hover{background:var(--accent);border-color:var(--accent)}.text-link{display:inline-flex;align-items:center;gap:5px;padding:7px 0;border-bottom:1px solid currentColor;font:700 10px/1 var(--sans);text-decoration:none;text-transform:uppercase;letter-spacing:.09em}.text-link span{color:var(--accent)}.id-tag{font:500 9px/1 var(--mono);color:var(--faint);text-transform:uppercase}.button.research{background:var(--sheet);color:var(--ink);cursor:pointer}.button.research:hover{background:var(--accent);border-color:var(--accent);color:var(--sheet)}.button.research[disabled]{opacity:.55;cursor:default;background:var(--sheet);color:var(--ink);border-color:var(--line)}
.brief{display:grid;grid-template-columns:180px minmax(0,1fr);gap:40px;padding:36px 0;border-bottom:1px solid var(--ink)}.brief-label{font:700 10px/1.3 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}.brief p{max-width:800px;margin:0;font:400 clamp(20px,2.5vw,29px)/1.35 var(--display);letter-spacing:-.02em}
.contact-list{border-top:1px solid var(--ink)}.contact{display:grid;grid-template-columns:180px minmax(0,1fr) auto;align-items:center;gap:24px;min-height:96px;border-bottom:1px solid var(--line)}.label{font:700 10px/1.3 var(--sans);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}.contact-value{font:500 17px/1.3 var(--mono);word-break:break-word}.source{margin-top:7px;font-size:11px;color:var(--muted)}.source a{color:var(--accent);text-decoration:none;border-bottom:1px solid currentColor}
.people{border-top:1px solid var(--ink)}.person{display:grid;grid-template-columns:64px minmax(190px,.8fr) minmax(240px,1.2fr) auto;gap:22px;align-items:start;padding:25px 0;border-bottom:1px solid var(--line)}.priority{font:500 11px/1.3 var(--mono);color:var(--accent)}.role{margin-top:6px;font:700 11px/1.3 var(--sans);text-transform:uppercase;letter-spacing:.07em;color:var(--accent)}.person p{margin:0;color:var(--muted);font-size:13px}.signal-list{border-top:1px solid var(--ink)}.signal{display:grid;grid-template-columns:180px minmax(0,1fr);gap:24px;padding:24px 0;border-bottom:1px solid var(--line)}.date{font:600 11px/1.3 var(--mono);color:var(--accent);text-transform:uppercase}.signal strong{font-size:15px}.angles{counter-reset:angle;display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid var(--ink)}.angle{counter-increment:angle;position:relative;min-height:150px;padding:26px 28px 26px 62px;border-bottom:1px solid var(--line);font:400 18px/1.4 var(--display)}.angle:nth-child(odd){border-right:1px solid var(--line)}.angle:before{content:counter(angle,decimal-leading-zero);position:absolute;left:0;top:30px;font:500 10px/1 var(--mono);color:var(--accent)}
.foot{display:flex;justify-content:space-between;gap:20px;margin-top:72px;padding-top:18px;border-top:1px solid var(--ink);font:500 9px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.language-switch{display:inline-flex;gap:4px;margin:30px 0 -16px;padding:4px;border:1px solid var(--line);background:var(--sheet);border-radius:999px}.language-button{min-height:34px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:var(--muted);font:700 10px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.language-button[aria-pressed="true"]{background:var(--ink);color:var(--sheet)}.language-button:hover{color:var(--ink)}.language-button[aria-pressed="true"]:hover{color:var(--sheet)}
.grade{display:inline-block;margin-right:8px;padding:2px 8px;border:1px solid var(--line);border-radius:999px;font:700 9px/1.6 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap}.grade.strong{border-color:#16815d;color:#0f6247}.grade.weak{border-color:#a06b00;color:#8a5c00}.grade.thin{border-color:var(--danger);color:var(--danger)}.person p .grade{margin:0 0 0 6px}
.breakdown{display:grid;grid-template-columns:180px minmax(0,1fr);gap:40px;padding:26px 0;border-bottom:1px solid var(--ink)}.breakdown-label{font:700 10px/1.3 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}.breakdown-badges{display:flex;flex-wrap:wrap;gap:8px}.breakdown .grade{margin-right:0;font-size:10px;padding:4px 11px}.breakdown-note{max-width:640px;margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--muted)}@media(max-width:760px){.breakdown{grid-template-columns:1fr;gap:12px;padding:22px 0}}
:focus-visible{outline:2px solid var(--accent);outline-offset:4px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
@media(max-width:760px){.wrap{padding:0 18px 52px}.mast{height:60px}.folio{display:none}.hero{grid-template-columns:1fr;gap:30px;padding:42px 0 30px}.hero h1{font-size:clamp(43px,14vw,64px);line-height:.94}.hero-copy{font-size:14px;margin-top:18px}.hero-meta{align-self:auto}.meta-line{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric{padding:21px 15px 19px 0}.metric+.metric{padding-left:15px}.metric:nth-child(3){border-left:0;border-top:1px solid var(--line);padding-left:0}.metric:nth-child(4){border-top:1px solid var(--line)}.metric strong{font-size:35px}.section{padding-top:42px}.section-head{grid-template-columns:1fr;gap:8px}.section-note{text-align:left}.company{grid-template-columns:42px 1fr;gap:17px 12px;padding:24px 0}.record-address,.record-contact{grid-column:2}.actions{gap:12px}.button{min-height:46px;padding:0 18px}.brief{grid-template-columns:1fr;gap:14px;padding:28px 0}.brief p{font-size:23px}.contact{grid-template-columns:1fr auto;gap:7px 14px;padding:21px 0}.contact .label{grid-column:1/-1}.contact-value{font-size:15px}.people{border-top-color:var(--ink)}.person{grid-template-columns:38px 1fr;gap:14px 10px;padding:22px 0}.person p,.person .text-link{grid-column:2}.signal{grid-template-columns:1fr;gap:8px;padding:21px 0}.angles{grid-template-columns:1fr}.angle{min-height:auto;padding:22px 0 22px 42px}.angle:nth-child(odd){border-right:0}.language-switch{margin-top:22px}.language-button{min-height:38px;padding:0 16px}.foot{display:block;line-height:1.7}.foot span:last-child{display:block;margin-top:7px}}
</style></head><body class="${esc(report.report_type.replace('_', '-'))}"><main class="wrap">
<nav class="mast" aria-label="Report masthead"><div class="wordmark"><span class="mark">EE</span><span>Business intelligence</span></div><div class="folio">${esc(reportLabel)}${version ? ' · ' + version : ''}<br>${esc(report.public_id)}</div></nav>
<header class="hero"><div><div class="kicker">${esc(reportLabel)} · ${esc(reportDate(report))}${version ? ' · ' + version : ''}</div><h1>${esc(report.title ?? 'Research report')}</h1><p class="hero-copy">${active ? 'Research is in progress. This permanent report link refreshes as verified findings arrive.' : report.error ? esc(report.error) : isSearch ? 'A ranked field scan of relevant businesses, with direct routes to source listings and published contact points.' : 'A source-linked intelligence brief designed for qualification, outreach and informed decision-making.'}</p></div><aside class="hero-meta"><div class="status ${esc(report.status)}"><span class="status-dot"></span>${esc(statusLabel)}</div><div class="meta-line"><span>Issued ${esc(reportDate(report))}</span>${version ? `<span>Research pass ${esc(version)}</span>` : ''}<span>${isSearch ? 'Source / Google Maps' : 'Evidence / Public sources'}</span></div>${!isSearch ? `<div class="rounds" aria-label="Four research rounds">${[0, 1, 2, 3].map((i) => `<span class="round ${i < roundsLit ? 'on' : ''}"></span>`).join('')}</div>` : ''}</aside></header>
${body}<footer class="foot"><span>EE Business Intelligence · Confidential link</span><span>Evidence opens at its original public source</span></footer>
</main>${active ? '<script>setTimeout(()=>location.reload(),8000)</script>' : ''}${isSearch ? researchScript(report.public_id) : ''}</body></html>`;
}

export function notFoundPage(): string {
  const fake = { public_id: '', report_type: 'business_search', status: 'failed', title: 'Report not found', error: 'This report link is invalid or no longer available.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as PublishedReport;
  return shell(fake, '<section class="section"><div class="message error">Check that the complete report link was copied.</div></section>');
}

export function searchPage(report: PublishedReport, detail: { report?: Record<string, unknown>; companies?: Record<string, unknown>[] } | null): string {
  const request = obj(report.request);
  const scan = obj(detail?.report ?? report.result?.search);
  const companies = detail?.companies ?? arr(report.result?.companies);
  const keyword = value(request, 'keyword');
  const place = value(request, 'place', 'location');
  const stats = `<div class="metrics">
    <div class="metric"><strong>${esc(scan.found ?? companies.length ?? '—')}</strong><span>Businesses found</span></div>
    <div class="metric"><strong>${esc(companies.filter((c) => value(c, 'phone')).length)}</strong><span>Published phones</span></div>
    <div class="metric"><strong>${esc(companies.filter((c) => value(c, 'website')).length)}</strong><span>Direct websites</span></div>
    <div class="metric"><strong>${esc(place || 'Any')}</strong><span>Search geography</span></div>
  </div>`;
  const rows = companies.map((company, index) => {
    const name = value(company, 'name') || 'Unnamed business';
    const phone = value(company, 'phone');
    const rating = value(company, 'rating');
    const reviews = value(company, 'reviews');
    const website = value(company, 'website');
    const maps = value(company, 'maps_url', 'mapsUrl');
    const companyId = value(company, 'id');
    return `<article class="company"><div class="record-no">${esc(rank(company.rank ?? index + 1))}</div><div><h3>${esc(name)}</h3><div class="record-meta">${esc(value(company, 'category') || 'Business')}${rating ? ` · ★ ${esc(rating)}${reviews ? ` / ${esc(reviews)} reviews` : ''}` : ''}</div></div><div class="record-address">${esc(value(company, 'address') || 'Address not published')}</div><div class="record-contact">${phone ? `<div class="phone">${esc(phone)}</div>` : '<span class="record-meta">Phone not published</span>'}<div class="actions">${phone ? `<a class="button" href="tel:${esc(phone.replace(/[^+\d]/g, ''))}">Call now</a>` : ''}${link(website, 'Website')}${link(maps, 'Maps')}${companyId ? `<button class="button research" type="button" data-company="${esc(companyId)}" data-name="${esc(name)}">Research \u2192</button>` : ''}</div></div></article>`;
  }).join('');
  const body = report.status === 'failed'
    ? `<section class="section"><div class="message error">${esc(report.error ?? 'The search failed.')}</div></section>`
    : `${stats}<section class="section"><div class="section-head"><h2>${esc(keyword || 'Business')} directory</h2><span class="section-note">Ranked in the order returned by Google Maps. Each source opens independently.</span></div><div class="records">${rows || '<div class="empty">Waiting for businesses…</div>'}</div></section>`;
  return shell(report, body);
}

function chineseCompanyVersion(translated: Record<string, unknown>): string {
  const contacts = arr(translated.contacts);
  const people = arr(translated.people);
  const candidatePeople = arr(translated.candidate_people);
  const signals = arr(translated.signals ?? translated.business_signals);
  const conflicts = arr(translated.conflicts_and_unknowns);
  const outreach = strings(translated.outreach_angles);
  const summary = value(translated, 'summary', 'executive_summary');
  const contactRows = contacts.map((row) => {
    const raw = value(row, 'value_as_published', 'raw_value', 'value', 'normalized_value');
    const evidence = value(row, 'evidence_url', 'evidence', 'source_url');
    return `<div class="contact"><div class="label">${esc(value(row, 'purpose', 'channel', 'type') || '联系方式')}</div><div><div class="contact-value">${esc(raw)}</div><div class="source">${grade(row, true)}${esc(value(row, 'status', 'current_status', 'evidence_class'))}${evidence ? ` · <a href="${esc(evidence)}" target="_blank" rel="noopener">查看来源 ↗</a>` : ''}</div></div></div>`;
  }).join('');
  const peopleRows = people.map((row, i) => `<article class="person"><span class="priority">P${esc(rank(row.priority ?? i + 1))}</span><div><h3>${esc(value(row, 'name'))}</h3><div class="role">${esc(value(row, 'role', 'current_role', 'position'))}</div></div><p>${esc(value(row, 'relevance', 'domain', 'why_relevant'))}${grade(row, true)}</p>${link(value(row, 'role_url', 'source', 'evidence_url'), '来源')}</article>`).join('');
  const candidateRows = candidatePeople.map((row) => `<article class="person"><span class="priority">待核实</span><div><h3>${esc(value(row, 'name'))}</h3><div class="role">${esc(value(row, 'role', 'current_role'))}</div></div><p>${esc(value(row, 'verification_note', 'relevance'))}</p>${link(value(row, 'source_url'), '来源')}</article>`).join('');
  const signalRows = signals.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'date') || '当前')}</div><div><strong>${esc(value(row, 'fact', 'description', 'signal'))}</strong><div class="source">${grade(row, true)}${esc(value(row, 'evidence_class', 'type', 'source_class'))} ${link(value(row, 'evidence_url', 'evidence', 'source_url'), '来源')}</div></div></div>`).join('');
  const conflictRows = conflicts.map((row) => `<div class="signal"><div class="date">需核实</div><div><strong>${esc(value(row, 'issue', 'field'))}</strong><div class="source">${esc(value(row, 'details', 'status', 'note'))}</div></div></div>`).join('');
  let body = `<section class="section" lang="zh-CN"><div class="section-head"><h2>中文报告</h2><span class="section-note">与英文版对应的简体中文翻译；来源、ID 和联系方式保持原样。</span></div></section>`;
  body += evidenceTally([contacts, people, signals], true);
  if (summary) body += `<section class="brief" lang="zh-CN"><div class="brief-label">执行摘要</div><p>${esc(summary)}</p></section>`;
  body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>最佳联系渠道</h2><span class="section-note">仅展示经证据台账保留的联系方式。</span></div><div class="contact-list">${contactRows || '<div class="empty">暂无已验证的联系方式。</div>'}</div></section>`;
  body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>关键相关人员</h2><span class="section-note">当前职位均需有直接来源支持。</span></div><div class="people">${peopleRows || '<div class="empty">暂无已验证的相关人员。</div>'}</div></section>`;
  if (candidatePeople.length) body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>待核实人员线索</h2><span class="section-note">来自具名公开来源；在确认当前职位前请勿作为事实使用。</span></div><div class="people">${candidateRows}</div></section>`;
  if (outreach.length) body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>沟通切入点</h2><span class="section-note">根据已验证研究得出的对话建议。</span></div><div class="angles">${outreach.map((item) => `<div class="angle">${esc(item)}</div>`).join('')}</div></section>`;
  body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>业务动态</h2><span class="section-note">可能形成沟通理由的时效性证据。</span></div><div class="signal-list">${signalRows || '<div class="empty">暂无已验证的业务动态。</div>'}</div></section>`;
  if (conflictRows) body += `<section class="section" lang="zh-CN"><div class="section-head"><h2>冲突与未知项</h2></div><div class="message warning">${conflictRows}</div></section>`;
  return body;
}

export function companyPage(report: PublishedReport, chinese: Record<string, unknown> | null = null): string {
  const final = obj(report.result);
  const entity = obj(final.entity);
  const contacts = arr(final.contacts);
  const people = arr(final.people);
  const candidatePeople = arr(final.candidate_people);
  const signals = arr(final.signals ?? final.business_signals);
  const conflicts = arr(final.conflicts_and_unknowns);
  const outreach = strings(final.outreach_angles);
  const summary = value(final, 'summary', 'executive_summary');
  const autoPerson = obj(final.auto_person_research);
  const autoPersonReportId = /^[A-Za-z0-9_-]{20}$/.test(value(autoPerson, 'report_id')) ? value(autoPerson, 'report_id') : '';
  const stats = `<div class="metrics">
    <div class="metric"><strong>${contacts.length || '—'}</strong><span>Contact routes</span></div>
    <div class="metric"><strong>${people.length || '—'}</strong><span>Relevant people</span></div>
    <div class="metric"><strong>${signals.length || '—'}</strong><span>Business signals</span></div>
    <div class="metric"><strong>${esc(value(entity, 'rating', 'maps_rating') || '—')}</strong><span>Maps rating</span></div>
  </div>`;
  const contactRows = contacts.map((row) => {
    const raw = value(row, 'value_as_published', 'raw_value', 'value', 'normalized_value');
    const normalized = value(row, 'normalized_value');
    const evidence = value(row, 'evidence_url', 'evidence', 'source_url');
    const action = /@/.test(raw) ? `<a class="button" href="mailto:${esc(raw)}">Email</a>` : /\d/.test(raw) ? `<a class="button" href="tel:${esc((normalized || raw).replace(/[^+\d]/g, ''))}">Call</a>` : link(raw, 'Open', 'button');
    return `<div class="contact"><div class="label">${esc(value(row, 'purpose', 'channel', 'type') || 'Contact')}</div><div><div class="contact-value">${esc(raw)}</div><div class="source">${grade(row)}${esc(value(row, 'status', 'current_status', 'evidence_class'))}${evidence ? ` · <a href="${esc(evidence)}" target="_blank" rel="noopener">view evidence ↗</a>` : ''}</div></div>${action}</div>`;
  }).join('');
  const autoPersonName = value(autoPerson, 'person_name').trim().toLocaleLowerCase();
  const peopleRows = people.map((row, i) => {
    const personName = value(row, 'name');
    const isAutoPerson = Boolean(autoPersonReportId) && personName.trim().toLocaleLowerCase() === autoPersonName;
    const vipLink = isAutoPerson ? ` <a class="button" href="/r/${esc(autoPersonReportId)}">Person research <span aria-hidden="true">↗</span></a>` : '';
    return `<article class="person"><span class="priority">P${esc(rank(row.priority ?? i + 1))}</span><div><h3>${esc(personName)}${vipLink}</h3><div class="role">${esc(value(row, 'role', 'current_role', 'position'))}</div></div><p>${esc(value(row, 'relevance', 'domain', 'why_relevant'))}${grade(row)}</p>${link(value(row, 'role_url', 'source', 'evidence_url'), 'Evidence')}</article>`;
  }).join('');
  const candidateRows = candidatePeople.map((row) => `<article class="person"><span class="priority">VERIFY</span><div><h3>${esc(value(row, 'name'))}</h3><div class="role">${esc(value(row, 'role', 'current_role'))}</div></div><p>${esc(value(row, 'verification_note', 'relevance'))}</p>${link(value(row, 'source_url'), 'Source')}</article>`).join('');
  const signalRows = signals.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'date') || 'Current')}</div><div><strong>${esc(value(row, 'fact', 'description', 'signal'))}</strong><div class="source">${grade(row)}${esc(value(row, 'evidence_class', 'type', 'source_class'))} ${link(value(row, 'evidence_url', 'evidence', 'source_url'), 'Source')}</div></div></div>`).join('');
  const conflictRows = conflicts.map((row) => `<div class="signal"><div class="date">Review</div><div><strong>${esc(value(row, 'issue', 'field'))}</strong><div class="source">${esc(value(row, 'details', 'status', 'note'))}</div></div></div>`).join('');
  let body = stats + evidenceTally([contacts, people, signals]);
  if (summary) body += `<section class="brief"><div class="brief-label">Executive brief</div><p>${esc(summary)}</p></section>`;
  if (report.status === 'failed') body += `<section class="section"><div class="message error">${esc(report.error ?? 'Deep research failed.')}</div></section>`;
  else if (!contacts.length && !people.length && !candidatePeople.length && report.status !== 'completed' && report.status !== 'partial') body += '<section class="section"><div class="empty">The research rounds are running. Verified findings will appear here automatically.</div></section>';
  else {
    body += `<section class="section"><div class="section-head"><h2>Best contact routes</h2><span class="section-note">Only channels retained by the evidence ledger are shown.</span></div><div class="contact-list">${contactRows || '<div class="empty">No validated contacts.</div>'}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Decision-relevant people</h2><span class="section-note">Current roles require a direct supporting source.</span></div><div class="people">${peopleRows || '<div class="empty">No validated people.</div>'}</div></section>`;
    if (candidatePeople.length) body += `<section class="section"><div class="section-head"><h2>People to verify</h2><span class="section-note">Named public-source leads. Confirm their current role before treating it as fact or starting VIP research.</span></div><div class="people">${candidateRows}</div></section>`;
    if (outreach.length) body += `<section class="section"><div class="section-head"><h2>Outreach angles</h2><span class="section-note">Conversation starters derived from the validated research set.</span></div><div class="angles">${outreach.map((item) => `<div class="angle">${esc(item)}</div>`).join('')}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Business signals</h2><span class="section-note">Time-sensitive evidence that may create a reason to engage.</span></div><div class="signal-list">${signalRows || '<div class="empty">No validated signals.</div>'}</div></section>`;
    if (conflictRows) body += `<section class="section"><div class="section-head"><h2>Conflicts and unknowns</h2></div><div class="message warning">${conflictRows}</div></section>`;
  }
  if (chinese) {
    const englishBody = body;
    const chineseBody = chineseCompanyVersion(chinese);
    body = `<div class="language-switch" role="group" aria-label="Report language"><button class="language-button" type="button" data-report-language="en" aria-pressed="true">English</button><button class="language-button" type="button" data-report-language="zh-CN" aria-pressed="false">中文</button></div><div data-report-language-panel="en">${englishBody}</div><div data-report-language-panel="zh-CN" hidden>${chineseBody}</div><script>(function(){const buttons=document.querySelectorAll('[data-report-language]');const panels=document.querySelectorAll('[data-report-language-panel]');function select(language){buttons.forEach((button)=>button.setAttribute('aria-pressed',String(button.getAttribute('data-report-language')===language)));panels.forEach((panel)=>{panel.hidden=panel.getAttribute('data-report-language-panel')!==language;});}buttons.forEach((button)=>button.addEventListener('click',()=>select(button.getAttribute('data-report-language'))));}())</script>`;
  }
  return shell(report, body);
}

export function personPage(report: PublishedReport): string {
  const final = obj(report.result);
  const person = obj(final.person);
  const contacts = arr(final.contacts);
  const facts = arr(final.facts);
  const signals = arr(final.signals);
  const angles = strings(final.research_angles);
  const name = value(person, 'name') || 'VIP brief';
  const role = value(person, 'current_role', 'role');
  const company = value(person, 'company_name');
  const summary = value(final, 'summary');
  const stats = `<div class="metrics">
    <div class="metric"><strong>${contacts.length || '—'}</strong><span>Business contacts</span></div>
    <div class="metric"><strong>${facts.length || '—'}</strong><span>Verified facts</span></div>
    <div class="metric"><strong>${signals.length || '—'}</strong><span>Business signals</span></div>
    <div class="metric"><strong>${esc(company || '—')}</strong><span>Company context</span></div>
  </div>`;
  const contactRows = contacts.map((row) => {
    const raw = value(row, 'value_as_published', 'value', 'normalized_value');
    const normalized = value(row, 'normalized_value') || raw;
    const evidence = value(row, 'evidence_url', 'source_url');
    const action = /@/.test(raw) ? `<a class="button" href="mailto:${esc(raw)}">Email</a>` : /\d/.test(raw) ? `<a class="button" href="tel:${esc(normalized.replace(/[^+\d]/g, ''))}">Call</a>` : link(raw, 'Open', 'button');
    return `<div class="contact"><div class="label">${esc(value(row, 'purpose') || 'Business contact')}</div><div><div class="contact-value">${esc(raw)}</div><div class="source">${grade(row)}${esc(value(row, 'evidence_class', 'current_status'))}${evidence ? ` · <a href="${esc(evidence)}" target="_blank" rel="noopener">view evidence ↗</a>` : ''}</div></div>${action}</div>`;
  }).join('');
  const factRows = facts.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'category') || 'Professional fact')}</div><div><strong>${esc(value(row, 'fact', 'value', 'description'))}</strong><div class="source">${grade(row)}${esc(value(row, 'evidence_class', 'source_type'))} ${link(value(row, 'evidence_url', 'source_url'), 'Source')}</div></div></div>`).join('');
  const signalRows = signals.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'date') || 'Current')}</div><div><strong>${esc(value(row, 'fact', 'description', 'signal'))}</strong><div class="source">${grade(row)}${esc(value(row, 'evidence_class', 'source_type'))} ${link(value(row, 'evidence_url', 'source_url'), 'Source')}</div></div></div>`).join('');
  let body = stats + evidenceTally([contacts, facts, signals]);
  body += `<section class="brief"><div class="brief-label">VIP profile</div><p>${esc([name, role, company].filter(Boolean).join(' · ') || 'Public-professional research only.')}</p></section>`;
  if (summary) body += `<section class="brief"><div class="brief-label">Qualification readout</div><p>${esc(summary)}</p></section>`;
  if (report.status === 'failed') body += `<section class="section"><div class="message error">${esc(report.error ?? 'The VIP brief failed.')}</div></section>`;
  else if (!facts.length && !signals.length && report.status !== 'completed' && report.status !== 'partial') body += '<section class="section"><div class="empty">Public-professional research is running. This report will refresh automatically.</div></section>';
  else {
    body += `<section class="section"><div class="section-head"><h2>Published business contacts</h2><span class="section-note">Company-wide and person-specific routes are labeled separately.</span></div><div class="contact-list">${contactRows || '<div class="empty">No validated public business contacts.</div>'}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Verified professional facts</h2><span class="section-note">No private or sensitive-person data is included.</span></div><div class="signal-list">${factRows || '<div class="empty">No additional validated facts.</div>'}</div></section>`;
    if (angles.length) body += `<section class="section"><div class="section-head"><h2>Research angles</h2><span class="section-note">Use as prompts for informed qualification, not as asserted facts.</span></div><div class="angles">${angles.map((item) => `<div class="angle">${esc(item)}</div>`).join('')}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Business signals</h2><span class="section-note">Dated, source-linked signals only.</span></div><div class="signal-list">${signalRows || '<div class="empty">No validated business signals.</div>'}</div></section>`;
  }
  return shell(report, body);
}
