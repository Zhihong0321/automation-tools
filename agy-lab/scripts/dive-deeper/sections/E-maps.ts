// E / maps — customer feedback from Google Maps reviews.
//
// For each of the company's Google Maps listings: pull every review with scraper.tech
// `reviews` (cursor paging), then count and classify them (one LLM call), compute the
// owner-reply rate and reply delay, the rating trend over time, the negatives left
// without a reply, the recurring praise/complaint themes, review bursts, and whether
// good review text is reused on the official websites (direct page reads) or anywhere
// else on the web (a few exact-phrase Brave searches).
//
// Listings: reuses H-maps' listings (out/H-maps-<id>.json) when present, because their
// place_link carries the business_id; otherwise one search_maps on the company name,
// matched by name or official domain.
//
// Gotcha: lib.ts's ctx.maps() rejects every `reviews` answer, because that payload has
// no `status: "ok"` field (it is {data:{...place, reviews:[...]}, cursor}). This file
// carries its own reviews caller and bumps ctx.meter.maps itself.
//
// Budget: scraper.tech free plan. MAPS_BUDGET caps the reviews calls in one run. Set
// E_REUSE_RAW=1 to rebuild findings from the raw pages saved in a previous
// out/E-maps-<id>.json (zero Maps requests).
import fs from 'node:fs';
import path from 'node:path';
import { OUT, secret, type Ctx, type Finding } from '../lib.ts';

const MAPS_BUDGET = Number(process.env.E_MAPS_BUDGET ?? 9);
const PAGE_LIMIT = '100'; // asked for; the API returned 5 per page in testing anyway

const norm = (s: string) => s.toLowerCase().replace(/sdn\.?\s*bhd\.?|berhad|plt|enterprise|\(.*?\)/g, '').replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
const host = (u: string | null | undefined) => {
  try { return u ? new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
};
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim().split(' ').filter(Boolean);
const bizIdFromLink = (link: string | null | undefined) => String(link ?? '').match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? null;
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const half = (ts: number) => { const d = new Date(ts); return `${d.getUTCFullYear()}-H${d.getUTCMonth() < 6 ? 1 : 2}`; };
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

type Listing = { name: string; address: string | null; rating: number | null; reviews: number | null; business_id: string; place_link: string | null };
type Review = {
  listing: string; id: string; stars: number; ts: number; date: string; author: string; text: string; original: string | null;
  reply: string | null; reply_ts: number | null; link: string | null; author_reviews: number | null; edited: boolean; author_id: string | null;
};

/** scraper.tech `reviews`, called directly (see the gotcha above). Never throws; null on failure. */
async function reviewsCall(ctx: Ctx, args: Record<string, string>): Promise<any> {
  ctx.meter.maps.calls++;
  ctx.meter.maps.byTool.reviews = (ctx.meter.maps.byTool.reviews ?? 0) + 1;
  const base = (process.env.SCRAPER_TECH_BASE_URL ?? 'https://mcp.scraper.tech').replace(/\/+$/, '');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/${secret('SCRAPER_TECH_KEY')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'reviews', arguments: { country: 'my', ...args } } }),
      });
      if (res.status >= 500) { ctx.warn(`maps reviews HTTP ${res.status}`); continue; }
      if (!res.ok) { ctx.warn(`maps reviews HTTP ${res.status}`); break; }
      const rpc = await res.json() as any;
      const raw = rpc.result?.content?.[0]?.text ?? '';
      const data = JSON.parse(raw);
      if (rpc.result?.isError || !data?.data) { ctx.warn(`maps reviews: ${String(raw).slice(0, 200)}`); break; }
      return data;
    } catch (e) {
      ctx.warn(`maps reviews failed: ${(e as Error).message}`);
    }
  }
  ctx.meter.maps.failed++;
  return null;
}

