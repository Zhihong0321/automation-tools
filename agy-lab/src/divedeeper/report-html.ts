// The report as one standalone HTML page, from data alone (no network, no files). Read in order:
//   cover        the verdict, one status and one measured number per area, the homepage on a phone
//   stories      the three problems costing the most customers, each with its proof (chart,
//                review card or screenshot), what it costs and the first fix
//   fixes        the top 5 in order and the 30-day plan
//   other areas  what the stories did not cover, at most four items each
//   ready to use homepage copy, pages, review replies, FAQ, AI actions, business data
//   stranger     what a customer, bank or tender officer learns in 10 minutes
//   appendix     every finding in plain words, the background research and its sources
// Numbers come from editor.ts resolve(); wording from the S3 editor lane when it ran, else
// built in here. Used by the hub (divedeeper.ts) and by scripts/dive-deeper/report.ts.
// A missing lane only drops its block; the report still builds.
import { AREAS, resolve, type Item } from './editor.ts';

/** lanes: { "E-maps": laneResult, …, "S2-consult": …, "S3-editor": … } as runLane returns them. */
export function buildReport(dive: any, L: Record<string, any>): string {
  const r = dive.result ?? {};
  const R = resolve(dive, L);
  const name = R.name;
  const s2 = L['S2-consult']?.notes ?? {};
  const ed = L['S3-editor']?.notes ?? {};
  const plain: Record<string, { title: string; why: string }> = ed.plain ?? {};
  const shots: any[] = ed.shots ?? [];

  // ---------- helpers ----------
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
  const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  /** Links read as where they go ("See it on Google Maps"), never as the raw URL. */
  const seeIt = (u: string | null | undefined) => {
    if (!u || !/^https?:\/\//.test(u)) return '';
    const h = hostOf(u);
    const where = /google\.[a-z.]+$/.test(h) && /\/maps/.test(u) ? 'on Google Maps' : /search\.brave\.com/.test(h) ? 'in the search results' : h ? `on ${h}` : '';
    return `<a class="see" href="${esc(u)}" target="_blank" rel="noopener">See it ${esc(where)} ↗</a>`;
  };
  const dateOf = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const monthOf = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  const sevClass = (s: string) => (s === 'high' ? 'urgent' : s === 'medium' ? 'fix' : s === 'low' ? 'info' : 'good');
  const sevWord = (s: string) => (s === 'high' ? 'Urgent' : s === 'medium' ? 'Needs work' : s === 'low' ? 'Minor' : 'Good');
  /** The lane's machine labels, stripped, for when the editor did not run. */
  const rawTitle = (t: string) => t.replace(/^(VERIFIED|CONTRADICTED|NOT FOUND|CAN'T CHECK AUTOMATICALLY|PRIVATE):\s*/i, '').replace(/\s*\[\d+ of \d+ asks[^\]]*\]/g, '').replace(/deepseek-v[\d.]+-flash(-\d+)?/gi, 'DeepSeek').replace(/gpt-[\d.]+-?\w*/gi, 'GPT');
  const T = (x: Item) => plain[x.key]?.title || rawTitle(x.title);
  const why = (x: Item) => plain[x.key]?.why || '';
  const stars = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));
  const areaTitle = (id: string) => AREAS.find((a) => a.id === id)?.title ?? id;
  const areaOf = (id: string) => R.areas.find((a) => a.id === id);
  const byArea = (id: string) => R.items.filter((x) => x.area === id).sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
  const itemLi = (x: Item) => `<li class="${sevClass(x.severity)}"><span class="dot" aria-hidden="true"></span><div><p class="t">${esc(T(x))}</p>${why(x) ? `<p class="w">${esc(why(x))}</p>` : ''}${seeIt(x.source)}</div></li>`;

  // ---------- visuals ----------
  /** Google-style card for an unanswered bad review. */
  const reviewCard = (x: any) => `<figure class="gcard"><div class="gtop"><span class="av" aria-hidden="true">${esc(String(x.author ?? '?').trim().charAt(0).toUpperCase())}</span><div><b>${esc(x.author)}</b><span class="st">${stars(x.stars)}</span><span class="muted"> · ${esc(dateOf(x.date))} · ${esc(x.listing)}</span></div></div>
    ${x.text ? `<blockquote>${esc(clip(String(x.text), 420))}</blockquote>` : '<p class="muted">(a star rating with no text)</p>'}
    <p class="noreply">No reply from the owner${x.days_open != null ? ` for <b>${esc(x.days_open)} days</b>` : ''}</p></figure>`;

  /** Reviews a month, with the spike and the 1★ months marked. */
  function timeline(): string {
    const m = R.reviews.monthly;
    if (m.length < 3) return '';
    const W = 720, H = 190, pad = 26, bw = (W - pad * 2) / m.length;
    const max = Math.max(...m.map((x) => x.n), 1);
    const burstMonths = new Set(R.reviews.bursts.map((b: any) => String(b.day).slice(0, 7)));
    const y = (n: number) => H - pad - (n / max) * (H - pad * 2);
    const bars = m.map((x, i) => {
      const cls = burstMonths.has(x.month) ? 'b-spike' : 'b-norm';
      const h = Math.max(x.n ? 3 : 0, H - pad - y(x.n));
      return `<g><title>${esc(monthOf(x.month))}: ${x.n} review${x.n === 1 ? '' : 's'}${x.low ? `, ${x.low} of them 1–2★` : ''}</title>
        <rect class="${cls}" x="${(pad + i * bw + 1).toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>
        ${x.low ? `<circle class="b-low" cx="${(pad + i * bw + bw / 2).toFixed(1)}" cy="${(H - pad - h - 8).toFixed(1)}" r="4"/>` : ''}</g>`;
    }).join('');
    const ticks = m.map((x, i) => (i === 0 || i === m.length - 1 || x.month.endsWith('-01')) ? `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthOf(x.month))}</text>` : '').join('');
    const peak = m.reduce((a, b) => (b.n > a.n ? b : a));
    // The label sits beside the peak bar, on whichever side has room.
    const px = pad + m.indexOf(peak) * bw;
    const right = px < W / 2;
    const spike = burstMonths.has(peak.month) ? `<text class="ann" x="${(right ? px + bw + 6 : px - 6).toFixed(1)}" y="${(y(peak.n) + 12).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(peak.n)} reviews in ${esc(monthOf(peak.month))}</text>` : '';
    return `<figure class="chart"><figcaption>Google reviews each month, all your listings</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews per month"><line class="axis" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>${bars}${ticks}${spike}</svg>
      <p class="legend"><span class="k k-norm"></span>reviews <span class="k k-spike"></span>a month with a one-day spike Google may read as a review drive <span class="k k-low"></span>a 1–2★ review</p></figure>`;
  }

  /** The Maps result a customer sees in the main town, with you in it. */
  function mapsBoard(): string {
    const a = R.maps.by_area[0];
    if (!a || !a.top.length) return '';
    const us = R.maps.our;
    const max = Math.max(...a.top.map((t: any) => t.reviews ?? 0), us?.reviews ?? 0, 1);
    const row = (rank: string, n: string, rating: number | null, reviews: number | null, me = false) => `<div class="lb-row${me ? ' me' : ''}"><span class="lb-rank">${esc(rank)}</span><span class="lb-name">${esc(n)}${rating ? ` <span class="muted">${esc(rating)}★</span>` : ''}</span><span class="lb-bar"><i style="width:${(((reviews ?? 0) / max) * 100).toFixed(1)}%"></i></span><span class="lb-n">${reviews ?? '–'}</span></div>`;
    const top = a.top.slice(0, 5).map((t: any, i: number) => row(`#${i + 1}`, t.name.replace(/\s*[-–|].*$/, ''), t.rating, t.reviews)).join('');
    const gap = (a.best_rank ?? 99) > 6 ? `<div class="lb-gap">${a.best_rank ? `${a.best_rank - 6} more businesses` : 'everyone else on the list'}</div>` : '';
    const me = row(a.best_rank ? `#${a.best_rank}` : '—', us ? `You (${us.name})` : 'You', us?.rating ?? null, us?.reviews ?? null, true);
    const towns = R.maps.by_area.slice(1).map((t) => `<li><b>${esc(t.area)}</b>: ${t.best_rank ? `#${esc(t.best_rank)} of ${esc(t.of)}` : `not in the top ${esc(t.of || 20)}`}</li>`).join('');
    return `<figure class="chart"><figcaption>Google Maps, searching “${esc(a.query)}”. Bars are Google review counts.</figcaption>
      <div class="lb">${top}${gap}${me}</div>${towns ? `<p class="muted small">Your best place in the other towns you serve:</p><ul class="towns">${towns}</ul>` : ''}</figure>`;
  }

  /** Who AI assistants name when a customer asks for a recommendation, and you. */
  function aiVoice(): string {
    if (!R.ai.trade_answers) return '';
    const max = Math.max(...R.ai.share.map((s) => s.n), R.ai.named_us, 1);
    const row = (n: string, c: number, me = false) => `<div class="lb-row${me ? ' me' : ''}"><span class="lb-name">${esc(n)}</span><span class="lb-bar"><i style="width:${((c / max) * 100).toFixed(1)}%"></i></span><span class="lb-n">${c} of ${R.ai.trade_answers}</span></div>`;
    return `<figure class="chart"><figcaption>Customers asked AI assistants “${esc(R.ai.trade_question ?? 'who is the best?')}”. How often each business was named across ${R.ai.trade_answers} answers.</figcaption>
      <div class="lb lb-ai">${R.ai.share.map((s) => row(s.name, s.n)).join('')}${row('You', R.ai.named_us, true)}</div></figure>`;
  }

  /** Right, wrong and "don't know" when customers ask AI about you by name: from memory, then with a web search. */
  function aiAccuracy(): string {
    const modes = [R.ai.memory, R.ai.search].filter(Boolean) as any[];
    if (!modes.length) return '';
    const bar = (m: any) => {
      const t = m.right + m.mixed + m.wrong + m.dont_know || 1;
      const seg = (n: number, cls: string, label: string) => (n ? `<i class="${cls}" style="width:${((n / t) * 100).toFixed(1)}%" title="${esc(label)}: ${n}"></i>` : '');
      return `<div class="acc-row"><span class="acc-m">${esc(m.model)}</span><span class="acc-bar">${seg(m.right, 's-good', 'Right')}${seg(m.mixed, 's-fix', 'Partly right')}${seg(m.wrong, 's-urgent', 'Wrong')}${seg(m.dont_know, 's-none', "Didn't know you")}</span><span class="acc-n">${m.right} right · ${m.wrong} wrong · ${m.dont_know} didn't know</span></div>`;
    };
    return `<figure class="chart"><figcaption>Questions about you by name (your phone, address, website, licences, reputation)</figcaption>
      ${modes.map((md) => `<p class="acc-h">${esc(md.label)}</p>${md.models.map(bar).join('')}`).join('')}
      <p class="legend"><span class="k s-good"></span>right <span class="k s-fix"></span>partly right <span class="k s-urgent"></span>wrong <span class="k s-none"></span>didn't know you</p>
      ${(R.ai.memory?.wrong_examples ?? []).length ? `<p class="small"><b>Wrong things an assistant told a customer:</b></p><ul class="plain small">${R.ai.memory!.wrong_examples.slice(0, 3).map((w: any) => `<li>“${esc(clip(w.claim, 140))}”</li>`).join('')}</ul>` : ''}</figure>`;
  }

  const shotFig = (s: any, cls = '') => `<figure class="shot ${cls}"><img src="data:image/jpeg;base64,${s.img}" alt="${esc(s.caption)}" loading="lazy"><figcaption><b>${esc(s.caption)}.</b> <span class="muted">${esc(hostOf(s.url))}${esc(new URL(s.url).pathname === '/' ? '' : new URL(s.url).pathname)} · ${esc(dateOf(s.taken_at))}</span></figcaption></figure>`;
  const proofShots = shots.filter((s) => s.key !== 'cover');
  const coverShot = shots.find((s) => s.key === 'cover');

  function visual(theme: string): string {
    if (theme === 'reputation') return `${R.reviews.unanswered_low.slice(-2).reverse().map(reviewCard).join('')}${timeline()}`;
    if (theme === 'findability') return mapsBoard();
    if (theme === 'ai') return aiVoice() + aiAccuracy();
    if (theme === 'website') return proofShots.length ? `<div class="shots">${proofShots.slice(0, 3).map((s) => shotFig(s)).join('')}</div>` : '';
    return '';
  }

  // ---------- stories: the editor's, or built here from the numbers ----------
  const fallback: Record<string, () => any> = {
    reputation: () => ({ headline: `${R.reviews.replied} of your ${R.reviews.total} Google reviews have a reply from you`, body: R.reviews.unanswered_low.length ? `${R.reviews.unanswered_low.length} review${R.reviews.unanswered_low.length === 1 ? '' : 's'} of 1–2★ sit on your listing with no answer, the oldest for ${R.reviews.unanswered_low[0].days_open} days.` : 'Customers who read your reviews see nobody from the company answering.', cost: 'A complaint with no answer is the first thing a careful customer reads, and it reads as if nobody is listening.', fix: 'Reply publicly to every 1–2★ review this week, then to the rest.' }),
    findability: () => { const a = R.maps.by_area[0]; return { headline: a?.best_rank ? `You are #${a.best_rank} on Google Maps in ${a.area}` : `You are not on the first page of Google Maps in ${a?.area ?? 'your town'}`, body: `A customer searching “${a?.query ?? ''}” sees ${a?.best_rank ? a.best_rank - 1 : 'many'} other businesses before you.${R.maps.no_listing_in.length ? ` You have no Maps listing at all in ${R.maps.no_listing_in.join(', ')}.` : ''}`, cost: 'Most customers call one of the first three names they see.', fix: R.maps.no_listing_in.length ? `Create a Google Maps listing in ${R.maps.no_listing_in[0]}.` : 'Grow your review count and make your name, address and phone the same everywhere.' }; },
    ai: () => ({ headline: `AI assistants recommended you in ${R.ai.named_us} of ${R.ai.trade_answers} answers`, body: `When a customer asks an AI assistant who to hire, it names ${R.ai.share.slice(0, 3).map((s) => s.name).join(', ')} instead.`, cost: 'Customers who ask an assistant first never get to your website.', fix: 'Get listed on the pages assistants read, and give them correct facts about you to quote.' }),
    website: () => ({ headline: `${R.website.high} urgent faults on your websites`, body: 'Broken pages, empty service pages and contact details that do not work, found by reading every page.', cost: 'A customer who hits a dead page or a number that does not connect goes to the next result.', fix: 'Fix the urgent items in the list below before anything else on the site.' }),
  };
  const order = ['reputation', 'findability', 'ai', 'website'];
  const edStories: any[] = (ed.stories ?? []).filter((s: any) => order.includes(s.theme));
  const stories = (edStories.length ? edStories : order.filter((t) => areaOf(t)?.ran && areaOf(t)?.status[0] !== 'good').slice(0, 3).map((t) => ({ theme: t, ...fallback[t]() })))
    .map((s: any) => ({ ...fallback[s.theme](), ...Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' && v.trim())) }));
  const storyThemes = new Set(stories.map((s: any) => s.theme));
  const draftFor: Record<string, [string, string]> = { reputation: ['#d-reviews', 'Ready-made review replies'], findability: ['#d-pages', 'Pages to add, town by town'], ai: ['#d-ai', 'Getting recommended by AI'], website: ['#d-site', 'Your homepage, rewritten'] };

  const verdict = ed.verdict ?? s2.top?.summary ?? '';
  const top = s2.top ?? null;
  const site = s2.site ?? null;
  const ai = s2.ai ?? null;
  const replies = s2.replies ?? null;
  const targets: any[] = s2.reply_targets ?? [];
  const sources = (r.sources ?? []) as any[];

  /** Markdown of the company-dive dossier to HTML: headings, tables, lists, bold, [n] citations. */
  function md(src: string): string {
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
        out.push(`<div class="tbl"><table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
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

  // Private alerts: register data exposing personal IDs, plus private documents a search engine indexed.
  const privateItems: string[] = [];
  for (const f of L['D-registry']?.findings ?? []) if (/^PRIVATE/i.test(f.title)) privateItems.push(`<b>${esc(f.title.replace(/^PRIVATE:\s*/i, ''))}.</b> ${esc(clip(String(f.detail ?? ''), 300))}`);
  const searched = [
    ...Object.values(L['G-grounded']?.notes?.search_results ?? {}).flatMap((v: any) => (Array.isArray(v) ? v : v?.rows ?? []).map((x: any) => x.url ?? x)),
    ...(L['H-web']?.notes?.nameRows ?? []).map((x: any) => x.url),
  ].filter((u: any) => typeof u === 'string');
  const docs = [...new Set(searched.filter((u: string) => /proposal|invoice|\/inv[-/]|[?&]uid=|quotation/i.test(u)))];
  if (docs.length) privateItems.push(`<b>Search engines have indexed ${docs.length} private document link${docs.length === 1 ? '' : 's'}</b> (proposals or invoices meant for one customer). Put these behind a login or mark them no-index.`);

  // Credentials as a grid: what the official register says about each claim.
  const credIcon: Record<string, [string, string]> = { verified: ['good', '✓'], contradicted: ['urgent', '✕'], 'not found': ['fix', '?'], "can't check automatically": ['info', '–'] };
  const creds = R.credentials.list.filter((c: any) => c.verdict !== "can't check automatically");
  const credUnchecked = R.credentials.list.filter((c: any) => c.verdict === "can't check automatically");
  const credCard = (c: any) => {
    const under = c.verdict === 'contradicted' && c.direction === 'undersell';
    const [cls, ic] = under ? ['good', '↑'] : credIcon[c.verdict] ?? ['info', '–'];
    const label = under ? 'Better than you claim' : c.verdict === 'verified' ? 'Confirmed by the register' : c.verdict === 'contradicted' ? 'The register says otherwise' : 'Not found in the register';
    return `<div class="cred ${cls}"><span class="ic" aria-hidden="true">${ic}</span><div><p class="t">${esc(clip(c.claim, 110))}</p><p class="w">${esc(label)}${c.source ? ` · ${seeIt(c.source)}` : ''}</p></div></div>`;
  };

  const mismatch: any[] = ed.mismatch?.length ? ed.mismatch : (r.contradictions ?? []).slice(0, 5).map((c: string) => ({ issue: c.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim(), settled: null }));
  const otherAreas = R.areas.filter((a) => a.ran && !storyThemes.has(a.id));
  const checkedOn = dateOf(R.checked_on);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}: online presence audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>
:root { --bg:#f4f1ea; --paper:#fffdf8; --ink:#1c1a17; --muted:#6b645a; --line:#e2dccf; --accent:#0f5c4d; --accent-bg:#e2efe9;
  --urgent:#b4232c; --urgent-bg:#fbe9e7; --fix:#a35a00; --fix-bg:#fdf1de; --good:#1f7a4a; --good-bg:#e5f3ea; --info:#5d6670; --info-bg:#eef0f2; --none:#c9c3b6;
  --display:"Fraunces",Georgia,serif; --body:"Source Sans 3","Segoe UI",system-ui,sans-serif; }
@media (prefers-color-scheme: dark) { :root { --bg:#151412; --paper:#1d1c19; --ink:#ece7dd; --muted:#a39b8e; --line:#34312b; --accent:#5ec4a8; --accent-bg:#17302a;
  --urgent:#f2766d; --urgent-bg:#3a1a18; --fix:#f0b04a; --fix-bg:#33260f; --good:#5fcf8f; --good-bg:#132a1c; --info:#aab3bc; --info-bg:#22272b; --none:#4a463f; color-scheme:dark; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--body); font-size:17px; line-height:1.6; }
.wrap { max-width:960px; margin:0 auto; padding:0 16px 80px; }
h1,h2,h3,h4 { font-family:var(--display); font-weight:700; line-height:1.15; margin:0; text-wrap:balance; }
h1 { font-size:clamp(34px,6vw,58px); letter-spacing:-0.015em; } h2 { font-size:clamp(26px,3.6vw,36px); } h3 { font-size:22px; } h4 { font-family:var(--body); font-size:17px; }
p { margin:0; } a { color:var(--accent); text-underline-offset:3px; } .muted { color:var(--muted); } .small { font-size:15px; }
.eyebrow { font-size:13px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--accent); }
section { margin-top:72px; } .sec-head { display:grid; gap:8px; margin-bottom:24px; max-width:66ch; }
/* cover */
.cover { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:40px; align-items:center; padding:56px 0 8px; }
.cover .lede { font-size:20px; line-height:1.55; max-width:60ch; margin-top:18px; }
.cover .meta { margin-top:18px; font-size:14px; color:var(--muted); display:flex; flex-wrap:wrap; gap:4px 18px; } .cover .meta b { color:var(--ink); font-weight:600; }
.phone { width:220px; border-radius:30px; border:9px solid var(--ink); overflow:hidden; background:var(--ink); box-shadow:0 20px 40px -18px rgba(0,0,0,.45); }
.phone img { display:block; width:100%; } .phone-cap { font-size:13px; color:var(--muted); text-align:center; margin-top:8px; }
/* scorecard */
.card-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-top:36px; }
.area { background:var(--paper); border:1px solid var(--line); border-top:5px solid var(--info); border-radius:10px; padding:14px 16px; display:grid; gap:6px; text-decoration:none; color:inherit; }
.area.urgent { border-top-color:var(--urgent); } .area.fix { border-top-color:var(--fix); } .area.good { border-top-color:var(--good); }
.area .al { font-size:14px; color:var(--muted); } .area .m { font-family:var(--display); font-size:20px; line-height:1.2; }
.chip { display:inline-block; font-size:12px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:2px 9px; border-radius:999px; width:max-content; }
.chip.urgent { color:var(--urgent); background:var(--urgent-bg); } .chip.fix { color:var(--fix); background:var(--fix-bg); } .chip.good { color:var(--good); background:var(--good-bg); } .chip.info { color:var(--info); background:var(--info-bg); }
nav.toc { margin-top:28px; display:flex; flex-wrap:wrap; gap:6px 18px; font-size:15px; } nav.toc a { text-decoration:none; }
/* stories */
.story { background:var(--paper); border:1px solid var(--line); border-radius:14px; padding:32px; display:grid; gap:18px; margin-top:24px; }
.story .num { font-family:var(--display); font-size:56px; line-height:1; color:var(--accent); opacity:.85; }
.story-head { display:grid; grid-template-columns:auto minmax(0,1fr); gap:20px; align-items:start; } .story-head .body { font-size:18px; margin-top:10px; max-width:62ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.pair > div { border-radius:10px; padding:14px 16px; display:grid; gap:4px; } .pair .cost { background:var(--urgent-bg); } .pair .do { background:var(--accent-bg); }
.pair .lbl { font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; } .pair .cost .lbl { color:var(--urgent); } .pair .do .lbl { color:var(--accent); }
.go { font-weight:600; text-decoration:none; }
/* figures */
figure { margin:0; } .chart { display:grid; gap:10px; } figcaption { font-size:15px; color:var(--muted); }
svg { width:100%; height:auto; display:block; } svg text { font-family:var(--body); font-size:12px; fill:var(--muted); } svg .ann { fill:var(--ink); font-weight:700; font-size:13px; }
.axis { stroke:var(--line); } .b-norm { fill:var(--accent); opacity:.55; } .b-spike { fill:var(--fix); } .b-low { fill:var(--urgent); stroke:var(--paper); stroke-width:2; }
.legend { font-size:13px; color:var(--muted); display:flex; flex-wrap:wrap; gap:4px 14px; align-items:center; } .k { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:-8px; vertical-align:-1px; }
.k-norm { background:var(--accent); opacity:.55; } .k-spike { background:var(--fix); } .k-low { background:var(--urgent); border-radius:50%; }
.s-good { background:var(--good); } .s-fix { background:var(--fix); } .s-urgent { background:var(--urgent); } .s-none { background:var(--none); }
.gcard { border:1px solid var(--line); border-radius:12px; padding:16px 18px; background:var(--bg); display:grid; gap:10px; }
.gtop { display:flex; gap:12px; align-items:center; font-size:15px; } .av { width:36px; height:36px; border-radius:50%; background:var(--info); color:var(--paper); display:grid; place-items:center; font-weight:700; flex:none; }
.st { color:#e6a700; letter-spacing:1px; margin-left:8px; } blockquote { margin:0; font-size:16px; } .noreply { font-size:14px; color:var(--urgent); font-weight:600; }
.lb { display:grid; gap:6px; } .lb-row { display:grid; grid-template-columns:42px minmax(0,1.4fr) minmax(0,1fr) 64px; gap:10px; align-items:center; font-size:15px; padding:5px 8px; border-radius:8px; }
.lb-ai .lb-row { grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 72px; }
.lb-row.me { background:var(--accent-bg); font-weight:700; } .lb-rank { font-family:var(--display); font-weight:700; } .lb-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lb-bar { height:10px; background:var(--line); border-radius:5px; overflow:hidden; } .lb-bar i { display:block; height:100%; background:var(--info); border-radius:5px; } .lb-row.me .lb-bar i { background:var(--accent); }
.lb-n { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); } .lb-gap { text-align:center; color:var(--muted); font-size:13px; letter-spacing:.2em; }
.towns { margin:0; padding-left:20px; font-size:15px; display:flex; flex-wrap:wrap; gap:2px 22px; }
.acc-h { font-weight:700; font-size:15px; margin-top:6px; } .acc-row { display:grid; grid-template-columns:80px minmax(0,1fr); gap:4px 12px; align-items:center; font-size:14px; }
.acc-bar { display:flex; height:14px; border-radius:7px; overflow:hidden; gap:2px; } .acc-bar i { display:block; height:100%; } .acc-n { grid-column:2; color:var(--muted); }
.shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
.shot { display:grid; gap:8px; } .shot img { width:100%; border:1px solid var(--line); border-radius:10px; display:block; }
/* lists */
ul.items { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
ul.items li { display:grid; grid-template-columns:14px minmax(0,1fr); gap:12px; padding:10px 0; border-bottom:1px solid var(--line); }
ul.items .dot { width:10px; height:10px; border-radius:50%; margin-top:8px; background:var(--info); } ul.items li.urgent .dot { background:var(--urgent); } ul.items li.fix .dot { background:var(--fix); } ul.items li.good .dot { background:var(--good); }
ul.items .t { font-weight:600; } ul.items .w { color:var(--muted); font-size:15px; } a.see { font-size:14px; text-decoration:none; }
.plain { margin:0; padding-left:20px; display:grid; gap:6px; }
ol.fixes { list-style:none; margin:0; padding:0; display:grid; gap:12px; counter-reset:fix; }
ol.fixes > li { min-width:0; counter-increment:fix; background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:16px 18px 16px 64px; position:relative; display:grid; gap:6px; }
ol.fixes > li::before { content:counter(fix); position:absolute; left:20px; top:10px; font-family:var(--display); font-weight:700; font-size:30px; color:var(--accent); }
.tags { display:flex; flex-wrap:wrap; gap:6px; }
.weeks { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:16px; }
.box { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:16px 18px; display:grid; gap:10px; align-content:start; }
.area-block { display:grid; gap:12px; padding:22px 0; border-top:1px solid var(--line); } .area-block .row { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:baseline; }
/* ready to use */
.draft { background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:22px; display:grid; grid-template-columns:minmax(0,1fr); gap:14px; margin-top:16px; overflow-wrap:anywhere; }
.hero { background:var(--accent-bg); border-radius:10px; padding:22px; display:grid; gap:10px; } .hero .hl { font-family:var(--display); font-size:28px; line-height:1.15; } .hero .btn { justify-self:start; background:var(--accent); color:var(--paper); font-weight:700; padding:8px 16px; border-radius:8px; }
.grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; } .grid2 > * { min-width:0; }
.reply-card { display:grid; gap:8px; padding:16px 0; border-bottom:1px solid var(--line); } .reply-card .quote { color:var(--muted); font-style:italic; } .reply-card .ans { border-left:3px solid var(--accent); padding-left:12px; }
.tbl { overflow-x:auto; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
table { width:100%; border-collapse:collapse; font-size:15px; } th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; } th { font-size:13px; color:var(--muted); font-weight:600; } tr:last-child td { border-bottom:0; }
pre { margin:0; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:14px; overflow-x:auto; font-size:13px; line-height:1.5; }
code { font-size:.9em; overflow-wrap:anywhere; }
/* stranger */
.idstrip { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
.idstrip div { background:var(--paper); padding:12px 14px; } .idstrip .al { font-size:13px; color:var(--muted); display:block; }
.creds { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }
.cred { display:grid; grid-template-columns:30px minmax(0,1fr); gap:10px; background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.cred .ic { width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font-weight:700; color:var(--paper); background:var(--info); }
.cred.good .ic { background:var(--good); } .cred.urgent .ic { background:var(--urgent); } .cred.fix .ic { background:var(--fix); }
.cred .t { font-weight:600; font-size:15px; } .cred .w { font-size:14px; color:var(--muted); }
.quotes { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; } .quotes blockquote { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:16px; font-size:15px; }
.quotes cite { display:block; margin-top:8px; font-style:normal; font-size:13px; color:var(--muted); }
.private { border:1px solid var(--urgent); background:var(--urgent-bg); border-radius:10px; padding:18px 20px; display:grid; gap:8px; } .private h2 { color:var(--urgent); font-size:22px; }
details.appx > summary { cursor:pointer; font-family:var(--display); font-size:20px; font-weight:700; padding:14px 0; border-top:1px solid var(--line); }
.dossier { display:grid; gap:12px; max-width:72ch; font-size:16px; } a.cite { font-size:.75em; text-decoration:none; vertical-align:super; }
ol.sources { padding-left:34px; display:grid; gap:3px; font-size:13px; color:var(--muted); } ol.sources li { overflow-wrap:anywhere; }
footer { margin-top:64px; border-top:1px solid var(--line); padding-top:18px; display:grid; gap:6px; font-size:13px; color:var(--muted); }
@media (max-width:720px) {
  .cover { grid-template-columns:1fr; padding-top:32px; } .phone { width:180px; justify-self:center; }
  .story { padding:20px; } .story-head { grid-template-columns:1fr; gap:8px; } .story .num { font-size:40px; } .pair { grid-template-columns:1fr; }
  .lb-row { grid-template-columns:34px minmax(0,1fr) 54px; } .lb-row .lb-bar { display:none; } .lb-ai .lb-row { grid-template-columns:minmax(0,1fr) 64px; }
  ol.fixes > li { padding-left:50px; } ol.fixes > li::before { left:16px; font-size:24px; }
}
@media print {
  body { background:#fff; font-size:11pt; } .wrap { max-width:none; } nav.toc, a.see { display:none; }
  section { margin-top:28pt; } .story, figure, .box, .draft, .cred, ol.fixes > li, .area-block { break-inside:avoid; }
  #stories, #fixes, #ready, #stranger, #appendix { break-before:page; } details.appx { display:block; } details.appx > :not(summary) { display:block; }
}
</style>
</head>
<body>
<div class="wrap">

<header class="cover">
  <div>
    <p class="eyebrow">Online presence audit · ${esc(checkedOn)}</p>
    <h1 style="margin-top:14px">${esc(name)}</h1>
    <p class="muted" style="font-size:20px;margin-top:8px">How customers, Google and AI assistants see you, and what to fix first.</p>
    ${verdict ? `<p class="lede">${esc(verdict)}</p>` : ''}
    <p class="meta"><span>SSM <b>${esc(R.identity.ssm ?? '–')}</b></span>${R.identity.domains.length ? `<span>Sites <b>${esc(R.identity.domains.join(', '))}</b></span>` : ''}${R.reviews.total ? `<span>Reviews read <b>${esc(R.reviews.total)}</b></span>` : ''}${R.ai.trade_answers ? `<span>AI answers checked <b>${esc((R.ai.memory?.models ?? []).concat(R.ai.search?.models ?? []).reduce((t: number, m: any) => t + m.asked + m.trade_asked, 0))}</b></span>` : ''}</p>
  </div>
  ${coverShot ? `<div><div class="phone"><img src="data:image/jpeg;base64,${coverShot.img}" alt="${esc(name)} homepage on a phone"></div><p class="phone-cap">${esc(hostOf(coverShot.url))} on a phone</p></div>` : ''}
</header>

<div class="card-grid" aria-label="Where you stand">
  ${R.areas.filter((a) => a.ran).map((a) => `<a class="area ${a.status[0]}" href="#${storyThemes.has(a.id) ? `story-${a.id}` : `area-${a.id}`}"><span class="al">${esc(a.title)}</span><span class="m">${esc(a.metric ?? '')}</span><span class="chip ${a.status[0]}">${esc(a.status[1])}</span></a>`).join('')}
</div>

<nav class="toc" aria-label="Contents"><a href="#stories">The ${stories.length === 1 ? 'main problem' : `${stories.length} main problems`}</a><a href="#fixes">Fixes in order</a>${otherAreas.length ? '<a href="#other">Everything else</a>' : ''}<a href="#ready">Ready to use</a><a href="#stranger">What a stranger sees</a><a href="#appendix">Full checklist</a></nav>

${stories.length ? `<section id="stories">
  <div class="sec-head"><p class="eyebrow">Where you lose customers</p><h2>The ${stories.length === 1 ? 'main problem' : `${['', 'one', 'two', 'three'][stories.length]} problems`} costing you the most customers</h2></div>
  ${stories.map((s: any, i: number) => `<article class="story" id="story-${esc(s.theme)}">
    <div class="story-head"><span class="num">${String(i + 1).padStart(2, '0')}</span><div><p class="eyebrow">${esc(areaTitle(s.theme))}</p><h3 style="font-size:clamp(24px,3vw,32px);margin-top:6px">${esc(s.headline)}</h3><p class="body">${esc(s.body)}</p></div></div>
    ${visual(s.theme)}
    <div class="pair"><div class="cost"><span class="lbl">What it costs you</span><p>${esc(s.cost)}</p></div><div class="do"><span class="lbl">Do this first</span><p>${esc(s.fix)}</p></div></div>
    ${draftFor[s.theme] ? `<a class="go" href="${draftFor[s.theme][0]}">${esc(draftFor[s.theme][1])} ↓</a>` : ''}
  </article>`).join('')}
</section>` : ''}

<section id="fixes">
  <div class="sec-head"><p class="eyebrow">What to do</p><h2>Your fixes, in order</h2><p class="muted">Least effort for most effect first.</p></div>
  ${top?.top5?.length ? `<ol class="fixes">${top.top5.map((x: any) => `<li><h4>${esc(x.fix)}</h4><p class="muted">${esc(x.why)}</p><div class="tags"><span class="chip info">${esc(x.effort)}</span><span class="chip ${x.impact === 'high' ? 'urgent' : 'fix'}">${esc(x.impact)} impact</span></div></li>`).join('')}</ol>` : '<p class="muted">The fix list was not written in this run.</p>'}
  ${(top?.plan30 ?? []).length ? `<h3 style="margin-top:36px">Your first 30 days</h3><div class="weeks">${top.plan30.map((w: any) => `<div class="box"><h4>Week ${esc(w.week)}</h4><ul class="plain small">${(w.tasks ?? []).map((t: string) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
</section>

${otherAreas.length ? `<section id="other">
  <div class="sec-head"><p class="eyebrow">Everything else</p><h2>The other areas we checked</h2><p class="muted">The most important items in each. Every finding is in the full checklist at the end.</p></div>
  ${otherAreas.map((a) => {
    const list = byArea(a.id).filter((x) => x.severity === 'high' || x.severity === 'medium');
    const extra = a.id === 'website' && proofShots.length ? `<div class="shots">${proofShots.slice(0, 3).map((s) => shotFig(s)).join('')}</div>` : a.id === 'credentials' ? '' : visual(a.id);
    return `<div class="area-block" id="area-${a.id}"><div class="row"><h3>${esc(a.title)}</h3><span class="chip ${a.status[0]}">${esc(a.status[1])}</span><span class="muted">${esc(a.metric ?? '')}</span></div>
      ${extra}${list.length ? `<ul class="items">${list.slice(0, 4).map(itemLi).join('')}</ul>${list.length > 4 ? `<p class="small"><a href="#appx-${a.id}">${list.length - 4} more in the full checklist ↓</a></p>` : ''}` : '<p class="muted">Nothing urgent here.</p>'}</div>`;
  }).join('')}
</section>` : ''}

<section id="ready">
  <div class="sec-head"><p class="eyebrow">Ready to use</p><h2>Done for you: copy, replies and pages</h2><p class="muted">Written from the facts we verified. Read each one before you publish it.</p></div>

  <div class="draft" id="d-site"><h3>Your homepage, rewritten</h3>
    ${site ? `<p>${esc(site.verdict)}</p>${site.one_site_or_two ? `<p><b>One site or two?</b> ${esc(site.one_site_or_two)}</p>` : ''}
    ${site.homepage ? `<div class="hero"><div class="hl">${esc(site.homepage.headline)}</div><p>${esc(site.homepage.subheadline)}</p>${(site.homepage.proof_points ?? []).length ? `<ul class="plain">${site.homepage.proof_points.map((p: string) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}<span class="btn">${esc(site.homepage.cta)}</span></div>
    <div class="grid2">${(site.homepage.sections ?? []).map((x: any) => `<div><h4>${esc(x.title)}</h4><p class="small">${esc(x.body)}</p></div>`).join('')}</div>` : ''}
    ${(site.pages_to_fix ?? []).length ? `<h4>Pages to fix</h4><div class="tbl"><table><thead><tr><th>Page</th><th>Problem</th><th>Fix</th></tr></thead><tbody>${site.pages_to_fix.map((p: any) => `<tr><td>${esc(p.page)}</td><td>${esc(p.problem)}</td><td>${esc(p.fix)}</td></tr>`).join('')}</tbody></table></div>` : ''}` : '<p class="muted">The website plan was not written in this run.</p>'}
  </div>

  ${(site?.pages_to_add ?? []).length ? `<div class="draft" id="d-pages"><h3>Pages to add, town by town</h3><div class="grid2">${site.pages_to_add.map((p: any) => `<div class="box"><code>${esc(p.slug)}</code><h4>${esc(p.title)}</h4><p class="muted small">${esc(p.why)}</p><ul class="plain small">${(p.outline ?? []).map((o: string) => `<li>${esc(o)}</li>`).join('')}</ul></div>`).join('')}</div></div>` : ''}

  <div class="draft" id="d-reviews"><h3>Review replies, ready to post</h3>
    ${(replies?.replies ?? []).length ? `${replies.replies.map((x: any) => { const t = targets[x.i] ?? {}; return `<div class="reply-card"><p class="small"><span class="st" style="margin:0">${stars(Number(t.stars) || 0)}</span> <span class="muted">${esc(t.author ?? '')} · ${esc(dateOf(t.date))} · ${esc(t.listing)}</span></p>${t.text ? `<p class="quote">${esc(clip(String(t.text), 300))}</p>` : '<p class="quote">(star rating only)</p>'}<p class="ans">${esc(x.reply)}</p>${x.reply_en ? `<p class="ans muted">${esc(x.reply_en)}</p>` : ''}${x.note ? `<p class="small muted"><b>Before posting:</b> ${esc(x.note)}</p>` : ''}</div>`; }).join('')}
    <div class="grid2">${replies.template_5star ? `<div class="box"><h4>Thank-you reply for 5★ reviews</h4><p class="small">${esc(replies.template_5star)}</p></div>` : ''}${replies.ask_message ? `<div class="box"><h4>WhatsApp message asking for a review</h4><p class="small">${esc(replies.ask_message)}</p></div>` : ''}</div>` : '<p class="muted">No unanswered reviews needed a draft.</p>'}
  </div>

  <div class="draft" id="d-ai"><h3>Getting recommended by AI assistants</h3>
    ${ai ? `${(ai.actions ?? []).length ? `<ol class="fixes">${ai.actions.map((a: any) => `<li><h4>${esc(a.action)}</h4><p class="muted small">${esc(a.why)}</p><p class="small">${esc(a.how)}</p><div class="tags"><span class="chip info">${esc(a.effort)}</span><span class="chip ${a.impact === 'high' ? 'urgent' : 'fix'}">${esc(a.impact)} impact</span></div></li>`).join('')}</ol>` : ''}
    ${(ai.faq ?? []).length ? `<h4>FAQ for your website</h4><div class="grid2">${ai.faq.map((x: any) => `<div class="box"><h4>${esc(x.q)}</h4><p class="small">${esc(x.a)}</p></div>`).join('')}</div>` : ''}
    ${ai.measure ? `<p class="small"><b>How to track it:</b> ${esc(ai.measure)}</p>` : ''}` : '<p class="muted">The AI plan was not written in this run.</p>'}
  </div>

  ${s2.jsonld ? `<div class="draft"><h3>Business details for Google and AI</h3><p class="muted small">Ask your web developer to paste this into the &lt;head&gt; of every page, after checking the phone and address are the ones you want everywhere.</p><pre>${esc('<script type="application/ld+json">\n' + JSON.stringify(s2.jsonld, null, 2) + '\n</script>')}</pre></div>` : ''}
</section>

<section id="stranger">
  <div class="sec-head"><p class="eyebrow">What a stranger sees</p><h2>What a customer, bank or tender officer learns about you in 10 minutes</h2></div>
  <div class="idstrip">
    <div><span class="al">Legal name</span>${esc(name)}</div>
    <div><span class="al">SSM number</span>${esc(R.identity.ssm ?? '–')}</div>
    ${R.credentials.cidb_grade ? `<div><span class="al">CIDB grade (official register)</span>${esc(R.credentials.cidb_grade)}</div>` : ''}
    ${R.maps.our ? `<div><span class="al">Google rating</span>${esc(R.maps.our.rating)}★ from ${esc(R.maps.our.reviews)} reviews</div>` : ''}
    ${R.identity.address ? `<div style="grid-column:1/-1"><span class="al">Address</span>${esc(R.identity.address)}</div>` : ''}
  </div>
  ${creds.length ? `<h3 style="margin:32px 0 12px">Your claims, checked against the official registers</h3><div class="creds">${creds.map(credCard).join('')}</div>${credUnchecked.length ? `<p class="muted small" style="margin-top:10px">No public register exists for ${credUnchecked.length} other claim${credUnchecked.length === 1 ? '' : 's'} (${esc(credUnchecked.slice(0, 4).map((c: any) => clip(c.claim, 40)).join('; '))}${credUnchecked.length > 4 ? '; …' : ''}), so a stranger has to take your word for them.</p>` : ''}` : ''}
  ${mismatch.length ? `<h3 style="margin:32px 0 12px">What does not add up</h3><ul class="items">${mismatch.map((m: any) => `<li class="fix"><span class="dot"></span><div><p class="t">${esc(m.issue)}</p>${m.settled ? `<p class="w">The official register ${esc(m.settled)}${m.source ? ` · ${seeIt(m.source)}` : ''}</p>` : ''}</div></li>`).join('')}</ul>` : ''}
  ${R.reviews.good_quotes.length ? `<h3 style="margin:32px 0 12px">What your customers say, in their words</h3><div class="quotes">${R.reviews.good_quotes.map((q: any) => `<blockquote>${esc(clip(String(q.text), 300))}<cite>${esc(q.author)} · ${esc(dateOf(q.date))}</cite></blockquote>`).join('')}</div>${R.reviews.praise.length ? `<p class="muted small" style="margin-top:10px">Praised most for: ${esc(R.reviews.praise.map(([p, n]) => `${p} (${n})`).join(', '))}. None of this appears on your website yet.</p>` : ''}` : ''}
</section>

${privateItems.length ? `<section class="private" aria-labelledby="priv-h"><h2 id="priv-h">Private: for you only</h2><ul class="plain">${privateItems.map((x) => `<li>${x}</li>`).join('')}</ul></section>` : ''}

<section id="appendix">
  <div class="sec-head"><p class="eyebrow">Appendix</p><h2>The full checklist</h2><p class="muted">Every finding, area by area, with a link to where we saw it.</p></div>
  ${AREAS.filter((a) => byArea(a.id).length).map((a) => { const list = byArea(a.id); return `<details class="appx" id="appx-${a.id}"><summary>${esc(a.title)} <span class="muted small">${list.filter((x) => x.severity === 'high').length} urgent · ${list.filter((x) => x.severity === 'medium').length} needs work · ${list.length} in all</span></summary><ul class="items">${list.map(itemLi).join('')}</ul></details>`; }).join('')}
  <details class="appx"><summary>Background research on the company</summary><p class="muted small" style="margin:6px 0 14px">Written from public sources on ${esc(dateOf(dive.finished_at))}, before the checks above. Where they differ, the checks above are newer and win.</p><div class="dossier">${md(String(dive.dossier ?? ''))}</div></details>
  ${sources.length ? `<details class="appx"><summary>Sources (${sources.length})</summary><ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(clip(String(s.title || hostOf(s.url)), 90))}</a> <span>${esc(hostOf(s.url))}</span>` : esc(s.title)}</li>`).join('')}</ol></details>` : ''}
</section>

<footer>
  <p>Checked ${esc(checkedOn)}. Background research from ${esc(dateOf(dive.finished_at))}.</p>
  <p>How we checked: every Google review on your Maps listings was read; Maps ranks come from Google Maps searches without a phone's location, so a customer nearby may see a slightly different order; web ranks come from Brave Search set to Malaysia; each licence and award was looked up in its issuer's own register; every page of your websites was read and its links and numbers tested; AI answers come from DeepSeek V4.1 Flash and GPT-6.1, asked each question several times, from memory and with a web search. The ready-to-use drafts were written with AI from these findings.</p>
</footer>

</div>
</body>
</html>
`;
  return html;
}
