import type { PublishedReport } from './reportdb.ts';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

const arr = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[] : [];

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const value = (row: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) if (row[key] != null && row[key] !== '') return String(row[key]);
  return '';
};

function link(url: unknown, label: string, className = 'action'): string {
  const href = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
  return href ? `<a class="${className}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

function shell(report: PublishedReport, body: string): string {
  const active = report.status === 'queued' || report.status === 'running';
  const statusLabel = report.status === 'completed' ? 'Ready' : report.status === 'partial' ? 'Ready with gaps' : report.status;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#102a2a"><title>${esc(report.title ?? 'Business intelligence report')}</title>
<style>
:root{--ink:#142121;--muted:#647171;--paper:#f4f5ef;--card:#fff;--line:#dfe4dc;--brand:#0e5c51;--brand2:#173b3b;--gold:#e9ad43;--good:#14795f;--bad:#a33c32;--shadow:0 12px 36px rgba(15,45,42,.08)}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);background:linear-gradient(160deg,#ecf4ee 0,#f6f4ed 35%,#f4f5ef 100%);font:15px/1.55 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}.wrap{max-width:1120px;margin:auto;padding:0 18px 72px}.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0 14px}.brand{font-weight:850;letter-spacing:-.03em}.brand i{color:var(--brand);font-style:normal}.share{font-size:12px;color:var(--muted)}
.hero{position:relative;overflow:hidden;background:var(--brand2);color:#fff;border-radius:28px;padding:30px;box-shadow:var(--shadow)}.hero:after{content:"";position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(45,178,144,.18);right:-75px;top:-95px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a9d8cc}.hero h1{max-width:820px;font-size:clamp(28px,6vw,50px);line-height:1.02;letter-spacing:-.045em;margin:10px 0 12px}.hero p{max-width:700px;color:#c6d7d3;margin:0}.badge{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:7px 11px;border:1px solid rgba(255,255,255,.18);border-radius:99px;font-size:12px;text-transform:capitalize}.dot{width:8px;height:8px;border-radius:50%;background:var(--gold)}.completed .dot{background:#5ee2b3}.failed .dot{background:#ff7c72}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.stat,.panel{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.stat{padding:16px}.stat b{font-size:24px;letter-spacing:-.03em;display:block}.stat span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.section{margin-top:26px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:0 2px 11px}.section h2{font-size:19px;letter-spacing:-.025em;margin:0}.section-note{font-size:12px;color:var(--muted)}.panel{padding:20px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.company{display:flex;flex-direction:column;gap:10px;min-height:220px}.company-top{display:flex;gap:12px;align-items:flex-start}.rank{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:11px;background:#e8f1ec;color:var(--brand);font-weight:800}.company h3,.person h3{font-size:17px;line-height:1.2;margin:1px 0 4px}.muted{color:var(--muted)}.meta{font-size:13px;color:var(--muted)}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}.action{display:inline-flex;align-items:center;text-decoration:none;border:1px solid var(--line);background:#f8faf7;border-radius:11px;padding:9px 12px;font-weight:700;font-size:12px}.action.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.contact{display:grid;grid-template-columns:140px 1fr auto;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}.contact:last-child{border:0}.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:800}.contact strong{word-break:break-word}.source{font-size:11px;color:var(--muted)}
.people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.person{position:relative;padding:18px}.priority{position:absolute;right:14px;top:13px;font:800 11px/1 ui-monospace;color:var(--brand)}.role{color:var(--brand);font-weight:750;font-size:13px}.signal{display:grid;grid-template-columns:110px 1fr;gap:16px;padding:15px 0;border-bottom:1px solid var(--line)}.signal:last-child{border:0}.date{font-weight:850;color:var(--brand);font-size:13px}.warning{background:#fff8e8;border-color:#efdbad}.error{background:#fff0ee;border-color:#edc2bd;color:#752b24}.empty{text-align:center;padding:36px 18px;color:var(--muted)}
.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:20px}.step{height:5px;border-radius:9px;background:rgba(255,255,255,.16)}.step.on{background:#55d8ae}.foot{text-align:center;color:var(--muted);font-size:11px;margin-top:40px}.foot a{color:var(--brand)}
@media(max-width:760px){.wrap{padding:0 12px 50px}.top{padding:14px 4px 10px}.share{display:none}.hero{border-radius:22px;padding:24px 20px}.hero h1{font-size:32px}.stats{grid-template-columns:repeat(2,1fr)}.grid,.people{grid-template-columns:1fr}.panel{padding:16px}.contact{grid-template-columns:1fr auto}.contact .label{grid-column:1/-1;margin-bottom:-8px}.signal{grid-template-columns:1fr;gap:4px}.actions .action{flex:1;justify-content:center}.company{min-height:0}.section{margin-top:22px}}
</style></head><body><main class="wrap">
<div class="top"><div class="brand"><i>EE</i> Business Intelligence</div><div class="share">Private share link · ${esc(report.public_id)}</div></div>
<header class="hero"><div class="eyebrow">${report.report_type === 'business_search' ? 'Business discovery report' : 'Company deep research'}</div><h1>${esc(report.title ?? 'Research report')}</h1><p>${active ? 'Research is running. This page updates automatically and keeps the same share link.' : report.error ? esc(report.error) : 'Evidence-linked business intelligence, prepared for outreach and decision making.'}</p><div class="badge ${esc(report.status)}"><span class="dot"></span>${esc(statusLabel)}</div>${report.report_type === 'company_research' ? `<div class="progress"><span class="step on"></span><span class="step ${report.status !== 'queued' ? 'on' : ''}"></span><span class="step ${report.status === 'completed' || report.status === 'partial' ? 'on' : ''}"></span><span class="step ${report.status === 'completed' ? 'on' : ''}"></span></div>` : ''}</header>
${body}<div class="foot">Generated by EE Business Intelligence · Evidence links open their original public source</div>
</main>${active ? '<script>setTimeout(()=>location.reload(),8000)</script>' : ''}</body></html>`;
}

