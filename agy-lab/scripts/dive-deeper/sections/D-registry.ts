// D / registry — unproven claims, checked in the issuing body's own public register.
//
// Step 1 (D-common): the claim list from the dive's facts plus a fresh read of the site.
// Step 2: each claim goes to the register of the body that would issue it, by direct
// page reads only (GET, or the register's own read-only search form). No CAPTCHA, login
// or paywall is ever attempted: a register that needs one gives "can't check automatically".
// Step 3: one LLM call compares each claim with the register record it found
// (verified / contradicted) and lists details in the record that disagree with the company.
//
// Hand-tested register table (Oct 2026), see REGISTERS below for the reasons.
// Personal data in register records (MyKad numbers, personal phones and emails) is never
// copied into findings; only its presence is noted, privately.
import zlib from 'node:zlib';
import type { Ctx, Finding } from '../lib.ts';
import { extractClaims, companyNames, host, type Claim, type Verdict } from './D-common.ts';

type Rec = { register: string; url: string; found: boolean; record: string; cannot?: string; notes?: string[]; pii?: string[] };

export const REGISTERS: Record<string, { name: string; url: string; auto: string; how: string }> = {
  CIDB: { name: 'CIDB CIMS contractor search', url: 'https://cims.cidb.gov.my/smis/regcontractor/reglocalsearchcontractor.vbhtml', auto: 'yes', how: 'read-only search form (POST, no CAPTCHA) by SSM number; result row gives grade, state, phone, PPK/SPKK. The detail view (Paparan) redirects to an error page outside a browser.' },
  SEDA_RPVSP: { name: 'SEDA Registered PV Service Provider directory', url: 'https://services.seda.gov.my/spqp/listing', auto: 'yes', how: 'one GET; the whole directory is embedded as JSON (about 1 MB). Also carries contact MyKad numbers (PII).' },
  SEDA_RPVI: { name: 'SEDA Registered Solar PV Investor directory', url: 'https://services.seda.gov.my/rpvi/rpvi/listing', auto: 'yes', how: 'GET with ?company_name=; JSON embedded in the page.' },
  MYHIJAU: { name: 'MyHIJAU directory / GGP e-catalogue', url: 'https://www.myhijau.my/directory/ggp', auto: 'yes (by certificate number)', how: 'XHR JSON GET ?search_name=; returns every listing in the matching groups with certificate numbers and dates but no company names, so the match is by certificate number.' },
  GOLDEN_BULL: { name: 'Golden Bull Award hall of fame (organiser)', url: 'https://goldenbullaward.com/winners/my-hall-of-fame/', auto: 'yes', how: 'GET of the winner page; year and category are in the breadcrumb.' },
  MPSEA: { name: 'MPSEA (formerly MPIA) member list', url: 'https://mpsea.org.my/membership/', auto: 'yes', how: 'GET of the membership page, then its member-list PDF (text PDF, parsed in-lane).' },
  ST: { name: 'Suruhanjaya Tenaga ECOS registers', url: 'https://ecos.st.gov.my/', auto: 'no (at test time)', how: 'portal showed a scheduled-maintenance page; the contractor list was not reachable.' },
  SHRDC: { name: 'SHRDC website search', url: 'https://www.shrdc.org.my/?s=', auto: 'weak', how: 'WordPress site search only; SHRDC publishes no partner register, so "not found" is weak evidence.' },
  MAYBANK: { name: 'Maybank solar financing pages', url: 'https://www.maybank2u.com.my/maybank2u/malaysia/en/personal/loans/others/maybank-solar-financing.page', auto: 'no', how: 'no public list of appointed installers; maybank2u refused or hung plain requests in testing.' },
  SAJ: { name: 'SAJ distributor list', url: 'https://www.saj-electric.com/', auto: 'no', how: 'manufacturer publishes no distributor register.' },
  SSM: { name: 'SSM e-Info', url: 'https://www.ssm-einfo.my/', auto: 'no', how: 'paid register (company profile and financials are sold per document).' },
  INSURER: { name: 'insurer records', url: '', auto: 'no', how: 'insurance cover is a private contract; no public register.' },
  SELF_COUNT: { name: 'none', url: '', auto: 'no', how: 'project, plant, MWp and revenue counts sit only with the company (and SSM accounts, which are paid); no public per-company register.' },
  OTHER: { name: 'none', url: '', auto: 'no', how: 'no known public register for this issuer.' },
};

