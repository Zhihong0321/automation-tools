// The report as one standalone HTML document of A4 pages, from data alone (no network, no files).
// Styled after the Eternalgy corporate profile: two-tone headlines, dark pages for the numbers,
// banded tables. On screen the pages stack like sheets; Print / Save as PDF gives clean A4.
// One document, three versions: on screen ?view=desktop|mobile|a4 (or the screen width) picks
// the layout and a switcher changes it; printing always gives the A4 pages.
//   cover        company, title, the homepage on a phone
//   at a glance  five measured numbers, the status of each area, the verdict
//   fix first    the three problems costing the most customers
//   chapters     one per area, each opening with why it matters today, then what we found
//   plan         fixes in order and the first 30 days
//   ready to use homepage copy, pages, review replies, AI plan, FAQ, business data
//   stranger     what a customer, bank or tender officer learns in 10 minutes
//   appendix     every finding in plain words, the background research, sources, method
// Numbers come from editor.ts resolve(); wording from the S3 editor lane when it ran, else
// built in here. Used by the hub (divedeeper.ts) and by scripts/dive-deeper/report.ts.
// A missing lane only drops its block; the report still builds.
import { AREAS, resolve, type Item } from './editor.ts';

/** Why each area matters, said once for every client. No market statistics we cannot source. */
export const OPENERS: Record<string, { q: [string, string]; body: (t: { trade: string; town: string }) => string }> = {
  reputation: {
    q: ['Do reviews still decide', 'who gets the call?'],
    body: ({ trade }) => `Before a customer phones a ${trade}, they read its Google reviews. They read the bad ones first, and then they read what the owner wrote back. A reply shows a stranger how you behave when something goes wrong, which is exactly what they are trying to find out before they hire you. Silence reads as the answer.`,
  },
  findability: {
    q: ['When a customer searches,', 'do they find you?'],
    body: ({ trade, town }) => `Customers do not search for your company name. They search for what they need and where, such as “${trade} in ${town}”, and most of them call one of the first few names Google Maps shows. Where you appear on that list depends on your reviews, on how complete and consistent your listing is, and on whether you have a listing in every town you serve.`,
  },
  ai: {
    q: ['How important is an AI recommendation', 'in today’s market?'],
    body: ({ trade, town }) => `More and more customers now ask an AI assistant, such as ChatGPT, Gemini or DeepSeek, who to hire instead of comparing websites themselves. The assistant replies with a short list of names. A business that is not on that list never gets the chance to quote for the job, and one the assistant describes wrongly loses the customer’s trust before the first call. We asked the assistants what a customer looking for a ${trade} in ${town} would ask, and what they would ask about you by name.`,
  },
  website: {
    q: ['Does your website win the customer,', 'or lose them?'],
    body: () => 'Your website is where a customer goes to check you before they call. A dead link, an empty page or a phone number that does not connect tells them the business is careless, and they move on to the next name. We read every page of your sites and tested every link, phone number and WhatsApp link the way a customer would.',
  },
  credentials: {
    q: ['Can a stranger verify', 'what you claim?'],
    body: () => 'Banks, tender officers and larger clients check a contractor’s licences and awards before they sign. We looked up each claim on your sites in the issuing body’s own register, the same check a careful buyer makes. A claim the register confirms builds trust; one it contradicts, or one nobody can check, raises a question you will not be there to answer.',
  },
};
export const CHAPTER_ORDER = ['reputation', 'findability', 'ai', 'website', 'credentials'] as const;
export const CHAPTER_EYEBROW: Record<string, string> = { reputation: 'Reputation', findability: 'Search and Maps', ai: 'AI assistants', website: 'Your websites', credentials: 'Licences and awards' };

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markdown of the company-dive dossier to HTML: headings, tables, lists, bold, [n] citations. */
export function md(src: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+)\]/g, '<a class="cite" href="#src-$1">[$1]</a>');
  const out: string[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^#\s/.test(ln)) continue;
    const h = ln.match(/^(#{2,4})\s+(.*)/);
    if (h) { out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue; }
    if (/^\|/.test(ln)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (row: string) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((x) => !/^\|[\s:|-]+\|$/.test(x));
      out.push(`<table class="band"><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln) || /^\s*\d+\.\s+/.test(ln)) {
      const ordered = /^\s*\d+\./.test(ln);
      const list: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) list.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      i--;
      out.push(`<${ordered ? 'ol' : 'ul'} class="plain">${list.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (ln.trim()) out.push(`<p>${inline(ln)}</p>`);
  }
  return out.join('\n');
}

/** The A4 / desktop / mobile stylesheet shared by the full report and the preview. */
const CSS = `/* A4 sheets in the Eternalgy corporate-profile style: ink and grey type, near-black feature pages,
   grey-banded tables, square panels. Colour is kept for status only. */
:root { --ink:#111418; --grey:#5c636d; --muted:#8a9099; --line:#e6e8eb; --band:#f2f3f5; --paper:#ffffff; --desk:#d9dcdf;
  --dark:#0e1013; --dark2:#1b2129; --on-dark:#f3f4f6; --on-dark-2:#9aa1ab;
  --urgent:#b42318; --urgent-bg:#fdecea; --fix:#a15c07; --fix-bg:#fdf3e2; --good:#067647; --good-bg:#e6f4ec; --info:#5c636d; --info-bg:#eef0f2; --none:#cfd3d8;
  --display:"Inter Tight","Inter",system-ui,sans-serif; --body:"Inter",system-ui,sans-serif; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; background:var(--desk); color:var(--ink); font-family:var(--body); font-size:13.5px; line-height:1.55; }
.page { position:relative; width:210mm; min-height:297mm; margin:24px auto; background:var(--paper); padding:20mm 18mm 24mm; box-shadow:0 2px 18px rgba(0,0,0,.12); display:flex; flex-direction:column; gap:16px; }
.page.dark { background:var(--dark); color:var(--on-dark); }
.pf { position:absolute; left:18mm; right:18mm; bottom:9mm; display:flex; justify-content:space-between; font-size:9px; color:var(--muted); }
.dark .pf { color:var(--on-dark-2); }
h1,h2,h3,h4 { font-family:var(--display); font-weight:600; margin:0; letter-spacing:-0.025em; line-height:1.05; }
.display { font-size:40px; line-height:1.04; max-width:15em; } .display .g, h1 .g { color:var(--grey); } .dark .display .g, .dark h1 .g { color:var(--on-dark-2); }
p { margin:0; } a { color:inherit; } .muted { color:var(--muted); } .small { font-size:11.5px; }
.eyebrow { font-size:10.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
.lead { font-size:15.5px; line-height:1.5; } .body { font-size:13.5px; max-width:44em; }
.sub { font-size:22px; margin-top:12px; } .kicker { font-family:var(--display); font-size:17px; font-weight:500; letter-spacing:-0.01em; color:var(--grey); max-width:34em; }
.lbl { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
.note { font-size:11.5px; color:var(--muted); }
.opener { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(0,1fr); gap:28px; align-items:start; margin-top:4px; }
.aside { border-left:1px solid var(--line); padding-left:18px; display:grid; gap:6px; justify-items:start; } .aside .big { font-family:var(--display); font-size:19px; font-weight:600; letter-spacing:-0.015em; line-height:1.2; }
/* cover */
.cover { padding:0; overflow:hidden; display:grid; grid-template-rows:auto 1fr auto; }
.cover-top { display:flex; justify-content:space-between; align-items:center; padding:16mm 18mm 0; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--on-dark-2); } .cover-top b { color:var(--on-dark); letter-spacing:.06em; font-size:15px; text-transform:none; }
.cover-mid { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:24px; align-items:end; padding:0 18mm; }
.cover h1 { font-size:54px; line-height:1.02; letter-spacing:-0.035em; }
.cover-bot { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:0 18mm 16mm; font-size:12px; color:var(--on-dark-2); } .cover-bot b { color:var(--on-dark); font-weight:500; display:block; font-size:14px; }
.phone { width:58mm; border-radius:22px; border:6px solid #2a3038; overflow:hidden; background:#000; } .phone img { display:block; width:100%; }
.phone-cap { font-size:10px; color:var(--on-dark-2); text-align:center; margin-top:6px; }
/* glance */
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(28mm,1fr)); gap:14px; margin-top:10px; }
.stats div { display:grid; gap:4px; align-content:start; } .stats b { font-family:var(--display); font-size:44px; font-weight:500; letter-spacing:-0.04em; line-height:1; } .stats span { font-size:10.5px; color:var(--on-dark-2); line-height:1.35; }
.small-stats b { font-size:26px; color:var(--ink); } .small-stats span { color:var(--muted); }
.rows { display:grid; gap:3px; } .rows a { display:grid; grid-template-columns:42mm minmax(0,1fr) auto; gap:14px; align-items:center; background:var(--dark2); padding:9px 12px; text-decoration:none; font-size:12px; }
.rows a b { font-weight:600; } .rows a span { color:var(--on-dark-2); }
.verdict { font-size:15px; line-height:1.55; color:var(--on-dark); max-width:42em; }
/* fix first */
.three { display:grid; gap:10px; } .three .item { display:grid; grid-template-columns:16mm minmax(0,1fr); gap:14px; padding:16px; background:var(--band); }
.three .item:first-child { background:var(--dark2); color:var(--on-dark); } .three .item:first-child .muted, .three .item:first-child .lbl { color:var(--on-dark-2); }
.three .n { font-family:var(--display); font-size:34px; font-weight:500; letter-spacing:-0.04em; line-height:1; }
.three h3 { font-size:19px; letter-spacing:-0.02em; line-height:1.15; } .three .cols { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:8px; font-size:12px; }
/* tables */
table { width:100%; border-collapse:collapse; } th { text-align:left; font-size:10px; font-weight:500; color:var(--muted); padding:6px 10px; }
.band td { padding:8px 10px; vertical-align:top; font-size:12px; } .band tbody tr:nth-child(odd) td { background:var(--band); }
.band .t { font-weight:600; } .band .w { color:var(--grey); font-size:11.5px; margin-top:2px; } .band .where { white-space:nowrap; text-align:right; font-size:11px; color:var(--grey); } .st-cell { width:24mm; }
a.see { text-decoration:none; color:var(--grey); } a.see:hover { color:var(--ink); }
.pill { display:inline-block; font-size:9.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; white-space:nowrap; }
.pill.urgent { color:var(--urgent); background:var(--urgent-bg); } .pill.fix { color:var(--fix); background:var(--fix-bg); } .pill.good { color:var(--good); background:var(--good-bg); } .pill.info { color:var(--info); background:var(--info-bg); }
.dark .pill.urgent { color:#ffb4ab; background:#3a1714; } .dark .pill.fix { color:#fdd38a; background:#33240b; } .dark .pill.good { color:#8ee0b0; background:#0f2a1d; }
.tbl-h { font-size:14px; letter-spacing:-0.01em; margin-top:6px; }
/* charts */
figure { margin:0; } .chart { display:grid; gap:6px; } figcaption { font-size:10.5px; color:var(--muted); }
svg { width:100%; height:auto; display:block; } svg text { font-family:var(--body); font-size:11px; fill:var(--muted); } svg .ann { fill:var(--ink); font-weight:600; font-size:12px; }
.axis { stroke:var(--line); } .b-norm { fill:var(--ink); opacity:.75; } .b-spike { fill:var(--fix); } .b-low { fill:var(--urgent); stroke:var(--paper); stroke-width:2; }
.k { display:inline-block; width:9px; height:9px; vertical-align:-1px; margin:0 2px 0 6px; } .k-spike { background:var(--fix); } .k-low { background:var(--urgent); border-radius:50%; }
.s-good { background:var(--good); } .s-fix { background:var(--fix); } .s-urgent { background:var(--urgent); } .s-none { background:var(--none); }
.board td { padding:6px 10px; font-size:12px; border-bottom:1px solid var(--line); } .board thead th { border-bottom:1px solid var(--ink); }
.board .rk { font-family:var(--display); font-weight:600; width:14mm; } .board .num { text-align:right; color:var(--grey); white-space:nowrap; width:1%; } .board .barc { width:38%; }
.board tr.me td { background:var(--dark2); color:var(--on-dark); font-weight:600; } .board tr.me .num, .board tr.me .muted { color:var(--on-dark-2); }
.board tr.gap td { color:var(--muted); font-size:10.5px; letter-spacing:.1em; text-align:center; }
.bar { display:block; height:6px; background:var(--band); } .bar i { display:block; height:100%; background:var(--grey); } tr.me .bar { background:#2c3440; } tr.me .bar i { background:#fff; }
.stack { display:flex; height:10px; gap:2px; } .stack i { display:block; height:100%; }
.gcard { border:1px solid var(--line); padding:12px 14px; display:grid; gap:8px; } .gtop { display:flex; gap:10px; align-items:center; font-size:12px; }
.av { width:28px; height:28px; border-radius:50%; background:var(--grey); color:#fff; display:grid; place-items:center; font-weight:600; flex:none; }
.stars { color:#e6a700; letter-spacing:1px; } blockquote { margin:0; font-size:12.5px; } .noreply { font-size:11px; color:var(--urgent); font-weight:600; }
.shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(55mm,1fr)); gap:10px; } .shot { display:grid; gap:5px; } .shot img { width:100%; border:1px solid var(--line); display:block; }
/* panels */
.pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.panel { padding:14px 16px; display:grid; gap:6px; align-content:start; } .panel.dark { background:var(--dark2); color:var(--on-dark); } .panel.dark .lbl { color:var(--on-dark-2); } .panel.light { background:var(--band); }
.panel .quote { font-size:12.5px; }
/* plan, drafts */
.fixes { counter-reset:fx; display:grid; gap:4px; } .fixes > div { counter-increment:fx; display:grid; grid-template-columns:12mm minmax(0,1fr) auto; gap:12px; padding:10px 12px; background:var(--band); align-items:start; }
.fixes > div::before { content:counter(fx, decimal-leading-zero); font-family:var(--display); font-size:20px; font-weight:500; color:var(--grey); }
.fixes h4 { font-size:13.5px; letter-spacing:-0.005em; line-height:1.3; } .fixes .w { color:var(--grey); font-size:11.5px; margin-top:2px; } .fixes .tags { display:grid; gap:4px; justify-items:end; }
.weeks { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; } .weeks > div { background:var(--band); padding:12px; } .weeks > div:first-child { background:var(--dark2); color:var(--on-dark); }
.weeks h4 { font-size:14px; margin-bottom:6px; } .weeks ul { margin:0; padding-left:15px; font-size:11px; display:grid; gap:4px; }
.hero { background:var(--dark2); color:var(--on-dark); padding:18px; display:grid; gap:8px; } .hero .hl { font-family:var(--display); font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.12; }
.hero ul { margin:0; padding-left:16px; color:var(--on-dark-2); font-size:12px; } .hero .btn { justify-self:start; background:#fff; color:var(--ink); font-weight:600; padding:6px 12px; font-size:12px; }
.grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.box { background:var(--band); padding:12px 14px; display:grid; gap:5px; align-content:start; font-size:12px; } .box h4 { font-size:13.5px; letter-spacing:-0.005em; line-height:1.25; } .box code { font-size:10.5px; color:var(--grey); overflow-wrap:anywhere; }
.box ul, ul.plain, ol.plain { margin:0; padding-left:16px; display:grid; gap:3px; }
.reply { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); gap:14px; padding:10px 0; border-bottom:1px solid var(--line); font-size:12px; }
.reply .q { color:var(--grey); font-style:italic; } .reply .a { border-left:2px solid var(--ink); padding-left:10px; }
pre { margin:0; background:var(--band); padding:12px; overflow-x:auto; font-size:10px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
.idtable td:first-child { color:var(--grey); width:42mm; }
.quotes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; } .quotes blockquote { background:var(--band); padding:12px; font-size:11.5px; } .quotes cite { display:block; margin-top:6px; font-style:normal; font-size:10px; color:var(--muted); }
.private { border-left:3px solid var(--urgent); background:var(--urgent-bg); padding:12px 16px; display:grid; gap:6px; font-size:12px; }
.dossier { display:grid; gap:8px; font-size:11.5px; } .dossier h4, .dossier h5, .dossier h6 { font-family:var(--display); font-size:14px; margin-top:8px; letter-spacing:-0.01em; }
a.cite { font-size:.75em; text-decoration:none; vertical-align:super; color:var(--grey); }
details > summary { cursor:pointer; font-family:var(--display); font-weight:600; font-size:15px; padding:10px 0; border-top:1px solid var(--line); }
ol.sources { padding-left:28px; display:grid; gap:2px; font-size:10px; color:var(--grey); } ol.sources li { overflow-wrap:anywhere; }
/* Three versions of one document. The base above is the A4 sheet; on screen the <html> class picks
   v-a4 (sheets on a desk), v-desktop (wide sections) or v-mobile (one column). Print is always A4. */
.viewbar, .chapnav { display:none; }
@media screen {
  .viewbar { display:flex; position:fixed; z-index:20; right:16px; bottom:16px; gap:2px; background:var(--dark); padding:4px; box-shadow:0 6px 24px rgba(0,0,0,.25); font-size:12px; }
  .viewbar button { font:inherit; color:var(--on-dark-2); background:none; border:0; padding:7px 11px; cursor:pointer; white-space:nowrap; }
  .viewbar button[aria-pressed="true"] { background:#fff; color:var(--ink); font-weight:600; } .viewbar button:focus-visible { outline:2px solid #fff; outline-offset:1px; }

  .v-desktop body, .v-mobile body { background:var(--paper); }
  .v-desktop .pf, .v-mobile .pf { display:none; }
  .v-desktop .chapnav, .v-mobile .chapnav { display:flex; position:sticky; top:0; z-index:10; background:rgba(255,255,255,.94); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); overflow-x:auto; scrollbar-width:none; }
  .v-desktop .page, .v-mobile .page { scroll-margin-top:44px; }
  .v-desktop .chapnav { padding:0 max(34px, calc((100vw - 1120px) / 2 - 14px)); }
  .chapnav a { flex:none; padding:12px 14px; font-size:12.5px; color:var(--grey); text-decoration:none; white-space:nowrap; } .chapnav a:hover { color:var(--ink); }

  /* desktop: wide sections, bigger type, dark pages as full-width bands */
  .v-desktop body { font-size:16px; }
  .v-desktop .page { width:auto; min-height:0; margin:0; box-shadow:none; padding:88px max(48px, calc((100vw - 1120px) / 2)); gap:22px; border-bottom:1px solid var(--line); }
  .v-desktop .page.dark { border-bottom:0; }
  .v-desktop .display { font-size:clamp(44px,4.6vw,64px); } .v-desktop .lead { font-size:19px; } .v-desktop .body { font-size:16px; } .v-desktop .kicker { font-size:21px; } .v-desktop .sub { font-size:28px; margin-top:24px; }
  .v-desktop .cover { min-height:min(100vh,860px); padding:0; } .v-desktop .cover-top, .v-desktop .cover-mid, .v-desktop .cover-bot { padding-left:max(48px, calc((100vw - 1120px) / 2)); padding-right:max(48px, calc((100vw - 1120px) / 2)); }
  .v-desktop .cover-top { padding-top:48px; } .v-desktop .cover-bot { padding-bottom:48px; font-size:14px; } .v-desktop .cover h1 { font-size:clamp(56px,6.4vw,92px); } .v-desktop .phone { width:250px; }
  .v-desktop .stats b { font-size:68px; } .v-desktop .stats span { font-size:13px; } .v-desktop .verdict { font-size:19px; } .v-desktop .rows a { font-size:14px; padding:13px 16px; grid-template-columns:260px minmax(0,1fr) auto; }
  .v-desktop .band td, .v-desktop .board td { font-size:14px; padding:11px 14px; } .v-desktop .band .w { font-size:13px; } .v-desktop th { font-size:11px; }
  .v-desktop .three h3 { font-size:24px; } .v-desktop .three .cols { font-size:14px; } .v-desktop .three .item { padding:22px; }
  .v-desktop .panel { padding:20px 22px; font-size:15px; } .v-desktop .box { font-size:14px; padding:16px 18px; } .v-desktop .box h4 { font-size:16px; }
  .v-desktop .fixes > div { padding:14px 16px; } .v-desktop .fixes h4 { font-size:16px; } .v-desktop .fixes .w { font-size:13.5px; }
  .v-desktop .weeks ul { font-size:13px; } .v-desktop .reply { font-size:14px; } .v-desktop blockquote { font-size:14.5px; }
  .v-desktop .opener { gap:56px; } .v-desktop .aside .big { font-size:24px; } .v-desktop figcaption, .v-desktop .note { font-size:12.5px; }
  .v-desktop .shots { grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; } .v-desktop .hero .hl { font-size:32px; }

  /* mobile: one column, thumb-sized type; on a wide screen it previews at phone width */
  .v-mobile body { font-size:16px; max-width:480px; margin:0 auto; box-shadow:0 0 0 1px var(--line); }
  .v-mobile .viewbar { right:auto; left:50%; transform:translateX(-50%); bottom:12px; } .v-mobile .viewbar button { padding:7px 10px; }
  .v-mobile .page { width:auto; min-height:0; margin:0; padding:40px 18px 48px; box-shadow:none; border-bottom:1px solid var(--line); gap:16px; }
  .v-mobile .page.dark { border-bottom:0; }
  .v-mobile .display { font-size:32px; } .v-mobile .lead { font-size:16.5px; } .v-mobile .body { font-size:15.5px; } .v-mobile .kicker { font-size:18px; } .v-mobile .sub { font-size:22px; }
  .v-mobile .opener, .v-mobile .pair, .v-mobile .cover-mid, .v-mobile .cover-bot, .v-mobile .three .cols, .v-mobile .grid2, .v-mobile .grid3, .v-mobile .quotes, .v-mobile .reply { grid-template-columns:1fr; }
  .v-mobile .weeks { grid-template-columns:1fr; } .v-mobile .aside { border-left:0; padding-left:0; border-top:1px solid var(--line); padding-top:12px; } .v-mobile .aside .big { font-size:21px; }
  .v-mobile .cover { min-height:100svh; padding:0; } .v-mobile .cover-top, .v-mobile .cover-mid, .v-mobile .cover-bot { padding-left:18px; padding-right:18px; } .v-mobile .cover-top { padding-top:28px; } .v-mobile .cover-bot { padding-bottom:84px; font-size:13px; }
  .v-mobile .cover h1 { font-size:42px; } .v-mobile .phone { width:min(62vw,240px); justify-self:center; }
  .v-mobile .stats { grid-template-columns:1fr 1fr; gap:18px; } .v-mobile .stats b { font-size:44px; } .v-mobile .stats span { font-size:12.5px; } .v-mobile .verdict { font-size:16.5px; }
  .v-mobile .rows a { grid-template-columns:minmax(0,1fr) auto; font-size:13.5px; padding:12px; } .v-mobile .rows a span:nth-child(2) { grid-column:1/-1; grid-row:2; }
  .v-mobile .three .item { grid-template-columns:1fr; gap:6px; } .v-mobile .three h3 { font-size:20px; } .v-mobile .three .cols { font-size:14px; }
  .v-mobile .band tr { display:block; } .v-mobile .band tbody tr { padding:10px 12px; } .v-mobile .band td { display:block; padding:2px 0; background:none !important; font-size:14px; }
  .v-mobile .band tbody tr:nth-child(odd) { background:var(--band); } .v-mobile .band thead { display:none; } .v-mobile .band .where { text-align:left; white-space:normal; }
  .v-mobile .st-cell { width:auto; } .v-mobile .pill { white-space:normal; } .v-mobile .band td, .v-mobile .board td { overflow-wrap:anywhere; }
  .v-mobile .board .barc { display:none; } .v-mobile .board td { font-size:13.5px; padding:9px 6px; }
  .v-mobile .fixes > div { grid-template-columns:1fr; gap:6px; } .v-mobile .fixes .tags { justify-items:start; display:flex; gap:6px; } .v-mobile .fixes h4 { font-size:15px; }
  .v-mobile .box, .v-mobile .panel { font-size:14.5px; } .v-mobile .hero .hl { font-size:24px; } .v-mobile figcaption, .v-mobile .note { font-size:12.5px; }
  .v-mobile .gtop { flex-wrap:wrap; } .v-mobile pre { font-size:11px; } .v-mobile .small { font-size:14px; } .v-desktop .small { font-size:14px; }
}
/* A4 on a small screen: the sheets scroll sideways inside the desk instead of breaking. */
@media screen and (max-width:840px) { .v-a4 body { overflow-x:auto; } .v-a4 .page { margin:12px; } }
@page { size:A4; margin:0; }
@media print {
  .viewbar, .chapnav { display:none !important; }
  body { background:none; } .page { margin:0; box-shadow:none; width:210mm; min-height:297mm; break-after:page; -webkit-box-decoration-break:clone; box-decoration-break:clone; }
  .page:last-child { break-after:auto; } .band tr, .box, .panel, figure, .fixes > div, .gcard, .reply, .three .item, .weeks, .hero, .pair, .opener, pre { break-inside:avoid; }
  h2, h3, h4, .sub, .tbl-h, .kicker, .lbl { break-after:avoid; }
  details > :not(summary) { display:block; } details::details-content { display:block; content-visibility:visible; } details > summary { list-style:none; }
}
`;

/** One standalone document: the shared style, the version switcher and the given pages. */
export function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en" class="v-desktop">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=Inter:wght@400;500;600&display=swap">
<style>
${CSS}</style>
<script>
// Pick the version before first paint: ?view=a4|desktop|mobile wins, else the screen width decides.
(function () {
  var q = new URLSearchParams(location.search).get('view');
  var v = /^(a4|desktop|mobile)$/.test(q || '') ? q : (window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop');
  document.documentElement.className = 'v-' + v;
})();
</script>
</head>
<body>
<nav class="viewbar" aria-label="Report version"><button type="button" data-v="desktop">Desktop</button><button type="button" data-v="mobile">Mobile</button><button type="button" data-v="a4">A4</button><button type="button" data-print>Print / PDF</button></nav>

${body}
<script>
// The version switcher: same document, three layouts. Print always uses the A4 layout.
(function () {
  var root = document.documentElement;
  var bar = document.querySelector('.viewbar');
  var mark = function () { bar.querySelectorAll('[data-v]').forEach(function (b) { b.setAttribute('aria-pressed', root.className === 'v-' + b.dataset.v ? 'true' : 'false'); }); };
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-print')) { window.print(); return; }
    root.className = 'v-' + b.dataset.v;
    try { var u = new URL(location.href); u.searchParams.set('view', b.dataset.v); history.replaceState(null, '', u); } catch (err) {}
    mark();
  });
  mark();
})();
</script>
</body>
</html>
`;
}

/** lanes: { "E-maps": laneResult, …, "S2-consult": …, "S3-editor": … } as runLane returns them. */
export function buildReport(dive: any, L: Record<string, any>): string {
  const r = dive.result ?? {};
  const R = resolve(dive, L);
  const name = R.name;
  const s2 = L['S2-consult']?.notes ?? {};
  const ed = L['S3-editor']?.notes ?? {};
  const plain: Record<string, { title: string; why: string }> = ed.plain ?? {};
  const shots: any[] = ed.shots ?? [];
  const trade = String((R.plan?.trades ?? [])[0] ?? 'business like yours');
  const town = String(R.hq ?? (R.plan?.areas ?? [])[0] ?? 'your town');

  // ---------- helpers ----------
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
  const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const pathOf = (u: string) => { try { const p = new URL(u).pathname; return p === '/' ? '' : p; } catch { return ''; } };
  /** Links read as where they go ("See it on Google Maps"), never as the raw URL. */
  const seeIt = (u: string | null | undefined) => {
    if (!u || !/^https?:\/\//.test(u)) return '';
    const h = hostOf(u);
    const where = /google\.[a-z.]+$/.test(h) && /\/maps/.test(u) ? 'Google Maps' : /search\.brave\.com/.test(h) ? 'search results' : h;
    return `<a class="see" href="${esc(u)}" target="_blank" rel="noopener">${esc(where)} ↗</a>`;
  };
  const dateOf = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const monthOf = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  // The lanes use "info" for good news and plain notes alike, so it reads as a neutral note.
  const sevClass = (s: string) => (s === 'high' ? 'urgent' : s === 'medium' ? 'fix' : 'info');
  const sevWord = (s: string) => (s === 'high' ? 'Urgent' : s === 'medium' ? 'Needs work' : s === 'low' ? 'Minor' : 'Note');
  /** The lane's machine labels, stripped, for when the editor did not run. */
  const rawTitle = (t: string) => t.replace(/^(VERIFIED|CONTRADICTED|NOT FOUND|CAN'T CHECK AUTOMATICALLY|PRIVATE):\s*/i, '').replace(/\s*\[\d+ of \d+ asks[^\]]*\]/g, '').replace(/deepseek-v[\d.]+-flash(-\d+)?/gi, 'DeepSeek').replace(/gpt-[\d.]+-?\w*/gi, 'GPT');
  /** Stage-2 text built from raw finding titles keeps their machine bits; strip them for print. */
  const scrub = (t: unknown) => rawTitle(String(t ?? '')).replace(/\s*\((?:DNS )?ENOTFOUND\)/g, '').replace(/doesnt_know/g, "don't know").replace(/\s*;?\s*others: [a-z_]+/g, '').replace(/\s{2,}/g, ' ');
  const T = (x: Item) => plain[x.key]?.title || rawTitle(x.title);
  const why = (x: Item) => plain[x.key]?.why || '';
  const stars = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));
  const areaOf = (id: string) => R.areas.find((a) => a.id === id);
  const byArea = (id: string) => R.items.filter((x) => x.area === id).sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
  /** A headline in the profile's two tones: the first clause in ink, the rest in grey. */
  const twoTone = (a: string, b?: string) => {
    if (b === undefined) {
      const m = a.match(/^(.{12,70}?[,;:—])\s+(.{8,})$/);
      if (m) { a = m[1].replace(/[;:]$/, m[1].endsWith(':') ? ':' : ','); b = m[2]; }
    }
    return `${esc(a)}${b ? `<br><span class="g">${esc(b)}</span>` : ''}`;
  };
  /** Finding rows in a banded table: status, finding with what it means, where we saw it. */
  const itemRows = (list: Item[]) => list.length ? `<table class="band items"><tbody>${list.map((x) => `<tr><td class="st-cell"><span class="pill ${sevClass(x.severity)}">${esc(sevWord(x.severity))}</span></td><td><p class="t">${esc(T(x))}</p>${why(x) ? `<p class="w">${esc(why(x))}</p>` : ''}</td><td class="where">${seeIt(x.source)}</td></tr>`).join('')}</tbody></table>` : '';
  let pageNo = 0;
  const foot = () => `<footer class="pf"><span>${esc(name)} · Online Presence Audit ${esc(R.checked_on.slice(0, 4))}</span><span>${++pageNo}</span></footer>`;

  // ---------- visuals ----------
  /** Google-style card for an unanswered bad review. */
  const reviewCard = (x: any) => `<figure class="gcard"><div class="gtop"><span class="av" aria-hidden="true">${esc(String(x.author ?? '?').trim().charAt(0).toUpperCase())}</span><div><b>${esc(x.author)}</b> <span class="stars">${stars(x.stars)}</span><span class="muted"> · ${esc(dateOf(x.date))} · ${esc(x.listing)}</span></div></div>
    ${x.text ? `<blockquote>${esc(clip(String(x.text), 420))}</blockquote>` : '<p class="muted">(a star rating with no text)</p>'}
    <p class="noreply">No reply from the owner${x.days_open != null ? ` for ${esc(x.days_open)} days` : ''}</p></figure>`;

  /** Reviews a month, with the spike and the 1★ months marked. */
  function timeline(): string {
    const m = R.reviews.monthly;
    if (m.length < 3) return '';
    const W = 720, H = 170, pad = 24, bw = (W - pad * 2) / m.length;
    const max = Math.max(...m.map((x) => x.n), 1);
    const burstMonths = new Set(R.reviews.bursts.map((b: any) => String(b.day).slice(0, 7)));
    const y = (n: number) => H - pad - (n / max) * (H - pad * 2);
    const bars = m.map((x, i) => {
      const h = Math.max(x.n ? 3 : 0, H - pad - y(x.n));
      return `<g><title>${esc(monthOf(x.month))}: ${x.n} review${x.n === 1 ? '' : 's'}${x.low ? `, ${x.low} of them 1–2★` : ''}</title>
        <rect class="${burstMonths.has(x.month) ? 'b-spike' : 'b-norm'}" x="${(pad + i * bw + 1).toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>
        ${x.low ? `<circle class="b-low" cx="${(pad + i * bw + bw / 2).toFixed(1)}" cy="${(H - pad - h - 8).toFixed(1)}" r="4"/>` : ''}</g>`;
    }).join('');
    const ticks = m.map((x, i) => (i === 0 || i === m.length - 1 || x.month.endsWith('-01')) ? `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthOf(x.month))}</text>` : '').join('');
    const peak = m.reduce((a, b) => (b.n > a.n ? b : a));
    const px = pad + m.indexOf(peak) * bw;
    const right = px < W / 2;
    const spike = burstMonths.has(peak.month) ? `<text class="ann" x="${(right ? px + bw + 6 : px - 6).toFixed(1)}" y="${(y(peak.n) + 12).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(peak.n)} reviews in ${esc(monthOf(peak.month))}</text>` : '';
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews per month"><line class="axis" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>${bars}${ticks}${spike}</svg>
      <figcaption>Google reviews each month, all your listings. <span class="k k-spike"></span> a month with a one-day spike Google may read as a review drive · <span class="k k-low"></span> a 1–2★ review</figcaption></figure>`;
  }

  /** The Maps result a customer sees in the main town, with you in it. */
  function mapsBoard(): string {
    const a = R.maps.by_area[0];
    if (!a || !a.top.length) return '';
    const us = R.maps.our;
    const max = Math.max(...a.top.map((t: any) => t.reviews ?? 0), us?.reviews ?? 0, 1);
    const row = (rank: string, n: string, rating: number | null, reviews: number | null, me = false) => `<tr class="${me ? 'me' : ''}"><td class="rk">${esc(rank)}</td><td>${esc(n)}${rating ? ` <span class="muted">${esc(rating)}★</span>` : ''}</td><td class="barc"><span class="bar"><i style="width:${(((reviews ?? 0) / max) * 100).toFixed(1)}%"></i></span></td><td class="num">${reviews ?? '–'}</td></tr>`;
    const top = a.top.slice(0, 5).map((t: any, i: number) => row(`#${i + 1}`, t.name.replace(/\s*[-–|].*$/, ''), t.rating, t.reviews)).join('');
    const gap = (a.best_rank ?? 99) > 6 ? `<tr class="gap"><td></td><td colspan="3">${a.best_rank ? `${a.best_rank - 6} more businesses` : 'everyone else on the list'}</td></tr>` : '';
    const me = row(a.best_rank ? `#${a.best_rank}` : '—', us ? `You · ${us.name}` : 'You', us?.rating ?? null, us?.reviews ?? null, true);
    const towns = R.maps.by_area.slice(1);
    return `<figure class="chart"><table class="board"><thead><tr><th>Rank</th><th>Business</th><th colspan="2">Google reviews</th></tr></thead><tbody>${top}${gap}${me}</tbody></table>
      <figcaption>Google Maps, searching “${esc(a.query)}”.</figcaption></figure>
      ${towns.length ? `<div class="stats small-stats">${towns.map((t) => `<div><b>${t.best_rank ? `#${esc(t.best_rank)}` : '—'}</b><span>${esc(t.area)}${t.best_rank ? ` · of ${esc(t.of)}` : ` · not in top ${esc(t.of || 20)}`}</span></div>`).join('')}</div>` : ''}`;
  }

  /** Who AI assistants name when a customer asks for a recommendation, and you. */
  function aiVoice(): string {
    if (!R.ai.trade_answers) return '';
    const max = Math.max(...R.ai.share.map((s) => s.n), R.ai.named_us, 1);
    const row = (n: string, c: number, me = false) => `<tr class="${me ? 'me' : ''}"><td>${esc(n)}</td><td class="barc"><span class="bar"><i style="width:${((c / max) * 100).toFixed(1)}%"></i></span></td><td class="num">${c} of ${R.ai.trade_answers}</td></tr>`;
    return `<figure class="chart"><table class="board"><thead><tr><th>Business named</th><th colspan="2">How often</th></tr></thead><tbody>${R.ai.share.map((s) => row(s.name, s.n)).join('')}${row('You', R.ai.named_us, true)}</tbody></table>
      <figcaption>A customer asks: “${esc(R.ai.trade_question ?? 'Who is the best?')}” Names given across ${R.ai.trade_answers} answers.</figcaption></figure>`;
  }

  /** Right, wrong and "don't know" when customers ask AI about you by name: from memory, then with a web search. */
  function aiAccuracy(): string {
    const modes = [R.ai.memory, R.ai.search].filter(Boolean) as any[];
    if (!modes.length) return '';
    const bar = (m: any) => {
      const t = m.right + m.mixed + m.wrong + m.dont_know || 1;
      const seg = (n: number, cls: string, label: string) => (n ? `<i class="${cls}" style="width:${((n / t) * 100).toFixed(1)}%" title="${esc(label)}: ${n}"></i>` : '');
      return `<tr><td>${esc(m.model)}</td><td class="barc"><span class="stack">${seg(m.right, 's-good', 'Right')}${seg(m.mixed, 's-fix', 'Partly right')}${seg(m.wrong, 's-urgent', 'Wrong')}${seg(m.dont_know, 's-none', "Didn't know you")}</span></td><td class="num">${m.right} right · ${m.wrong} wrong · ${m.dont_know} unknown</td></tr>`;
    };
    return `<figure class="chart"><table class="board">${modes.map((md) => `<thead><tr><th colspan="3">${esc(md.label)}</th></tr></thead><tbody>${md.models.map(bar).join('')}</tbody>`).join('')}</table>
      <figcaption>Questions about you by name: phone, address, website, licences, reputation. <span class="k s-good"></span> right <span class="k s-fix"></span> partly right <span class="k s-urgent"></span> wrong <span class="k s-none"></span> did not know you</figcaption></figure>
      ${(R.ai.memory?.wrong_examples ?? []).length ? `<div class="panel dark"><p class="lbl">What an assistant told a customer about you</p>${R.ai.memory!.wrong_examples.slice(0, 3).map((w: any) => `<p class="quote">“${esc(clip(w.claim, 140))}”</p>`).join('')}<p class="small">None of these is correct.</p></div>` : ''}`;
  }

  const shotFig = (s: any) => `<figure class="shot"><img src="data:image/jpeg;base64,${s.img}" alt="${esc(s.caption)}" loading="lazy"><figcaption><b>${esc(s.caption)}.</b> ${esc(hostOf(s.url))}${esc(pathOf(s.url))} · ${esc(dateOf(s.taken_at))}</figcaption></figure>`;
  const proofShots = shots.filter((s) => s.key !== 'cover');
  const coverShot = shots.find((s) => s.key === 'cover');

  // Credentials as a banded table: what the official register says about each claim.
  const credLabel = (c: any) => (c.verdict === 'contradicted' && c.direction === 'undersell' ? ['good', 'Better than you claim'] : c.verdict === 'verified' ? ['good', 'Confirmed'] : c.verdict === 'contradicted' ? ['urgent', 'Register says otherwise'] : c.verdict === 'not found' ? ['fix', 'Not found'] : ['info', 'No public register']);
  const credTable = (list: any[]) => list.length ? `<table class="band"><thead><tr><th>Your claim</th><th>Register</th><th>Result</th></tr></thead><tbody>${list.map((c: any) => { const [cls, lbl] = credLabel(c); return `<tr><td>${esc(clip(c.claim, 120))}</td><td class="where">${seeIt(c.source) || '–'}</td><td><span class="pill ${cls}">${esc(lbl)}</span></td></tr>`; }).join('')}</tbody></table>` : '';
  const creds = R.credentials.list.filter((c: any) => c.verdict !== "can't check automatically");
  const credUnchecked = R.credentials.list.filter((c: any) => c.verdict === "can't check automatically");

  function visual(theme: string): string {
    if (theme === 'reputation') return `${R.reviews.unanswered_low.slice(-2).reverse().map(reviewCard).join('')}${timeline()}`;
    if (theme === 'findability') return mapsBoard();
    if (theme === 'ai') return aiVoice() + aiAccuracy();
    if (theme === 'website') return proofShots.length ? `<div class="shots">${proofShots.slice(0, 3).map(shotFig).join('')}</div>` : '';
    if (theme === 'credentials') return `${credTable(creds)}${credUnchecked.length ? `<p class="note">No public register exists for ${credUnchecked.length} other claim${credUnchecked.length === 1 ? '' : 's'} (${esc(credUnchecked.slice(0, 4).map((c: any) => clip(c.claim, 40)).join('; '))}${credUnchecked.length > 4 ? '; …' : ''}), so a stranger has to take your word for them.</p>` : ''}`;
    return '';
  }

  // ---------- stories: the editor's, or built here from the numbers ----------
  const fallback: Record<string, () => any> = {
    reputation: () => ({ headline: `${R.reviews.replied} of your ${R.reviews.total} Google reviews have a reply from you`, body: R.reviews.unanswered_low.length ? `${R.reviews.unanswered_low.length} review${R.reviews.unanswered_low.length === 1 ? '' : 's'} of 1–2★ sit on your listing with no answer, the oldest for ${R.reviews.unanswered_low[0].days_open} days.` : 'Customers who read your reviews see nobody from the company answering.', cost: 'A complaint with no answer is the first thing a careful customer reads, and it reads as if nobody is listening.', fix: 'Reply publicly to every 1–2★ review this week, then to the rest.' }),
    findability: () => { const a = R.maps.by_area[0]; return { headline: a?.best_rank ? `You are #${a.best_rank} on Google Maps in ${a.area}` : `You are not on the first page of Google Maps in ${a?.area ?? 'your town'}`, body: `A customer searching “${a?.query ?? ''}” sees ${a?.best_rank ? a.best_rank - 1 : 'many'} other businesses before you.${R.maps.no_listing_in.length ? ` You have no Maps listing at all in ${R.maps.no_listing_in.join(', ')}.` : ''}`, cost: 'Most customers call one of the first three names they see.', fix: R.maps.no_listing_in.length ? `Create a Google Maps listing in ${R.maps.no_listing_in[0]}.` : 'Grow your review count and make your name, address and phone the same everywhere.' }; },
    ai: () => ({ headline: `AI assistants recommended you in ${R.ai.named_us} of ${R.ai.trade_answers} answers`, body: `When a customer asks an AI assistant who to hire, it names ${R.ai.share.slice(0, 3).map((s) => s.name).join(', ')} instead.`, cost: 'Customers who ask an assistant first never get to your website.', fix: 'Get listed on the pages assistants read, and give them correct facts about you to quote.' }),
    website: () => ({ headline: `${R.website.high} urgent faults on your websites`, body: 'Broken pages, empty service pages and contact details that do not work, found by reading every page.', cost: 'A customer who hits a dead page or a number that does not connect goes to the next result.', fix: 'Fix the urgent items in this chapter before anything else on the site.' }),
  };
  const themes = ['reputation', 'findability', 'ai', 'website'];
  const edStories: any[] = (ed.stories ?? []).filter((s: any) => themes.includes(s.theme));
  const stories = (edStories.length ? edStories : themes.filter((t) => areaOf(t)?.ran && areaOf(t)?.status[0] !== 'good').slice(0, 3).map((t) => ({ theme: t, ...fallback[t]() })))
    .map((s: any) => ({ ...fallback[s.theme](), ...Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' && v.trim())) }));
  const storyOf = (t: string) => stories.find((s: any) => s.theme === t);
  const chapters = CHAPTER_ORDER.filter((id) => areaOf(id)?.ran);
  const chapterNo = (id: string) => chapters.indexOf(id as any) + 1;

  const verdict = ed.verdict ?? s2.top?.summary ?? '';
  const top = s2.top ?? null;
  const site = s2.site ?? null;
  const ai = s2.ai ?? null;
  const replies = s2.replies ?? null;
  const targets: any[] = s2.reply_targets ?? [];
  const sources = (r.sources ?? []) as any[];

  // The five measured numbers on the dark "at a glance" page.
  const okClaims = R.credentials.list.filter((c: any) => c.verdict === 'verified' || c.direction === 'undersell').length;
  const checkable = R.credentials.list.filter((c: any) => !/can't check/.test(c.verdict)).length;
  const big: [string, string, string][] = ([
    areaOf('reputation')?.ran && R.reviews.total ? ['reputation', `${R.reviews.replied}/${R.reviews.total}`, 'Google reviews with a reply from you'] : null,
    areaOf('findability')?.ran && R.maps.by_area[0] ? ['findability', R.maps.by_area[0].best_rank ? `#${R.maps.by_area[0].best_rank}` : '—', `on Google Maps in ${R.maps.by_area[0].area}`] : null,
    areaOf('ai')?.ran && R.ai.trade_answers ? ['ai', `${R.ai.named_us}/${R.ai.trade_answers}`, 'AI answers that recommend you'] : null,
    areaOf('website')?.ran ? ['website', String(R.website.high), 'urgent faults on your websites'] : null,
    areaOf('credentials')?.ran && checkable ? ['credentials', `${okClaims}/${checkable}`, 'claims the official registers confirm'] : null,
  ].filter(Boolean) as [string, string, string][]);

  // Private alerts: register data exposing personal IDs, plus private documents a search engine indexed.
  const privateItems: string[] = [];
  for (const f of L['D-registry']?.findings ?? []) if (/^PRIVATE/i.test(f.title)) privateItems.push(`<b>${esc(f.title.replace(/^PRIVATE:\s*/i, ''))}.</b> ${esc(clip(String(f.detail ?? ''), 300))}`);
  const searched = [
    ...Object.values(L['G-grounded']?.notes?.search_results ?? {}).flatMap((v: any) => (Array.isArray(v) ? v : v?.rows ?? []).map((x: any) => x.url ?? x)),
    ...(L['H-web']?.notes?.nameRows ?? []).map((x: any) => x.url),
  ].filter((u: any) => typeof u === 'string');
  const docs = [...new Set(searched.filter((u: string) => /proposal|invoice|\/inv[-/]|[?&]uid=|quotation/i.test(u)))];
  if (docs.length) privateItems.push(`<b>Search engines have indexed ${docs.length} private document link${docs.length === 1 ? '' : 's'}</b> (proposals or invoices meant for one customer). Put these behind a login or mark them no-index.`);

  const mismatch: any[] = ed.mismatch?.length ? ed.mismatch : (r.contradictions ?? []).slice(0, 5).map((c: string) => ({ issue: c.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim(), settled: null }));
  const checkedOn = dateOf(R.checked_on);

  // ---------- one chapter per area ----------
  function chapter(id: string): string {
    const a = areaOf(id)!;
    const op = OPENERS[id];
    const s = storyOf(id);
    const list = byArea(id).filter((x) => x.severity === 'high' || x.severity === 'medium');
    const rest = byArea(id).length - Math.min(list.length, 6);
    const n = chapterNo(id);
    const subtitle = s?.headline ?? '';
    return `<section class="page" id="ch-${id}">
  <p class="eyebrow">Chapter ${n} · ${esc(CHAPTER_EYEBROW[id])}</p>
  <h2 class="display">${twoTone(op.q[0], op.q[1])}</h2>
  <div class="opener"><p class="lead">${esc(op.body({ trade, town }))}</p>
    <div class="aside"><p class="lbl">What we measured</p><p class="big">${esc(a.metric ?? '–')}</p><span class="pill ${a.status[0]}">${esc(a.status[1])}</span></div></div>
  <h3 class="sub">${id === 'ai' ? 'How AI sees your brand' : 'What we found'}</h3>
  ${subtitle ? `<p class="kicker">${esc(subtitle)}</p>` : ''}
  ${s?.body ? `<p class="body">${esc(s.body)}</p>` : ''}
  ${id === 'website' && !proofShots.length ? '' : visual(id)}
  ${s ? `<div class="pair"><div class="panel dark"><p class="lbl">What it costs you</p><p>${esc(s.cost)}</p></div><div class="panel light"><p class="lbl">Do this first</p><p>${esc(s.fix)}</p></div></div>` : ''}
  ${list.length ? `<h4 class="tbl-h">The items that matter most</h4>${itemRows(list.slice(0, 6))}` : '<p class="note">Nothing urgent here.</p>'}
  ${rest > 0 ? `<p class="note">${rest} more finding${rest === 1 ? '' : 's'} in this area are in the <a href="#appx-${id}">full checklist</a>.</p>` : ''}
  ${foot()}
</section>`;
  }

  return shell(`${name}: Online Presence Audit`, `<section class="page dark cover">
  <div class="cover-top"><b>${esc(name)}</b><span>Online Presence Audit ${esc(R.checked_on.slice(0, 4))}</span></div>
  <div class="cover-mid">
    <h1>How customers, Google and AI<br><span class="g">see your business.</span></h1>
    ${coverShot ? `<div><div class="phone"><img src="data:image/jpeg;base64,${coverShot.img}" alt="${esc(name)} homepage on a phone"></div><p class="phone-cap">${esc(hostOf(coverShot.url))} on a phone</p></div>` : ''}
  </div>
  <div class="cover-bot"><div><b>Prepared for ${esc(name)}</b>SSM ${esc(R.identity.ssm ?? '–')}${R.identity.domains.length ? ` · ${esc(R.identity.domains.join(', '))}` : ''}</div><div><b>Checked ${esc(checkedOn)}</b>${R.reviews.total ? `${esc(R.reviews.total)} reviews read · ` : ''}${R.ai.trade_answers ? `${esc((R.ai.memory?.models ?? []).concat(R.ai.search?.models ?? []).reduce((t: number, m: any) => t + m.asked + m.trade_asked, 0))} AI answers checked · ` : ''}every page of your sites tested</div></div>
</section>

<nav class="chapnav" aria-label="Sections"><a href="#glance">At a glance</a>${stories.length ? '<a href="#stories">Fix first</a>' : ''}${chapters.map((id) => `<a href="#ch-${id}">${esc(CHAPTER_EYEBROW[id])}</a>`).join('')}<a href="#fixes">Plan</a><a href="#ready">Ready to use</a><a href="#stranger">Trust</a><a href="#appendix">Checklist</a></nav>

<section class="page dark" id="glance">
  <p class="eyebrow">At a glance</p>
  <h2 class="display">Where you stand,<br><span class="g">in ${big.length === 5 ? 'five' : big.length} numbers.</span></h2>
  ${big.length ? `<div class="stats">${big.map(([id, v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
  ${verdict ? `<p class="verdict" style="margin-top:14px">${esc(verdict)}</p>` : ''}
  <div class="rows" style="margin-top:auto">${chapters.map((id) => { const a = areaOf(id)!; return `<a href="#ch-${id}"><b>${esc(a.title)}</b><span>${esc(a.metric ?? '')}</span><span class="pill ${a.status[0]}">${esc(a.status[1])}</span></a>`; }).join('')}</div>
  ${foot()}
</section>

${stories.length ? `<section class="page" id="stories">
  <p class="eyebrow">Fix these first</p>
  <h2 class="display">${stories.length === 1 ? 'One problem' : `${['', 'One', 'Two', 'Three'][stories.length]} problems`}<br><span class="g">are costing you the most customers.</span></h2>
  <p class="lead" style="max-width:40em">Out of ${R.items.length} things we checked, these ${stories.length === 1 ? 'is the one' : `are the ${stories.length}`} that turn the most customers away. Each has its own chapter with the evidence.</p>
  <div class="three">${stories.map((s: any, i: number) => `<div class="item"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><p class="lbl">${esc(CHAPTER_EYEBROW[s.theme])} · Chapter ${chapterNo(s.theme)}</p><h3>${esc(s.headline)}</h3>
    <div class="cols"><div><p class="lbl">What it costs you</p><p>${esc(s.cost)}</p></div><div><p class="lbl">Do this first</p><p>${esc(s.fix)}</p></div></div></div></div>`).join('')}</div>
  ${foot()}
</section>` : ''}

${chapters.map(chapter).join('\n')}

<section class="page" id="fixes">
  <p class="eyebrow">The plan</p>
  <h2 class="display">Your fixes, in order.<br><span class="g">Least effort, most effect first.</span></h2>
  ${top?.top5?.length ? `<div class="fixes">${top.top5.map((x: any) => `<div><div><h4>${esc(x.fix)}</h4><p class="w">${esc(x.why)}</p></div><div class="tags"><span class="pill info">${esc(x.effort)}</span><span class="pill ${x.impact === 'high' ? 'urgent' : 'fix'}">${esc(x.impact)} impact</span></div></div>`).join('')}</div>` : '<p class="note">The fix list was not written in this run.</p>'}
  ${(top?.plan30 ?? []).length ? `<h3 class="sub">Your first 30 days</h3><div class="weeks">${top.plan30.map((w: any) => `<div><h4>Week ${esc(w.week)}</h4><ul>${(w.tasks ?? []).map((t: string) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
  ${foot()}
</section>

<section class="page" id="ready">
  <p class="eyebrow">Ready to use</p>
  <h2 class="display">Done for you:<br><span class="g">copy, replies and pages.</span></h2>
  <p class="lead" style="max-width:40em">Written only from facts we verified. Read each one before you publish it.</p>
  <h3 class="sub" id="d-site">Your homepage, rewritten</h3>
  ${site ? `<p class="body">${esc(site.verdict)}</p>${site.one_site_or_two ? `<p class="body"><b>One site or two?</b> ${esc(site.one_site_or_two)}</p>` : ''}
  ${site.homepage ? `<div class="hero"><div class="hl">${esc(site.homepage.headline)}</div><p>${esc(site.homepage.subheadline)}</p>${(site.homepage.proof_points ?? []).length ? `<ul>${site.homepage.proof_points.map((p: string) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}<span class="btn">${esc(site.homepage.cta)}</span></div>
  <div class="grid3">${(site.homepage.sections ?? []).map((x: any) => `<div class="box"><h4>${esc(x.title)}</h4><p>${esc(x.body)}</p></div>`).join('')}</div>` : ''}
  ${(site.pages_to_fix ?? []).length ? `<h4 class="tbl-h">Pages to fix</h4><table class="band"><thead><tr><th>Page</th><th>Problem</th><th>Fix</th></tr></thead><tbody>${site.pages_to_fix.map((p: any) => `<tr><td>${esc(p.page)}</td><td>${esc(p.problem)}</td><td>${esc(p.fix)}</td></tr>`).join('')}</tbody></table>` : ''}` : '<p class="note">The website plan was not written in this run.</p>'}
  ${(site?.pages_to_add ?? []).length ? `<h3 class="sub" id="d-pages">Pages to add, town by town</h3><div class="grid3">${site.pages_to_add.map((p: any) => `<div class="box"><code>${esc(p.slug)}</code><h4>${esc(p.title)}</h4><p class="muted">${esc(p.why)}</p><ul>${(p.outline ?? []).map((o: string) => `<li>${esc(o)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
  <h3 class="sub" id="d-reviews">Review replies, ready to post</h3>
  ${(replies?.replies ?? []).length ? `${replies.replies.map((x: any) => { const t = targets[x.i] ?? {}; return `<div class="reply"><div><p class="small"><span class="stars">${stars(Number(t.stars) || 0)}</span> <span class="muted">${esc(t.author ?? '')} · ${esc(dateOf(t.date))}</span></p>${t.text ? `<p class="q">${esc(clip(String(t.text), 260))}</p>` : '<p class="q">(star rating only)</p>'}</div><div><p class="a">${esc(x.reply)}</p>${x.reply_en ? `<p class="a muted">${esc(x.reply_en)}</p>` : ''}${x.note ? `<p class="small muted" style="margin-top:4px"><b>Before posting:</b> ${esc(x.note)}</p>` : ''}</div></div>`; }).join('')}
  <div class="grid2" style="margin-top:6px">${replies.template_5star ? `<div class="box"><h4>Thank-you reply for 5★ reviews</h4><p>${esc(replies.template_5star)}</p></div>` : ''}${replies.ask_message ? `<div class="box"><h4>WhatsApp message asking for a review</h4><p>${esc(replies.ask_message)}</p></div>` : ''}</div>` : '<p class="note">No unanswered reviews needed a draft.</p>'}
  <h3 class="sub" id="d-ai">Getting recommended by AI assistants</h3>
  ${ai ? `${(ai.actions ?? []).length ? `<div class="fixes">${ai.actions.map((a: any) => `<div><div><h4>${esc(scrub(a.action))}</h4><p class="w">${esc(scrub(a.why))}</p><p class="small" style="margin-top:3px">${esc(scrub(a.how))}</p></div><div class="tags"><span class="pill info">${esc(a.effort)}</span><span class="pill ${a.impact === 'high' ? 'urgent' : 'fix'}">${esc(a.impact)} impact</span></div></div>`).join('')}</div>` : ''}
  ${(ai.faq ?? []).length ? `<h4 class="tbl-h">FAQ for your website</h4><div class="grid2">${ai.faq.map((x: any) => `<div class="box"><h4>${esc(x.q)}</h4><p>${esc(x.a)}</p></div>`).join('')}</div>` : ''}
  ${ai.measure ? `<p class="note"><b>How to track it:</b> ${esc(scrub(ai.measure))}</p>` : ''}` : '<p class="note">The AI plan was not written in this run.</p>'}
  ${s2.jsonld ? `<h4 class="tbl-h">Business details for Google and AI</h4><p class="note">Ask your web developer to paste this into the &lt;head&gt; of every page, after checking the phone and address are the ones you want everywhere.</p><pre>${esc('<script type="application/ld+json">\n' + JSON.stringify(s2.jsonld, null, 2) + '\n</script>')}</pre>` : ''}
  ${foot()}
</section>

<section class="page" id="stranger">
  <p class="eyebrow">What a stranger sees</p>
  <h2 class="display">What a customer, bank or tender officer<br><span class="g">learns about you in ten minutes.</span></h2>
  <table class="band idtable"><tbody>
    <tr><td>Company</td><td><b>${esc(name)}</b></td></tr>
    <tr><td>Registration</td><td>${esc(R.identity.ssm ?? '–')}</td></tr>
    ${R.credentials.cidb_grade ? `<tr><td>CIDB grade (official register)</td><td>${esc(R.credentials.cidb_grade)}</td></tr>` : ''}
    ${R.maps.our ? `<tr><td>Google rating</td><td>${esc(R.maps.our.rating)}★ from ${esc(R.maps.our.reviews)} reviews</td></tr>` : ''}
    ${R.identity.address ? `<tr><td>Address</td><td>${esc(R.identity.address)}</td></tr>` : ''}
    ${R.identity.domains.length ? `<tr><td>Websites</td><td>${esc(R.identity.domains.join(', '))}</td></tr>` : ''}
  </tbody></table>
  ${mismatch.length ? `<h3 class="sub">What does not add up</h3><table class="band"><tbody>${mismatch.map((m: any) => `<tr><td><p class="t">${esc(m.issue)}</p>${m.settled ? `<p class="w">The official register ${esc(m.settled)}</p>` : ''}</td><td class="where">${m.source ? seeIt(m.source) : ''}</td></tr>`).join('')}</tbody></table>` : ''}
  ${R.reviews.good_quotes.length ? `<h3 class="sub">What your customers say, in their words</h3><div class="quotes">${R.reviews.good_quotes.map((q: any) => `<blockquote>${esc(clip(String(q.text), 260))}<cite>${esc(q.author)} · ${esc(dateOf(q.date))}</cite></blockquote>`).join('')}</div>${R.reviews.praise.length ? `<p class="note">Praised most for: ${esc(R.reviews.praise.map(([p, n]) => `${p} (${n})`).join(', '))}. None of this appears on your website yet.</p>` : ''}` : ''}
  ${privateItems.length ? `<div class="private"><p class="lbl" style="color:var(--urgent)">Private: for you only</p><ul class="plain">${privateItems.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
  ${foot()}
</section>

<section class="page" id="appendix">
  <p class="eyebrow">Appendix</p>
  <h2 class="display">The full checklist.<br><span class="g">Every finding, area by area.</span></h2>
  ${AREAS.filter((a) => byArea(a.id).length).map((a) => { const list = byArea(a.id); return `<div id="appx-${a.id}"><h3 class="sub" style="font-size:17px">${esc(a.title)} <span class="muted" style="font-family:var(--body);font-size:11px;font-weight:400;letter-spacing:0">${list.filter((x) => x.severity === 'high').length} urgent · ${list.filter((x) => x.severity === 'medium').length} need work · ${list.length} in all</span></h3>${itemRows(list)}</div>`; }).join('')}
  <details><summary>Background research on the company</summary><p class="note" style="margin:4px 0 10px">Written from public sources on ${esc(dateOf(dive.finished_at))}, before the checks in this report. Where they differ, the checks are newer and win.</p><div class="dossier">${md(String(dive.dossier ?? ''))}</div></details>
  ${sources.length ? `<details><summary>Sources (${sources.length})</summary><ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(clip(String(s.title || hostOf(s.url)), 90))}</a> · ${esc(hostOf(s.url))}` : esc(s.title)}</li>`).join('')}</ol></details>` : ''}
  <div class="note" style="margin-top:8px"><p class="lbl">How we checked</p><p>Every Google review on your Maps listings was read. Maps ranks come from Google Maps searches without a phone’s location, so a customer nearby may see a slightly different order; web ranks come from Brave Search set to Malaysia. Each licence and award was looked up in its issuer’s own register. Every page of your websites was read and its links and numbers tested. AI answers come from DeepSeek V4.1 Flash and GPT-6.1, asked each question several times, from memory and with a web search. The ready-to-use drafts were written with AI from these findings. Checked ${esc(checkedOn)}; background research from ${esc(dateOf(dive.finished_at))}.</p></div>
  ${foot()}
</section>

`);
}
