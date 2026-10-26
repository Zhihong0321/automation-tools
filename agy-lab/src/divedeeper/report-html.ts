// The full report as one standalone HTML page, from data alone (no network, no files):
//   Part 1  the company-dive (who the company is)
//   Part 2  dive-deeper stage 1 (what we found)
//   Part 3  dive-deeper stage 2 (what to do)
// Used by the hub (divedeeper.ts) and by scripts/dive-deeper/report.ts. A missing lane
// only drops its block; the report still builds.

/** lanes: { "E-maps": laneResult, "H-maps": …, "S2-consult": … } as runLane returns them. */
export function buildReport(dive: any, L: Record<string, any>): string {
  const r = dive.result ?? {};
  const id = r.identity ?? {};
  const name = String(id.legal_name ?? dive.company);
  const brand = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || 'company';
  const s2 = L['S2-consult']?.notes ?? {};

  // ---------- helpers ----------
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
  const link = (u: string | null | undefined, text?: string) => (u && /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(text ?? u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))}</a>` : '');
  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  const sevClass = (s: string) => (s === 'high' ? 'urgent' : s === 'medium' ? 'fix' : s === 'low' ? 'info' : 'good');
  const dateOf = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const isPrivate = (f: any) => /^PRIVATE/i.test(f.title);

  /** Markdown of the company-dive dossier to HTML: headings, tables, lists, bold, [n] citations. */
  function md(src: string): string {
    const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+)\]/g, '<a class="cite" href="#src-$1">[$1]</a>');
    const out: string[] = [];
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^#\s/.test(ln)) continue; // the report has its own title
      const h = ln.match(/^(#{2,4})\s+(.*)/);
      if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
      if (/^\|/.test(ln)) {
        const rows: string[] = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        i--;
        const cells = (row: string) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((x) => !/^\|[\s:|-]+\|$/.test(x));
        out.push(`<div class="tbl"><table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*[-*]\s+/.test(ln) || /^\s*\d+\.\s+/.test(ln)) {
        const ordered = /^\s*\d+\./.test(ln);
        const items: string[] = [];
        while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i--;
        out.push(`<${ordered ? 'ol' : 'ul'} class="md-list">${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (ln.trim()) out.push(`<p>${inline(ln)}</p>`);
    }
    return out.join('\n');
  }

  function findingList(fs_: any[], opts: { clipAt?: number } = {}): string {
    if (!fs_.length) return '<p class="muted">Nothing found here.</p>';
    return `<ul class="findings">${fs_.map((f) => `<li class="${sevClass(f.severity)}"><span class="t">${esc(f.title)}</span>${f.detail ? `<span class="d">${esc(clip(String(f.detail), opts.clipAt ?? 420))}</span>` : ''}${f.source ? `<span class="src">${link(f.source)}</span>` : ''}</li>`).join('')}</ul>`;
  }

  /** A section's findings: high/medium in full, low/info as one compact list. */
  function sectionFindings(fs_: any[], clipAt = 420): string {
    const list = fs_.filter((f) => !isPrivate(f)).sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
    const main = list.filter((f) => f.severity === 'high' || f.severity === 'medium');
    const minor = list.filter((f) => f.severity !== 'high' && f.severity !== 'medium');
    return findingList(main, { clipAt }) + (minor.length ? `<details class="minor"><summary>${minor.length} smaller or positive item${minor.length === 1 ? '' : 's'}</summary>${findingList(minor, { clipAt: 260 })}</details>` : '');
  }

  function status(fs_: any[]): [string, string] {
    const hi = fs_.filter((f) => f.severity === 'high' && !isPrivate(f)).length;
    const md_ = fs_.filter((f) => f.severity === 'medium').length;
    return hi >= 2 ? ['urgent', 'Urgent'] : hi || md_ >= 2 ? ['fix', 'Needs work'] : ['good', 'Good'];
  }

  // ---------- content ----------
  const sections = [
    { id: 'reviews', eyebrow: 'How the public sees you', title: 'What customers say', q: 'Every Google review on your Maps listings, read one by one.', f: L['E-maps']?.findings ?? [] },
    { id: 'findability', eyebrow: 'How the internet sees you', title: 'Can customers find you', q: 'Google Maps and web searches a customer would type, in the towns you serve, and a search for your own name.', f: [...(L['H-maps']?.findings ?? []), ...(L['H-web']?.findings ?? [])] },
    { id: 'credentials', eyebrow: 'Are your claims backed', title: 'Registrations and awards', q: 'Each claim on your sites, looked up in the issuing body\'s own register.', f: L['D-registry']?.findings ?? [] },
    { id: 'website', eyebrow: 'Website health', title: 'Your websites', q: 'Pages read, links and phone numbers tested, copy checked.', f: L['C-merged']?.findings ?? [] },
    { id: 'ai', eyebrow: 'How AI sees you', title: 'What AI assistants say', q: 'Customer questions put to two AI assistants, from their own knowledge and with web search.', f: [...(L['G-fixed']?.findings ?? []), ...(L['G-grounded']?.findings ?? [])] },
  ];

  // Private alerts: register data exposing personal IDs, plus private documents a search engine indexed.
  const privateItems: string[] = [];
  for (const f of L['D-registry']?.findings ?? []) if (isPrivate(f)) privateItems.push(`<b>${esc(f.title.replace(/^PRIVATE:\s*/i, ''))}.</b> ${esc(clip(String(f.detail ?? ''), 300))}`);
  const searched = [
    ...Object.values(L['G-grounded']?.notes?.search_results ?? {}).flatMap((v: any) => (Array.isArray(v) ? v : v?.rows ?? []).map((x: any) => x.url ?? x)),
    ...(L['H-web']?.notes?.nameRows ?? []).map((x: any) => x.url),
  ].filter((u: any) => typeof u === 'string');
  const docs = [...new Set(searched.filter((u: string) => /proposal|invoice|\/inv[-/]|[?&]uid=|quotation/i.test(u)))];
  if (docs.length) privateItems.push(`<b>Search engines have indexed ${docs.length} private document link${docs.length === 1 ? '' : 's'}</b> (proposals or invoices meant for one customer), for example <code>${esc(clip(docs[0], 70))}</code>. Put these behind a login or mark them no-index.`);

  const people = (r.people?.people ?? []).filter((p: any) => p.name);
  const facts = (r.facts ?? []) as any[];
  const sources = (r.sources ?? []) as any[];
  const checked = [L['E-maps'], L['H-maps'], L['C-merged'], L['D-registry'], L['G-fixed']].map((x) => x?.ran_at).filter(Boolean).sort();
  const checkedOn = checked.length ? `${dateOf(checked[0])}${dateOf(checked[0]) !== dateOf(checked[checked.length - 1]) ? ' – ' + dateOf(checked[checked.length - 1]) : ''}` : dateOf(dive.finished_at);

  const site = s2.site ?? null;
  const ai = s2.ai ?? null;
  const top = s2.top ?? null;
  const replies = s2.replies ?? null;
  const targets: any[] = s2.reply_targets ?? [];

  const html = `<!doctype html>
  <html lang="en">
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} Presence Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap">
  <style>
  /* One reading column, an audit dossier in three parts. Status stripes mark severity; every finding keeps its proof link. */
  :root { --bg:#f5f7f4; --paper:#ffffff; --ink:#15201b; --muted:#56635c; --line:#d8dfd9; --accent:#0e5a52; --accent-bg:#e3f0ee;
    --urgent:#b42318; --urgent-bg:#fdecea; --fix:#a15c07; --fix-bg:#fdf3e2; --good:#067647; --good-bg:#e6f4ec; --info:#475467; --info-bg:#eef1f4;
    --display:"Archivo","Helvetica Neue",Arial,sans-serif; --body:"Source Sans 3","Segoe UI",system-ui,sans-serif; --mono:"JetBrains Mono",ui-monospace,Consolas,monospace; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1513; --paper:#161e1b; --ink:#e6ece8; --muted:#9ba8a1; --line:#29342f; --accent:#5cc4b6; --accent-bg:#14302c;
    --urgent:#f97066; --urgent-bg:#3a1714; --fix:#fdb022; --fix-bg:#33240b; --good:#47cd89; --good-bg:#0f2a1d; --info:#b0bac4; --info-bg:#1d2428; color-scheme:dark; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--body); font-size:16px; line-height:1.55; }
  .wrap { max-width:880px; margin:0 auto; padding:40px 16px 72px; display:grid; gap:44px; }
  h1,h2,h3,h4,h5 { font-family:var(--display); text-wrap:balance; margin:0; line-height:1.15; }
  h1 { font-size:clamp(28px,5vw,42px); font-weight:800; letter-spacing:-0.01em; }
  h2 { font-size:23px; font-weight:700; } h3 { font-size:18px; font-weight:700; } h4 { font-size:16px; font-weight:700; } h5 { font-size:15px; }
  p { margin:0; } a { color:var(--accent); text-underline-offset:2px; } a:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  code { font-family:var(--mono); font-size:0.88em; overflow-wrap:anywhere; }
  .muted { color:var(--muted); } .eyebrow { font-family:var(--mono); font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); }
  .lede { font-size:18px; color:var(--muted); max-width:64ch; }
  header.cover { display:grid; gap:14px; }
  .meta { display:flex; flex-wrap:wrap; gap:8px 18px; font-size:14px; color:var(--muted); } .meta b { color:var(--ink); font-weight:600; }
  .draft { border:1px dashed var(--fix); color:var(--fix); background:var(--fix-bg); padding:2px 8px; border-radius:4px; font-family:var(--mono); font-size:12px; letter-spacing:0.06em; }
  nav.toc { display:grid; gap:6px; font-size:15px; } nav.toc a { text-decoration:none; } nav.toc .p { font-family:var(--display); font-weight:700; margin-top:6px; color:var(--ink); }
  .part { border-top:3px solid var(--accent); padding-top:18px; display:grid; gap:6px; }
  .part .n { font-family:var(--mono); font-size:13px; color:var(--accent); letter-spacing:0.08em; text-transform:uppercase; }
  section { display:grid; gap:14px; } section.block { gap:16px; }
  .snap { display:grid; border-top:1px solid var(--line); }
  .snap-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 16px; align-items:baseline; padding:11px 0; border-bottom:1px solid var(--line); }
  .snap-row a { font-family:var(--display); font-weight:700; text-decoration:none; color:var(--ink); } .snap-row p { grid-column:1/-1; font-size:15px; color:var(--muted); }
  .chip { font-family:var(--mono); font-size:12px; letter-spacing:0.04em; text-transform:uppercase; padding:2px 8px; border-radius:999px; white-space:nowrap; font-weight:500; }
  .chip.urgent { color:var(--urgent); background:var(--urgent-bg); } .chip.fix { color:var(--fix); background:var(--fix-bg); } .chip.good { color:var(--good); background:var(--good-bg); } .chip.info { color:var(--info); background:var(--info-bg); }
  ol.fixes { list-style:none; margin:0; padding:0; display:grid; gap:12px; counter-reset:fix; }
  ol.fixes > li { counter-increment:fix; background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:16px 18px 16px 58px; position:relative; display:grid; gap:6px; }
  ol.fixes > li::before { content:counter(fix); position:absolute; left:18px; top:13px; font-family:var(--display); font-weight:800; font-size:24px; color:var(--accent); }
  .tags { display:flex; flex-wrap:wrap; gap:6px; }
  .findings { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
  .findings li { background:var(--paper); border:1px solid var(--line); border-left:4px solid var(--info); border-radius:6px; padding:11px 14px; display:grid; gap:4px; min-width:0; }
  .findings li.urgent { border-left-color:var(--urgent); } .findings li.fix { border-left-color:var(--fix); } .findings li.good { border-left-color:var(--good); }
  .findings .t { font-weight:600; } .findings .d { color:var(--muted); font-size:15px; overflow-wrap:anywhere; } .findings .src { font-size:13px; overflow-wrap:anywhere; }
  details.minor > summary { cursor:pointer; color:var(--muted); font-size:15px; padding:6px 0; } details.minor .findings { margin-top:8px; }
  .tbl { overflow-x:auto; border:1px solid var(--line); border-radius:8px; background:var(--paper); }
  table { width:100%; border-collapse:collapse; font-size:15px; } th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-family:var(--mono); font-size:12px; letter-spacing:0.05em; text-transform:uppercase; color:var(--muted); font-weight:500; } tr:last-child td { border-bottom:0; }
  .dossier { display:grid; gap:12px; max-width:72ch; } .dossier h3 { margin-top:10px; } .dossier .tbl { max-width:none; }
  .md-list { margin:0; padding-left:22px; display:grid; gap:6px; } a.cite { font-size:0.8em; text-decoration:none; vertical-align:super; }
  .card { background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:16px 18px; display:grid; gap:10px; }
  .draftcopy { background:var(--accent-bg); border-radius:8px; padding:18px; display:grid; gap:12px; }
  .draftcopy .hl { font-family:var(--display); font-weight:800; font-size:24px; } .draftcopy .sub { font-size:17px; }
  .draftcopy .btn { justify-self:start; background:var(--accent); color:var(--paper); font-weight:600; padding:6px 14px; border-radius:6px; font-size:15px; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; } .grid2 > * { min-width:0; }
  pre { margin:0; background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:14px; overflow-x:auto; font-family:var(--mono); font-size:13px; line-height:1.5; }
  .quote { border-left:3px solid var(--line); padding-left:12px; color:var(--muted); font-style:italic; }
  .reply { border-left:3px solid var(--accent); padding-left:12px; }
  .private { border:1px solid var(--urgent); background:var(--urgent-bg); border-radius:8px; padding:16px 18px; display:grid; gap:8px; } .private h2 { color:var(--urgent); font-size:19px; }
  .private ul, .plain { margin:0; padding-left:20px; display:grid; gap:6px; }
  ol.sources { margin:0; padding-left:30px; display:grid; gap:3px; font-size:13px; color:var(--muted); } ol.sources li { overflow-wrap:anywhere; }
  footer { border-top:1px solid var(--line); padding-top:16px; display:grid; gap:6px; font-size:13px; color:var(--muted); }
  @media (max-width:520px) { ol.fixes > li { padding-left:46px; } ol.fixes > li::before { left:14px; font-size:20px; } }
  </style>
  </head>
  <body>
  <div class="wrap">

  <header class="cover">
    <div class="meta"><span class="eyebrow">Business presence report</span><span class="draft">DRAFT</span></div>
    <h1>${esc(name)}: how customers, Google and AI see you, and what to do about it</h1>
    ${top?.summary ? `<p class="lede">${esc(top.summary)}</p>` : ''}
    <div class="meta">
      <span>Registration <b>${esc((id.registration_numbers ?? []).filter((x: string) => /^\d{12}$/.test(x))[0] ?? (id.registration_numbers ?? [])[0] ?? '-')}</b></span>
      <span>Checked <b>${esc(checkedOn)}</b></span>
      <span>Sites <b>${esc((id.official_domains ?? []).join(', '))}</b></span>
    </div>
  </header>

  <nav class="toc" aria-label="Contents">
    <a href="#summary">Summary and top 5 fixes</a>
    <span class="p">Part 1 · Who you are</span><a href="#profile">Company profile</a>
    <span class="p">Part 2 · What we found</span>${sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}
    <span class="p">Part 3 · What to do</span><a href="#c-website">Your website</a><a href="#c-ai">Getting recommended by AI</a><a href="#c-reviews">Replying to reviews</a><a href="#c-plan">30-day plan</a><a href="#c-more">More we can help with</a>
  </nav>

  <section id="summary" class="block">
    <h2>Summary</h2>
    <div class="snap">${sections.map((s) => { const [c, t] = status(s.f); const lead = s.f.filter((f: any) => !isPrivate(f)).sort((a: any, b: any) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9))[0]; return `<div class="snap-row"><a href="#${s.id}">${esc(s.title)}</a><span class="chip ${c}">${t}</span>${lead ? `<p>${esc(clip(lead.title, 160))}</p>` : ''}</div>`; }).join('')}</div>
    ${top?.top5?.length ? `<h3>Top 5 fixes, in order</h3><ol class="fixes">${top.top5.map((x: any) => `<li><h4>${esc(x.fix)}</h4><p class="muted">${esc(x.why)}</p><div class="tags"><span class="chip info">${esc(x.effort)}</span><span class="chip ${x.impact === 'high' ? 'urgent' : 'fix'}">${esc(x.impact)} impact</span></div></li>`).join('')}</ol>` : ''}
  </section>

  <div class="part" id="part1"><span class="n">Part 1</span><h2>Who you are</h2><p class="muted">What public sources say about the company, with every source numbered.</p></div>

  <section id="profile" class="block">
    <div class="tbl"><table><tbody>
      <tr><th>Legal name</th><td>${esc(id.legal_name)}</td></tr>
      <tr><th>Also known as</th><td>${esc((id.aliases ?? []).join(', '))}</td></tr>
      <tr><th>Registration</th><td>${esc((id.registration_numbers ?? []).join(' · '))}</td></tr>
      <tr><th>Industry</th><td>${esc(id.industry)}</td></tr>
      <tr><th>Address</th><td>${esc(id.address)}</td></tr>
      <tr><th>Websites</th><td>${(id.official_domains ?? []).map((d: string) => link('https://' + d, d)).join(', ')}</td></tr>
    </tbody></table></div>
    ${id.summary ? `<p>${esc(id.summary)}</p>` : ''}
    ${people.length ? `<h3>People named in public sources</h3><div class="tbl"><table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>${people.map((p: any) => `<tr><td>${esc(p.name)}</td><td>${esc(p.role ?? '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3>Company dossier</h3>
    <div class="dossier">${md(String(dive.dossier ?? ''))}</div>
    ${(r.contradictions ?? []).length ? `<h3>Where sources disagree</h3><ul class="plain">${r.contradictions.map((c: string) => `<li>${md(c).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''}
    ${(r.gaps ?? []).length ? `<h3>What public sources do not show</h3><ul class="plain">${r.gaps.map((g: string) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    <p class="muted">${facts.length} facts drawn from ${sources.length} sources (listed at the end).</p>
  </section>

  <div class="part" id="part2"><span class="n">Part 2</span><h2>What we found</h2><p class="muted">Each finding links to where we saw it. Red is urgent, amber needs work, green is good.</p></div>

  ${sections.map((s) => `<section id="${s.id}" class="block"><div><p class="eyebrow">${esc(s.eyebrow)}</p><h2>${esc(s.title)}</h2><p class="muted">${esc(s.q)}</p></div>${sectionFindings(s.f, s.id === 'ai' ? 360 : 420)}</section>`).join('\n')}

  <div class="part" id="part3"><span class="n">Part 3</span><h2>What to do</h2><p class="muted">Advice and ready-to-use drafts, built from the findings in Part 2.</p></div>

  <section id="c-website" class="block">
    <h2>Your website</h2>
    ${site ? `<p>${esc(site.verdict)}</p>${site.one_site_or_two ? `<p><b>One site or two?</b> ${esc(site.one_site_or_two)}</p>` : ''}
    ${site.homepage ? `<h3>Homepage, rewritten</h3><div class="draftcopy">
      <div class="hl">${esc(site.homepage.headline)}</div><div class="sub">${esc(site.homepage.subheadline)}</div>
      ${(site.homepage.proof_points ?? []).length ? `<ul class="plain">${site.homepage.proof_points.map((p: string) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <span class="btn">${esc(site.homepage.cta)}</span>
      ${(site.homepage.sections ?? []).map((x: any) => `<div><h4>${esc(x.title)}</h4><p>${esc(x.body)}</p></div>`).join('')}
    </div>` : ''}
    ${(site.pages_to_add ?? []).length ? `<h3>Pages to add</h3><div class="grid2">${site.pages_to_add.map((p: any) => `<div class="card"><code>${esc(p.slug)}</code><h4>${esc(p.title)}</h4><p class="muted">${esc(p.why)}</p><ul class="plain">${(p.outline ?? []).map((o: string) => `<li>${esc(o)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
    ${(site.pages_to_fix ?? []).length ? `<h3>Pages to fix</h3><div class="tbl"><table><thead><tr><th>Page</th><th>Problem</th><th>Fix</th></tr></thead><tbody>${site.pages_to_fix.map((p: any) => `<tr><td>${esc(p.page)}</td><td>${esc(p.problem)}</td><td>${esc(p.fix)}</td></tr>`).join('')}</tbody></table></div>` : ''}` : '<p class="muted">The website plan could not be written in this run.</p>'}
    ${s2.jsonld ? `<h3>Business details for search engines and AI</h3><p class="muted">Paste this into the &lt;head&gt; of every page, after checking the phone and address are the ones you want everywhere.</p><pre>${esc('<script type="application/ld+json">\n' + JSON.stringify(s2.jsonld, null, 2) + '\n</script>')}</pre>` : ''}
  </section>

  <section id="c-ai" class="block">
    <h2>Getting recommended by AI</h2>
    ${ai ? `${(ai.why_they_win ?? []).length ? `<h3>Why others get named instead of you</h3><ul class="plain">${ai.why_they_win.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    ${(s2.presence ?? []).length ? `<h3>The "best installer" pages AI reads</h3><div class="tbl"><table><thead><tr><th>Page</th>${Object.keys(s2.presence[0].on).map((k) => `<th>${esc(k.replace(/\s+Sdn\.? Bhd\.?$/i, ''))}</th>`).join('')}</tr></thead><tbody>${s2.presence.map((p: any) => `<tr><td>${link(p.url)}</td>${Object.values(p.on).map((v) => `<td>${v ? '<span class="chip good">listed</span>' : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${(ai.actions ?? []).length ? `<h3>What to do</h3><ol class="fixes">${ai.actions.map((a: any) => `<li><h4>${esc(a.action)}</h4><p class="muted">${esc(a.why)}</p><p>${esc(a.how)}</p><div class="tags"><span class="chip info">${esc(a.effort)}</span><span class="chip ${a.impact === 'high' ? 'urgent' : 'fix'}">${esc(a.impact)} impact</span></div></li>`).join('')}</ol>` : ''}
    ${(ai.faq ?? []).length ? `<h3>FAQ for your website</h3><p class="muted">Written only from verified facts. Check each answer before publishing.</p><div class="grid2">${ai.faq.map((x: any) => `<div class="card"><h4>${esc(x.q)}</h4><p>${esc(x.a)}</p></div>`).join('')}</div>` : ''}
    ${ai.measure ? `<p><b>How to track it:</b> ${esc(ai.measure)}</p>` : ''}` : '<p class="muted">The AI plan could not be written in this run.</p>'}
  </section>

  <section id="c-reviews" class="block">
    <h2>Replying to reviews</h2>
    ${(replies?.replies ?? []).length ? `<p class="muted">Draft replies for reviews that have none yet. Edit them in your own voice before posting.</p>${replies.replies.map((x: any) => { const t = targets[x.i] ?? {}; return `<div class="card"><div class="meta"><span class="chip ${t.stars <= 2 ? 'urgent' : t.stars <= 3 ? 'fix' : 'good'}">${esc(t.stars)}★</span><span>${esc(t.date)} · ${esc(t.listing)}</span></div>${t.text ? `<p class="quote">${esc(clip(String(t.text), 400))}</p>` : '<p class="quote">(star rating only, no text)</p>'}<p class="reply">${esc(x.reply)}</p>${x.reply_en ? `<p class="reply muted">${esc(x.reply_en)}</p>` : ''}${x.note ? `<p class="muted"><b>Before posting:</b> ${esc(x.note)}</p>` : ''}</div>`; }).join('')}
    <div class="grid2">${replies.template_5star ? `<div class="card"><h4>Thank-you reply for 5★ reviews</h4><p>${esc(replies.template_5star)}</p></div>` : ''}${replies.ask_message ? `<div class="card"><h4>WhatsApp message asking for a review</h4><p>${esc(replies.ask_message)}</p></div>` : ''}</div>` : '<p class="muted">No unanswered reviews needed a draft.</p>'}
  </section>

  <section id="c-plan" class="block">
    <h2>30-day plan</h2>
    ${(top?.plan30 ?? []).length ? `<div class="grid2">${top.plan30.map((w: any) => `<div class="card"><h4>Week ${esc(w.week)}</h4><ul class="plain">${(w.tasks ?? []).map((t: string) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p class="muted">Not written in this run.</p>'}
  </section>

  <section id="c-more" class="block">
    <h2>More we can help with</h2>
    ${(top?.more_help ?? []).length ? `<ul class="findings">${top.more_help.map((m: any) => `<li class="info"><span class="t">${esc(m.service)}</span><span class="d">${esc(m.why_for_you)}</span></li>`).join('')}</ul>` : ''}
  </section>

  ${privateItems.length ? `<section class="private" aria-labelledby="priv-h"><h2 id="priv-h">Private: for you only</h2><ul>${privateItems.map((x) => `<li>${x}</li>`).join('')}</ul></section>` : ''}

  <section id="sources" class="block">
    <h3>Sources</h3>
    <ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${link(s.url, s.title || s.url)}</li>`).join('')}</ol>
  </section>

  <footer>
    <p>Draft report. Part 1 from the company research of ${esc(dateOf(dive.finished_at))}; Parts 2 and 3 checked ${esc(checkedOn)}.</p>
    <p>Maps ranks come from Google Maps searches without a phone's location, so a customer may see a slightly different order. Web ranks come from Brave Search set to Malaysia, used as a stand-in for Google. AI answers come from DeepSeek V4.1 Flash and GPT-6.1 Sol. Advice in Part 3 was drafted with AI from the findings and should be read before use.</p>
  </footer>

  </div>
  </body>
  </html>
  `;
  return html;
}