const PII_KEY = /mykad|nric|\bic\b|_ic$|signature_ic|email|mobile|telephone|contact_number|contact_name|signature_name/i;
const scrub = (o: any): any => JSON.parse(JSON.stringify(o, (k, v) => (PII_KEY.test(k) ? undefined : v)));
const piiPresent = (o: any): string[] => {
  const hits = new Set<string>();
  JSON.stringify(o, (k, v) => { if (/mykad|signature_ic/i.test(k) && v && String(v).replace(/\D/g, '').length >= 12) hits.add(k); return v; });
  return [...hits];
};

/** The JSON object (balanced braces) that starts at the last `{"uuid"` before position i. */
function objectAround(text: string, i: number, start = '{"uuid"'): any {
  const a = text.lastIndexOf(start, i);
  if (a < 0) return null;
  let depth = 0, inStr = false;
  for (let j = a; j < text.length; j++) {
    const ch = text[j];
    if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { try { return JSON.parse(text.slice(a, j + 1)); } catch { return null; } }
  }
  return null;
}

/** GET a binary file (a PDF): ctx.page decodes text and would corrupt it. Metered as an http call. */
async function getBytes(ctx: Ctx, url: string): Promise<Buffer | null> {
  ctx.meter.http.calls++;
  ctx.meter.other.pdf = (ctx.meter.other.pdf ?? 0) + 1;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } });
    if (!res.ok) { ctx.warn(`pdf ${url}: HTTP ${res.status}`); return null; }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    ctx.meter.http.failed++;
    ctx.warn(`pdf ${url} failed: ${(e as Error).message}`);
    return null;
  }
}

/** Rough text of a simple (Flate, non-CID) PDF: inflate content streams, read Tj/TJ strings. */
function pdfText(buf: Buffer): string {
  const s = buf.toString('latin1');
  const out: string[] = [];
  let pos = 0;
  while (true) {
    const k = s.indexOf('stream', pos);
    if (k < 0) break;
    if (s.slice(k - 3, k) === 'end') { pos = k + 6; continue; }
    let a = k + 6;
    if (s[a] === '\r') a++;
    if (s[a] === '\n') a++;
    const b = s.indexOf('endstream', a);
    if (b < 0) break;
    pos = b + 9;
    const dict = s.slice(Math.max(0, s.lastIndexOf('obj', k)), k);
    if (/\/Subtype\s*\/Image|\/Length1|\/FontFile/.test(dict)) continue;
    let t: string;
    try { t = zlib.inflateSync(buf.subarray(a, b)).toString('latin1'); } catch { continue; }
    if (!/\bBT\b/.test(t)) continue;
    const parts: string[] = [];
    for (const m of t.matchAll(/\(((?:\\.|[^\\)]){0,500})\)\s*Tj|\[([^\]]{0,4000})\]\s*TJ|(T\*|Td|TD|Tm|ET)\b/g)) {
      if (m[1] !== undefined) parts.push(m[1]);
      else if (m[2] !== undefined) parts.push([...m[2].matchAll(/\(((?:\\.|[^\\)]){0,500})\)|(-?\d+\.?\d*)/g)].map((x) => (x[1] !== undefined ? x[1] : Number(x[2]) < -200 ? ' ' : '')).join(''));
      else parts.push(m[3] === 'ET' ? '\n' : ' ');
    }
    out.push(parts.join('').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, '$1'));
  }
  return out.join('\n');
}

