// K / credibility — what official and public records say about the company (part 4 of the
// malaysia-deeper-dive report, next to D-registry's licence and award checks).
//
// Malaysian sources, each read the way a bank, tender panel or careful buyer would:
//   - regulator alert lists: Bank Negara's Financial Consumer Alert list and the Securities
//     Commission's investor alerts (bnm.gov.my sits behind a bot check, so both are searched
//     through Exa and Brave restricted to the regulator's own domain, never by passing the check);
//   - court and insolvency records: published judgments (kehakiman.gov.my, CommonLII, CLJ,
//     LawNet, eLaw), winding-up and bankruptcy notices, also for up to two key people, kept
//     only when the page also names the company;
//   - Bursa Malaysia: is it a listed company with public annual reports;
//   - government sites (.gov.my): tender awards, vendor lists, grants, penalties naming it;
//   - financial figures third parties publish about it (from the dive's research).
// Paid or closed registers (SSM e-Info, CTOS, CCRIS, MDI insolvency search, PDRM Semak Mule)
// are listed as not checked, never guessed. One LLM call judges every hit: this company, a key
// person, or a namesake. No kill gates: a failed search leaves that check "could not check".
import { nameOf, type Ctx, type Finding } from '../lib.ts';

const LAW = ['kehakiman.gov.my', 'commonlii.org', 'cljlaw.com', 'lawnet.com', 'elaw.my', 'mlj.com.my', 'lexology.com', 'insolvensi.gov.my', 'mdi.gov.my'];
const KEY_ROLE = /director|founder|owner|shareholder|chief executive|ceo|managing|chairman|pengarah/i;

