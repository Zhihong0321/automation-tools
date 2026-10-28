// The free preview, as a landing page that sells the full report. Built from the company-dive
// alone, plus the preview editor's notes when they exist (preview-editor.ts). Two hooks:
//   1. it is about this company and nobody else: what public sources already say about them
//   2. warning signs we found (contradictions, missing, outdated and wrong details), some shown,
//      the rest and the five numbers customers decide on kept locked for the full report
// Then what the full report unlocks, the done-for-you work, how it works, and the order panel.
// Same look as the full report (Inter, two-tone headlines, near-black bands), laid out as one
// responsive page rather than A4 sheets.
import { CHAPTER_EYEBROW, CHAPTER_ORDER, OPENERS, esc, md } from './report-html.ts';
import type { PreviewNotes } from './preview-editor.ts';

/** What the seller shows on the order panel; every field optional. */
export type Offer = { price?: string; contact?: string; order_url?: string };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dateOf = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
// "July 2023 in [1][3] vs …" reads as "July 2023 vs …": the citation and the word that led into it go.
const noCites = (s: string) => s.replace(/(?:\s+(?:in|on|from|per|by|at))?\s*(?:\[\d+\])+/g, '').replace(/\s+([.,;:)])/g, '$1').replace(/\s+/g, ' ').trim();
const shortName = (n: string) => n.replace(/\s+(Sdn\.?\s*Bhd\.?|Berhad|Bhd\.?|Enterprise|PLT|Pte\.?\s*Ltd\.?)$/i, '').trim() || n;
const CLAIM = /\b(CIDB|SEDA|MyHIJAU|MyHijau|ISO|certif|accredit|licen[cs]|grade|award|member|partner|distributor|approved|appointed)\b/i;

const TYPE: Record<string, [string, string]> = {
  contradiction: ['Contradiction', 'contra'], missing: ['Missing', 'missing'], outdated: ['Outdated', 'outdated'], wrong: ['Wrong information', 'wrong'],
};

/** Warnings the page shows when the preview editor has not run: the dive's own contradictions and gaps. */
function fallbackWarnings(r: any): NonNullable<PreviewNotes['warnings']> {
  const split = (s: string) => { const m = s.match(/^([^:]{3,60}):\s*(.+)$/); return m ? [m[1], m[2]] : [clip(s, 70), s]; };
  return [
    ...(r.contradictions ?? []).map((c: string) => { const [t, d] = split(noCites(c)); return { type: 'contradiction' as const, title: `Sources disagree on: ${t.toLowerCase()}`, detail: d, risk: 'A customer or bank comparing sources sees two stories and starts to doubt both.' }; }),
    ...(r.gaps ?? []).map((g: string) => ({ type: 'missing' as const, title: clip(noCites(g), 80), detail: noCites(g), risk: 'When the record is silent, a careful buyer fills the gap with doubt.' })),
  ];
}