const cellText = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const nameRe = (short: string) => new RegExp(short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');

// ---------- one checker per register; each returns what the register says, never a verdict ----------

async function cidb(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.CIDB;
  const n = companyNames(dive);
  const form = (ssm: string, name: string) => new URLSearchParams({ comName: name, ComState: '', ComCategoryID: '', CidbRegno: '', seltype: '', selvalidity: '', ssmno: ssm, hdnpagesize: '10', hdnctpage: '1', hdntotpage: '0', hdnsortcol: 'ComName', hdnsortdir: '0', hdntotalrecs: '0', hdnexportopts: '0' }).toString();
  const notes: string[] = [];
  let rows: string[][] = [];
  for (const [ssm, name] of [[n.ssmNew, ''], ['', n.short]] as const) {
    if (!ssm && !name) continue;
    const p = await ctx.page(R.url, { method: 'POST', body: form(ssm, name), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    if (p.status !== 200) { ctx.warn(`CIDB search HTTP ${p.status} ${p.error ?? ''}`); continue; }
    if (/captcha/i.test(p.html)) return { register: R.name, url: R.url, found: false, record: '', cannot: 'CIDB search now shows a CAPTCHA' };
    rows = p.html.split(/<tr/i).slice(1).map((tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]))).filter((c) => c.length >= 9 && nameRe(n.short).test(c[1] ?? ''));
    if (rows.length) { notes.push(`searched by ${ssm ? 'SSM number ' + ssm : 'name ' + name}`); break; }
  }
  // The MyDigital Kontraktor page the dive found is a third-party portfolio, not the register.
  const md = (dive.result?.sources ?? []).find((s: any) => host(s.url) === 'mydigitalkontraktor.com.my');
  if (md) {
    const p = await ctx.page(md.url);
    const g = ctx.htmlText(p.html).match(/CIDB Registered Contractor\s*•\s*(G\d)/i);
    if (g) notes.push(`MyDigital Kontraktor portfolio (${md.url}) shows grade ${g[1]}`);
  }
  if (!rows.length) return { register: R.name, url: R.url, found: false, record: 'no row for the company in the CIDB contractor search', notes };
  const [no, name, grade, state, district, phone, fax, ppk, spkk, stb] = rows[0];
  return { register: R.name, url: R.url, found: true, record: `name ${name}; grade ${grade}; state ${state}; district ${district}; phone ${phone}; PPK ${ppk || '-'}; SPKK ${spkk || '-'}; STB ${stb || '-'}${rows.length > 1 ? `; ${rows.length} rows matched` : ''}`, notes };
}

async function sedaRpvsp(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.SEDA_RPVSP;
  const n = companyNames(dive);
  const p = await ctx.page(R.url);
  if (p.status !== 200) return { register: R.name, url: R.url, found: false, record: '', cannot: `directory HTTP ${p.status} ${p.error ?? ''}` };
  const m = p.html.match(new RegExp('"company_name":"' + n.short.replace(/\s+/g, '\\s*'), 'i'));
  if (!m) return { register: R.name, url: R.url, found: false, record: `no company named "${n.short}" among the listed providers` };
  const obj = objectAround(p.html, m.index!);
  if (!obj) return { register: R.name, url: R.url, found: true, record: 'company name present, record could not be parsed' };
  const pii = piiPresent(obj);
  const clean = scrub(obj);
  const addr = (clean.sp_addresses ?? []).map((a: any) => `${a.type}: ${String(a.address).replace(/\s+/g, ' ')} ${a.postcode} (${a.state}) phone ${a.phone ?? '-'}; listed ${a.created_at}`).join(' | ');
  const qps = (clean.sp_qualified_persons ?? []).map((q: any) => `${q.certificate_category} (cert ${q.certificate_no}, ${q.year})`).join('; ');
  const segs = ['is_domestic', 'is_commercial', 'is_industrial', 'is_agriculture'].map((k) => `${k.slice(3)}=${clean[k] === '1' ? 'yes' : 'no'}`).join(', ');
  return { register: R.name, url: 'https://www.seda.gov.my/directory/registered-pv-service-provider-directory/', found: true, record: `name ${clean.company_name}; website ${clean.website}; segments ${segs}; certificates listed: ${String(clean.certificate_description ?? '').replace(/\s+/g, ' ')}; addresses: ${addr}; qualified persons: ${qps}`, pii: pii.length ? [`SEDA RPVSP directory source carries ${pii.length} MyKad field(s) for this company's people (${pii.join(', ')})`] : [] };
}

async function sedaRpvi(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.SEDA_RPVI;
  const n = companyNames(dive);
  const url = `${R.url}?company_name=${encodeURIComponent(n.short)}`;
  const p = await ctx.page(url);
  if (p.status !== 200) return { register: R.name, url, found: false, record: '', cannot: `directory HTTP ${p.status} ${p.error ?? ''}` };
  const m = p.html.match(new RegExp('"company_name":"' + n.short.replace(/\s+/g, '\\s*'), 'i'));
  if (!m) return { register: R.name, url, found: false, record: `no investor named "${n.short}" in the directory` };
  const obj = objectAround(p.html, m.index!);
  const clean = obj ? scrub(obj) : {};
  return { register: R.name, url, found: true, record: `name ${clean.company_name ?? n.short}; category ${clean.category_of_company ?? '-'}; website ${clean.website ?? '-'}; business: ${(clean.nature_of_business ?? []).join(', ')}; addresses: ${(clean.rpvi_addresses ?? []).length}`, pii: obj && piiPresent(obj).length ? ['SEDA RPVI directory source carries a MyKad field for the contact person'] : [] };
}

let myhijauCache: any = null;
async function myhijau(ctx: Ctx, dive: any, claim: Claim): Promise<Rec> {
  const R = REGISTERS.MYHIJAU;
  const n = companyNames(dive);
  const url = `${R.url}?page=1&limit=50&search_name=${encodeURIComponent(n.short)}`;
  if (!myhijauCache) {
    const p = await ctx.page(url, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' } });
    myhijauCache = ctx.parseJson(p.html) ?? { data: [] };
    if (!myhijauCache.data?.length) ctx.warn(`MyHijau JSON empty (HTTP ${p.status})`);
  }
  const apps: { group: string; a: any }[] = [];
  const walk = (node: any) => { for (const a of node.applications ?? []) apps.push({ group: node.name, a }); for (const c of node.children ?? []) walk(c); };
  for (const d of myhijauCache.data ?? []) walk(d);
  const want = (claim.value.match(/MyH[PS]\s*\d+\s*\/\s*\d+(?:-\d+)?/i)?.[0] ?? '').replace(/\s+/g, '').toUpperCase();
  const byName = apps.filter(({ a }) => nameRe(n.short).test(`${a.sop_name ?? ''} ${a.main_certificate ?? ''} ${a.policy_name ?? ''}`));
  const byCert = want ? apps.filter(({ a }) => String(a.certificate_no ?? '').replace(/\s+/g, '').toUpperCase() === want) : [];
  let hits = byCert.length ? byCert : byName;
  if (byCert.length > 1) { const both = byCert.filter((h) => byName.includes(h)); if (both.length) hits = both; }
  const pii = hits.some(({ a }) => String(a.signature_ic ?? '').replace(/\D/g, '').length >= 12) ? ['MyHijau directory JSON carries the signatory\'s MyKad number for this certificate'] : [];
  if (!hits.length) {
    if (!want && !apps.length) return { register: R.name, url, found: false, record: '', cannot: 'MyHijau directory returned no listings to match against' };
    return { register: R.name, url, found: false, record: `${apps.length} listings in the groups matching "${n.short}"; none with certificate ${want || '(no number claimed)'} or the company name` };
  }
  if (hits.length > 1 && byCert.length > 1 && !byCert.some((h) => byName.includes(h))) {
    return { register: R.name, url, found: false, record: '', cannot: `certificate ${want} is shared by ${hits.length} listings and the public JSON carries no company name` };
  }
  const rec = hits.slice(0, 3).map(({ group, a }) => `product group "${group}" (type ${a.type}); certificate ${a.certificate_no}; status ${a.status}; certified ${a.myhijau_cert_date}; expires ${a.myhijau_exp_date}; SOP "${a.sop_name ?? '-'}"`).join(' | ');
  return { register: R.name, url, found: true, record: rec + (byCert.length && byName.length && byCert.some((h) => byName.includes(h)) ? '; matched by certificate number and by the company name in the SOP title' : byCert.length ? '; matched by certificate number only' : '; matched by the company name in the SOP title'), pii };
}

async function goldenBull(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.GOLDEN_BULL;
  const n = companyNames(dive);
  const src = (dive.result?.sources ?? []).filter((s: any) => host(s.url) === 'goldenbullaward.com').map((s: any) => s.url);
  const slug = n.legal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tries = src.length ? src : [`https://goldenbullaward.com/winners/my-hall-of-fame/malaysia-${new Date().getFullYear() - 1}/outstanding-bull-award-my-${new Date().getFullYear() - 1}/${slug}/`];
  for (const url of tries.slice(0, 2)) {
    const p = await ctx.page(url);
    if (p.status !== 200) continue;
    if (!nameRe(n.short).test(p.html)) continue;
    const crumbs = [...p.html.matchAll(/"name":"([^"]{3,80})"/g)].map((m) => m[1]).filter((x) => /winner|award|20\d\d/i.test(x));
    const years = [...new Set(ctx.htmlText(p.html).match(/Awards and Recognition:?\s*(20\d\d)/i)?.slice(1) ?? [])];
    return { register: R.name, url, found: true, record: `organiser winner page names ${n.legal}; breadcrumb: ${[...new Set(crumbs)].join(' > ')}; "Awards and Recognition" year: ${years.join(', ') || '-'}; url path: ${new URL(url).pathname}` };
  }
  return { register: R.name, url: R.url, found: false, record: 'no organiser winner page found for the company' };
}

async function mpsea(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.MPSEA;
  const n = companyNames(dive);
  const p = await ctx.page(R.url);
  const pdf = p.html.match(/href="([^"]+membership[^"]*listing[^"]*\.pdf)"/i)?.[1] ?? p.html.match(/href="([^"]+member[^"]*\.pdf)"/i)?.[1];
  if (!pdf) return { register: R.name, url: R.url, found: false, record: '', cannot: `no member-list PDF linked on the membership page (HTTP ${p.status})` };
  const buf = await getBytes(ctx, pdf);
  if (!buf) return { register: R.name, url: pdf, found: false, record: '', cannot: 'member-list PDF could not be fetched' };
  const text = pdfText(buf);
  if (text.length < 500) return { register: R.name, url: pdf, found: false, record: '', cannot: 'member-list PDF has no extractable text (scanned or CID fonts)' };
  const i = text.search(nameRe(n.short));
  if (i < 0) return { register: R.name, url: pdf, found: false, record: `${n.short} is not in the member list (${text.length} chars read)` };
  const row = text.slice(i, i + 160).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6).join(' | ');
  return { register: R.name, url: pdf, found: true, record: `member-list row: ${row}` };
}