/** The listings: H-maps' cached ones if present, else one search_maps on the name. */
async function findListings(ctx: Ctx, dive: any): Promise<{ listings: Listing[]; from: string }> {
  const id = dive.result?.identity ?? {};
  const hFile = path.join(OUT, `H-maps-${ctx.diveId}.json`);
  try {
    if (fs.existsSync(hFile)) {
      const h = JSON.parse(fs.readFileSync(hFile, 'utf8'));
      const rows = (h.notes?.listings ?? []).map((l: any) => ({ name: l.name, address: l.address ?? null, rating: l.rating ?? null, reviews: l.reviews ?? null, business_id: bizIdFromLink(l.place_link), place_link: l.place_link ?? null }))
        .filter((l: any) => l.business_id);
      if (rows.length) return { listings: rows, from: 'H-maps cache' };
    }
  } catch (e) { ctx.warn(`could not read ${hFile}: ${(e as Error).message}`); }

  const names = [id.legal_name, dive.company, ...(id.aliases ?? [])].filter(Boolean).map(norm).filter((n: string) => n.length >= 4);
  const domains = (id.official_domains ?? []).map((d: string) => d.replace(/^www\./, ''));
  const isUs = (row: any) => {
    const n = norm(String(row.name ?? ''));
    const h = host(row.website);
    return names.some((x: string) => n.includes(x) || (x.includes(n) && n.length >= 4)) || (h && domains.some((d: string) => h === d || h.endsWith('.' + d)));
  };
  const own = await ctx.maps('search_maps', { query: String(id.legal_name ?? dive.company), limit: '20', lang: 'en' });
  const rows = (own?.data ?? []).filter(isUs).map((x: any) => ({ name: x.name, address: x.full_address ?? null, rating: x.rating ?? null, reviews: x.review_count ?? null, business_id: x.business_id ?? bizIdFromLink(x.place_link), place_link: x.place_link ?? null }))
    .filter((l: any) => l.business_id);
  return { listings: rows, from: 'search_maps' };
}

/** Every review of one listing, by cursor paging, inside the request budget. */
async function pullReviews(ctx: Ctx, l: Listing, budget: { left: number }): Promise<{ pages: any[]; stop: string }> {
  const pages: any[] = [];
  const seen = new Set<string>();
  let cursor = '';
  while (true) {
    if (budget.left <= 0) return { pages, stop: 'maps budget used up' };
    budget.left--;
    const page = await reviewsCall(ctx, { business_id: l.business_id, limit: PAGE_LIMIT, sort: 'newest', ...(cursor ? { cursor } : {}) });
    if (!page) return { pages, stop: 'call failed' };
    const rows: any[] = page.data?.reviews ?? [];
    pages.push({ listing: l.name, business_id: l.business_id, cursor_in: cursor || null, cursor_out: page.cursor ?? null, rows });
    const fresh = rows.filter((r) => r.review_id && !seen.has(r.review_id));
    fresh.forEach((r) => seen.add(r.review_id));
    if (!fresh.length) return { pages, stop: 'page added no new reviews' };
    if (!page.cursor) return { pages, stop: 'no cursor' };
    if (l.reviews != null && seen.size >= l.reviews) return { pages, stop: 'all listed reviews pulled' };
    cursor = String(page.cursor);
  }
}