export function buildPreview(dive: any, offer: Offer = {}, notes: PreviewNotes | null = null): string {
  const r = dive?.result ?? {};
  const id = r.identity ?? {};
  const name = String(id.legal_name ?? dive?.company ?? 'Your company');
  const short = shortName(name);
  const facts: any[] = r.facts ?? [];
  const sources: any[] = r.sources ?? [];
  const contradictions: string[] = (r.contradictions ?? []).filter(Boolean);
  const gaps: string[] = (r.gaps ?? []).filter(Boolean);
  const people = (r.people?.people ?? []).filter((p: any) => p.name);
  const domains: string[] = id.official_domains ?? [];
  const ssm = (id.registration_numbers ?? []).find((x: string) => /^\d{12}$/.test(x)) ?? (id.registration_numbers ?? [])[0] ?? null;
  const town = String(id.address ?? '').match(/\b\d{5}\s+([^,]+)/)?.[1]?.trim() ?? 'your town';
  // "Solar photovoltaic (PV) EPC, …" becomes "solar photovoltaic company", so the openers read as a sentence.
  const kind = String(id.industry ?? '').split(/[,(;]/)[0].trim().toLowerCase();
  const trade = !kind ? 'business like yours' : /\b(installer|contractor|company|firm|shop|clinic|agency|supplier|provider|consultant|service)s?$/.test(kind) ? kind : `${kind} company`;
  const claims = facts.filter((f) => CLAIM.test(String(f.fact ?? '')) && !/private limited/i.test(String(f.fact))).length;
  const made = dateOf(dive?.finished_at) || dateOf(new Date().toISOString());
  const year = String(dive?.finished_at ?? new Date().toISOString()).slice(0, 4);

  const known = notes?.known?.length ? notes.known : [
    id.industry && { label: 'What you do', value: clip(String(id.industry), 90) },
    id.address && { label: 'Head office', value: clip(String(id.address), 90) },
    ssm && { label: 'Registration', value: `SSM ${ssm}` },
    domains.length && { label: 'Websites', value: domains.join(', ') },
    (id.aliases ?? []).length && { label: 'Also known as', value: id.aliases.join(', ') },
    people[0] && { label: 'Leadership', value: `${people[0].name}${people[0].role ? `, ${people[0].role}` : ''}` },
  ].filter(Boolean) as { label: string; value: string }[];
  const warnings = notes?.warnings?.length ? notes.warnings : fallbackWarnings(r);
  const shown = warnings.slice(0, 5);
  // Every sign we hold beyond what this page shows stays locked for the full report.
  const moreSigns = Math.max(warnings.length - shown.length, contradictions.length + gaps.length - shown.length, 0);
  const typesFound = [...new Set(warnings.map((w) => w.type))];
  const hook = notes?.hook || `This preview was prepared for ${name} alone, from ${sources.length} public sources. Here is what they say about you, and where they do not agree.`;

  const ctaHref = offer.order_url && /^https?:\/\//.test(offer.order_url) ? offer.order_url : '#order';
  const ctaAttrs = ctaHref === '#order' ? '' : ' target="_blank" rel="noopener"';
  const cta = (label: string, cls = 'btn') => `<a class="${cls}" href="${esc(ctaHref)}"${ctaAttrs}>${esc(label)}</a>`;

  // What each chapter of the full report unlocks for this company.
  const inside: Record<string, { know: string[]; locked: string }> = {
    reputation: { know: ['Which reviews still have no reply from you', 'Review spikes Google may hold back', 'What customers praise, ready for your website'], locked: '? of ? reviews answered' },
    findability: { know: [`Your rank on Google Maps in ${town} and every town you serve`, 'Every business shown before you', 'Towns where you have no listing at all'], locked: '#? on Google Maps' },
    ai: { know: ['How often AI assistants recommend you, and who instead', 'Every wrong phone, address or website they give out', 'The pages assistants read that list your rivals'], locked: '? of ? AI answers name you' },
    website: { know: [`Dead pages, empty pages and broken contact links on ${domains.length ? domains.join(', ') : 'your sites'}`, 'Screenshots of each problem', 'Numbers and addresses that differ from Google'], locked: '? urgent faults' },
    credentials: { know: [`Each of your ${claims || ''} licence and award claims, looked up in its register`.replace('  ', ' '), 'Claims the register contradicts, or shows you undersell', 'Claims no register can back'], locked: '? of ? claims confirmed' },
  };

  const css = `
:root { --ink:#111418; --grey:#5c636d; --muted:#8a9099; --line:#e6e8eb; --band:#f2f3f5; --paper:#fff; --dark:#0e1013; --dark2:#1b2129; --on-dark:#f3f4f6; --on-dark-2:#9aa1ab;
  --contra:#a15c07; --contra-bg:#fdf3e2; --missing:#475467; --missing-bg:#eef0f2; --outdated:#6941c6; --outdated-bg:#f1ecfd; --wrong:#b42318; --wrong-bg:#fdecea; --good:#067647;
  --display:"Inter Tight","Inter",system-ui,sans-serif; --body:"Inter",system-ui,sans-serif; --w:1120px; --gut:max(20px, calc((100vw - var(--w)) / 2)); }
* { box-sizing:border-box; } html { scroll-behavior:smooth; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; background:var(--paper); color:var(--ink); font-family:var(--body); font-size:16px; line-height:1.55; }
h1,h2,h3,h4 { font-family:var(--display); font-weight:600; margin:0; letter-spacing:-0.025em; line-height:1.05; text-wrap:balance; } p { margin:0; } a { color:inherit; }
.g { color:var(--grey); } .dark .g { color:var(--on-dark-2); }
section { padding:96px var(--gut); scroll-margin-top:60px; } .dark { background:var(--dark); color:var(--on-dark); }
.eyebrow { font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); } .dark .eyebrow { color:var(--on-dark-2); }
h2 { font-size:clamp(34px,4.4vw,58px); max-width:16em; } .lead { font-size:19px; line-height:1.5; color:var(--grey); max-width:38em; } .dark .lead { color:var(--on-dark-2); }
.head { display:grid; gap:14px; margin-bottom:44px; }
.btn { display:inline-flex; align-items:center; gap:8px; background:#fff; color:var(--ink); font-weight:600; padding:14px 22px; text-decoration:none; font-size:15px; }
.btn.ink { background:var(--ink); color:#fff; } .btn.ghost { background:none; color:inherit; border:1px solid currentColor; opacity:.85; }
.btn:hover { opacity:.9; } .btn:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
/* top bar */
.top { position:sticky; top:0; z-index:10; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:10px var(--gut); background:rgba(14,16,19,.92); backdrop-filter:blur(10px); color:var(--on-dark); font-size:13px; }
.top b { font-weight:600; } .top span { color:var(--on-dark-2); } .top .btn { padding:9px 14px; font-size:13px; }
/* hero */
.hero { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:56px; align-items:center; padding-top:88px; padding-bottom:88px; }
.hero h1 { font-size:clamp(40px,5.6vw,76px); letter-spacing:-0.035em; line-height:1.02; margin-top:18px; }
.hero .lead { margin-top:22px; color:var(--on-dark); opacity:.86; } .ctas { display:flex; flex-wrap:wrap; gap:12px; margin-top:32px; }
.file { background:var(--paper); color:var(--ink); padding:26px; display:grid; gap:14px; box-shadow:0 30px 60px -30px rgba(0,0,0,.6); transform:rotate(1.2deg); }
.file .stamp { justify-self:start; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--wrong); border:2px solid var(--wrong); padding:3px 8px; transform:rotate(-3deg); }
.file h3 { font-size:24px; letter-spacing:-0.02em; } .file dl { margin:0; display:grid; gap:0; font-size:13.5px; }
.file dl div { display:grid; grid-template-columns:96px minmax(0,1fr); gap:10px; padding:7px 0; border-top:1px solid var(--line); } .file dt { color:var(--muted); } .file dd { margin:0; overflow-wrap:anywhere; }
.file .foot { font-size:12px; color:var(--muted); }
/* proof strip */
.strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:24px; padding:48px var(--gut); border-bottom:1px solid var(--line); }
.strip b { display:block; font-family:var(--display); font-size:clamp(40px,4.6vw,60px); font-weight:500; letter-spacing:-0.04em; line-height:1; } .strip span { font-size:14px; color:var(--grey); }
/* known */
.known { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:2px; background:var(--line); border:1px solid var(--line); }
.known div { background:var(--paper); padding:20px 22px; display:grid; gap:6px; align-content:start; } .known .k { font-size:12px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); } .known .v { font-family:var(--display); font-size:19px; font-weight:500; letter-spacing:-0.01em; line-height:1.3; }
.people { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; } .people span { background:var(--band); padding:8px 12px; font-size:14px; } .people b { font-weight:600; }
.note { font-size:13px; color:var(--muted); margin-top:16px; }
/* warnings */
.warn-section { background:var(--band); }
.legend { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
.tag { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:4px 9px; }
.tag.contra { color:var(--contra); background:var(--contra-bg); } .tag.missing { color:var(--missing); background:var(--missing-bg); } .tag.outdated { color:var(--outdated); background:var(--outdated-bg); } .tag.wrong { color:var(--wrong); background:var(--wrong-bg); }
.warns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.warn { background:var(--paper); padding:24px; display:grid; gap:10px; align-content:start; border-top:4px solid var(--ink); }
.warn.contra { border-top-color:var(--contra); } .warn.missing { border-top-color:var(--missing); } .warn.outdated { border-top-color:var(--outdated); } .warn.wrong { border-top-color:var(--wrong); }
.warn h3 { font-size:21px; letter-spacing:-0.015em; line-height:1.2; } .warn .d { color:var(--grey); font-size:15px; } .warn .risk { font-size:14px; border-left:2px solid var(--ink); padding-left:10px; }
.warn.first { grid-column:1/-1; background:var(--dark); color:var(--on-dark); } .warn.first .d { color:var(--on-dark-2); } .warn.first .risk { border-left-color:#fff; } .warn.first h3 { font-size:clamp(24px,2.6vw,30px); }
.locked { background:var(--paper); padding:24px; display:grid; gap:12px; align-content:start; position:relative; overflow:hidden; border-top:4px solid var(--line); }
.locked .bar { height:12px; background:var(--band); } .locked .bar.s { width:62%; } .locked .bar.m { width:84%; }
.locked .lockmsg { position:absolute; inset:0; display:grid; place-content:center; text-align:center; gap:6px; background:linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.96) 55%); padding:20px; }
.locked .lockmsg b { font-family:var(--display); font-size:44px; font-weight:600; letter-spacing:-0.03em; line-height:1; } .locked .lockmsg span { font-size:14px; color:var(--grey); }
.five { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px; background:var(--line); margin-top:40px; border:1px solid var(--line); }
.five div { background:var(--paper); padding:18px; display:grid; gap:8px; } .five .k { font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.five .v { font-family:var(--display); font-size:20px; font-weight:600; letter-spacing:-0.015em; color:var(--muted); } .five .lk { font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink); }
/* band */
.band-cta { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:32px; align-items:center; padding-top:72px; padding-bottom:72px; }
.band-cta h2 { font-size:clamp(30px,3.4vw,46px); }
/* unlock */
.chapters { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
.chapter { background:var(--band); padding:22px; display:grid; gap:10px; align-content:start; } .chapter .n { font-family:var(--display); font-size:32px; font-weight:500; color:var(--muted); letter-spacing:-0.04em; line-height:1; }
.chapter h3 { font-size:19px; letter-spacing:-0.015em; line-height:1.2; } .chapter ul { margin:0; padding-left:16px; font-size:14px; color:var(--grey); display:grid; gap:4px; }
.chapter .lockline { font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--ink); border-top:1px solid var(--line); padding-top:10px; margin-top:auto; }
.done { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; } .done div { border-top:2px solid var(--ink); padding-top:14px; display:grid; gap:6px; } .done h3 { font-size:19px; } .done p { color:var(--grey); font-size:15px; }
.steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; counter-reset:st; }
.steps div { counter-increment:st; display:grid; gap:6px; } .steps div::before { content:counter(st, decimal-leading-zero); font-family:var(--display); font-size:36px; font-weight:500; letter-spacing:-0.04em; color:var(--muted); }
.steps h3 { font-size:18px; } .steps p { font-size:14.5px; color:var(--grey); } .steps .now { color:var(--good); font-weight:600; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
/* order */
.order { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:56px; align-items:center; }
.order .panel { background:var(--dark2); padding:32px; display:grid; gap:14px; } .order .price { font-family:var(--display); font-size:48px; font-weight:600; letter-spacing:-0.03em; line-height:1; }
.order ul { margin:0; padding-left:18px; color:var(--on-dark-2); display:grid; gap:6px; font-size:15px; }
footer { padding:48px var(--gut) 64px; font-size:13px; color:var(--grey); display:grid; gap:12px; }
details > summary { cursor:pointer; font-family:var(--display); font-weight:600; font-size:17px; padding:12px 0; border-top:1px solid var(--line); color:var(--ink); }
.dossier { display:grid; gap:8px; font-size:14px; color:var(--ink); max-width:72ch; } .dossier h4, .dossier h5, .dossier h6 { font-family:var(--display); font-size:16px; margin-top:10px; }
.dossier table { width:100%; border-collapse:collapse; font-size:13px; } .dossier td, .dossier th { padding:6px 8px; text-align:left; vertical-align:top; } .dossier tbody tr:nth-child(odd) td { background:var(--band); }
.plain { margin:0; padding-left:18px; display:grid; gap:4px; } a.cite { font-size:.75em; text-decoration:none; vertical-align:super; color:var(--grey); }
ol.sources { padding-left:28px; display:grid; gap:2px; font-size:12px; } ol.sources li { overflow-wrap:anywhere; }
@media (max-width:900px) {
  section { padding-top:64px; padding-bottom:64px; } .hero { grid-template-columns:1fr; gap:40px; padding-top:56px; } .file { transform:none; }
  .strip { grid-template-columns:1fr 1fr; } .warns { grid-template-columns:1fr; } .five { grid-template-columns:1fr 1fr; } .band-cta, .order { grid-template-columns:1fr; }
  .done { grid-template-columns:1fr; } .steps { grid-template-columns:1fr 1fr; } .top span.for { display:none; } .lead { font-size:17px; }
}
@media print { .top, .ctas, .band-cta .btn { display:none; } section { padding:36px 24px; break-inside:avoid; } .warn, .chapter, .locked { break-inside:avoid; } }
`;

  const warnCard = (w: NonNullable<PreviewNotes['warnings']>[number], first = false) => {
    const [label, cls] = TYPE[w.type] ?? TYPE.contradiction;
    return `<article class="warn ${cls}${first ? ' first' : ''}"><span class="tag ${cls}">${esc(label)}</span><h3>${esc(noCites(w.title))}</h3>${w.detail ? `<p class="d">${esc(noCites(w.detail))}</p>` : ''}${w.risk ? `<p class="risk">${esc(noCites(w.risk))}</p>` : ''}</article>`;
  };
  const lockedCard = (n: number) => `<article class="locked" aria-label="${n} more warning signs, in the full report"><div class="bar s"></div><div class="bar m"></div><div class="bar"></div><div class="bar m"></div><div class="bar s"></div><div class="lockmsg"><b>+${n}</b><span>more warning signs we found,<br>shown in your full report</span></div></article>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(short)}: your online presence preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=Inter:wght@400;500;600;700&display=swap">
<style>${css}</style>
</head>
<body>

<header class="top"><div><b>Online Presence Audit ${esc(year)}</b> <span class="for">· Prepared for ${esc(name)}</span></div>${cta('Get the full report')}</header>

<section class="dark hero">
  <div>
    <p class="eyebrow">Preview · prepared for ${esc(name)} · ${esc(made)}</p>
    <h1>We read ${esc(sources.length)} public sources about ${esc(short)}.<br><span class="g">${warnings.length ? 'Not all of them tell the same story.' : 'Here is what they say.'}</span></h1>
    <p class="lead">${esc(noCites(hook))}</p>
    <div class="ctas">${cta('Get my full report')}<a class="btn ghost" href="#warnings">See the warning signs ↓</a></div>
  </div>
  <aside class="file" aria-label="Your file">
    <span class="stamp">Prepared for you</span>
    <h3>${esc(name)}</h3>
    <dl>
      ${ssm ? `<div><dt>Registration</dt><dd>SSM ${esc(ssm)}</dd></div>` : ''}
      ${id.address ? `<div><dt>Head office</dt><dd>${esc(clip(String(id.address), 90))}</dd></div>` : ''}
      ${domains.length ? `<div><dt>Websites</dt><dd>${esc(domains.join(', '))}</dd></div>` : ''}
      ${people.length ? `<div><dt>People found</dt><dd>${esc(people.slice(0, 3).map((p: any) => p.name).join(', '))}${people.length > 3 ? ` and ${people.length - 3} more` : ''}</dd></div>` : ''}
      ${warnings.length ? `<div><dt>Warning signs</dt><dd><b style="color:var(--wrong)">${esc(Math.max(warnings.length, contradictions.length + gaps.length))} found</b> before the audit began</dd></div>` : ''}
    </dl>
    <p class="foot">Researched ${esc(made)} from ${esc(sources.length)} public sources</p>
  </aside>
</section>

<div class="strip">
  <div><b>${esc(sources.length)}</b><span>public sources read about ${esc(short)}</span></div>
  <div><b>${esc(facts.length)}</b><span>facts on public record</span></div>
  <div><b>${esc(contradictions.length)}</b><span>places where those sources disagree</span></div>
  <div><b>${esc(gaps.length)}</b><span>questions they cannot answer</span></div>
</div>

<section id="known">
  <div class="head"><p class="eyebrow">What we already know about you</p>
    <h2>Not a template.<br><span class="g">Every line here is about ${esc(short)}.</span></h2>
    <p class="lead">Before a customer calls, before a bank lends or a tender panel shortlists, this is what public sources tell them about you.</p></div>
  <div class="known">${known.map((k) => `<div><span class="k">${esc(k.label)}</span><span class="v">${esc(noCites(k.value))}</span></div>`).join('')}</div>
  ${people.length ? `<div class="people">${people.slice(0, 8).map((p: any) => `<span><b>${esc(p.name)}</b>${p.role ? ` · ${esc(clip(String(p.role), 40))}` : ''}</span>`).join('')}</div>` : ''}
</section>

<section id="warnings" class="warn-section">
  <div class="head"><p class="eyebrow">Warning signs</p>
    <h2>${esc(Math.max(warnings.length, contradictions.length + gaps.length))} warning signs,<br><span class="g">found before the audit even started.</span></h2>
    <p class="lead">These come from public sources alone. Each one is something a customer, a bank or a tender officer can find, and none of them has been checked against your reviews, Google, AI assistants or the official registers yet.</p>
    <div class="legend">${typesFound.map((t) => `<span class="tag ${TYPE[t][1]}">${esc(TYPE[t][0])}</span>`).join('')}</div></div>
  <div class="warns">${shown.map((w, i) => warnCard(w, i === 0)).join('')}${moreSigns ? lockedCard(moreSigns) : ''}</div>
  <div class="five" aria-label="Locked until you order">${CHAPTER_ORDER.map((c) => `<div><span class="k">${esc(CHAPTER_EYEBROW[c])}</span><span class="v">${esc(inside[c].locked)}</span><span class="lk">Locked</span></div>`).join('')}</div>
  <p class="note">And these are only the warning signs public sources show. The five numbers your customers decide on stay locked until the full audit runs.</p>
</section>

<section class="dark band-cta">
  <div><p class="eyebrow">The full audit</p><h2>See what your customers see,<br><span class="g">and exactly what to fix.</span></h2></div>
  ${cta('Get my full report')}
</section>

<section id="unlock">
  <div class="head"><p class="eyebrow">What the full report unlocks</p>
    <h2>Five questions your customers<br><span class="g">already ask about you.</span></h2></div>
  <div class="chapters">${CHAPTER_ORDER.map((c, i) => `<div class="chapter"><span class="n">${String(i + 1).padStart(2, '0')}</span><p class="eyebrow">${esc(CHAPTER_EYEBROW[c])}</p><h3>${esc(OPENERS[c].q[0])} ${esc(OPENERS[c].q[1])}</h3><ul>${inside[c].know.map((k) => `<li>${esc(k)}</li>`).join('')}</ul><p class="lockline">Unlocks: ${esc(inside[c].locked)}</p></div>`).join('')}</div>
  <p class="note">Each chapter opens with why it matters to a ${esc(trade)} in ${esc(town)} today, shows the evidence, what it costs you, and the first thing to fix.</p>
</section>

<section id="done" style="padding-top:0">
  <div class="head"><p class="eyebrow">Done for you</p><h2>Not just a report.<br><span class="g">The fixes, written for you.</span></h2></div>
  <div class="done">
    <div><h3>Your fixes, in order</h3><p>The five changes that win back the most customers, least effort first, and a plan for your first 30 days.</p></div>
    <div><h3>Your homepage, rewritten</h3><p>A new headline, proof points and sections, built only from facts the registers confirm.</p></div>
    <div><h3>Review replies, ready to post</h3><p>A reply for every unanswered complaint, and a WhatsApp message asking customers for a review.</p></div>
    <div><h3>Pages to add</h3><p>One page per service and town, outlined, so customers in each town can find you.</p></div>
    <div><h3>Getting recommended by AI</h3><p>The pages assistants read, the corrections they need, and an FAQ written for them to quote.</p></div>
    <div><h3>Business details for Google</h3><p>The structured data your web developer pastes in, so search engines read the right name, address and phone.</p></div>
  </div>
</section>

<section id="how" style="padding-top:0">
  <div class="head"><p class="eyebrow">How it works</p><h2>From this preview<br><span class="g">to your full report.</span></h2></div>
  <div class="steps">
    <div><h3>This preview</h3><p>${esc(sources.length)} public sources, read for ${esc(short)}.</p><span class="now">Done</span></div>
    <div><h3>You order</h3><p>${offer.contact ? esc(offer.contact) : 'Reply to the message that brought you this preview.'}</p></div>
    <div><h3>We run the full audit</h3><p>Your reviews, Google Maps in every town you serve, AI assistants, every page of your websites, and each claim in its official register.</p></div>
    <div><h3>You get your report</h3><p>One link: desktop, mobile, and A4 to print or save as PDF.</p></div>
  </div>
</section>

<section id="order" class="dark">
  <div class="order">
    <div><p class="eyebrow">Order your full report</p><h2>${esc(short)} deserves<br><span class="g">one story, told right.</span></h2>
      <p class="lead" style="margin-top:18px">You have seen what public sources say. The full audit shows what your customers see, settles every warning sign against the official records, and hands you the fixes.</p></div>
    <div class="panel">
      ${offer.price ? `<p class="price">${esc(offer.price)}</p>` : ''}
      <ul><li>Five chapters on what customers see</li><li>Every warning sign settled against the records</li><li>Fixes in order, and the work written for you</li><li>Desktop, mobile and A4 PDF</li></ul>
      ${ctaHref !== '#order' ? cta('Get my full report') : `<p>${esc(offer.contact || 'Reply to the message that brought you this preview, and we will start your full audit.')}</p>`}
      <p style="font-size:13px;color:var(--on-dark-2)">This preview is yours to keep.</p>
    </div>
  </div>
</section>

<footer>
  <details><summary>The research behind this preview</summary><p style="margin:6px 0 12px">Written from public sources on ${esc(made)}.</p><div class="dossier">${md(String(dive?.dossier ?? ''))}</div></details>
  ${sources.length ? `<details><summary>Sources (${sources.length})</summary><ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(clip(String(s.title || hostOf(s.url)), 90))}</a> · ${esc(hostOf(s.url))}` : esc(s.title)}</li>`).join('')}</ol></details>` : ''}
  <p>Online Presence Audit ${esc(year)} · Preview prepared for ${esc(name)}. Built from public sources only; nothing here has been checked against official registers yet.</p>
</footer>

</body>
</html>
`;
}