async function st(ctx: Ctx): Promise<Rec> {
  const R = REGISTERS.ST;
  const p = await ctx.page(R.url);
  const t = ctx.htmlText(p.html);
  if (p.status !== 200) return { register: R.name, url: R.url, found: false, record: '', cannot: `ECOS HTTP ${p.status} ${p.error ?? ''}` };
  if (/maintenance|penyelenggaraan/i.test(t)) return { register: R.name, url: R.url, found: false, record: '', cannot: `ECOS shows a maintenance page ("${t.slice(0, 80)}")` };
  if (/captcha/i.test(p.html)) return { register: R.name, url: R.url, found: false, record: '', cannot: 'ECOS shows a CAPTCHA' };
  return { register: R.name, url: R.url, found: false, record: '', cannot: 'ECOS is up but its contractor list has no plain-GET search the lane knows (needs a by-hand check)' };
}

async function shrdc(ctx: Ctx, dive: any): Promise<Rec> {
  const R = REGISTERS.SHRDC;
  const n = companyNames(dive);
  const url = R.url + encodeURIComponent(n.short);
  const p = await ctx.page(url);
  if (p.status !== 200) return { register: R.name, url, found: false, record: '', cannot: `SHRDC search HTTP ${p.status}` };
  const t = ctx.htmlText(p.html);
  if (/No posts were found|Nothing Found|no results/i.test(t)) return { register: R.name, url, found: false, record: `SHRDC site search for "${n.short}": no posts found (SHRDC publishes no partner register, so this is weak evidence)` };
  const hit = t.search(nameRe(n.short));
  return { register: R.name, url, found: hit >= 0, record: hit >= 0 ? `SHRDC site mentions: ${t.slice(Math.max(0, hit - 150), hit + 250)}` : 'search returned pages without the company name' };
}