type Check = { id: string; label: string; where: string; result: 'clear' | 'found' | 'not_checked' | 'could_not_check' | 'public' | 'not_public'; detail: string; source: string | null };

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const r = dive.result ?? {};
  const N = nameOf(dive);
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'checked_at'>) => findings.push({ ...f, checked_at: ctx.now() } as Finding);
  const legal = N.legal.replace(/\./g, '');
  const people = (r.people?.people ?? []).filter((p: any) => KEY_ROLE.test(`${p.role ?? ''} ${p.relation ?? ''}`) && /\s/.test(String(p.name ?? '').trim()) && !/unknown/i.test(p.name)).slice(0, 2).map((p: any) => String(p.name).trim());

  // ---- 1. Searches, grouped by the check they answer. ----
  type Hit = { group: string; url: string; title: string; text: string; person?: string };
  const hits: Hit[] = [];
  const failed = new Set<string>();
  const seen = new Set<string>();
  const push = (group: string, url: string, title: string, text: string, person?: string) => {
    const k = `${group}|${url}`;
    if (!url || seen.has(k)) return;
    seen.add(k);
    hits.push({ group, url, title: String(title ?? ''), text: String(text ?? '').slice(0, 2500), person });
  };
  const exa = async (group: string, q: string, includeDomains?: string[], person?: string) => {
    const before = ctx.meter.exa.failed;
    const rows = await ctx.exa(q, { numResults: 10, text: 2500, ...(includeDomains ? { includeDomains } : {}) });
    if (ctx.meter.exa.failed > before) failed.add(group);
    for (const x of rows) push(group, x.url, x.title, x.text, person);
  };
  const brave = async (group: string, q: string, person?: string) => {
    const before = ctx.meter.brave.failed;
    const rows = await ctx.brave(q, { count: 15 });
    if (ctx.meter.brave.failed > before) failed.add(group);
    for (const x of rows) push(group, x.url, x.title, String(x.description ?? '').replace(/<[^>]+>/g, '') + ' ' + (x.extra_snippets ?? []).join(' '), person);
  };
  await Promise.all([
    exa('bnm', `"${N.bare}"`, ['bnm.gov.my']), brave('bnm', `"${N.short}" site:bnm.gov.my`),
    exa('sc', `"${N.bare}"`, ['sc.com.my']), brave('sc', `"${N.short}" site:sc.com.my`),
    exa('court', `"${legal}"`, LAW),
    brave('court', `"${legal}" mahkamah OR court OR judgment OR saman OR plaintiff OR defendant`),
    brave('insolvency', `"${legal}" "winding up" OR penggulungan OR liquidator OR pelikuidasi OR receiver`),
    ...people.map((p: string) => brave('court', `"${p}" "${N.short}" mahkamah OR court OR bankrupt OR muflis OR saman`, p)),
    brave('bursa', `"${N.short}" site:bursamalaysia.com`),
    exa('gov', `"${N.bare}"`, ['gov.my']), brave('gov', `"${N.short}" site:gov.my`),
  ]);
  // Only pages that name the company (or, for a person, name both) can be about it.
  const named = hits.filter((h) => N.mentions(`${h.title} ${h.text}`) && (!h.person || `${h.title} ${h.text}`.toLowerCase().includes(h.person.toLowerCase())));
  ctx.log(`${hits.length} results, ${named.length} name the company`);

  // ---- 2. One judgement over every hit. ----
  const judged: any[] = [];
  for (let i = 0; i < named.length; i += 14) {
    const batch = named.slice(i, i + 14);
    const got = ctx.parseJson(await ctx.llm(
      `Company: ${N.legal}${(r.identity?.registration_numbers ?? []).length ? ` (SSM ${(r.identity.registration_numbers).join(' / ')})` : ''}, ${N.industry}, ${N.address}. Key people: ${people.join(', ') || 'none known'}.\n` +
      `Each result below came from a search of official or legal sources. For each decide:\n` +
      `- about: "company" (this exact company: same name AND nothing contradicts the registration number or address), "person" (one of the key people, clearly in connection with this company), "namesake" (a different entity or person), "irrelevant" (only a passing word match, a list page that does not name it, a generic page)\n` +
      `- category: alert (named on a regulator's warning or alert list), court (a court case or judgment), insolvency (winding-up, liquidation, receivership, bankruptcy), listing (listed on Bursa: annual reports, announcements), government (named on a government site: tender award, vendor/registration list, grant, programme, penalty), other\n` +
      `- role: for court cases, plaintiff / defendant / other / unclear; else ""\n` +
      `- outcome: one sentence: what the record says (case, year, result; award and value; list and why)\n` +
      `- sentiment: positive (builds trust) | neutral | negative (a risk a buyer would ask about)\n` +
      `- year: YYYY or ""\n\n` +
      batch.map((h, j) => `#${j} [${h.group}] ${h.title} | ${h.url}\n${h.text.slice(0, 1600)}`).join('\n\n') +
      `\n\nReturn JSON only: {"items":[{"i":0,"about":"","category":"","role":"","outcome":"","sentiment":"","year":""}]}`,
    ));
    // An unread result could be the case or the alert, so its check cannot say "clear".
    if (!got) { ctx.warn(`credibility batch ${i / 14 + 1} did not parse; ${batch.length} results unjudged`); for (const h of batch) failed.add(h.group); continue; }
    for (const it of got.items ?? []) {
      const h = batch[Number(it?.i)];
      if (h && ['company', 'person'].includes(it.about)) judged.push({ ...it, group: h.group, url: h.url, title: h.title, host: N.hostOf(h.url), person: it.about === 'person' ? h.person ?? null : null });
    }
  }
  const of = (cats: string[]) => judged.filter((x) => cats.includes(x.category));

  // ---- 3. The checks, one row each. ----
  const checks: Check[] = [];
  const row = (id: string, label: string, where: string, list: any[], groups: string[], clearText: string, foundText: (l: any[]) => string) => {
    const res: Check['result'] = list.length ? 'found' : groups.some((g) => failed.has(g)) ? 'could_not_check' : 'clear';
    checks.push({ id, label, where, result: res, detail: res === 'found' ? foundText(list) : res === 'clear' ? clearText : 'not every search or result could be read in this run', source: list[0]?.url ?? null });
  };
  row('bnm', 'Bank Negara Financial Consumer Alert list', 'bnm.gov.my', of(['alert']).filter((x) => x.group === 'bnm'), ['bnm'], 'not named', (l) => l.map((x) => x.outcome).join(' '));
  row('sc', 'Securities Commission investor alerts', 'sc.com.my', of(['alert']).filter((x) => x.group === 'sc'), ['sc'], 'not named', (l) => l.map((x) => x.outcome).join(' '));
  const courts = of(['court']);
  row('court', 'Published court judgments and cases', 'kehakiman.gov.my, CommonLII, CLJ, LawNet, news', courts, ['court'], 'no case found naming the company', (l) => `${l.length} case${l.length === 1 ? '' : 's'}: ${l.slice(0, 3).map((x) => `${x.year ? x.year + ': ' : ''}${x.outcome}`).join(' ')}`);
  const insolv = of(['insolvency']);
  row('insolvency', 'Winding-up, liquidation and receivership notices', 'news and legal notices', insolv, ['insolvency'], 'none found', (l) => l.map((x) => `${x.year ? x.year + ': ' : ''}${x.outcome}`).join(' '));
  const listed = of(['listing']).filter((x) => x.about === 'company');
  checks.push({ id: 'bursa', label: 'Listed on Bursa Malaysia', where: 'bursamalaysia.com', result: listed.length ? 'public' : 'not_public', detail: listed.length ? `yes: annual reports and announcements are public (${listed[0].outcome})` : 'not listed, so its accounts are only on paid SSM documents', source: listed[0]?.url ?? null });
  const gov = of(['government']);
  checks.push({ id: 'gov', label: 'Named on government websites', where: '.gov.my', result: gov.length ? 'found' : failed.has('gov') ? 'could_not_check' : 'clear', detail: gov.length ? gov.slice(0, 4).map((x) => `${x.host}: ${x.outcome}`).join(' ') : 'no government page names it', source: gov[0]?.url ?? null });
  const fin = (r.facts ?? []).filter((f: any) => f.topic === 'size_financials');
  checks.push({ id: 'financials', label: 'Financial figures published by third parties', where: 'directories and data sellers', result: fin.length ? 'public' : 'not_public', detail: fin.length ? fin.slice(0, 3).map((f: any) => f.fact).join(' ') : 'no revenue, capital or headcount figures found in public sources', source: null });
  for (const [id, label, why] of [
    ['ssm', 'SSM company profile, directors and financial statements', 'sold per document by SSM e-Info; not bought for this report'],
    ['ctos', 'CTOS / Experian credit reports and CCRIS', 'paid, or need the company’s consent'],
    ['mdi', 'Insolvency Department (MDI) search', 'a paid search per name'],
    ['mule', 'PDRM Semak Mule (numbers and bank accounts reported in scams)', 'not checked automatically'],
  ] as const) checks.push({ id, label, where: '', result: 'not_checked', detail: why, source: null });

  // ---- 4. Findings. ----
  for (const x of of(['alert'])) add({ title: `You are named on ${x.group === 'bnm' ? "Bank Negara's" : "the Securities Commission's"} alert list`, detail: `${x.outcome} Banks and customers check this list. If it is a different business with your name, write to the regulator and say so on your website.`, severity: 'high', source: x.url, check: 'cred-alert' });
  for (const x of courts) add({ title: `${x.person ? `${x.person}: ` : ''}A court case ${x.role && x.role !== 'unclear' && x.role !== 'other' ? `with you as ${x.role}` : 'naming you'}${x.year ? ` (${x.year})` : ''}`, detail: `${x.outcome} Anyone checking you can read this. Be ready to explain how it ended.`, severity: x.sentiment === 'negative' ? (Number(x.year) >= new Date().getFullYear() - 5 ? 'high' : 'medium') : 'low', source: x.url, check: 'cred-court' });
  for (const x of insolv) add({ title: `${x.person ? `${x.person}: ` : ''}A winding-up or insolvency notice${x.year ? ` (${x.year})` : ''}`, detail: x.outcome, severity: 'high', source: x.url, check: 'cred-insolvency' });
  for (const x of gov.filter((y) => y.sentiment === 'negative')) add({ title: `A government site records a problem: ${x.host}`, detail: x.outcome, severity: 'high', source: x.url, check: 'cred-gov' });
  const good = gov.filter((y) => y.sentiment !== 'negative');
  if (good.length) add({ title: `${good.length} government page${good.length === 1 ? ' names' : 's name'} you`, detail: `${good.slice(0, 3).map((x) => `${x.host}: ${x.outcome}`).join(' ')} Mention these on your site: an outside record carries more weight than your own claims.`, severity: 'info', source: good[0].url, check: 'cred-gov' });
  const clean = checks.filter((c) => ['bnm', 'sc', 'court', 'insolvency'].includes(c.id) && c.result === 'clear').length;
  add({ title: `${clean} of 4 public risk checks come back clear`, detail: checks.filter((c) => ['bnm', 'sc', 'court', 'insolvency'].includes(c.id)).map((c) => `${c.label}: ${c.detail}`).join('; ') + '.', severity: clean === 4 ? 'info' : 'medium', source: null, check: 'cred-summary' });
  if (!listed.length) add({ title: 'A bank or buyer cannot read your accounts for free', detail: `You are not listed, so your financial statements are only on paid SSM documents${fin.length ? `, while directories already publish figures about you (${fin.slice(0, 2).map((f: any) => f.fact).join(' ')})` : ''}. Have a one-page company profile with capital, years running and key projects ready for tenders.`, severity: 'low', source: null, check: 'cred-financials' });

  return { findings, notes: { checks, items: judged, people, searched: hits.length, failed: [...failed] } };
}
