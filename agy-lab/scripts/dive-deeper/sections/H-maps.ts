// H / maps — findability on Google Maps.
// Where does the company rank for "<trade> in <area>" in the areas it says it serves,
// who sits above it, and what a Maps search for its own name returns (duplicate or
// stray listings). One LLM call picks the trade words and areas from the dive; the
// rest is scraper.tech search_maps (one request per query).
import type { Ctx, Finding } from '../lib.ts';

const LIMIT = 60;

const norm = (s: string) => s.toLowerCase().replace(/sdn\.?\s*bhd\.?|berhad|plt|enterprise|\(.*?\)/g, '').replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
const host = (u: string | null | undefined) => {
  try { return u ? new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
};

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const r = dive.result ?? {};
  const id = r.identity ?? {};
  const names = [id.legal_name, dive.company, ...(id.aliases ?? [])].filter(Boolean).map(norm).filter((n: string) => n.length >= 4);
  const domains = (id.official_domains ?? []).map((d: string) => d.replace(/^www\./, ''));
  const isUs = (row: any) => {
    const n = norm(String(row.name ?? ''));
    const h = host(row.website);
    return names.some((x: string) => n.includes(x) || x.includes(n) && n.length >= 4) || (h && domains.some((d: string) => h === d || h.endsWith('.' + d)));
  };

  // 1. Trade words and areas, from the dive (fallback: industry words + HQ town).
  const footprint = (r.facts ?? []).filter((f: any) => ['footprint', 'identity', 'products_services'].includes(f.topic)).map((f: any) => '- ' + f.fact).join('\n');
  const plan = ctx.parseJson(await ctx.llm(
    `A Malaysian customer looks for a company like this on Google Maps. Company: ${dive.company}. Industry: ${id.industry}. HQ: ${id.address}.\nFacts:\n${footprint}\n\n` +
    `Return JSON {"trades": [2 short search phrases a customer would type, e.g. "solar panel installer"], "areas": [up to 4 towns/cities where the company has an office or says it serves, most important first]}. JSON only.`,
  ));
  const trades: string[] = (plan?.trades ?? []).slice(0, 2);
  const areas: string[] = (plan?.areas ?? []).slice(0, 4);
  if (!trades.length) { ctx.warn('no trades from the LLM; falling back to the industry'); trades.push(String(id.industry ?? 'company').split(/[,(]/)[0].trim()); }
  if (!areas.length) { ctx.warn('no areas from the LLM; falling back to the HQ town'); areas.push(String(id.address ?? 'Kuala Lumpur').split(',').slice(-3, -2)[0]?.trim() || 'Kuala Lumpur'); }
  ctx.log(`trades: ${trades.join(' | ')}   areas: ${areas.join(' | ')}`);

  const findings: Finding[] = [];
  const ranks: any[] = [];
  const queries = trades.flatMap((t) => areas.map((a) => `${t} in ${a}`));
  const results = await Promise.all(queries.map(async (q) => ({ q, data: await ctx.maps('search_maps', { query: q, limit: String(LIMIT), lang: 'en' }) })));
  for (const { q, data } of results) {
    if (!data) { ranks.push({ query: q, rank: null, of: null, failed: true }); continue; }
    const rows: any[] = data.data ?? [];
    const idx = rows.findIndex(isUs);
    const ours = idx >= 0 ? rows[idx] : null;
    const above = rows.slice(0, idx >= 0 ? idx : 5).filter((x) => !isUs(x)).slice(0, 5)
      .map((x) => `${x.name} (${x.rating ?? '-'}★, ${x.review_count ?? 0} reviews)`);
    ranks.push({ query: q, rank: idx >= 0 ? idx + 1 : null, of: rows.length, listing: ours?.name ?? null, rating: ours?.rating ?? null, reviews: ours?.review_count ?? null, top: above });
    const checked = ctx.now();
    if (idx < 0) {
      findings.push({ title: `Not in the first ${rows.length} Maps results for "${q}"`, detail: `A customer searching "${q}" on Google Maps sees ${rows.length} businesses and none is yours. Top results: ${above.join('; ')}.`, severity: 'high', source: `https://www.google.com/maps/search/${encodeURIComponent(q)}`, checked_at: checked, query: q, rank: null });
    } else {
      const sev = idx < 3 ? 'info' : idx < 10 ? 'medium' : 'high';
      findings.push({ title: `#${idx + 1} of ${rows.length} on Maps for "${q}"`, detail: `Listing "${ours.name}" (${ours.rating ?? '-'}★, ${ours.review_count ?? 0} reviews).${above.length ? ' Ahead of you: ' + above.join('; ') + '.' : ' You are the top result.'}`, severity: sev, source: `https://www.google.com/maps/search/${encodeURIComponent(q)}`, checked_at: checked, query: q, rank: idx + 1 });
    }
  }

  // 2. A Maps search for the company's own name: how many listings carry it?
  const own = await ctx.maps('search_maps', { query: String(id.legal_name ?? dive.company), limit: '20', lang: 'en' });
  const listings = (own?.data ?? []).filter(isUs).map((x: any) => ({ name: x.name, address: x.full_address, rating: x.rating, reviews: x.review_count, phone: x.phone_number, website: x.website, claimed: x.is_claimed, verified: x.verified, closed: x.is_permanently_closed || x.is_temporarily_closed, place_link: x.place_link }));
  if (own) {
    const unclaimed = listings.filter((l: any) => l.claimed === false);
    findings.push({ title: `${listings.length} Google Maps listings carry your name`, detail: listings.map((l: any) => `${l.name} — ${l.address ?? 'no address'} — ${l.rating ?? '-'}★/${l.reviews ?? 0} — ${l.phone ?? 'no phone'} — ${l.website ?? 'no website'}${l.claimed === false ? ' — NOT CLAIMED' : ''}${l.closed ? ' — CLOSED' : ''}`).join(' | ') || 'none found', severity: listings.length === 0 ? 'high' : unclaimed.length ? 'medium' : 'info', source: `https://www.google.com/maps/search/${encodeURIComponent(String(id.legal_name ?? dive.company))}`, checked_at: ctx.now() });
    const phones = new Set(listings.map((l: any) => l.phone).filter(Boolean));
    const sites = new Set(listings.map((l: any) => host(l.website)).filter(Boolean));
    if (phones.size > 1 || sites.size > 1) findings.push({ title: 'Your Maps listings disagree with each other', detail: `Phones: ${[...phones].join(', ') || '-'}; websites: ${[...sites].join(', ') || '-'}.`, severity: 'medium', source: null, checked_at: ctx.now() });
    for (const l of listings.filter((l: any) => !l.website)) findings.push({ title: `Listing "${l.name}" has no website link`, detail: `${l.address}`, severity: 'medium', source: l.place_link, checked_at: ctx.now() });
  }

  return { findings, notes: { trades, areas, ranks, listings } };
}