export function notFoundPage(): string {
  const fake = { public_id: '', report_type: 'business_search', status: 'failed', title: 'Report not found', error: 'This share link is invalid or no longer available.' } as PublishedReport;
  return shell(fake, '<section class="section panel empty">Check that the complete report link was copied.</section>');
}

export function searchPage(report: PublishedReport, detail: { report?: Record<string, unknown>; companies?: Record<string, unknown>[] } | null): string {
  const request = obj(report.request);
  const scan = obj(detail?.report ?? report.result?.search);
  const companies = detail?.companies ?? arr(report.result?.companies);
  const keyword = value(request, 'keyword');
  const place = value(request, 'place', 'location');
  const stats = `<div class="stats">
    <div class="stat"><b>${esc(scan.found ?? companies.length ?? '—')}</b><span>Businesses</span></div>
    <div class="stat"><b>${esc(companies.filter((c) => value(c, 'phone')).length)}</b><span>Phone contacts</span></div>
    <div class="stat"><b>${esc(companies.filter((c) => value(c, 'website')).length)}</b><span>Websites</span></div>
    <div class="stat"><b>${esc(place || 'Any')}</b><span>Location</span></div>
  </div>`;
  const cards = companies.map((company, index) => {
    const name = value(company, 'name') || 'Unnamed business';
    const phone = value(company, 'phone');
    const rating = value(company, 'rating');
    const reviews = value(company, 'reviews');
    const website = value(company, 'website');
    const maps = value(company, 'maps_url', 'mapsUrl');
    const companyId = value(company, 'id');
    return `<article class="panel company"><div class="company-top"><div class="rank">${esc(company.rank ?? index + 1)}</div><div><h3>${esc(name)}</h3><div class="meta">${esc(value(company, 'category') || 'Business')}${rating ? ` · ★ ${esc(rating)}${reviews ? ` (${esc(reviews)})` : ''}` : ''}</div></div></div><div class="muted">${esc(value(company, 'address') || 'Address not published')}</div>${phone ? `<strong>${esc(phone)}</strong>` : '<span class="meta">Phone not published</span>'}<div class="actions">${phone ? `<a class="action primary" href="tel:${esc(phone.replace(/[^+\d]/g, ''))}">Call</a>` : ''}${link(website, 'Website')}${link(maps, 'Google Maps')}${companyId ? `<span class="action" title="Use this value with POST /api/company-research">Company ID ${esc(companyId)}</span>` : ''}</div></article>`;
  }).join('');
  const body = report.status === 'failed'
    ? `<section class="section panel error">${esc(report.error ?? 'The search failed.')}</section>`
    : `${stats}<section class="section"><div class="section-head"><h2>${esc(keyword || 'Business')} results</h2><span class="section-note">Ranked as returned by Google Maps</span></div><div class="grid">${cards || '<div class="panel empty">Waiting for businesses…</div>'}</div></section>`;
  return shell(report, body);
}