async function lookup(ctx: Ctx, dive: any, c: Claim, cache: Map<string, Promise<Rec>>): Promise<Rec> {
  const R = REGISTERS[c.issuer] ?? REGISTERS.OTHER;
  const once = (k: string, f: () => Promise<Rec>) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k)!; };
  switch (c.issuer) {
    case 'CIDB': return once('CIDB', () => cidb(ctx, dive));
    case 'SEDA_RPVSP': return once('SEDA_RPVSP', () => sedaRpvsp(ctx, dive));
    case 'SEDA_RPVI': return once('SEDA_RPVI', () => sedaRpvi(ctx, dive));
    case 'MYHIJAU': return myhijau(ctx, dive, c);
    case 'GOLDEN_BULL': return once('GOLDEN_BULL', () => goldenBull(ctx, dive));
    case 'MPSEA': return once('MPSEA', () => mpsea(ctx, dive));
    case 'ST': return once('ST', () => st(ctx));
    case 'SHRDC': return once('SHRDC', () => shrdc(ctx, dive));
    default: return { register: R.name, url: R.url, found: false, record: '', cannot: R.how };
  }
}

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const id = dive.result?.identity ?? {};
  const { claims, pages } = await extractClaims(ctx, dive);
  ctx.log(`${claims.length} claims: ${claims.map((c) => `${c.id} ${c.issuer} ${c.value}`).join(' | ')}`);

  // Step 2: register lookups (sequential: polite, and the big SEDA/MyHijau pages are fetched once).
  const cache = new Map<string, Promise<Rec>>();
  const recs: Rec[] = [];
  for (const c of claims) {
    const rec = await lookup(ctx, dive, c, cache).catch((e) => ({ register: c.issuer, url: '', found: false, record: '', cannot: `lookup failed: ${(e as Error).message}` } as Rec));
    recs.push(rec);
    ctx.log(`${c.id} ${c.issuer}: ${rec.cannot ? "can't check: " + rec.cannot : rec.found ? 'record found' : 'not found'}`);
  }

  // Step 3: one LLM call compares each claim with the record found for it.
  const judged = claims.map((c, i) => ({ c, r: recs[i] })).filter(({ r }) => !r.cannot && r.found);
  let verdicts: Record<string, { verdict: Verdict; why: string; disagreements?: string[] }> = {};
  if (judged.length) {
    const prompt = `You compare a company's claims with what the issuing body's own public register says. Today is ${ctx.now().slice(0, 10)}.
Company identity (from its own documents): ${JSON.stringify({ legal_name: id.legal_name, address: id.address, registration_numbers: id.registration_numbers, official_domains: id.official_domains })}

For each claim decide:
- "verified": the register record supports the claim as worded (same grade / number / year / status, and still valid);
- "contradicted": the register says something different (another grade, another year, another type of certificate, expired, a different category);
- "not_shown": use ONLY when the whole claim is a specific number or date (e.g. "PPK no. 0120250324-WP152634") that the record does not display at all. If the record confirms the main status (registered, member, winner, grade) but not a side detail (a year, a number, "unlimited tender capacity"), the verdict is "verified" and the missing detail goes in "why".
Being listed in a body's own directory IS the registration or membership. Free-text fields inside a listing (e.g. "certificates listed", market-segment ticks) were typed by the company itself; a gap there is a "disagreement", never a contradiction of the registration.
A claim with a small wording gap (e.g. the certificate is real but covers a service, not the product the claim names) is "contradicted" only if the gap would mislead a customer; otherwise "verified" and name the gap in "why".
Also list "disagreements": details in the register record that differ from the company identity above or from the claim (address, unit number, phone, website, state, category, missing market segments). Keep each short. Do not repeat personal data.

${judged.map(({ c, r }) => `## ${c.id}\nClaim: ${c.claim} (value: ${c.value || '-'}; said on ${c.where.join(' ')})\nRegister: ${r.register} (${r.url})\nRecord: ${r.record}${r.notes?.length ? '\nOther notes: ' + r.notes.join('; ') : ''}`).join('\n\n')}

Return JSON only: {"results":[{"id":"C01","verdict":"verified|contradicted|not_shown","why":"one sentence citing the record","disagreements":["..."]}]}`;
    const out = ctx.parseJson<{ results: any[] }>(await ctx.llm(prompt));
    for (const x of out?.results ?? []) if (x?.id) verdicts[x.id] = { verdict: x.verdict === 'contradicted' ? 'contradicted' : x.verdict === 'not_shown' ? "can't check automatically" : 'verified', why: String(x.why ?? ''), disagreements: (x.disagreements ?? []).map(String) };
    if (!out) ctx.warn('judge answer did not parse; records found are reported as verified without a comparison');
  }

  const findings: Finding[] = [];
  const pii = new Set<string>();
  claims.forEach((c, i) => {
    const r = recs[i];
    (r.pii ?? []).forEach((x) => pii.add(x));
    let verdict: Verdict, why: string;
    if (r.cannot) { verdict = "can't check automatically"; why = r.cannot; }
    else if (!r.found) { verdict = 'not found'; why = r.record; }
    else { const v = verdicts[c.id]; verdict = v?.verdict ?? 'verified'; why = v?.why || r.record; }
    const sev = verdict === 'contradicted' ? 'high' : verdict === 'not found' ? 'medium' : verdict === 'verified' ? 'info' : 'low';
    findings.push({
      title: `${verdict.toUpperCase()}: ${c.claim}`,
      detail: `${why}${r.notes?.length ? ' Also: ' + r.notes.join('; ') + '.' : ''}${verdicts[c.id]?.disagreements?.length ? ' Register details that differ: ' + verdicts[c.id].disagreements!.join('; ') + '.' : ''}`,
      severity: sev,
      source: r.url || null,
      checked_at: ctx.now(),
      evidence: r.record || r.cannot,
      claim_id: c.id, claim: c.claim, issuer: c.issuer, value: c.value, claimed_on: c.where, verdict, register: r.register,
    });
  });
  if (pii.size) findings.push({ title: 'PRIVATE: a public register exposes your staff MyKad numbers', detail: [...pii].join('. ') + '. The numbers sit in the page data (not shown on screen) and can be read by anyone. Ask the register to remove them. (Report privately, never as bait.)', severity: 'high', source: null, checked_at: ctx.now(), verdict: 'risk', private: true });

  return { findings, notes: { claims, pages_read: pages, registers: REGISTERS, records: recs.map((r, i) => ({ id: claims[i].id, ...r })) } };
}