function toReview(listing: string, r: any): Review {
  const ts = Math.round(Number(r.iso_date_timestamp ?? r.review_timestamp ?? 0) / 1000) || Date.parse(String(r.iso_date ?? '').replace(' ', 'T') + 'Z');
  // Posting date, not the last edit (review_timestamp and sort:newest follow the edit date).
  // Reply timestamp: no field for it was seen in testing; look for any plausible key.
  const replyKey = Object.keys(r).find((k) => /^(business|owner)_(response|answer|reply)_.*(timestamp|time|date)$/i.test(k));
  let replyTs: number | null = null;
  if (replyKey && r[replyKey] != null) {
    const v = r[replyKey];
    replyTs = typeof v === 'number' ? (v > 1e14 ? Math.round(v / 1000) : v > 1e11 ? v : v * 1000) : Date.parse(String(v).replace(' ', 'T') + 'Z') || null;
  }
  const original = r.review_text ?? null;
  const en = r.translations && !Array.isArray(r.translations) ? r.translations.en : null;
  return {
    listing, id: r.review_id, stars: Number(r.review_rate ?? 0), ts, date: ts ? day(ts) : String(r.iso_date ?? '').slice(0, 10),
    author: String(r.user_name ?? ''), text: String(en ?? original ?? '').trim(), original,
    reply: r.business_response_text ?? r.owner_answer ?? null, reply_ts: replyTs, link: r.review_link ?? null,
    author_id: String(r.user_link ?? '').match(/contrib\/(\d+)/)?.[1] ?? null,
    author_reviews: r.user_total_reviews ?? null, edited: Boolean(r.iso_date_of_last_edit_timestamp && r.iso_date_timestamp && r.iso_date_of_last_edit_timestamp !== r.iso_date_timestamp),
  };
}

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const findings: Finding[] = [];
  const id = dive.result?.identity ?? {};
  const add = (f: Omit<Finding, 'checked_at'>) => findings.push({ ...f, checked_at: ctx.now() });

  // 1. Listings and raw review pages (or the previous run's raw pages).
  let listings: Listing[] = [];
  let listingsFrom = '';
  let pages: any[] = [];
  const stops: Record<string, string> = {};
  const prevFile = path.join(OUT, `E-maps-${ctx.diveId}.json`);
  if (process.env.E_REUSE_RAW === '1' && fs.existsSync(prevFile)) {
    const prev = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
    listings = prev.notes?.listings ?? [];
    pages = prev.notes?.raw_pages ?? [];
    listingsFrom = 'reused from previous run';
    Object.assign(stops, prev.notes?.paging_stop ?? {});
    ctx.log(`reusing ${pages.length} raw pages from ${prevFile}`);
  } else {
    const found = await findListings(ctx, dive);
    listings = found.listings;
    listingsFrom = found.from;
    ctx.log(`${listings.length} listings (${listingsFrom}): ${listings.map((l) => `${l.name} ${l.rating ?? '-'}★/${l.reviews ?? 0}`).join(' | ')}`);
    const budget = { left: MAPS_BUDGET };
    for (const l of listings) {
      if (!l.reviews) { stops[l.name] = 'listing shows 0 reviews, not called'; continue; }
      const got = await pullReviews(ctx, l, budget);
      pages.push(...got.pages);
      stops[l.name] = got.stop;
      ctx.log(`${l.name}: ${got.pages.reduce((n, p) => n + p.rows.length, 0)} rows in ${got.pages.length} pages (${got.stop})`);
    }
  }
  if (!listings.length) {
    ctx.warn('no Google Maps listing found for the company');
    add({ title: 'No Google Maps listing found', detail: `A Maps search for "${id.legal_name ?? dive.company}" found no listing that matches the name or the official domains.`, severity: 'high', source: `https://www.google.com/maps/search/${encodeURIComponent(String(id.legal_name ?? dive.company))}` });
    return { findings, notes: { listings, listingsFrom } };
  }

  // 2. Normalise and de-duplicate.
  const byId = new Map<string, Review>();
  for (const p of pages) for (const r of p.rows ?? []) if (r.review_id && !byId.has(r.review_id)) byId.set(r.review_id, toReview(p.listing, r));
  const reviews = [...byId.values()].sort((a, b) => b.ts - a.ts);
  const now = Date.now();

  // 3. Per-listing counts, coverage, reply rate and delay.
  const perListing: any[] = [];
  for (const l of listings) {
    const rs = reviews.filter((r) => r.listing === l.name);
    const replied = rs.filter((r) => r.reply);
    const avg = rs.length ? rs.reduce((n, r) => n + r.stars, 0) / rs.length : null;
    const delays = replied.filter((r) => r.reply_ts && r.ts).map((r) => (r.reply_ts! - r.ts) / 86400000);
    const stars: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    rs.forEach((r) => { stars[r.stars] = (stars[r.stars] ?? 0) + 1; });
    const row = {
      name: l.name, listed_rating: l.rating, listed_reviews: l.reviews, pulled: rs.length, avg_pulled: avg && +avg.toFixed(2),
      stars, with_text: rs.filter((r) => r.text).length, replied: replied.length, reply_rate: rs.length ? +(replied.length / rs.length).toFixed(2) : null,
      median_reply_days: delays.length ? +delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)].toFixed(1) : null,
      newest: rs[0]?.date ?? null, oldest: rs[rs.length - 1]?.date ?? null, paging_stop: stops[l.name] ?? null,
    };
    perListing.push(row);
    if (!rs.length) continue;
    const src = l.place_link;
    add({
      title: `${l.name}: ${rs.length} reviews, ${row.reply_rate === 0 ? 'none' : Math.round((row.reply_rate ?? 0) * 100) + '%'} answered by the owner`,
      detail: `Listed ${l.rating ?? '-'}★ from ${l.reviews ?? '?'} reviews; pulled ${rs.length} (${row.stars[5]}×5★, ${row.stars[4]}×4★, ${row.stars[3]}×3★, ${row.stars[2]}×2★, ${row.stars[1]}×1★), ${row.with_text} with text, ${rs.length - row.with_text} star-only. Owner replied to ${replied.length}.` +
        (row.median_reply_days != null ? ` Median reply delay ${row.median_reply_days} days.` : replied.length ? ' The API gives no reply date, so reply speed cannot be measured.' : '') +
        ` Reviews span ${row.oldest} to ${row.newest}.`,
      severity: row.reply_rate != null && row.reply_rate < 0.3 && rs.length >= 5 ? 'medium' : 'info',
      source: src, listing: l.name, reply_rate: row.reply_rate,
    });
    if (l.reviews != null && rs.length < l.reviews) ctx.warn(`${l.name}: pulled ${rs.length} of ${l.reviews} reviews (${row.paging_stop})`);
  }

  // 4. Negatives (1–3★) without an owner reply: each one is a finding.
  const negatives = reviews.filter((r) => r.stars <= 3);
  for (const r of negatives.filter((r) => !r.reply)) {
    const ageDays = Math.round((now - r.ts) / 86400000);
    add({
      title: `${r.stars}★ review with no reply (${r.listing}, ${r.date})`,
      detail: `${r.author || 'A customer'} left ${r.stars}★ ${ageDays} days ago${r.text ? `: "${clip(r.text, 220)}"` : ' with no text (star only)'}. No owner reply. Anyone reading the listing sees it unanswered.`,
      severity: r.stars <= 2 ? 'high' : 'medium', source: r.link, listing: r.listing, review_id: r.id, stars: r.stars,
    });
  }

  // 5. Rating trend, by half-year, all listings together.
  const buckets = new Map<string, { n: number; sum: number }>();
  for (const r of reviews) { const k = half(r.ts); const b = buckets.get(k) ?? { n: 0, sum: 0 }; b.n++; b.sum += r.stars; buckets.set(k, b); }
  const trend = [...buckets.entries()].sort().map(([k, b]) => ({ period: k, reviews: b.n, avg: +(b.sum / b.n).toFixed(2) }));
  const recent = reviews.filter((r) => now - r.ts < 180 * 86400000);
  const older = reviews.filter((r) => now - r.ts >= 180 * 86400000);
  const avgOf = (rs: Review[]) => (rs.length ? +(rs.reduce((n, r) => n + r.stars, 0) / rs.length).toFixed(2) : null);
  if (reviews.length) {
    const ra = avgOf(recent), oa = avgOf(older);
    const dir = ra != null && oa != null ? (ra < oa - 0.2 ? 'falling' : ra > oa + 0.2 ? 'rising' : 'steady') : 'not enough history';
    add({
      title: `Rating trend: ${dir}${ra != null ? ` (last 6 months ${ra}★ from ${recent.length} reviews` : ''}${oa != null ? `, before that ${oa}★ from ${older.length})` : ra != null ? ')' : ''}`,
      detail: `By half-year: ${trend.map((t) => `${t.period} ${t.avg}★ (${t.reviews})`).join('; ')}. Newest review ${reviews[0].date}; ${Math.round((now - reviews[0].ts) / 86400000)} days ago.`,
      severity: dir === 'falling' ? 'medium' : 'info', source: listings[0].place_link,
    });
  }

  // 6. Review bursts: many reviews in a short window (a campaign; Google may filter them).
  for (const l of listings) {
    const rs = reviews.filter((r) => r.listing === l.name).sort((a, b) => a.ts - b.ts);
    let best = { n: 0, from: '', to: '' };
    for (let i = 0; i < rs.length; i++) {
      let j = i;
      while (j + 1 < rs.length && rs[j + 1].ts - rs[i].ts <= 7 * 86400000) j++;
      if (j - i + 1 > best.n) best = { n: j - i + 1, from: rs[i].date, to: rs[j].date };
    }
    if (rs.length >= 5 && best.n >= Math.max(4, Math.ceil(rs.length * 0.4))) {
      add({
        title: best.from === best.to
          ? `${best.n} of ${l.name}'s ${rs.length} reviews were posted on the same day (${best.from})`
          : `${best.n} of ${l.name}'s ${rs.length} reviews arrived within one week (${best.from} to ${best.to})`,
        detail: `A burst like this reads as a review drive. It is allowed if customers are real, but Google can hold back or remove reviews that arrive in clusters, and a sharp-eyed customer notices the dates.`,
        severity: 'low', source: l.place_link, listing: l.name,
      });
    }
  }

  // 6b. The same Google account reviewing more than one of the company's listings, and
  // same-day bursts across listings. Found by hand in testing: 3 accounts reviewed both
  // HQ and Kluang, and 17 reviews across the two landed on 2026-05-16.
  const byAuthor = new Map<string, Review[]>();
  for (const r of reviews) if (r.author_id) byAuthor.set(r.author_id, [...(byAuthor.get(r.author_id) ?? []), r]);
  const multi = [...byAuthor.values()].filter((rs) => new Set(rs.map((r) => r.listing)).size > 1);
  if (multi.length) add({
    title: `${multi.length} reviewer(s) left a review on more than one of your listings`,
    detail: multi.map((rs) => `${rs[0].author}: ${rs.map((r) => `${r.listing.replace(/^.*\((.*)\)$/, '$1')} ${r.stars}★ ${r.date}`).join(', ')}`).join('; ') + '. One customer usually deals with one branch; Google treats the same account reviewing sister listings as a sign of solicited reviews and may remove them.',
    severity: 'medium', source: multi[0][0].link, author_ids: multi.map((rs) => rs[0].author_id),
  });
  const perDay = new Map<string, Review[]>();
  for (const r of reviews) perDay.set(r.date, [...(perDay.get(r.date) ?? []), r]);
  const [bigDay, bigRs] = [...perDay.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ['', []];
  if (bigRs.length >= 5 && new Set(bigRs.map((r) => r.listing)).size > 1) add({
    title: `${bigRs.length} of your ${reviews.length} Google reviews were posted on one day (${bigDay}), across ${new Set(bigRs.map((r) => r.listing)).size} listings`,
    detail: [...new Set(bigRs.map((r) => r.listing))].map((l) => `${l}: ${bigRs.filter((r) => r.listing === l).length}`).join('; ') + `. ${bigRs.filter((r) => !r.text).length} of them are star-only.`,
    severity: 'medium', source: listings[0].place_link,
  });

  // 7. Classify and theme the reviews that have text (one LLM call).
  const texted = reviews.filter((r) => r.text);
  let themes: any = null;
  if (texted.length) {
    const list = texted.map((r, i) => ({ i, stars: r.stars, listing: r.listing, date: r.date, text: clip(r.text, 700) }));
    themes = ctx.parseJson(await ctx.llm(
      `These are Google Maps reviews of ${dive.company} (${id.industry ?? 'a company'}). Classify each review and find what customers repeatedly praise or complain about.\n\n` +
      `Reviews (JSON):\n${JSON.stringify(list)}\n\n` +
      `Return JSON only:\n{"reviews":[{"i":0,"sentiment":"positive|mixed|negative","praise":["short theme"],"complaints":["short theme"]}],\n` +
      ` "praise_themes":[{"theme":"short label, e.g. responsive after-sales support","reviews":[i,...]}],\n` +
      ` "complaint_themes":[{"theme":"short label","reviews":[i,...]}],\n` +
      ` "staff_named":[{"name":"staff first name as written","reviews":[i,...]}]}\n` +
      `Rules: a theme needs at least 2 reviews to be listed; use only what the text says; list every review index that supports each theme; complaints in a positive review still count.`,
    ));
    if (!themes) ctx.warn('review classification: the LLM answer did not parse; themes skipped');
  }
  const valid = (ids: any) => (Array.isArray(ids) ? ids.filter((i: any) => Number.isInteger(i) && texted[i]) : []);
  if (themes) {
    const fmt = (t: any) => `${t.theme} (${valid(t.reviews).length})`;
    const praise = (themes.praise_themes ?? []).filter((t: any) => valid(t.reviews).length >= 2).sort((a: any, b: any) => valid(b.reviews).length - valid(a.reviews).length);
    // The model leaves one-off complaints out of complaint_themes (it applies the 2-review
    // rule to them too), so fall back to the per-review complaint tags.
    let complaints = (themes.complaint_themes ?? []).filter((t: any) => valid(t.reviews).length >= 1);
    if (!complaints.length) {
      complaints = (themes.reviews ?? []).filter((x: any) => texted[x.i] && (x.complaints?.length || x.sentiment === 'negative'))
        .map((x: any) => ({ theme: (x.complaints ?? []).slice(0, 3).join(' / ') || 'negative experience', reviews: [x.i] }));
    }
    if (praise.length) add({
      title: `What customers praise most: ${praise.slice(0, 3).map((t: any) => t.theme).join(', ')}`,
      detail: `${praise.map(fmt).join('; ')}. From ${texted.length} reviews with text. E.g. "${clip(texted[valid(praise[0].reviews)[0]].text, 160)}" (${texted[valid(praise[0].reviews)[0]].author}).`,
      severity: 'info', source: texted[valid(praise[0].reviews)[0]].link, themes: praise.map((t: any) => ({ theme: t.theme, review_ids: valid(t.reviews).map((i: number) => texted[i].id) })),
    });
    if (complaints.length) add({
      title: `Complaints in the review text: ${complaints.slice(0, 3).map((t: any) => t.theme).join(', ')}`,
      detail: complaints.map((t: any) => `${t.theme} (${valid(t.reviews).length}): ${valid(t.reviews).slice(0, 2).map((i: number) => `"${clip(texted[i].text, 120)}" ${texted[i].stars}★ ${texted[i].date}`).join(' / ')}`).join('; '),
      severity: 'medium', source: texted[valid(complaints[0].reviews)[0]]?.link ?? null, themes: complaints.map((t: any) => ({ theme: t.theme, review_ids: valid(t.reviews).map((i: number) => texted[i].id) })),
    });
    else add({ title: 'No complaint appears in any written review', detail: `Of ${texted.length} reviews with text, the classifier found no complaint. Negative ratings, if any, are star-only, so the reason is unknown.`, severity: 'info', source: listings[0].place_link });
    const staff = (themes.staff_named ?? []).filter((s: any) => valid(s.reviews).length >= 2);
    if (staff.length) add({ title: `Staff customers name in reviews: ${staff.map((s: any) => s.name).join(', ')}`, detail: staff.map((s: any) => `${s.name} (${valid(s.reviews).length} reviews)`).join('; ') + '.', severity: 'info', source: texted[valid(staff[0].reviews)[0]].link });
  }
  const starOnly = reviews.filter((r) => !r.text);
  if (reviews.length >= 5 && starOnly.length / reviews.length >= 0.4) add({
    title: `${starOnly.length} of ${reviews.length} reviews are star-only (no text)`,
    detail: `Star-only reviews say nothing to a prospect and carry less weight. ${starOnly.filter((r) => r.stars <= 3).length} of them are 3★ or lower, so their reason is unknown.`,
    severity: 'low', source: listings[0].place_link,
  });

  // 8. Is good review text reused on the official websites? (homepage + testimonial pages)
  const good = texted.filter((r) => r.stars >= 4 && words(r.original ?? r.text).length >= 6);
  const domains: string[] = [...new Set<string>((id.official_domains ?? []).map((d: string) => d.replace(/^www\./, '')))];
  const pagesRead: { url: string; status: number; chars: number }[] = [];
  const siteText: { url: string; text: string }[] = [];
  for (const d of domains) {
    const home = await ctx.page(`https://${d}/`);
    pagesRead.push({ url: home.finalUrl, status: home.status, chars: home.html.length });
    if (!home.html) { ctx.warn(`could not read https://${d}/: ${home.error ?? home.status}`); continue; }
    if (siteText.some((s) => s.url === home.finalUrl)) continue; // eternalgy.com redirects to solarpanels.my
    siteText.push({ url: home.finalUrl, text: ctx.htmlText(home.html) });
    const links = [...home.html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1])
      .filter((h) => /testimon|review|feedback|client|customer|happy|ulasan|评价|见证/i.test(h))
      .map((h) => { try { return new URL(h, home.finalUrl).href; } catch { return ''; } })
      .filter((u) => u && host(u) === host(home.finalUrl));
    for (const u of [...new Set(links)].slice(0, 2)) {
      const p = await ctx.page(u);
      pagesRead.push({ url: p.finalUrl, status: p.status, chars: p.html.length });
      if (p.html) siteText.push({ url: p.finalUrl, text: ctx.htmlText(p.html) });
    }
  }
  const reuse: { review: Review; url: string; how: string }[] = [];
  for (const r of good) {
    const w = words(r.original ?? r.text);
    const grams = new Set<string>();
    for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(' '));
    for (const s of siteText) {
      const t = ' ' + words(s.text).join(' ') + ' ';
      const hit = [...grams].find((g) => t.includes(' ' + g + ' '));
      if (hit) { reuse.push({ review: r, url: s.url, how: `phrase "${hit}"` }); break; }
    }
  }
  if (siteText.length) {
    if (reuse.length) add({
      title: `${reuse.length} Google review(s) quoted on your website`,
      detail: reuse.map((x) => `${x.review.author} ${x.review.stars}★ on ${x.url} (${x.how})`).join('; '),
      severity: 'info', source: reuse[0].url,
    });
    else add({
      title: `None of your ${good.length} good written Google reviews appear on your websites`,
      detail: `Checked ${siteText.length} pages (${siteText.map((s) => s.url).join(', ')}) for any 6-word phrase from each 4–5★ review. ${good.length ? `Strong ones to reuse: ${good.slice().sort((a, b) => b.text.length - a.text.length).slice(0, 2).map((r) => `"${clip(r.text, 100)}" (${r.author})`).join('; ')}.` : ''}`,
      severity: good.length ? 'low' : 'info', source: siteText[0].url,
    });
  }

  // 9. Reused anywhere else on the web (Facebook, directories)? Exact-phrase Brave search.
  const longest = good.slice().sort((a, b) => b.text.length - a.text.length).slice(0, 3);
  const webHits: any[] = [];
  for (const r of longest) {
    const w = words(r.original ?? r.text);
    const phrase = w.slice(0, Math.min(w.length, 9)).join(' ');
    const res = await ctx.brave(`"${phrase}"`, { count: 10 });
    const hits = res.filter((x: any) => !/google\.[a-z.]+\/maps/.test(String(x.url))).map((x: any) => ({ url: x.url, title: x.title }));
    webHits.push({ review: r.id, author: r.author, phrase, hits });
  }
  const offMaps = webHits.filter((h) => h.hits.length);
  if (longest.length) add({
    title: offMaps.length ? `${offMaps.length} review quote(s) also found elsewhere on the web` : 'Your best Google reviews are not reused anywhere a search engine can see',
    detail: offMaps.length ? offMaps.map((h) => `${h.author}: ${h.hits.slice(0, 2).map((x: any) => x.url).join(', ')}`).join('; ') : `Exact-phrase web searches for the ${longest.length} longest good reviews found no copy on Facebook, directories or the website.`,
    severity: 'info', source: offMaps[0]?.hits[0]?.url ?? null,
  });

  return {
    findings,
    notes: {
      listingsFrom, listings, per_listing: perListing, trend, paging_stop: stops,
      classified: themes, pages_read: pagesRead, web_reuse: webHits,
      reviews: reviews.map((r) => ({ ...r, link: undefined })),
      raw_pages: pages,
    },
  };
}