export function companyPage(report: PublishedReport): string {
  const final = obj(report.result);
  const entity = obj(final.entity);
  const contacts = arr(final.contacts);
  const people = arr(final.people);
  const signals = arr(final.signals ?? final.business_signals);
  const conflicts = arr(final.conflicts_and_unknowns);
  const stats = `<div class="stats">
    <div class="stat"><b>${contacts.length || '—'}</b><span>Contact channels</span></div>
    <div class="stat"><b>${people.length || '—'}</b><span>Relevant people</span></div>
    <div class="stat"><b>${signals.length || '—'}</b><span>Business signals</span></div>
    <div class="stat"><b>${esc(value(entity, 'rating', 'maps_rating') || '—')}</b><span>Maps rating</span></div>
  </div>`;
  const contactRows = contacts.map((row) => {
    const raw = value(row, 'value_as_published', 'raw_value', 'value', 'normalized_value');
    const normalized = value(row, 'normalized_value');
    const evidence = value(row, 'evidence_url', 'evidence', 'source_url');
    const action = /@/.test(raw) ? `<a class="action primary" href="mailto:${esc(raw)}">Email</a>` : /\d/.test(raw) ? `<a class="action primary" href="tel:${esc((normalized || raw).replace(/[^+\d]/g, ''))}">Call</a>` : link(raw, 'Open', 'action primary');
    return `<div class="contact"><div class="label">${esc(value(row, 'purpose', 'channel', 'type') || 'Contact')}</div><div><strong>${esc(raw)}</strong><div class="source">${esc(value(row, 'status', 'current_status', 'evidence_class'))}${evidence ? ` · <a href="${esc(evidence)}" target="_blank" rel="noopener">evidence</a>` : ''}</div></div>${action}</div>`;
  }).join('');
  const peopleCards = people.map((row, i) => `<article class="panel person"><span class="priority">P${esc(row.priority ?? i + 1)}</span><h3>${esc(value(row, 'name'))}</h3><div class="role">${esc(value(row, 'role', 'current_role', 'position'))}</div><p class="muted">${esc(value(row, 'relevance', 'domain', 'why_relevant'))}</p>${link(value(row, 'role_url', 'source', 'evidence_url'), 'Role evidence')}</article>`).join('');
  const signalRows = signals.map((row) => `<div class="signal"><div class="date">${esc(value(row, 'date') || 'Current')}</div><div><strong>${esc(value(row, 'fact', 'description', 'signal'))}</strong><div class="source">${esc(value(row, 'evidence_class', 'type', 'source_class'))} ${link(value(row, 'evidence_url', 'evidence', 'source_url'), 'Source')}</div></div></div>`).join('');
  const conflictRows = conflicts.map((row) => `<div class="signal"><div class="date">Review</div><div><strong>${esc(value(row, 'issue', 'field'))}</strong><div class="muted">${esc(value(row, 'details', 'status', 'note'))}</div></div></div>`).join('');
  let body = stats;
  if (report.status === 'failed') body += `<section class="section panel error">${esc(report.error ?? 'Deep research failed.')}</section>`;
  else if (!contacts.length && !people.length && report.status !== 'completed' && report.status !== 'partial') body += '<section class="section panel empty">The research rounds are running. Results will appear here automatically.</section>';
  else {
    body += `<section class="section"><div class="section-head"><h2>Best contact routes</h2><span class="section-note">Current and historical channels are labeled separately</span></div><div class="panel">${contactRows || '<div class="empty">No validated contacts.</div>'}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Decision-relevant people</h2><span class="section-note">Roles require direct evidence</span></div><div class="people">${peopleCards || '<div class="panel empty">No validated people.</div>'}</div></section>`;
    body += `<section class="section"><div class="section-head"><h2>Business signals</h2><span class="section-note">Useful reasons to start a conversation</span></div><div class="panel">${signalRows || '<div class="empty">No validated signals.</div>'}</div></section>`;
    if (conflictRows) body += `<section class="section"><div class="section-head"><h2>Conflicts and unknowns</h2></div><div class="panel warning">${conflictRows}</div></section>`;
  }
  return shell(report, body);
}
