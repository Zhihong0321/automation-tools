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

function shell(report: PublishedReport, body: string): string {
  const active = report.status === 'queued' || report.status === 'running';
  const isSearch = report.report_type === 'business_search';
  const statusLabel = report.status === 'completed' ? 'Research complete' : report.status === 'partial' ? 'Complete · noted gaps' : report.status;
  const reportLabel = isSearch ? 'Market scan' : 'Company dossier';
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
.records{border-top:1px solid var(--ink)}.company{display:grid;grid-template-columns:64px minmax(210px,1.1fr) minmax(220px,1fr) minmax(240px,.9fr);gap:22px;align-items:start;padding:28px 0;border-bottom:1px solid var(--line)}.record-no{font:500 12px/1 var(--mono);color:var(--accent)}.company h3,.person h3{margin:0;font:600 19px/1.18 var(--sans);letter-spacing:-.025em}.record-meta{margin-top:7px;font-size:12px;color:var(--muted)}.record-address{font-size:13px;color:var(--muted);max-width:380px}.record-contact{display:grid;gap:15px}.phone{font:500 16px/1.2 var(--mono);letter-spacing:-.035em}.actions{display:flex;gap:13px;align-items:center;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;background:var(--ink);border:1px solid var(--ink);color:var(--sheet);font:700 10px/1 var(--sans);text-decoration:none;text-transform:uppercase;letter-spacing:.1em;transition:background .18s,color .18s}.button:hover{background:var(--accent);border-color:var(--accent)}.text-link{display:inline-flex;align-items:center;gap:5px;padding:7px 0;border-bottom:1px solid currentColor;font:700 10px/1 var(--sans);text-decoration:none;text-transform:uppercase;letter-spacing:.09em}.text-link span{color:var(--accent)}.id-tag{font:500 9px/1 var(--mono);color:var(--faint);text-transform:uppercase}
.brief{display:grid;grid-template-columns:180px minmax(0,1fr);gap:40px;padding:36px 0;border-bottom:1px solid var(--ink)}.brief-label{font:700 10px/1.3 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}.brief p{max-width:800px;margin:0;font:400 clamp(20px,2.5vw,29px)/1.35 var(--display);letter-spacing:-.02em}
.contact-list{border-top:1px solid var(--ink)}.contact{display:grid;grid-template-columns:180px minmax(0,1fr) auto;align-items:center;gap:24px;min-height:96px;border-bottom:1px solid var(--line)}.label{font:700 10px/1.3 var(--sans);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}.contact-value{font:500 17px/1.3 var(--mono);word-break:break-word}.source{margin-top:7px;font-size:11px;color:var(--muted)}.source a{color:var(--accent);text-decoration:none;border-bottom:1px solid currentColor}
.people{border-top:1px solid var(--ink)}.person{display:grid;grid-template-columns:64px minmax(190px,.8fr) minmax(240px,1.2fr) auto;gap:22px;align-items:start;padding:25px 0;border-bottom:1px solid var(--line)}.priority{font:500 11px/1.3 var(--mono);color:var(--accent)}.role{margin-top:6px;font:700 11px/1.3 var(--sans);text-transform:uppercase;letter-spacing:.07em;color:var(--accent)}.person p{margin:0;color:var(--muted);font-size:13px}.signal-list{border-top:1px solid var(--ink)}.signal{display:grid;grid-template-columns:180px minmax(0,1fr);gap:24px;padding:24px 0;border-bottom:1px solid var(--line)}.date{font:600 11px/1.3 var(--mono);color:var(--accent);text-transform:uppercase}.signal strong{font-size:15px}.angles{counter-reset:angle;display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid var(--ink)}.angle{counter-increment:angle;position:relative;min-height:150px;padding:26px 28px 26px 62px;border-bottom:1px solid var(--line);font:400 18px/1.4 var(--display)}.angle:nth-child(odd){border-right:1px solid var(--line)}.angle:before{content:counter(angle,decimal-leading-zero);position:absolute;left:0;top:30px;font:500 10px/1 var(--mono);color:var(--accent)}
.foot{display:flex;justify-content:space-between;gap:20px;margin-top:72px;padding-top:18px;border-top:1px solid var(--ink);font:500 9px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:4px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
@media(max-width:760px){.wrap{padding:0 18px 52px}.mast{height:60px}.folio{display:none}.hero{grid-template-columns:1fr;gap:30px;padding:42px 0 30px}.hero h1{font-size:clamp(43px,14vw,64px);line-height:.94}.hero-copy{font-size:14px;margin-top:18px}.hero-meta{align-self:auto}.meta-line{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric{padding:21px 15px 19px 0}.metric+.metric{padding-left:15px}.metric:nth-child(3){border-left:0;border-top:1px solid var(--line);padding-left:0}.metric:nth-child(4){border-top:1px solid var(--line)}.metric strong{font-size:35px}.section{padding-top:42px}.section-head{grid-template-columns:1fr;gap:8px}.section-note{text-align:left}.company{grid-template-columns:42px 1fr;gap:17px 12px;padding:24px 0}.record-address,.record-contact{grid-column:2}.actions{gap:12px}.button{min-height:46px;padding:0 18px}.brief{grid-template-columns:1fr;gap:14px;padding:28px 0}.brief p{font-size:23px}.contact{grid-template-columns:1fr auto;gap:7px 14px;padding:21px 0}.contact .label{grid-column:1/-1}.contact-value{font-size:15px}.people{border-top-color:var(--ink)}.person{grid-template-columns:38px 1fr;gap:14px 10px;padding:22px 0}.person p,.person .text-link{grid-column:2}.signal{grid-template-columns:1fr;gap:8px;padding:21px 0}.angles{grid-template-columns:1fr}.angle{min-height:auto;padding:22px 0 22px 42px}.angle:nth-child(odd){border-right:0}.foot{display:block;line-height:1.7}.foot span:last-child{display:block;margin-top:7px}}
</style></head><body class="${esc(report.report_type.replace('_', '-'))}"><main class="wrap">
<nav class="mast" aria-label="Report masthead"><div class="wordmark"><span class="mark">EE</span><span>Business intelligence</span></div><div class="folio">${esc(reportLabel)}<br>${esc(report.public_id)}</div></nav>
<header class="hero"><div><div class="kicker">${esc(reportLabel)} · ${esc(reportDate(report))}</div><h1>${esc(report.title ?? 'Research report')}</h1><p class="hero-copy">${active ? 'Research is in progress. This permanent report link refreshes as verified findings arrive.' : report.error ? esc(report.error) : isSearch ? 'A ranked field scan of relevant businesses, with direct routes to source listings and published contact points.' : 'A source-linked intelligence brief designed for qualification, outreach and informed decision-making.'}</p></div><aside class="hero-meta"><div class="status ${esc(report.status)}"><span class="status-dot"></span>${esc(statusLabel)}</div><div class="meta-line"><span>Issued ${esc(reportDate(report))}</span><span>${isSearch ? 'Source / Google Maps' : 'Evidence / Public sources'}</span></div>${!isSearch ? `<div class="rounds" aria-label="Four research rounds"><span class="round on"></span><span class="round ${report.status !== 'queued' ? 'on' : ''}"></span><span class="round ${report.status === 'completed' || report.status === 'partial' ? 'on' : ''}"></span><span class="round ${report.status === 'completed' ? 'on' : ''}"></span></div>` : ''}</aside></header>
${body}<footer class="foot"><span>EE Business Intelligence · Confidential link</span><span>Evidence opens at its original public source</span></footer>
</main>${active ? '<script>setTimeout(()=>location.reload(),8000)</script>' : ''}</body></html>`;
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
    return `<article class="company"><div class="record-no">${esc(rank(company.rank ?? index + 1))}</div><div><h3>${esc(name)}</h3><div class="record-meta">${esc(value(company, 'category') || 'Business')}${rating ? ` · ★ ${esc(rating)}${reviews ? ` / ${esc(reviews)} reviews` : ''}` : ''}</div></div><div class="record-address">${esc(value(company, 'address') || 'Address not published')}</div><div class="record-contact">${phone ? `<div class="phone">${esc(phone)}</div>` : '<span class="record-meta">Phone not published</span>'}<div class="actions">${phone ? `<a class="button" href="tel:${esc(phone.replace(/[^+\d]/g, ''))}">Call now</a>` : ''}${link(website, 'Website')}${link(maps, 'Maps')}</div>${companyId ? `<span class="id-tag">Research ID / ${esc(companyId)}</span>` : ''}</div></article>`;
  }).join('');
  const body = report.status === 'failed'
    ? `<section class="section"><div class="message error">${esc(report.error ?? 'The search failed.')}</div></section>`
    : `${stats}<section class="section"><div class="section-head"><h2>${esc(keyword || 'Business')} directory</h2><span class="section-note">Ranked in the order returned by Google Maps. Each source opens independently.</span></div><div class="records">${rows || '<div class="empty">Waiting for businesses…</div>'}</div></section>`;
  return shell(report, body);
}

export function companyPage(report: PublishedReport): string {
  const final = obj(report.result);
  const entity = obj(final.entity);
  const contacts = arr(final.contacts);
  const people = arr(final.people);
  const signals = arr(final.signals ?? final.business_signals);
  const conflicts = arr(final.conflicts_and_unknowns);
  const outreach = strings(final.outreach_angles);
  const summary = value(final, 'summary', 'executive_summary');
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
    return `<div class="contact"><div class="label">${esc(value(row, 'purpose', 'channel', 'type') || 'Contact')}</div><div><div class="contact-value">${esc(raw)}</div><div class="source">${esc(value(row, 'status', 'current_status', 'evidence_class'))}${evidence ? ` · <a href="${esc(evidence)}" target="_blank" rel="noopener">view evidence ↗</a>` : ''}</div></div>${action}</div>`;
  }).join('');
  const peopleRows = people.map((row, i) => `<article class="person"><span class="priority">P${esc(rank(row.priority ?? i + 1))}</span><div><h3>${esc(value(row, 'name'))}</h3><div class="role">${esc(value(row, 'role', 'current_role', 'position'))}</div></div><p>${esc(value(row, 'relevance', 'domain', 'why_relevant'))}</p>${link(value(row, 'role_url', 'source', 'evidence_url'), 'Evidence')}</article>`).join('');
  const signalRows = signals.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'date') || 'Current')}</div><div><strong>${esc(value(row, 'fact', 'description', 'signal'))}</strong><div class="source">${esc(value(row, 'evidence_class', 'type', 'source_class'))} ${link(value(row, 'evidence_url', 'evidence', 'source_url'), 'Source')}</div></div></div>`).join('');
  const conflictRows = conflicts.map((row) => `<div class="signal"><div class="date">Review</div><div><strong>${esc(value(row, 'issue', 'field'))}</strong><div class="source">${esc(value(row, 'details', 'status', 'note'))}</div></div></div>`).join('');
  let body = stats;
  if (summary) body += `<section class="brief"><div class="brief-label">Executive brief</div><p>${esc(summary)}</p></section>`;
  if (report.status === 'failed') body += `<section class="section"><div class="message error">${esc(report.error ?? 'Deep research failed.')}</div></section>`;
  else if (!contacts.length && !people.length && report.status !== 'completed' && report.status !== 'partial') body += '<section class="section"><div class="empty">The research rounds are running. Verified findings will appear here automatically.</div></section>';
  else {
    body += `<section class="section"><div class="section-head"><h2>Best contact routes</h2><span class="section-note">Only channels retained by the evidence ledger are shown.</span></div><div class="contact-list">${contactRows || '<div class="empty">No validated contacts.</div>'}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Decision-relevant people</h2><span class="section-note">Current roles require a direct supporting source.</span></div><div class="people">${peopleRows || '<div class="empty">No validated people.</div>'}</div></section>`;
    if (outreach.length) body += `<section class="section"><div class="section-head"><h2>Outreach angles</h2><span class="section-note">Conversation starters derived from the validated research set.</span></div><div class="angles">${outreach.map((item) => `<div class="angle">${esc(item)}</div>`).join('')}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Business signals</h2><span class="section-note">Time-sensitive evidence that may create a reason to engage.</span></div><div class="signal-list">${signalRows || '<div class="empty">No validated signals.</div>'}</div></section>`;
    if (conflictRows) body += `<section class="section"><div class="section-head"><h2>Conflicts and unknowns</h2></div><div class="message warning">${conflictRows}</div></section>`;
  }
  return shell(report, body);
}
