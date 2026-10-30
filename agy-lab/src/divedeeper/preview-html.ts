// The free preview, as a landing page that sells the full report. Built from the company-dive
// alone, plus the preview editor's notes when they exist (preview-editor.ts). Two hooks:
//   1. it is about this company and nobody else: what public sources already say about them
//   2. warning signs we found (contradictions, missing, outdated and wrong details), some shown,
//      the rest and the five numbers customers decide on kept locked for the full report
// Then what is inside the full report, shown in its three parts with placeholder versions of
// the report's own visuals: the deeper dive (reviews, Maps, AI, websites), the credibility check
// (this company's claims and warning signs, each with where it gets checked), and the analysis
// and suggestions (fix list, 30-day plan, the drafts). Then how it works, and the order panel.
// Same look as the full report (Inter, two-tone headlines, near-black bands), laid out as one
// responsive page rather than A4 sheets.
//
// It sits on a public link and goes to someone who has not paid, so it names only the company and
// its publicly named leadership: no staff names, no phone numbers, no private document links, and
// no research write-up (privacy.ts). Sources are the ones the company-dive judged to be about them.
import { CHAPTER_EYEBROW, CHAPTER_ORDER, OPENERS, esc } from './report-html.ts';
import { isLeadership, publicSources, scrub } from './privacy.ts';
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
  const sources: any[] = publicSources(r.sources);
  const contradictions: string[] = (r.contradictions ?? []).filter(Boolean);
  const gaps: string[] = (r.gaps ?? []).filter(Boolean);
  const everyone = (r.people?.people ?? []).filter((p: any) => p.name);
  const people = everyone.filter((p: any) => isLeadership(p.role));
  const staff = everyone.filter((p: any) => !isLeadership(p.role)).map((p: any) => String(p.name));
  /** Text written from the research, made fit for a public page. */
  const P = (t: unknown) => noCites(scrub(t, { phones: true, staff }));
  const domains: string[] = id.official_domains ?? [];
  const ssm = (id.registration_numbers ?? []).find((x: string) => /^\d{12}$/.test(x)) ?? (id.registration_numbers ?? [])[0] ?? null;
  const town = String(id.address ?? '').match(/\b\d{5}\s+([^,]+)/)?.[1]?.trim() ?? 'your town';
  // "Solar photovoltaic (PV) EPC, …" becomes "solar photovoltaic company", so the openers read as a sentence.
  const kind = String(id.industry ?? '').split(/[,(;]/)[0].trim().toLowerCase();
  const trade = !kind ? 'business like yours' : /\b(installer|contractor|company|firm|shop|clinic|agency|supplier|provider|consultant|service)s?$/.test(kind) ? kind : `${kind} company`;
  const claims = facts.filter((f) => CLAIM.test(String(f.fact ?? '')) && !/private limited/i.test(String(f.fact))).length;
  const made = dateOf(dive?.finished_at) || dateOf(new Date().toISOString());
  // finished_at may arrive as a Date, whose String() starts with the weekday.
  const year = String(new Date(dive?.finished_at ?? Date.now()).getFullYear());

  const known = notes?.known?.length ? notes.known : [
    id.industry && { label: 'What you do', value: clip(String(id.industry), 90) },
    id.address && { label: 'Head office', value: clip(String(id.address), 90) },
    ssm && { label: 'Registration', value: `SSM ${ssm}` },
    domains.length && { label: 'Websites', value: domains.join(', ') },
    (id.aliases ?? []).length && { label: 'Also known as', value: id.aliases.join(', ') },
    people[0] && { label: 'Leadership', value: `${people[0].name}${people[0].role ? `, ${people[0].role}` : ''}` },
  ].filter(Boolean) as { label: string; value: string }[];
  const warnings = (notes?.warnings?.length ? notes.warnings : fallbackWarnings(r)).map((w) => ({ ...w, title: P(w.title), detail: P(w.detail), risk: P(w.risk) }));
  const shown = warnings.slice(0, 5);
  // Every sign we hold beyond what this page shows stays locked for the full report.
  const moreSigns = Math.max(warnings.length - shown.length, contradictions.length + gaps.length - shown.length, 0);
  const typesFound = [...new Set(warnings.map((w) => w.type))];
  const hook = notes?.hook ? P(notes.hook) : `This preview was prepared for ${name} alone, from ${sources.length} public sources. Here is what they say about you, and where they do not agree.`;

  const ctaHref = offer.order_url && /^https?:\/\//.test(offer.order_url) ? offer.order_url : '#order';
  const ctaAttrs = ctaHref === '#order' ? '' : ' target="_blank" rel="noopener"';
  const cta = (label: string, cls = 'btn') => `<a class="${cls}" href="${esc(ctaHref)}"${ctaAttrs}>${esc(label)}</a>`;

  // What each chapter of the full report unlocks for this company.
  const inside: Record<string, { know: string[]; locked: string }> = {
    reputation: { know: ['Which reviews still have no reply from you', 'Review spikes Google may hold back', 'What customers praise, ready for your website'], locked: '? of ? reviews answered' },
    findability: { know: ['What a search for your name shows: your own pages, third parties, outdated or negative results', 'Dead or broken pages of yours that search engines still index', `Your rank on Google Maps and in web search in ${town} and every town you serve`], locked: '#? on Google Maps' },
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
/* how it works */
.steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; counter-reset:st; }
.steps div { counter-increment:st; display:grid; gap:6px; } .steps div::before { content:counter(st, decimal-leading-zero); font-family:var(--display); font-size:36px; font-weight:500; letter-spacing:-0.04em; color:var(--muted); }
.steps h3 { font-size:18px; } .steps p { font-size:14.5px; color:var(--grey); } .steps .now { color:var(--good); font-weight:600; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
.uses { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.uses div { background:var(--band); padding:22px; display:grid; gap:8px; align-content:start; border-top:3px solid var(--ink); }
.uses h3 { font-size:19px; letter-spacing:-0.015em; line-height:1.2; } .uses p { font-size:14.5px; color:var(--grey); }
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
/* inside the full report: the three parts */
.parts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.parts a { background:var(--dark2); color:var(--on-dark); padding:28px; display:grid; gap:12px; align-content:start; text-decoration:none; border-top:3px solid #fff; }
.parts a:hover { background:#232a34; } .parts .n { font-family:var(--display); font-size:56px; font-weight:500; letter-spacing:-0.04em; line-height:1; color:var(--on-dark-2); }
.parts h3 { font-size:26px; letter-spacing:-0.02em; } .parts p { color:var(--on-dark-2); font-size:15px; }
.parts li.hl { color:#fff; font-weight:600; padding-left:12px; border-left:3px solid #fff; }
.parts ul { margin:0; padding:0; list-style:none; font-size:14px; } .parts li { padding:8px 0; border-top:1px solid rgba(255,255,255,.12); } .parts .go { font-size:13px; font-weight:600; margin-top:6px; }
.feats { display:grid; gap:64px; }
.feat { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:56px; align-items:center; } .feat:nth-child(even) .mock { order:2; }
.feat .txt { display:grid; gap:12px; align-content:start; } .feat .n { font-family:var(--display); font-size:15px; font-weight:600; color:var(--muted); }
.feat h3 { font-size:clamp(24px,2.6vw,32px); letter-spacing:-0.02em; line-height:1.15; } .feat .what { color:var(--grey); }
.feat ul { margin:0; padding:0; list-style:none; display:grid; gap:0; font-size:15px; } .feat li { padding:9px 0 9px 22px; border-top:1px solid var(--line); position:relative; } .feat li::before { content:"→"; position:absolute; left:0; color:var(--muted); }
.feat .hlb { display:inline-block; background:var(--ink); color:#fff; font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; padding:3px 8px; margin-right:10px; }
.feat .q { font-family:var(--display); font-size:17px; color:var(--grey); margin-top:-4px; } .feat.spot .mock { box-shadow:inset 0 4px 0 var(--ink); }
.m-serp { background:#fff; padding:14px 16px; display:grid; gap:10px; box-shadow:0 1px 3px rgba(0,0,0,.07); } .m-q { font-size:13px; border:1px solid var(--line); border-radius:20px; padding:6px 14px; justify-self:stretch; }
.m-hit { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; align-items:center; } .m-hit .m-host { grid-column:1; } .m-hit .pill { grid-column:2; grid-row:1 / span 2; font-size:10px; }
.feat .lockline { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
/* placeholder visuals, drawn like the full report's own */
.mock { background:var(--band); padding:28px; display:grid; gap:14px; position:relative; margin:0; align-content:start; }
.mock .cap, .tile .cap { font-size:12.5px; color:var(--muted); line-height:1.45; }
.m-lock { justify-self:start; font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--grey); border:1px solid #c9ced4; padding:3px 8px; background:var(--paper); }
.rd { display:inline-block; height:9px; background:#d3d8de; border-radius:2px; vertical-align:middle; max-width:100%; }
.m-card { background:#fff; padding:16px 18px; display:grid; gap:9px; box-shadow:0 1px 3px rgba(0,0,0,.07); }
.m-top { display:flex; align-items:center; gap:10px; font-size:13px; } .m-av { flex:none; width:30px; height:30px; border-radius:50%; background:#c9ced4; display:grid; place-items:center; color:#fff; font-weight:700; font-size:13px; }
.m-stars { color:#e8a500; letter-spacing:1px; font-size:13px; } .m-stars i { color:#d3d8de; font-style:normal; }
.m-noreply { font-size:12px; font-weight:700; color:var(--wrong); }
.m-bars { display:flex; align-items:flex-end; gap:3px; height:72px; border-bottom:1px solid #c9ced4; } .m-bars i { flex:1; background:#bfc5cc; } .m-bars i.hot { background:var(--wrong); }
.m-board { width:100%; border-collapse:collapse; font-size:13.5px; background:#fff; } .m-board td { padding:10px 12px; border-top:1px solid var(--line); vertical-align:middle; }
.m-board .rk { width:48px; font-weight:600; color:var(--muted); } .m-board .num { width:64px; text-align:right; color:var(--muted); font-size:12.5px; white-space:nowrap; }
.m-board .me td { background:var(--ink); color:#fff; font-weight:600; } .m-board .me .rk, .m-board .me .num { color:#fff; }
.m-board .gap td { color:var(--muted); font-size:12px; text-align:center; background:var(--band); padding:6px; }
.m-meter { display:block; height:8px; background:var(--band); } .m-meter i { display:block; height:100%; background:#9aa1ab; }
.m-ask { background:#fff; padding:12px 16px; border-radius:16px 16px 16px 4px; font-size:14px; justify-self:start; max-width:92%; box-shadow:0 1px 3px rgba(0,0,0,.07); }
.m-stack { display:flex; height:14px; } .m-stack i { display:block; } .s-good { background:var(--good); } .s-fix { background:#e0a43a; } .s-urgent { background:var(--wrong); } .s-none { background:#bfc5cc; }
.kk { display:inline-block; width:9px; height:9px; margin:0 3px 0 8px; vertical-align:baseline; } .kk:first-child { margin-left:0; }
.m-browser { background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.08); } .m-url { display:flex; gap:10px; align-items:center; padding:9px 12px; background:#e6e9ec; font-size:12px; color:var(--grey); overflow:hidden; white-space:nowrap; }
.m-url .dots { display:flex; gap:5px; } .m-url .dots i { width:9px; height:9px; border-radius:50%; background:#c4c9cf; }
.m-page { padding:20px; display:grid; gap:10px; position:relative; min-height:210px; align-content:start; } .m-boxes { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px; } .m-boxes span { height:62px; background:var(--band); }
.m-pin { position:absolute; background:var(--wrong); color:#fff; font-size:11px; font-weight:700; letter-spacing:.03em; padding:4px 8px; box-shadow:0 4px 10px -4px rgba(180,35,24,.6); }
.m-btn { justify-self:start; background:var(--ink); color:#fff; font-size:11px; font-weight:600; padding:7px 12px; }
/* credibility ledger */
.cred { display:grid; grid-template-columns:minmax(0,1fr); gap:0; }
.ledger { width:100%; border-collapse:collapse; background:var(--paper); font-size:15px; }
.ledger th { text-align:left; font-size:11.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); padding:14px 20px; font-weight:600; border-bottom:2px solid var(--ink); }
.ledger td { padding:18px 20px; border-top:1px solid var(--line); vertical-align:top; } .ledger tr:first-child td { border-top:0; }
.ledger .said { display:grid; gap:6px; } .ledger .said b { font-weight:500; } .ledger .where { color:var(--grey); font-size:14px; width:30%; } .ledger .res { width:1%; white-space:nowrap; }
.ledger .src { font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
.ledger tr.hidden td { background:#fafbfc; }
.vstamp { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; border:2px dashed #b4bac2; color:var(--muted); padding:4px 9px; transform:rotate(-2deg); }
.outcomes { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:20px; font-size:13px; color:var(--grey); }
.pill { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:4px 9px; }
.pill.good { color:var(--good); background:#e5f4ec; } .pill.bad { color:var(--wrong); background:var(--wrong-bg); } .pill.amb { color:var(--contra); background:var(--contra-bg); } .pill.none { color:var(--missing); background:var(--missing-bg); }
/* analysis and suggestions */
.tiles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.tile { background:var(--band); padding:24px; display:grid; gap:12px; align-content:start; } .tile.wide { grid-column:span 2; }
.tile h3 { font-size:20px; letter-spacing:-0.015em; } .tile > p { font-size:14.5px; color:var(--grey); }
.tile .in { background:#fff; padding:16px; display:grid; gap:9px; font-size:13px; box-shadow:0 1px 3px rgba(0,0,0,.07); }
.m-fix { display:grid; grid-template-columns:26px minmax(0,1fr) auto auto; gap:10px; align-items:center; padding:9px 0; border-top:1px solid var(--line); } .m-fix:first-child { border-top:0; }
.m-fix .no { font-family:var(--display); font-weight:600; color:var(--muted); } .m-pill { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; background:var(--band); color:var(--grey); white-space:nowrap; } .m-pill.hi { color:var(--wrong); background:var(--wrong-bg); }
.m-weeks { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; } .m-weeks div { display:grid; gap:7px; align-content:start; } .m-weeks b { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; }
.m-reply { background:var(--ink); padding:12px 14px; border-radius:12px 12px 4px 12px; justify-self:end; width:86%; display:grid; gap:7px; } .m-reply .rd { background:rgba(255,255,255,.32); } .m-reply small { color:#c9ced4; font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
.m-slug { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12.5px; background:#fff; padding:9px 12px; border-left:3px solid var(--ink); overflow-wrap:anywhere; }
.m-code { margin:0; background:var(--dark); color:#c9d1d9; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12px; padding:16px; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; } .m-code .rd { background:rgba(255,255,255,.22); height:8px; }
.m-faq { display:grid; gap:6px; padding:9px 0; border-top:1px solid var(--line); } .m-faq:first-child { border-top:0; } .m-faq b { font-size:13px; }
@media (max-width:900px) {
  section { padding-top:64px; padding-bottom:64px; } .hero { grid-template-columns:1fr; gap:40px; padding-top:56px; } .file { transform:none; }
  .parts { grid-template-columns:1fr; } .feat { grid-template-columns:1fr; gap:28px; } .feat:nth-child(even) .mock { order:0; } .tiles { grid-template-columns:1fr 1fr; }
  .strip { grid-template-columns:1fr 1fr; } .warns { grid-template-columns:1fr; } .five { grid-template-columns:1fr 1fr; } .band-cta, .order { grid-template-columns:1fr; }
  .uses { grid-template-columns:1fr 1fr; } .steps { grid-template-columns:1fr 1fr; } .top span.for { display:none; } .lead { font-size:17px; }
}
@media (max-width:700px) {
  .ledger thead { display:none; } .ledger tr { display:grid; gap:8px; padding:16px 18px; border-top:1px solid var(--line); } .ledger tr:first-child { border-top:0; }
  .ledger td { display:block; padding:0; border:0; width:auto !important; } .ledger .where::before { content:"Checked against: "; font-weight:600; color:var(--ink); }
}
@media (max-width:560px) { .uses, .tiles { grid-template-columns:1fr; } .tile.wide { grid-column:auto; } .m-weeks { grid-template-columns:1fr 1fr; } .mock { padding:18px; } .m-fix { grid-template-columns:22px minmax(0,1fr) auto; } .m-fix .eff { display:none; } }
@media print { .top, .ctas, .band-cta .btn { display:none; } section { padding:36px 24px; break-inside:avoid; } .warn, .locked, .uses div, .feat, .tile, .parts a, .ledger tr { break-inside:avoid; } }
`;

  const warnCard = (w: NonNullable<PreviewNotes['warnings']>[number], first = false) => {
    const [label, cls] = TYPE[w.type] ?? TYPE.contradiction;
    return `<article class="warn ${cls}${first ? ' first' : ''}"><span class="tag ${cls}">${esc(label)}</span><h3>${esc(w.title)}</h3>${w.detail ? `<p class="d">${esc(w.detail)}</p>` : ''}${w.risk ? `<p class="risk">${esc(w.risk)}</p>` : ''}</article>`;
  };
  // ---------- inside the full report ----------
  // Placeholder versions of the full report's visuals: grey bars where this company's numbers go.
  const rd = (w: string) => `<span class="rd" style="width:${w}"></span>`;
  const site = domains[0] ?? 'your website';
  const query = `${kind || 'business'} ${town === 'your town' ? 'near me' : `in ${town}`}`;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pageSlug = `/${slug(kind.split(/\s+/).slice(-2).join(' ') || 'services')}${town === 'your town' ? '' : `-${slug(town)}`}`;

  const mocks: Record<string, string> = {
    reputation: `<figure class="mock" aria-label="Sample of the reviews chapter"><span class="m-lock">Your reviews go here</span>
      <div class="m-card"><div class="m-top"><span class="m-av">?</span><div style="display:grid;gap:6px;flex:1">${rd('38%')}<span class="m-stars">★<i>★★★★</i></span></div></div>${rd('96%')}${rd('88%')}${rd('62%')}<p class="m-noreply">No reply from the owner for ? days</p></div>
      <div class="m-bars" aria-hidden="true">${[22, 30, 18, 26, 40, 34, 28, 100, 36, 24, 30, 44, 38, 26, 32, 48, 30, 42].map((h, i) => `<i${i === 7 ? ' class="hot"' : ''} style="height:${h}%"></i>`).join('')}</div>
      <figcaption class="cap">Every Google review on your listings, month by month. Red marks a one-day spike Google may hold back.</figcaption></figure>`,
    findability: `<figure class="mock" aria-label="Sample of the search chapter"><span class="m-lock">Your search results go here</span>
      <div class="m-serp"><p class="m-q">${esc(short)}</p>${[['Your page', '', '70%'], ['Third party', 'amb', '58%'], ['Dead page, still indexed', 'bad', '64%']].map(([t, c, w]) => `<div class="m-hit"><span class="m-host">${rd('30%')}</span>${rd(w)}<span class="pill ${c || 'none'}">${t}</span></div>`).join('')}</div>
      <table class="m-board"><tbody>${[['62%', 92], ['48%', 74], ['55%', 60]].map(([w, m], i) => `<tr><td class="rk">#${i + 1}</td><td>${rd(String(w))}</td><td style="width:30%"><span class="m-meter"><i style="width:${m}%"></i></span></td><td class="num">? reviews</td></tr>`).join('')}
      <tr class="gap"><td colspan="4">? more businesses before you</td></tr>
      <tr class="me"><td class="rk">#?</td><td colspan="2">You · ${esc(short)}</td><td class="num">? reviews</td></tr></tbody></table>
      <figcaption class="cap">What a search for your name shows, then Google Maps and web search for “${esc(query)}” in every town you serve.</figcaption></figure>`,
    ai: `<figure class="mock" aria-label="Sample of the AI assistants chapter"><span class="m-lock">Your AI answers go here</span>
      <p class="m-ask">“Who is the best ${esc(query)}?”</p>
      <table class="m-board"><tbody>${[['44%', 88], ['58%', 66], ['36%', 40]].map(([w, m]) => `<tr><td>${rd(String(w))}</td><td style="width:34%"><span class="m-meter"><i style="width:${m}%"></i></span></td><td class="num">? of ?</td></tr>`).join('')}
      <tr class="me"><td>You · ${esc(short)}</td><td></td><td class="num">? of ?</td></tr></tbody></table>
      <span class="m-stack" aria-hidden="true"><i class="s-good" style="width:34%"></i><i class="s-fix" style="width:18%"></i><i class="s-urgent" style="width:22%"></i><i class="s-none" style="width:26%"></i></span>
      <figcaption class="cap">Asked about you by name: <span class="kk s-good"></span>right <span class="kk s-fix"></span>partly right <span class="kk s-urgent"></span>wrong <span class="kk s-none"></span>did not know you</figcaption></figure>`,
    website: `<figure class="mock" aria-label="Sample of the websites chapter"><span class="m-lock">Your screenshots go here</span>
      <div class="m-browser"><div class="m-url"><span class="dots"><i></i><i></i><i></i></span>${esc(site)}/…</div>
        <div class="m-page">${rd('54%')}${rd('78%')}${rd('40%')}<div class="m-boxes"><span></span><span></span><span></span></div>
          <span class="m-pin" style="top:14px;right:14px">Dead page</span><span class="m-pin" style="top:100px;left:10px">Empty service page</span><span class="m-pin" style="bottom:14px;right:18px">Phone differs from Google</span></div></div>
      <figcaption class="cap">Every page of ${esc(domains.length ? domains.join(', ') : 'your websites')} opened, each link and phone number tested, each fault screenshotted.</figcaption></figure>`,
  };
  const what: Record<string, string> = {
    reputation: 'We read every Google review on every listing you have, and every reply you wrote back.',
    findability: `We search your name and your trade the way a customer does, on the web and on Google Maps, in ${town} and every town you serve. You see what search engines hold about you, and who shows up before you.`,
    ai: 'We ask AI assistants the questions your customers ask, many times over: who to hire, and what they know about you by name, from memory and with a web search.',
    website: `We open every page of ${domains.length ? domains.join(', ') : 'your websites'}, test each link, form and phone number, and screenshot every fault.`,
  };
  // AI and search lead: they are where most customers now meet a business first.
  const spotlight: Record<string, string> = { ai: 'How top AI sees your brand', findability: 'How search engines index your company' };
  const diveChapters = ['ai', 'findability', 'reputation', 'website'] as const;

  // The credibility check: this company's own claims and warning signs, each with where it gets checked.
  const registerFor = (t: string) => /\bCIDB\b|\bG[1-7]\b|grade/i.test(t) ? 'CIDB contractor register'
    : /\bSEDA\b|RPVSP|RPVI/i.test(t) ? 'SEDA registered provider directories'
    : /MyHIJAU/i.test(t) ? 'MyHIJAU directory'
    : /award|winner/i.test(t) ? 'The award organiser’s list of winners'
    : /member|association/i.test(t) ? 'The association’s member list'
    : /ISO|certif|accredit/i.test(t) ? 'The certification body’s register'
    : 'The issuing body’s own register, where one exists';
  // Judged on the title first, so a detail that mentions "About page" or "links" does not decide it.
  const checkOne = (t: string) => /\b(CIDB|SEDA|MyHIJAU|ISO|licen[cs]e?d?|certif\w*|accredit\w*|award|member)\b/i.test(t) ? registerFor(t)
    : /\b(SSM|registration|registry|register(ed)?|incorporat\w*|directors?|owners?|ownership|shareholders?|capital|revenue|financ\w*|accounts|headcount|employees?|staff)\b/i.test(t) ? 'Company registers and public records'
    : /\b(reviews?|ratings?|stars?)\b/i.test(t) ? 'Every Google review on your listings'
    : /\b(AI|ChatGPT|assistants?)\b/i.test(t) ? 'AI assistants, asked about you by name'
    : /\b(maps|listings?|address(es)?|location|office|phones?|contact)\b/i.test(t) ? 'Google Maps, your websites and directories'
    : /\b(websites?|domains?|pages?|links?|site)\b/i.test(t) ? 'Every page of your websites'
    : '';
  const checkFor = (title: string, detail: string) => checkOne(title) || checkOne(detail) || 'Public registers and records';
  const claimRows = facts.map((f) => String(f.fact ?? '')).filter((f) => CLAIM.test(f) && !/private limited/i.test(f)).slice(0, 3)
    .map((f) => ({ src: 'Your claim', said: clip(P(f), 120), where: registerFor(f) }));
  const signRows = warnings.slice(0, Math.max(6 - claimRows.length, 3))
    .map((w) => ({ src: TYPE[w.type]?.[0] ?? 'Warning sign', said: w.title, where: checkFor(w.title, String(w.detail ?? '')) }));
  const ledgerRows = [...claimRows, ...signRows];
  const hiddenRows = Math.max(Math.max(warnings.length, contradictions.length + gaps.length) - signRows.length, 0) + Math.max(claims - claimRows.length, 0);

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
      ${people.length ? `<div><dt>Leadership</dt><dd>${esc(people.slice(0, 3).map((p: any) => p.name).join(', '))}</dd></div>` : ''}
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
  <div class="known">${known.map((k) => `<div><span class="k">${esc(k.label)}</span><span class="v">${esc(P(k.value))}</span></div>`).join('')}</div>
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

<section id="inside" class="dark" style="padding-top:0">
  <div class="head"><p class="eyebrow">Inside your full report</p>
    <h2>Three parts, written for ${esc(short)}.<br><span class="g">Here is what each one shows you.</span></h2>
    <p class="lead">This preview read what public sources say. The full report goes further: it measures what your customers actually see, checks what is claimed about you, and tells you what to do about it.</p></div>
  <div class="parts">
    <a href="#dive"><span class="n">01</span><h3>The deeper dive</h3><p>Four places customers judge you before they call, each measured.</p>
      <ul>${diveChapters.map((c) => `<li${spotlight[c] ? ' class="hl"' : ''}>${esc(spotlight[c] ?? (c === 'reputation' ? 'Your Google reviews' : CHAPTER_EYEBROW[c]))}</li>`).join('')}</ul><span class="go">See what it shows ↓</span></a>
    <a href="#cred"><span class="n">02</span><h3>The credibility check</h3><p>Every claim and warning sign, checked against the records a stranger would use.</p>
      <ul><li>Licences and awards, in their registers</li><li>The ${esc(Math.max(warnings.length, contradictions.length + gaps.length))} warning signs, settled</li><li>What a bank or tender officer finds in ten minutes</li></ul><span class="go">See what it shows ↓</span></a>
    <a href="#advice"><span class="n">03</span><h3>Analysis and suggestions</h3><p>What it all means for your business, and what to do, in order.</p>
      <ul><li>Your fixes, least effort first</li><li>A plan for your first 30 days</li><li>Copy, replies and pages, written for you</li></ul><span class="go">See what it shows ↓</span></a>
  </div>
</section>

<section id="dive">
  <div class="head"><p class="eyebrow">Part 1 · The deeper dive</p>
    <h2>Four places customers judge you.<br><span class="g">We measure every one.</span></h2>
    <p class="lead">Each chapter opens with why it matters to ${/^[aeiou]/i.test(trade) ? 'an' : 'a'} ${esc(trade)} in ${esc(town)}, shows the evidence, what it costs you, and the first thing to fix. The grey bars below are where your own numbers go.</p></div>
  <div class="feats">${diveChapters.map((c) => `<div class="feat${spotlight[c] ? ' spot' : ''}">${mocks[c]}<div class="txt"><span class="n">${spotlight[c] ? '<span class="hlb">Highlight</span>' : ''}Chapter ${String(CHAPTER_ORDER.indexOf(c) + 1).padStart(2, '0')} · ${esc(CHAPTER_EYEBROW[c])}</span><h3>${esc(spotlight[c] ?? `${OPENERS[c].q[0]} ${OPENERS[c].q[1]}`)}</h3>${spotlight[c] ? `<p class="q">${esc(OPENERS[c].q[0])} ${esc(OPENERS[c].q[1])}</p>` : ''}<p class="what">${esc(what[c])}</p><ul>${inside[c].know.map((k) => `<li>${esc(k)}</li>`).join('')}</ul><p class="lockline">In your report: ${esc(inside[c].locked)}</p></div></div>`).join('')}</div>
</section>

<section id="cred" class="warn-section">
  <div class="head"><p class="eyebrow">Part 2 · The credibility check</p>
    <h2>Every claim, checked<br><span class="g">where a stranger would check it.</span></h2>
    <p class="lead">Banks, tender panels and careful customers verify before they trust. We do it first: each licence, award and membership is looked up in the issuing body’s own register, and each warning sign is settled against the records. These are the first rows of ${esc(short)}’s check.</p></div>
  <div class="cred"><table class="ledger"><thead><tr><th>What is said about ${esc(short)}</th><th>Checked against</th><th>Result</th></tr></thead><tbody>
    ${ledgerRows.map((r) => `<tr><td class="said"><span class="src">${esc(r.src)}</span><b>${esc(r.said)}</b></td><td class="where">${esc(r.where)}</td><td class="res"><span class="vstamp">In full report</span></td></tr>`).join('')}
    ${hiddenRows ? `<tr class="hidden"><td class="said"><span class="src">+${esc(hiddenRows)} more</span>${rd('72%')}${rd('48%')}</td><td class="where">${rd('80%')}</td><td class="res"><span class="vstamp">In full report</span></td></tr>` : ''}
  </tbody></table></div>
  <div class="outcomes"><span>Each row ends with one result:</span><span class="pill good">Confirmed</span><span class="pill good">Better than you claim</span><span class="pill bad">Register says otherwise</span><span class="pill amb">Not found</span><span class="pill none">No public register</span></div>
  <p class="note">Then one page of what a customer, bank or tender officer learns about you in ten minutes: your registration, Google rating, address and websites side by side, and what does not add up.</p>
</section>

<section id="advice">
  <div class="head"><p class="eyebrow">Part 3 · Analysis and suggestions</p>
    <h2>Not just what is wrong.<br><span class="g">What to do, in order, written for you.</span></h2>
    <p class="lead">We weigh every finding by what it costs you in customers and what it takes to fix, then write the work out so you or your web developer can start the same day.</p></div>
  <div class="tiles">
    <div class="tile wide"><h3>Your fixes, in order</h3><p>The changes that win back the most customers, least effort first, each with why it matters.</p>
      <div class="in">${[['1 hour', 'High'], ['1 day', 'High'], ['1 hour', 'Medium'], ['1 week', 'High'], ['1 day', 'Medium']].map(([e, im], i) => `<div class="m-fix"><span class="no">${i + 1}</span>${rd(['82%', '64%', '74%', '58%', '68%'][i])}<span class="m-pill eff">${e}</span><span class="m-pill${im === 'High' ? ' hi' : ''}">${im} impact</span></div>`).join('')}</div></div>
    <div class="tile"><h3>Your first 30 days</h3><p>The same fixes, laid out week by week.</p>
      <div class="in"><div class="m-weeks">${[1, 2, 3, 4].map((w) => `<div><b>Week ${w}</b>${rd('92%')}${rd('70%')}${w < 3 ? rd('84%') : ''}</div>`).join('')}</div></div></div>
    <div class="tile"><h3>Your homepage, rewritten</h3><p>A new headline, proof points and sections, built only from facts we verified.</p>
      <div class="m-browser"><div class="m-url"><span class="dots"><i></i><i></i><i></i></span>${esc(site)}</div><div class="m-page" style="min-height:0">${rd('86%')}${rd('60%')}${rd('74%')}<span class="m-btn">Your call to action</span></div></div></div>
    <div class="tile"><h3>Review replies, ready to post</h3><p>A reply for every unanswered complaint, and a WhatsApp message asking for reviews.</p>
      <div class="in"><span class="m-stars">★<i>★★★★</i></span>${rd('90%')}${rd('56%')}<div class="m-reply"><small>Your reply</small>${rd('94%')}${rd('70%')}</div></div></div>
    <div class="tile"><h3>Pages to add, town by town</h3><p>One page per service and town, outlined, so customers in each town find you.</p>
      <div class="in" style="background:none;box-shadow:none;padding:0"><span class="m-slug">${esc(pageSlug)}</span><span class="m-slug">${rd('62%')}</span><span class="m-slug">${rd('48%')}</span></div></div>
    <div class="tile"><h3>Getting recommended by AI</h3><p>The pages assistants read, the corrections they need, and an FAQ written for them to quote.</p>
      <div class="in">${[0, 1].map(() => `<div class="m-faq"><b>Q</b>${rd('80%')}${rd('64%')}</div>`).join('')}</div></div>
    <div class="tile wide"><h3>Business details for Google and AI</h3><p>Structured data your web developer pastes into every page, so search engines and assistants read the right name, address and phone.</p>
      <pre class="m-code">&lt;script type="application/ld+json"&gt;
{ "@type": "LocalBusiness",
  "name": "${esc(name)}",${domains.length ? `\n  "url": "https://${esc(domains[0])}",` : ''}
  "telephone": ${rd('120px')},
  "address": ${rd('220px')},
  "areaServed": ${rd('160px')} }
&lt;/script&gt;</pre></div>
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

<section id="protect" style="padding-top:0">
  <div class="head"><p class="eyebrow">Why it protects you</p><h2>One audit,<br><span class="g">four ways it guards your interest.</span></h2>
    <p class="lead">The same research we ran on ${esc(short)} works on any company you deal with.</p></div>
  <div class="uses">
    <div><h3>See yourself as customers do</h3><p>Customers search you before they call. Know what they find, so you fix it before it costs you a sale.</p></div>
    <div><h3>Check a vendor before you sign</h3><p>Running a tender or choosing a supplier? See their registration, licences, reviews and warning signs before you commit money to them.</p></div>
    <div><h3>Know your competitors</h3><p>How rivals show up on Google, in reviews and to AI assistants, and where you are already stronger than them.</p></div>
    <div><h3>Win the client before the meeting</h3><p>Research a prospect first. Walk in knowing their business, their people and their gaps, and write a proposal that speaks to them.</p></div>
  </div>
</section>

<section id="order" class="dark">
  <div class="order">
    <div><p class="eyebrow">Order your full report</p><h2>${esc(short)} deserves<br><span class="g">one story, told right.</span></h2>
      <p class="lead" style="margin-top:18px">You have seen what public sources say. The full audit shows what your customers see, settles every warning sign against the official records, and hands you the fixes.</p></div>
    <div class="panel">
      ${offer.price ? `<p class="price">${esc(offer.price)}</p>` : ''}
      <ul><li>The deeper dive: how top AI sees your brand, how search engines index you, your reviews and your websites</li><li>The credibility check: every claim and warning sign checked against the records</li><li>Analysis and suggestions: fixes in order, a 30-day plan, and the work written for you</li><li>Desktop, mobile and A4 PDF</li></ul>
      ${ctaHref !== '#order' ? cta('Get my full report') : `<p>${esc(offer.contact || 'Reply to the message that brought you this preview, and we will start your full audit.')}</p>`}
      <p style="font-size:13px;color:var(--on-dark-2)">This preview is yours to keep.</p>
    </div>
  </div>
</section>

<footer>
  ${sources.length ? `<details><summary>The public sources behind this preview (${sources.length})</summary><ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(clip(String(s.title || hostOf(s.url)), 90))}</a> · ${esc(hostOf(s.url))}` : esc(s.title)}</li>`).join('')}</ol></details>` : ''}
  <p>Online Presence Audit ${esc(year)} · Preview prepared for ${esc(name)}. Built from public sources only; nothing here has been checked against official registers yet.</p>
</footer>

</body>
</html>
`;
}
