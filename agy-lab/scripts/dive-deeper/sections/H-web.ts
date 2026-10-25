// H / web — findability in web search (Brave, country MY; a stand-in for Google).
// Where do the company's own domains rank for "<trade> <area>", and what does a search
// for its own name show (own pages, third parties, wrong entities, negatives)?
// One LLM call picks trades and areas, one classifies the name results; the rest is Brave.
import type { Ctx, Finding } from '../lib.ts';

const host = (u: string | null | undefined) => {
  try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
};

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const r = dive.result ?? {};
  const id = r.identity ?? {};
  const domains: string[] = (id.official_domains ?? []).map((d: string) => d.replace(/^www\./, ''));
  const ours = (u: string) => { const h = host(u); return domains.some((d) => h === d || h.endsWith('.' + d)); };
  const shortName = String(id.aliases?.[0] ?? id.legal_name ?? dive.company);

  const footprint = (r.facts ?? []).filter((f: any) => ['footprint', 'identity', 'products_services'].includes(f.topic)).map((f: any) => '- ' + f.fact).join('\n');
  const plan = ctx.parseJson(await ctx.llm(
    `A Malaysian customer looks for a company like this on Google. Company: ${dive.company}. Industry: ${id.industry}. HQ: ${id.address}.\nFacts:\n${footprint}\n\n` +
    `Return JSON {"trades": [2 short search phrases a customer would type, e.g. "solar panel installer"], "areas": [up to 4 Malaysian towns or cities (never a state or a country) where the company has an office or says it serves, most important first]}. JSON only.`,
  ));
  const trades: string[] = (plan?.trades ?? []).slice(0, 2);
  const areas: string[] = (plan?.areas ?? []).slice(0, 4);
  if (!trades.length) { ctx.warn('no trades from the LLM; falling back to the industry'); trades.push(String(id.industry ?? 'company').split(/[,(]/)[0].trim()); }
  if (!areas.length) { ctx.warn('no areas from the LLM; falling back to the HQ town'); areas.push('Kuala Lumpur'); }
  ctx.log(`trades: ${trades.join(' | ')}   areas: ${areas.join(' | ')}`);

  const findings: Finding[] = [];
  const ranks: any[] = [];

  // 1. Trade x area: rank of the first official-domain result in the top 20.
  const queries = trades.flatMap((t) => areas.map((a) => `${t} ${a}`));
  const results = await Promise.all(queries.map(async (q) => ({ q, rows: await ctx.brave(q, { count: 20 }) })));
  for (const { q, rows } of results) {
    const idx = rows.findIndex((x: any) => ours(x.url));
    const ahead = rows.slice(0, idx >= 0 ? idx : 5).map((x: any) => host(x.url)).filter((h: string, i: number, a: string[]) => a.indexOf(h) === i).slice(0, 5);
    ranks.push({ query: q, rank: idx >= 0 ? idx + 1 : null, of: rows.length, url: idx >= 0 ? rows[idx].url : null, ahead });
    const src = `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
    if (!rows.length) { ctx.warn(`no web results for "${q}"`); continue; }
    if (idx < 0) findings.push({ title: `Your website is not in the top ${rows.length} web results for "${q}"`, detail: `The top results are ${ahead.join(', ')}.`, severity: 'high', source: src, checked_at: ctx.now(), query: q, rank: null });
    else findings.push({ title: `Your website is #${idx + 1} in web results for "${q}"`, detail: `${rows[idx].url}${ahead.length ? '. Ahead of you: ' + ahead.join(', ') : ''}.`, severity: idx < 3 ? 'info' : idx < 10 ? 'medium' : 'high', source: src, checked_at: ctx.now(), query: q, rank: idx + 1 });
  }

  // 2. What a search for the company's own name shows.
  const nameQueries = [...new Set([shortName, String(id.legal_name ?? dive.company), `${shortName} review`])];
  const nameRows: any[] = [];
  for (const q of nameQueries) {
    const rows = await ctx.brave(q, { count: 10 });
    rows.forEach((x: any, i: number) => nameRows.push({ query: q, rank: i + 1, url: x.url, title: x.title, description: String(x.description ?? '').replace(/<[^>]+>/g, ''), age: x.age ?? x.page_age ?? null, official: ours(x.url) }));
  }
  const listing = nameRows.map((x, i) => `${i}. [${x.query} #${x.rank}] ${x.official ? '(OFFICIAL) ' : ''}${x.title} | ${x.url} | ${x.description.slice(0, 220)}${x.age ? ' | ' + x.age : ''}`).join('\n');
  const facts = (r.facts ?? []).filter((f: any) => f.confidence !== 'low').slice(0, 40).map((f: any) => '- ' + f.fact).join('\n');
  const verdict = ctx.parseJson(await ctx.llm(
    `These are web search results for searches of a company's own name. Company: ${dive.company} (${id.industry}, ${id.address}). Official domains: ${domains.join(', ')}.\nKnown facts:\n${facts}\n\nResults:\n${listing}\n\n` +
    `Classify each result as one of: own (official site/profile run by the company), third_party_ok (directory/news/listing that is accurate), outdated (shows old or wrong details: phone, address, name, dates), wrong_entity (a different company with a similar name), negative (complaint, bad review, scam warning), irrelevant.\n` +
    `Return JSON {"items":[{"i":number,"class":string,"why":short string}],"summary":"one sentence an owner would read"}. Only include items that are not "own" or "irrelevant". JSON only.`,
  ));
  const items: any[] = verdict?.items ?? [];
  if (!verdict) ctx.warn('name-result classification did not parse; name findings skipped');
  const officialTop = nameRows.filter((x) => x.query === shortName).slice(0, 10).filter((x) => x.official).length;
  findings.push({ title: `${officialTop} of the top 10 results for "${shortName}" are your own pages`, detail: verdict?.summary ?? '', severity: officialTop >= 3 ? 'info' : 'medium', source: `https://search.brave.com/search?q=${encodeURIComponent(shortName)}`, checked_at: ctx.now() });
  for (const it of items) {
    const row = nameRows[it.i];
    if (!row || !['outdated', 'wrong_entity', 'negative'].includes(it.class)) continue;
    findings.push({ title: `${it.class === 'negative' ? 'Negative result' : it.class === 'wrong_entity' ? 'A different company shows up' : 'Outdated details'} in a search for "${row.query}": ${row.title}`, detail: it.why, severity: it.class === 'negative' ? 'high' : 'medium', source: row.url, checked_at: ctx.now(), class: it.class });
  }

  return { findings, notes: { trades, areas, ranks, nameRows, classified: items } };
}
