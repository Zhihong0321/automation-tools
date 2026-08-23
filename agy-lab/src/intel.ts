// Public business-search and company-intelligence product surface.
//
// Both workflows are asynchronous by design. The POST returns an opaque share
// URL immediately; the same URL renders progress and later the completed report.
import crypto from 'node:crypto';
import type http from 'node:http';
import * as jobs from './jobs.ts';
import * as gateway from './gateway.ts';
import * as db from './reportdb.ts';
import * as ui from './reportui.ts';

export interface Ctx {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
}

const active = new Set<string>();

/** Runs this process is working on right now, so the reaper never kills one. */
export function activeReports(): string[] {
  return [...active];
}
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[] : [];

/**
 * Identity resolvers are supplied only for the live discovery call. The raw
 * values never enter a report request, run artifact, ledger, or final brief.
 */
export interface PersonIdentityHints {
  email?: string;
  mobile?: string;
}

export function normalizeMobileHint(value: string): string | null {
  const raw = value.trim();
  if (!raw || !/^[+()\d.\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  // E.164 tops out at 15 digits. We also allow national-format mobile input,
  // but refuse short values that are more likely an extension or random text.
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function identityHintValues(hints: PersonIdentityHints): string[] {
  const values: string[] = [];
  if (hints.email) values.push(hints.email.trim().toLowerCase());
  const mobile = hints.mobile ? normalizeMobileHint(hints.mobile) : null;
  if (mobile) values.push(mobile);
  return values;
}

function containsIdentityHint(value: unknown, hints: PersonIdentityHints): boolean {
  const values = identityHintValues(hints);
  if (!values.length) return false;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    const digits = value.replace(/\D/g, '');
    return values.some((hint) => hint.includes('@') ? lower.includes(hint) : digits.includes(hint));
  }
  if (Array.isArray(value)) return value.some((entry) => containsIdentityHint(entry, hints));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some((entry) => containsIdentityHint(entry, hints));
  return false;
}

/** Drop any model row that repeats a caller-supplied resolver before it reaches storage. */
export function redactIdentityHintsFromDiscovery(
  discovery: Record<string, unknown>,
  hints: PersonIdentityHints,
): Record<string, unknown> {
  if (!identityHintValues(hints).length) return discovery;
  const cleaned = structuredClone(discovery);
  for (const key of ['contacts', 'facts', 'signals']) {
    if (Array.isArray(cleaned[key])) cleaned[key] = rows(cleaned[key]).filter((row) => !containsIdentityHint(row, hints));
  }
  return cleaned;
}

/** A social scout may report only evidence it directly observed on its own network. */
export function keepDiscoveryEvidenceFromHosts(
  discovery: Record<string, unknown>,
  allowedHosts: string[],
): Record<string, unknown> {
  const hosts = new Set(allowedHosts.map((host) => host.toLowerCase()));
  const allowed = (row: Record<string, unknown>): boolean => {
    const evidence = directUrl(first(row, ['evidence_url', 'source_url', 'url']));
    if (!evidence) return false;
    const hostname = new URL(evidence).hostname.toLowerCase();
    return [...hosts].some((host) => hostname === host || hostname.endsWith('.' + host));
  };
  const cleaned = structuredClone(discovery);
  for (const key of ['contacts', 'facts', 'signals']) {
    if (Array.isArray(cleaned[key])) cleaned[key] = rows(cleaned[key]).filter(allowed);
  }
  return cleaned;
}

function origin(req: http.IncomingMessage): string {
  const forwarded = str(req.headers['x-forwarded-proto']);
  const proto = forwarded.split(',')[0]?.trim() || 'http';
  return proto + '://' + (req.headers.host ?? 'localhost');
}

function envelope(req: http.IncomingMessage, report: db.PublishedReport): Record<string, unknown> {
  const base = origin(req);
  const resource = report.report_type === 'business_search'
    ? 'business-search'
    : report.report_type === 'person_research' ? 'person-research' : 'company-research';
  return {
    id: report.public_id,
    type: report.report_type,
    status: report.status,
    title: report.title,
    created_at: report.created_at,
    updated_at: report.updated_at,
    completed_at: report.completed_at,
    view_url: base + '/r/' + report.public_id,
    api_url: base + '/api/' + resource + '/' + report.public_id,
    error: report.error,
  };
}

export function extractJson(raw: string): { value: Record<string, unknown> | null; error: string | null } {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return { value: null, error: 'model output contains no JSON object' };
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('root is not an object');
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (err) {
    return { value: null, error: 'invalid JSON: ' + ((err as Error).message ?? String(err)) };
  }
}

/**
 * A URL a model wrapped in Markdown is still that URL.
 *
 * The prompts ask for raw https:// strings -- though until this was written only
 * Round 02 said so, and the two synthesis steps, which is where it went wrong,
 * did not. One VIP brief published 17 evidence links as
 * `[https://host/path](https://host/path)`. Those are dead links in the report
 * UI. Unwrapping here is the permissive half; validateFinal / validatePersonFinal
 * are the strict half, and they now see through the same wrapper.
 */
export function unwrapUrl(value: string): string {
  const text = value.trim();
  const linked = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(text);
  if (linked) return linked[2]!.trim();
  const bracketed = /^\[([^\]]+)\]$/.exec(text);
  if (bracketed) return bracketed[1]!.trim();
  return text;
}

/**
 * Formatting normalises. Integrity rejects. Never the same code path.
 *
 * A Markdown-wrapped URL is a formatting defect: `unwrapUrl` repairs it
 * losslessly, so it must never be fatal. Making it fatal cost person report
 * `LSSBGcICBys3tdJgVCSG` a good summary over a bracket -- a cosmetic defect
 * traded for a substantive one, since the report went `partial` and the link was
 * no better for it. The wrappers are third-party models and their output shape
 * is not ours to control, so the consumer repairs what is repairable and rejects
 * only what is not: an invented URL, a dropped person, a changed ID set.
 *
 * Only a string that is *entirely* a Markdown link and unwraps to a parseable
 * https URL is rewritten. Prose that merely contains a link, and a plain
 * `[label]` that is not a URL, are left exactly as the model wrote them.
 */
export function normaliseUrls<T>(value: T): T {
  if (typeof value === 'string') {
    const candidate = unwrapUrl(value);
    if (candidate === value.trim() || !/^https?:\/\//.test(candidate)) return value;
    try { new URL(candidate); } catch { return value; }
    return candidate as unknown as T;
  }
  if (Array.isArray(value)) return value.map((entry) => normaliseUrls(entry)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normaliseUrls(entry)]),
    ) as unknown as T;
  }
  return value;
}

/**
 * How strong the evidence behind a row is. Never a reason to delete the row.
 *
 * This used to be a gate. `directUrl` returned null for anything that was not
 * https with a path, and every collector did `if (!evidence) continue`, so the
 * row vanished with no log, no gap entry and no count. On one measured run that
 * silently binned 14 of 37 researched rows -- 38% -- including four sourced from
 * the company's own website, plus SEDA, MyHIJAU, CTOS, JobStreet and China Press.
 * Round 01's prompt names those exact registries and spends a four-minute model
 * call collecting them; the gate then deleted the results.
 *
 * The concern behind it was real: a model that writes "source: seda.gov.my" may
 * have named an organisation rather than opened a page. But deleting fails
 * SILENTLY, and that is the whole problem -- a report missing 38% of its findings
 * looks complete, while a weak citation looks like a bug. So the code optimised
 * for never looking wrong instead of for being useful, and it did that invisibly,
 * on every run, to the person paying for the research.
 *
 * The https-only half had no argument at all. Nothing here is executed; a URL is
 * written to a JSON field. It cost 6 of 15 real company websites, because
 * Malaysian SME sites are routinely http.
 *
 * So: classify, never discard. The reader decides what to trust, which is the
 * only sound place for that decision to live. `candidate_people` has always
 * worked this way -- keep the row, stamp it needs_direct_role_evidence. This is
 * that same idiom, applied to every kind of row.
 */
export type EvidenceStrength =
  | 'direct_page'      // https, and a real path: the strongest thing we get
  | 'domain_only'      // https homepage -- names a source without pinning the page
  | 'insecure_page'    // http with a path
  | 'insecure_domain'  // http homepage
  | 'search_result'    // a search-engine URL: proves a query ran, not a fact
  | 'unsourced';       // the round gave no URL at all

/** Ranked worst-to-best, for sorting and for "how much of this report is solid". */
export const EVIDENCE_ORDER: EvidenceStrength[] =
  ['unsourced', 'search_result', 'insecure_domain', 'domain_only', 'insecure_page', 'direct_page'];

export function classifyEvidence(value: unknown): { url: string | null; strength: EvidenceStrength } {
  if (typeof value !== 'string' || !value.trim()) return { url: null, strength: 'unsourced' };
  let url: URL;
  try {
    url = new URL(unwrapUrl(value));
  } catch {
    // Not parseable as a URL at all. Keep whatever the round said -- it may be a
    // publication name a human can follow -- but call it what it is.
    return { url: null, strength: 'unsourced' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { url: null, strength: 'unsourced' };
  const bare = url.pathname === '/' || !url.pathname;
  const insecure = url.protocol !== 'https:';
  if (/google\.[^/]+\/search|bing\.com\/search|duckduckgo\.com/i.test(url.href)) {
    return { url: url.href, strength: 'search_result' };
  }
  if (/google\.com\/maps/i.test(url.href)) return { url: url.href, strength: 'direct_page' };
  if (bare) return { url: url.href, strength: insecure ? 'insecure_domain' : 'domain_only' };
  return { url: url.href, strength: insecure ? 'insecure_page' : 'direct_page' };
}

/**
 * The strict form, for the few places that genuinely need a usable link rather
 * than a classification -- a Messenger link we are about to publish as a contact
 * route, say. Everything that builds ledger rows uses classifyEvidence instead.
 */
function directUrl(value: unknown): string | null {
  const { url, strength } = classifyEvidence(value);
  return url && strength !== 'unsourced' && strength !== 'search_result' ? url : null;
}

function id(prefix: string, parts: unknown[]): string {
  return prefix + '_' + crypto.createHash('sha256').update(parts.map((v) => String(v ?? '')).join('|')).digest('hex').slice(0, 12);
}

function first(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) if (typeof row[key] === 'string' && str(row[key]).trim()) return str(row[key]).trim();
  return '';
}

function collectContacts(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.contacts)) {
      const cited = classifyEvidence(first(row, ['evidence_url', 'source_url', 'url']));
      const raw = first(row, ['value_as_published', 'value', 'raw_value', 'contact']);
      // The contact value is the row. Weak evidence downgrades it; it never deletes it.
      if (!raw) continue;
      const normalized = first(row, ['normalized_value', 'normalized']) || raw;
      const purpose = first(row, ['purpose', 'channel', 'type']) || 'Business contact';
      const key = normalized.toLowerCase() + '|' + purpose.toLowerCase();
      if (!found.has(key)) found.set(key, {
        id: id('contact', [normalized, purpose]), purpose, value_as_published: raw,
        normalized_value: normalized,
        current_status: first(row, ['current_status', 'status']) || 'published',
        evidence_class: first(row, ['evidence_class', 'source_type']) || 'unclassified',
        evidence_url: cited.url,
        evidence_strength: cited.strength,
        evidence_as_cited: cited.url ? null : first(row, ['evidence_url', 'source_url', 'url']) || null,
        source_date: row.source_date ?? row.visible_source_date ?? null,
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 24);
}

/**
 * Seniority, for choosing P01.
 *
 * `people[0]` is the person the pipeline sends to VIP research, so the order of
 * this list is a decision, not a presentation detail. It used to be insertion
 * order -- whoever Round 01 happened to mention first -- which was right on the
 * Eternalgy report only by luck.
 *
 * Matched longest-title-first so "chief executive" is not scored by the "chief"
 * of a lesser title, and against a spaced, punctuation-free string so
 * "CEO & Founder; Director" and "CEO / Founder" reduce to the same thing.
 */
const SENIORITY: Array<[RegExp, number]> = [
  [/\bchief executive|\bceo\b|\bmanaging director|\bgroup managing/, 100],
  [/\bfounder|\bco founder|\bproprietor|\bowner\b/, 95],
  [/\bchairman|\bchairperson|\bpresident\b/, 90],
  [/\bchief \w+ officer|\bcto\b|\bcfo\b|\bcoo\b|\bcmo\b/, 85],
  [/\bdirector\b|\bpartner\b/, 75],
  [/\bgeneral manager|\bhead of\b|\bvice president|\bvp\b/, 65],
  [/\bmanager\b|\blead\b|\bprincipal\b/, 45],
  [/\bengineer\b|\bofficer\b|\bexecutive\b|\bdesigner\b/, 25],
];

export function seniorityScore(role: string): number {
  const flat = ' ' + role.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  for (const [pattern, score] of SENIORITY) if (pattern.test(flat)) return score;
  return 10;
}

/** A person is one human, however many ways the rounds spelled their title. */
function personKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * One row per human, ranked by seniority.
 *
 * Keyed on name alone. The old key was name+role, so the Eternalgy report
 * carried "Gan Lai Soon" three times -- as "CEO & Founder; Director", as
 * "CEO & Founder / Director" and as "Director" -- three rows, one person, and a
 * P01 choice that was really a choice of transcription. When the same person
 * arrives twice, the more senior title and the better-classified evidence win,
 * and the alternate titles are kept so nothing sourced is thrown away.
 */
function collectPeople(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.people)) {
      const cited = classifyEvidence(first(row, ['role_evidence_url', 'evidence_url', 'role_url', 'source_url']));
      const name = first(row, ['name']);
      const role = first(row, ['current_role', 'role', 'position']);
      // A named person with a stated role is the row. How well it is sourced is
      // a property of the row, not a condition of its existence.
      if (!name || !role) continue;
      const key = personKey(name);
      const existing = found.get(key);
      if (!existing) {
        found.set(key, {
          id: id('person', [name, role]), name, role,
          relevance: first(row, ['relevance', 'why_relevant', 'outreach_relevance']),
          evidence_class: first(row, ['evidence_class', 'source_type']) || 'unclassified',
          role_url: cited.url,
          evidence_strength: cited.strength,
          evidence_as_cited: cited.url ? null : first(row, ['role_evidence_url', 'evidence_url', 'role_url', 'source_url']) || null,
          personal_profile_url: classifyEvidence(row.personal_profile_url).url,
          source_date: row.source_date ?? row.visible_source_date ?? null,
          introduced_by: first(row, ['introduced_by', '_round']) || null,
          also_described_as: [] as string[],
          seniority: seniorityScore(role),
        });
        continue;
      }
      // A profile URL found on the second sighting is still a profile URL.
      if (!existing.personal_profile_url) existing.personal_profile_url = classifyEvidence(row.personal_profile_url).url;
      const alts = existing.also_described_as as string[];
      const promote = seniorityScore(role) > num(existing.seniority, 0);
      // Whichever title loses goes to `also_described_as` -- including the one
      // being displaced, which is the half that is easy to drop on the floor.
      const demoted = promote ? String(existing.role) : role;
      if (promote) {
        existing.role = role;
        existing.seniority = seniorityScore(role);
        existing.role_url = cited.url;
        existing.evidence_strength = cited.strength;
        existing.evidence_class = first(row, ['evidence_class', 'source_type']) || existing.evidence_class;
      }
      const seen = new Set([String(existing.role).toLowerCase(), ...alts.map((r) => r.toLowerCase())]);
      if (!seen.has(demoted.toLowerCase())) alts.push(demoted);
    }
  }
  return [...found.values()]
    .sort((a, b) => num(b.seniority, 0) - num(a.seniority, 0))
    .slice(0, 16);
}

/**
 * Recall is useful before verification.  V1 surfaced registry contacts and
 * LinkedIn employees even when it could not attach a role page; silently
 * discarding them made a thin report look like a thin company.  These rows are
 * deliberately separate from `people`: they never qualify as verified people,
 * cannot trigger VIP research, and the UI labels them as leads to verify.
 */
function collectCandidatePeople(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.candidate_people)) {
      const name = first(row, ['name']);
      const role = first(row, ['current_role', 'role', 'position']) || 'Role not independently confirmed';
      const sourceName = first(row, ['source_name', 'source', 'evidence_note']);
      const sourceUrl = directUrl(first(row, ['source_url', 'role_evidence_url', 'evidence_url', 'role_url']));
      // A candidate must still say where it came from.  A URL is preferred, but
      // V1's useful registry and employee leads frequently had only a named source.
      if (!name || (!sourceName && !sourceUrl)) continue;
      const key = name.toLowerCase() + '|' + role.toLowerCase();
      if (!found.has(key)) found.set(key, {
        id: id('candidate_person', [name, role, sourceName || sourceUrl]), name, role,
        source_name: sourceName || new URL(sourceUrl!).hostname,
        source_url: sourceUrl,
        relevance: first(row, ['relevance', 'why_relevant', 'outreach_relevance']),
        verification_status: 'needs_direct_role_evidence',
        verification_note: first(row, ['verification_note', 'reason']) || 'Candidate from a named public source; current role needs direct verification.',
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 24);
}

function collectSignals(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.signals ?? source.business_signals ?? source.independent_signals)) {
      const cited = classifyEvidence(first(row, ['evidence_url', 'source_url', 'url']));
      const fact = first(row, ['fact', 'signal', 'description']);
      if (!fact) continue;
      const key = fact.toLowerCase().slice(0, 180) + '|' + (cited.url ?? 'unsourced');
      if (!found.has(key)) found.set(key, {
        id: id('signal', [fact, cited.url ?? 'unsourced']), date: row.date ?? row.visible_source_date ?? null,
        fact, evidence_class: first(row, ['evidence_class', 'source_type', 'source_class']) || 'unclassified',
        evidence_url: cited.url,
        evidence_strength: cited.strength,
        evidence_as_cited: cited.url ? null : first(row, ['evidence_url', 'source_url', 'url']) || null,
        outreach_use: first(row, ['outreach_use', 'relevance']),
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 14);
}

export function buildLedger(
  company: Record<string, unknown>,
  parsed: Record<string, unknown>[],
): Record<string, unknown> {
  const mapsUrl = directUrl(company.maps_url);
  const baseline: Record<string, unknown> = { contacts: [], people: [], signals: [] };
  if (company.phone && mapsUrl) {
    baseline.contacts = [{
      purpose: 'Google Maps phone', value: company.phone, normalized: company.phone,
      current_status: 'maps_listing', source_type: 'google_maps', source_url: mapsUrl, _round: 'gmap',
    }];
  }
  const all = [baseline, ...parsed];
  const contacts = collectContacts(all);
  const people = collectPeople(all);
  const candidatePeople = collectCandidatePeople(all);
  const signals = collectSignals(all);
  const conflicts = parsed.flatMap((p) => rows(p.conflicts ?? p.conflicts_and_unknowns)).slice(0, 12);
  return {
    entity: {
      company_id: String(company.id ?? ''), name: company.name, category: company.category,
      address: company.address, phone: company.phone, website: company.website,
      maps_url: company.maps_url, rating: company.rating, reviews: company.reviews,
    },
    contacts, people, candidate_people: candidatePeople, signals, conflicts_and_unknowns: conflicts,
    validation: {
      policy: 'Every row the research returned is retained and carries an evidence_strength; nothing is discarded for weak sourcing. direct_page is an https page that supports the field; domain_only names a source without pinning the page; insecure_* is the same over http; search_result proves a query ran, not a fact; unsourced means the round cited nothing. Candidate people are named by a public source but lack direct role evidence. Final synthesis may not add rows.',
      contact_count: contacts.length, people_count: people.length, candidate_people_count: candidatePeople.length, signal_count: signals.length,
      evidence_breakdown: evidenceBreakdown(contacts, people, signals),
    },
  };
}

/**
 * How the retained rows break down by evidence strength.
 *
 * This exists because the old behaviour was dishonest in a specific way: rows
 * were deleted for weak evidence, and the report then presented itself as
 * complete. Nothing counted what had gone. Now nothing is deleted, so the report
 * owes the reader a straight account of what it is made of.
 */
export function evidenceBreakdown(...groups: Record<string, unknown>[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const strength of EVIDENCE_ORDER) out[strength] = 0;
  for (const group of groups) {
    for (const row of group) {
      const key = String(row.evidence_strength ?? 'unsourced');
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  for (const key of Object.keys(out)) if (!out[key]) delete out[key];
  return out;
}

function sameSet(a: unknown[], b: unknown[]): boolean {
  const left = [...new Set(a.map(String))].sort();
  const right = [...new Set(b.map(String))].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

export function validateFinal(final: Record<string, unknown>, ledger: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const finalContacts = rows(final.contacts);
  const finalPeople = rows(final.people);
  const finalCandidates = rows(final.candidate_people);
  const ledgerContacts = rows(ledger.contacts);
  const ledgerPeople = rows(ledger.people);
  const ledgerCandidates = rows(ledger.candidate_people);
  if (!sameSet(finalContacts.map((r) => r.id), ledgerContacts.map((r) => r.id))) errors.push('contact id set changed');
  if (!sameSet(finalPeople.map((r) => r.id), ledgerPeople.map((r) => r.id))) errors.push('people id set changed');
  if (!sameSet(finalCandidates.map((r) => r.id), ledgerCandidates.map((r) => r.id))) errors.push('candidate people id set changed');
  const allowedUrls = new Set<string>();
  const collectAllowed = (value: unknown): void => {
    if (typeof value === 'string' && /^https?:\/\//.test(unwrapUrl(value))) {
      try { allowedUrls.add(new URL(unwrapUrl(value)).href); } catch { /* malformed URLs are caught by the ledger filter */ }
    } else if (Array.isArray(value)) value.forEach(collectAllowed);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collectAllowed);
  };
  collectAllowed(ledger);
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      // Unwrap first: a Markdown-wrapped URL does not start with "https://" and
      // used to slip through this check entirely. Wrapping itself is not an
      // error here -- `normaliseUrls` has already repaired it, and the URL a
      // model wrapped is still the URL it cited.
      const candidate = unwrapUrl(value);
      if (/^https?:\/\//.test(candidate)) {
        let href: string | null = null;
        try { href = new URL(candidate).href; } catch { href = null; }
        if (!href) errors.push('malformed URL: ' + value);
        else if (!allowedUrls.has(href)) errors.push('new URL: ' + value);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(final);
  return [...new Set(errors)];
}

/**
 * How a finished research run is published.
 *
 * `produced` counts the rounds that came back with usable output, and it is the
 * whole point of this function. Every round failure is caught where it happens
 * so one dead engine cannot abandon the work the others did — but nothing used
 * to ask whether ANY round had run, so a run in which all six calls were refused
 * published as `partial`: a green "Complete · noted gaps" over four empty
 * sections, indistinguishable from a company the research genuinely found
 * nothing on. Nothing ran is not a gap. It is a failure, and it says so.
 *
 * Reasons are deduplicated because they repeat by engine, not by round: one
 * offline worker turning away six calls is one fact, not six.
 */
export function publishOutcome(produced: number, failures: string[]): {
  status: 'completed' | 'partial' | 'failed';
  error: string | null;
} {
  const reasons = [...new Set(failures.filter(Boolean))];
  if (!produced) {
    return {
      status: 'failed',
      error: 'No research round produced any output, so this report has no findings. '
        + (reasons.join(' ') || 'Every round failed without reporting a reason.'),
    };
  }
  if (reasons.length) {
    return {
      status: 'partial',
      error: 'Report completed with one or more round, validation, or Chinese-translation gaps; only validated fields are published.',
    };
  }
  return { status: 'completed', error: null };
}

/**
 * The translation is a presentation copy, never a new research pass. These
 * values identify the evidence rows and/or lead a user to a source, so changing
 * one would turn a harmless language operation into data corruption.
 */
export function validateChineseTranslation(
  translated: Record<string, unknown>,
  canonical: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const collection of ['contacts', 'people', 'candidate_people', 'signals', 'conflicts_and_unknowns']) {
    if (rows(translated[collection]).length !== rows(canonical[collection]).length) errors.push(collection + ' row count changed');
  }
  if (!sameSet(rows(translated.contacts).map((row) => row.id), rows(canonical.contacts).map((row) => row.id))) errors.push('contact id set changed');
  if (!sameSet(rows(translated.people).map((row) => row.id), rows(canonical.people).map((row) => row.id))) errors.push('people id set changed');
  if (!sameSet(rows(translated.candidate_people).map((row) => row.id), rows(canonical.candidate_people).map((row) => row.id))) errors.push('candidate people id set changed');
  if (!sameSet(rows(translated.signals).map((row) => row.id), rows(canonical.signals).map((row) => row.id))) errors.push('signal id set changed');

  const compareInvariant = (original: unknown, candidate: unknown, path = ''): void => {
    if (Array.isArray(original)) {
      if (!Array.isArray(candidate) || original.length !== candidate.length) {
        errors.push('structure changed at ' + path);
        return;
      }
      original.forEach((value, index) => compareInvariant(value, candidate[index], `${path}[${index}]`));
      return;
    }
    if (!original || typeof original !== 'object') {
      if (typeof original !== typeof candidate) errors.push('value type changed at ' + path);
      return;
    }
    if (Array.isArray(candidate) || !candidate || typeof candidate !== 'object') {
      errors.push('structure changed at ' + path);
      return;
    }
    const originalKeys = Object.keys(original as Record<string, unknown>).sort();
    const candidateKeys = Object.keys(candidate as Record<string, unknown>).sort();
    if (!sameSet(originalKeys, candidateKeys)) errors.push('object keys changed at ' + path);
    for (const [key, value] of Object.entries(original as Record<string, unknown>)) {
      const translatedValue = (candidate as Record<string, unknown>)[key];
      const isInvariant = translationInvariantKey(key);
      if (isInvariant && JSON.stringify(value) !== JSON.stringify(translatedValue)) errors.push('canonical value changed at ' + (path ? path + '.' : '') + key);
      else compareInvariant(value, translatedValue, path ? path + '.' + key : key);
    }
  };
  compareInvariant(canonical, translated);
  return [...new Set(errors)];
}

function translationInvariantKey(key: string): boolean {
  return key === 'id' || key.endsWith('_id') || key.endsWith('_url') ||
    key === 'normalized_value' || key === 'value_as_published' || key === 'phone' ||
    key === 'website' || key === 'maps_url' || key === 'name' || key === 'company_name' ||
    key === 'person_name' || key === 'address' || key === 'date' || key === 'source_date' ||
    key === 'introduced_by' || key === 'synthesis_mode';
}

function collectPersonFacts(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.facts)) {
      const cited = classifyEvidence(first(row, ['evidence_url', 'source_url', 'url']));
      const category = first(row, ['category', 'type']) || 'Professional fact';
      const fact = first(row, ['fact', 'value', 'description']);
      if (!fact) continue;
      const key = category.toLowerCase() + '|' + fact.toLowerCase().slice(0, 220) + '|' + (cited.url ?? 'unsourced');
      if (!found.has(key)) found.set(key, {
        id: id('fact', [category, fact, cited.url ?? 'unsourced']), category, fact,
        evidence_class: first(row, ['evidence_class', 'source_type', 'source_class']) || 'unclassified',
        evidence_url: cited.url,
        evidence_strength: cited.strength,
        evidence_as_cited: cited.url ? null : first(row, ['evidence_url', 'source_url', 'url']) || null,
        source_date: row.source_date ?? row.visible_source_date ?? null,
        // This may say that an individual resolver matched, but never contains
        // the resolver value itself. It makes a historical affiliation auditable
        // without exposing an email address or mobile number.
        identity_match_basis: first(row, ['identity_match_basis', 'identity_match_note']) || null,
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 16);
}

export function buildPersonLedger(
  company: Record<string, unknown>,
  person: Record<string, unknown>,
  parsed: Record<string, unknown>[],
): Record<string, unknown> {
  const roleUrl = directUrl(first(person, ['role_url', 'role_evidence_url', 'evidence_url']));
  const name = first(person, ['name']);
  const role = first(person, ['role', 'current_role', 'position']);
  const baseline: Record<string, unknown> = {
    facts: roleUrl && name && role ? [{
      category: 'Current role', fact: `${name} is listed as ${role} at ${str(company.name, 'the company')}.`,
      evidence_class: first(person, ['evidence_class']) || 'first_party', evidence_url: roleUrl, _round: 'company_research',
      identity_match_basis: 'direct_current_role_evidence',
    }] : [],
    contacts: [], signals: [],
  };
  const all = [baseline, ...parsed];
  return {
    person: {
      id: first(person, ['id']), name, current_role: role,
      company_name: str(company.name), company_id: String(company.id ?? ''),
      role_evidence_url: roleUrl,
      personal_profile_url: directUrl(person.personal_profile_url) ?? null,
    },
    contacts: collectContacts(all),
    facts: collectPersonFacts(all),
    signals: collectSignals(all),
    validation: {
      policy: 'Public professional evidence only. An exact individual email or normalized mobile match may validate a sourced historical affiliation, but the matching value is never retained or published. Private or sensitive personal data and uncited social claims are excluded. Retained entries carry evidence_strength so the reader can judge sourcing.',
      contact_count: collectContacts(all).length,
      fact_count: collectPersonFacts(all).length,
      signal_count: collectSignals(all).length,
      evidence_breakdown: evidenceBreakdown(collectContacts(all), collectPersonFacts(all), collectSignals(all)),
    },
  };
}

export function validatePersonFinal(final: Record<string, unknown>, ledger: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!sameSet(rows(final.contacts).map((row) => row.id), rows(ledger.contacts).map((row) => row.id))) errors.push('contact id set changed');
  if (!sameSet(rows(final.facts).map((row) => row.id), rows(ledger.facts).map((row) => row.id))) errors.push('fact id set changed');
  if (!sameSet(rows(final.signals).map((row) => row.id), rows(ledger.signals).map((row) => row.id))) errors.push('signal id set changed');
  const allowedUrls = new Set<string>();
  const collectAllowed = (value: unknown): void => {
    if (typeof value === 'string' && /^https?:\/\//.test(unwrapUrl(value))) {
      try { allowedUrls.add(new URL(unwrapUrl(value)).href); } catch { /* validation below keeps malformed URLs out */ }
    } else if (Array.isArray(value)) value.forEach(collectAllowed);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collectAllowed);
  };
  collectAllowed(ledger);
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      // Unwrap first: a Markdown-wrapped URL does not start with "https://" and
      // used to slip through this check entirely. Wrapping itself is not an
      // error here -- `normaliseUrls` has already repaired it, and the URL a
      // model wrapped is still the URL it cited.
      const candidate = unwrapUrl(value);
      if (/^https?:\/\//.test(candidate)) {
        let href: string | null = null;
        try { href = new URL(candidate).href; } catch { href = null; }
        if (!href) errors.push('malformed URL: ' + value);
        else if (!allowedUrls.has(href)) errors.push('new URL: ' + value);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(final);
  return [...new Set(errors)];
}

/** P01 is the first person retained by the same evidence ledger used by the report UI. */
export function highestRankedPerson(
  company: Record<string, unknown>,
  parsed: Record<string, unknown>[],
): Record<string, unknown> | null {
  return rows(buildLedger(company, parsed).people)[0] ?? null;
}

function companyBaseline(company: Record<string, unknown>): string {
  return JSON.stringify({
    id: String(company.id ?? ''), name: company.name, category: company.category,
    address: company.address, phone: company.phone, website: company.website,
    maps_url: company.maps_url, rating: company.rating, reviews: company.reviews,
  });
}

/**
 * How a research round is allowed to fetch a page.
 *
 * `agy` can read a URL two ways: its built-in `read_url_content` tool, which needs
 * no approval, or a shell command, which does. A worker started by launchd has
 * nobody at the keyboard, so a shell request is auto-denied and the whole round
 * dies with "user denied permission to run command" -- that single line accounted
 * for most of the failed Round 01s in the report history.
 *
 * The prompt used to leave the method open, so the model picked one at random and
 * lost the coin flip more often than not. Naming the tool is what makes the round
 * deterministic. The alternative fix, --dangerously-skip-permissions, hands an
 * unrestricted shell to a model on a home network and is not worth it to read a
 * company's About page.
 */
const FETCH_POLICY = 'Fetch every page with your built-in URL reading tool (read_url_content). '
  + 'Never use the shell, terminal, bash, curl or wget to fetch a page: a shell command here requires '
  + 'an interactive approval that nobody can give, so the attempt is denied and this entire round fails.';

export function round01Prompt(company: Record<string, unknown>): string {
  return `You are Round 01 of a business lead-enrichment test. Research this exact company as of ${new Date().toISOString().slice(0, 10)}.
IMMUTABLE GOOGLE MAPS INPUT: ${companyBaseline(company)}
${FETCH_POLICY}
Find complete public company contacts, verified decision-relevant people, and separately retain named people who need verification. Search these sources separately: SSM/e-Info, CTOS/CreditScan, MyHIJAU, SEDA, CIDB, Maukerja, Hiredly, Ricebowl, JobStreet, Jora, LinkedIn company and people pages, official team/careers/testimonial pages, and reputable award, association, tender and news pages.
Rules: report everything you find and let the pipeline grade it -- never withhold a real finding because its source is only a homepage, is http rather than https, or is a registry you could not deep-link into. Give the most specific URL you actually used, as a raw https:// or http:// string and never a Markdown link; if you genuinely have no URL, name the source in evidence_url and return the row anyway. Company pages are first_party; do not infer emails/profiles/dates; no negative claims from search absence; do not explain conflicts without evidence; source date is null unless visibly published. Put a person in people only when their current role has direct URL evidence. Put a person in candidate_people when a named public source identifies them but that direct role evidence is missing; provide source_name, and source_url when known. Candidates are leads to verify, not confirmed roles.
Return exactly one compact JSON object in one fenced code block with arrays contacts, people, candidate_people, signals, conflicts_and_unknowns. Contact fields: purpose,value_as_published,normalized_value,current_status,evidence_class,evidence_url,source_date. People: name,current_role,relevance,evidence_class,role_evidence_url,personal_profile_url,source_date. Candidate people: name,current_role,source_name,source_url,relevance,verification_note. Signals: date,fact,evidence_class,evidence_url,outreach_use. Max 20 contacts, 12 people, 24 candidate_people, 10 signals. No prose outside JSON.`;
}

function round02Prompt(kind: 'contacts' | 'people' | 'signals', company: Record<string, unknown>, r1: Record<string, unknown>): string {
  const schemas = {
    contacts: 'contacts: purpose,value_as_published,normalized_value,current_status,evidence_class,evidence_url,source_date',
    people: 'people: name,current_role,relevance,evidence_class,role_evidence_url,personal_profile_url,source_date; candidate_people: name,current_role,source_name,source_url,relevance,verification_note',
    signals: 'signals: date,fact,evidence_class,evidence_url,outreach_use',
  };
  return `You are ChatGPT Round 02 auditing Gemini Round 01 for ${str(company.name)}. Do fresh web research; Round 01 is untrusted.
COMPANY BASELINE: ${companyBaseline(company)}
ROUND 01 PARSED LEADS: ${JSON.stringify(r1).slice(0, 28_000)}
Focus only on ${kind}. Confirm, correct, reject and add missed evidence. For contacts inspect subscription/campaign/careers/vendor pages. For people inspect SSM/e-Info, CTOS/CreditScan, MyHIJAU, SEDA, CIDB, job boards, LinkedIn people/company pages, official team pages, awards and associations. Prioritize CEO, commercial, partnerships, procurement, operations and HR, but retain directors, registry contacts, team members and employees as candidate_people when the named source is public but the current role lacks direct evidence. For signals use direct issuer or specific company pages.
Return exactly one compact JSON object inside one fenced code block with ${schemas[kind]}. Every URL must be a literal raw URL string inside JSON, never a Markdown link label. Report what you find and let the pipeline grade its sourcing: do not drop a real finding because its source is a homepage or is http. Candidate people require source_name and use source_url only when known. No inferred emails or personal URLs. Search snippets and crawl dates are not evidence. Use null when unknown. Max ${kind === 'contacts' ? 20 : kind === 'people' ? '12 people plus 24 candidate_people' : 10} rows and no prose outside JSON.`;
}


// ---------------------------------------------------------------- Round 03
//
// Round 03 used to be a Meta/Muse ask: a model was asked whether it could see
// live Facebook pages and, if it said yes, what was on them. Both halves of that
// answer came from the same place, so the round could not be audited — and it
// mostly replied `no_live_access` with empty arrays, which is the honest answer
// to a question that should never have been put to a model. The muse engine
// behind it is retired.
//
// It is the fb-recon crawler on the mini now. A deterministic read-only browser
// visits the pages, and every row below carries the facebook.com URL it was read
// from — the evidence standard the ledger always claimed, now actually met.

// Only a confirmed or likely page match contributes rows. A `weak` match is a
// plausible page that may belong to a different business, and attaching its phone
// number to this company is precisely the poisoning this round exists to prevent.
const FB_TRUSTED = new Set(['confirmed', 'likely']);

async function runJob(type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
  const job = jobs.create(type, payload, timeoutMs);
  const settled = await jobs.wait(job.id, timeoutMs + 5_000);
  if (!settled || settled.status !== 'done') throw new Error(settled?.error ?? type + ' did not finish');
  return object(settled.result);
}

/**
 * A Messenger link is a contact point only when the page published one. fb-recon
 * also *derives* a link from the profile URL for convenience and labels it
 * `derived`; that is arithmetic, not evidence, so it never enters the ledger.
 */
function messengerContact(row: Record<string, unknown>, purpose: string, evidenceUrl: string | null): Record<string, unknown> | null {
  const link = str(row.messenger_url).trim();
  if (!evidenceUrl || !link) return null;
  // `detected` means the page published the link; `derived` means fb-recon built
  // it from the profile URL. The derived one used to be discarded as "arithmetic,
  // not evidence" -- but it is a working Messenger route to this business, and
  // deleting a usable contact because of how it was obtained helps nobody. It is
  // labelled instead, and the label says exactly what it is.
  const detected = str(row.messenger_source) === 'detected';
  return {
    purpose, value_as_published: link, normalized_value: link,
    current_status: 'published',
    evidence_class: detected ? 'facebook_page_published' : 'facebook_link_derived_from_profile',
    evidence_strength: detected ? 'direct_page' : 'domain_only',
    derived: !detected,
    evidence_url: evidenceUrl, _round: 'round03',
  };
}

/**
 * Turn what the crawler saw into ledger rows. Pure on purpose: this is where the
 * evidence policy is actually enforced, so it has to be provable without a
 * worker, a queue or a browser in the way.
 */
export function facebookLedgerRows(page: Record<string, unknown>, discovered: Record<string, unknown> | null): {
  contacts: Record<string, unknown>[]; people: Record<string, unknown>[];
  signals: Record<string, unknown>[]; gaps: string[]; pageUrl: string | null;
} {
  const contacts: Record<string, unknown>[] = [];
  const people: Record<string, unknown>[] = [];
  const signals: Record<string, unknown>[] = [];
  const gaps: string[] = [];
  const pageUrl = classifyEvidence(page.facebook_url).url;
  if (!pageUrl) return { contacts, people, signals, gaps, pageUrl: null };
  // Confidence grades the rows; it does not decide whether they exist. This used
  // to return empty for a `weak` match, so a page the crawler found -- with its
  // phone, email, Messenger link, follower count and every person on it -- was
  // thrown away wholesale because the match was not certain. A `weak` match that
  // is really this company is a real finding, and whether to believe it is the
  // reader's call, not this function's.
  const confidence = str(page.confidence) || 'weak';
  const confirmed = FB_TRUSTED.has(confidence);
  const fbStrength: EvidenceStrength = confirmed ? 'direct_page' : 'domain_only';
  const fbClass = confirmed ? 'facebook_page' : 'facebook_page_unconfirmed_match';
  if (!confirmed) {
    gaps.push('Facebook page match is confidence "' + confidence + '": these rows may belong to a different business.');
  }

  const contact = (purpose: string, value: unknown): void => {
    const raw = str(value).trim();
    if (!raw) return;
    contacts.push({
      purpose, value_as_published: raw, normalized_value: raw,
      current_status: 'published', evidence_class: fbClass,
      evidence_url: pageUrl, evidence_strength: fbStrength,
      facebook_match_confidence: confidence, _round: 'round03',
    });
  };
  contact('Facebook Page phone', page.phone);
  contact('Facebook Page email', page.email);
  const pageMessenger = messengerContact(page, 'Messenger — company page', pageUrl);
  if (pageMessenger) contacts.push(pageMessenger);

  // Followers and reviews are the one thing a Page states about itself that is
  // worth a signal row: it is what "are they actually active here" looks like.
  const audience = [
    str(page.followers).trim() ? str(page.followers).trim() + ' followers' : '',
    num(page.reviews, 0) > 0 ? String(num(page.reviews, 0)) + ' reviews' : '',
  ].filter(Boolean).join(' and ');
  if (audience) {
    signals.push({
      date: null, fact: 'Facebook Page shows ' + audience + '.',
      evidence_class: fbClass, evidence_url: pageUrl, evidence_strength: fbStrength,
      facebook_match_confidence: confidence,
      outreach_use: 'Gauges how active and how public this business is on Facebook.',
      _round: 'round03',
    });
  }

  const companyUrl = directUrl(discovered?.company_url) ?? pageUrl;
  for (const person of rows(discovered?.people)) {
    const name = str(person.name).trim();
    const role = str(person.role).trim();
    if (!name) continue;
    // A named human at this company is a finding whether or not Facebook stated a
    // title for them. This used to drop them and log a gap; the name is the part
    // that matters and the missing title is now said out loud on the row itself.
    const profileUrl = classifyEvidence(person.profile_url).url;
    people.push({
      name, role: role || 'Role not stated on Facebook',
      role_stated: Boolean(role),
      relevance: str(person.source).trim() || null,
      evidence_class: 'facebook_' + (str(person.confidence) || 'weak'),
      evidence_strength: role ? fbStrength : 'domain_only',
      facebook_match_confidence: confidence,
      role_evidence_url: companyUrl,
      personal_profile_url: profileUrl,
      _round: 'round03',
    });
    const personMessenger = messengerContact(person, 'Messenger — ' + name, profileUrl ?? companyUrl);
    if (personMessenger) contacts.push(personMessenger);
  }

  return { contacts, people, signals, gaps, pageUrl };
}

async function round03Facebook(company: Record<string, unknown>): Promise<{
  artifact: Record<string, unknown>; parsed: Record<string, unknown> | null; status: string;
}> {
  const empty = { contacts: [], people: [], signals: [], search_gaps: [] as string[] };
  // A type no lane is claiming would leave a job pending until it timed out.
  // Saying so up front costs the run nothing and reads honestly in the report.
  if (!jobs.liveTypes().includes('fb.company')) {
    return {
      artifact: { access_mode: 'no_live_access', access_evidence: 'No mini worker is claiming fb.company; nothing visited Facebook for this run.', ...empty },
      parsed: null,
      status: 'skipped',
    };
  }

  const lead = {
    name: str(company.name), address: str(company.address), phone: str(company.phone),
    website: str(company.website), category: str(company.category),
  };
  const lookup = await runJob('fb.company', { ...lead, timeoutMs: 300_000 }, 300_000);
  const page = object(lookup.result);

  // Named humans — but only off a page the crawler confirmed. `discover` is the
  // expensive half of this round, so it never runs against an unconfirmed page.
  let discovery: Record<string, unknown> | null = null;
  const gaps: string[] = [];
  const trusted = directUrl(page.facebook_url) && FB_TRUSTED.has(str(page.confidence));
  if (trusted && jobs.liveTypes().includes('fb.discover')) {
    try {
      discovery = await runJob('fb.discover', { name: lead.name, address: lead.address, timeoutMs: 420_000 }, 420_000);
    } catch (err) {
      gaps.push('fb.discover failed: ' + ((err as Error).message ?? String(err)));
    }
  } else if (trusted) {
    gaps.push('No mini worker is claiming fb.discover; people were not searched for.');
  }

  const built = facebookLedgerRows(page, discovery ? object(discovery.result) : null);
  if (!built.pageUrl) {
    return {
      artifact: {
        access_mode: 'no_live_access',
        access_evidence: directUrl(page.facebook_url)
          ? 'A Facebook page was found, but only at confidence "' + str(page.confidence) + '", which is below the bar for evidence.'
          : 'No Facebook page for this business could be confirmed.',
        company_lookup: lookup, ...empty,
      },
      parsed: null,
      status: 'completed',
    };
  }

  const searchGaps = [...gaps, ...built.gaps];
  return {
    artifact: {
      access_mode: 'live_facebook_pages',
      access_evidence: 'fb-recon crawled ' + built.pageUrl + ' read-only at confidence "' + str(page.confidence) + '".',
      company_lookup: lookup, people_lookup: discovery,
      contacts: built.contacts, people: built.people, signals: built.signals, search_gaps: searchGaps,
    },
    parsed: { access_mode: 'live_facebook_pages', contacts: built.contacts, people: built.people, signals: built.signals },
    status: 'completed',
  };
}

function round04Prompt(ledger: Record<string, unknown>): string {
  return `You are Gemini Round 04. Write a concise final business-intelligence synthesis using only this validated ledger: ${JSON.stringify(ledger)}
Candidate people are leads to verify, not confirmed roles: do not present their role or affiliation as fact in summary or outreach_angles. Return exactly one JSON object in a fenced code block with keys summary (max 120 words), outreach_angles (max 5 short strings), entity, contacts, people, candidate_people, signals, conflicts_and_unknowns. Copy entity/contacts/people/candidate_people/signals/conflicts arrays exactly, including every id and URL.Copy every URL as a literal raw https:// string exactly as it appears in the ledger, never as a Markdown link and never wrapped in brackets. Do not browse, add, remove, rename, infer, resolve conflicts or introduce any number/name/URL not present in the ledger. No prose outside JSON.`;
}

interface TranslationEntry { path: string[]; text: string; }

function translationEntries(value: unknown, path: string[] = [], out: TranslationEntry[] = []): TranslationEntry[] {
  if (typeof value === 'string') {
    const key = path[path.length - 1] ?? '';
    // Published data routes and identifiers must be copied byte-for-byte. The
    // remaining strings are human-facing report copy and can be safely localised.
    if (!translationInvariantKey(key) && !/^https?:\/\//i.test(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => translationEntries(child, [...path, String(index)], out));
  } else if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => translationEntries(child, [...path, key], out));
  }
  return out;
}

function putTranslation(target: Record<string, unknown>, path: string[], text: string): void {
  let cursor: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < path.length - 1; index++) cursor = cursor[Array.isArray(cursor) ? Number(path[index]) : path[index]!] as Record<string, unknown> | unknown[];
  const key = path[path.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(key)] = text;
  else cursor[key] = text;
}

async function translationResponse(
  baseUrl: string,
  apiKey: string,
  model: string,
  texts: string[],
): Promise<string[]> {
  const prompt = `Translate each English string below to Simplified Chinese (zh-CN), in order. This is translation only: do not add, omit, merge, reorder, infer, or correct anything. Preserve all proper names, identifiers, URLs, email addresses, phone numbers, dates, codes, and numbers exactly if present. Return exactly one JSON object in a fenced code block: {"translations":["...same count and order..."]}.\nINPUT: ${JSON.stringify(texts)}`;
  let lastError = 'translation request failed';
  // Four tries, and the waits are seconds rather than milliseconds. 1s and 2s
  // are shorter than a Railway service takes to come back from a cold start, so
  // the old backoff gave up while the router was still waking: three of five
  // Chinese translations in the history died on a 503 that a slightly more
  // patient caller would have ridden out.
  const BACKOFF_MS = [2_000, 8_000, 20_000];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(baseUrl + '/chat/completions', {
        method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [
          { role: 'system', content: 'You are a precise English-to-Simplified-Chinese translator. Return only requested JSON.' },
          { role: 'user', content: prompt },
        ], temperature: 0 }), signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        lastError = 'translation service returned HTTP ' + response.status;
        if (response.status === 429 || response.status >= 500) {
          const wait = BACKOFF_MS[attempt];
          if (wait === undefined) break;
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
        throw new Error(lastError);
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const raw = payload.choices?.[0]?.message?.content;
      const parsed = typeof raw === 'string' ? extractJson(raw) : { value: null, error: 'translation service returned no message content' };
      const translated = parsed.value?.translations;
      if (!Array.isArray(translated) || translated.length !== texts.length || !translated.every((item) => typeof item === 'string')) throw new Error('translation service returned an invalid translations array');
      return translated as string[];
    } catch (err) {
      lastError = (err as Error).message ?? String(err);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  throw new Error(lastError);
}

function personBaseline(company: Record<string, unknown>, person: Record<string, unknown>): string {
  return JSON.stringify({
    company_name: company.name,
    company_website: company.website ?? null,
    person_id: person.id,
    person_name: first(person, ['name']),
    current_role: first(person, ['role', 'current_role', 'position']),
    role_evidence_url: first(person, ['role_url', 'role_evidence_url', 'evidence_url']),
    personal_profile_url: directUrl(person.personal_profile_url) ?? null,
  });
}

export function personDiscoveryPrompt(company: Record<string, unknown>, person: Record<string, unknown>, hints: PersonIdentityHints = {}): string {
  const resolvers = [
    hints.email ? `email: ${hints.email}` : null,
    hints.mobile ? `mobile: ${hints.mobile}` : null,
  ].filter(Boolean);
  const privateHint = resolvers.length
    ? `PRIVATE IDENTITY RESOLVERS (caller-supplied; use only as exact search and disambiguation keys): ${resolvers.join('; ')}. Never repeat, return, publish, save, or treat these values as a contact or evidence. Use them only to locate public professional pages that independently connect the target name to the target company or current role. Do not query breach data, data brokers, people-search sites, or private/social accounts.`
    : 'No private identity resolver was supplied; scope discovery with the target name and company.';
  return `You are researching a confirmed business leader for a VIP qualification brief as of ${new Date().toISOString().slice(0, 10)}.
TARGET BASELINE: ${personBaseline(company, person)}
${privateHint}
${FETCH_POLICY}
Research public professional business information only: the current role, public company/board affiliations, attributable interviews or talks, dated business signals, and professional publications or speaking appearances relevant to a commercial or partnership conversation. Resolve namesakes conservatively: retain a finding only when the direct source ties it to the target company/current role, when two independent public-professional sources make the match clear, or when a source contains an exact match to a caller-supplied individual email or normalized mobile. That exact resolver match is sufficient to retain a prior-company affiliation even when the source names a different employer; label it as historical, never current. For a resolver-validated row, set identity_match_basis to exact_email_match or exact_mobile_match, but never repeat any identifier value.
Never collect or return home address, non-business phone, family, private social accounts, age, ethnicity, religion, health, political views, private wealth, breach data, data-broker records, or personal contact details. Do not infer any fact, email, profile, title, date or affiliation.
Every retained item requires a raw full https:// direct source URL. Company-controlled pages are first_party; independent issuer/news pages are independent; public professional platforms are social_platform. Search snippets and bare homepages are not evidence.
Return exactly one compact JSON object inside a fenced code block with arrays contacts, facts and signals. Contact fields: purpose,value_as_published,normalized_value,current_status,evidence_class,evidence_url,source_date,identity_match_note. Retain only professional/business contact routes directly published by the person, company, or a reputable organization; distinguish a company-wide route from a person-specific route. Fact fields: category,fact,evidence_class,evidence_url,source_date,identity_match_basis. Signal fields: date,fact,evidence_class,evidence_url,outreach_use. Max 16 contacts, 16 facts and 10 signals. No prose outside JSON.`;
}

function personAuditPrompt(
  company: Record<string, unknown>,
  person: Record<string, unknown>,
  discovery: Record<string, unknown>,
): string {
  const leadUrls = [...rows(discovery.contacts), ...rows(discovery.facts), ...rows(discovery.signals)]
    .map((row) => first(row, ['evidence_url', 'source_url', 'url']))
    .filter(Boolean)
    .slice(0, 24);
  return `Independently audit and extend a VIP qualification brief for this exact business leader as of ${new Date().toISOString().slice(0, 10)}.
TARGET BASELINE: ${personBaseline(company, person)}
These untrusted public URLs are leads only; verify them and research beyond them: ${JSON.stringify(leadUrls)}
Use only the target name, company, role, and public-source leads. Do not seek or infer personal identifiers, and do not collect private or sensitive data. Retain only public professional information that direct evidence connects to the target company/current role, or to a historical employer already resolver-validated by the primary pass: current role, board/company affiliations, attributable interviews/talks/publications, and dated business signals relevant to a commercial conversation. Never upgrade a historical affiliation into a current role.
Every retained row needs a raw full https:// direct evidence URL; exclude search snippets, bare homepages, uncited claims, namesake matches, data brokers, breach data, and personal contact details. Return exactly one compact JSON object inside a fenced code block with contacts, facts and signals. Use the same fields as the discovery pass. Max 12 contacts, 16 facts and 10 signals. No prose outside JSON.`;
}

type SocialScout = 'facebook' | 'x';

const scoutConfig: Record<SocialScout, { jobType: string; hosts: string[]; label: string; defaultTimeoutMs: number }> = {
  facebook: {
    // Matches the home worker's public-person contract, not the company-page
    // crawler. It needs both names to resolve a namesake conservatively.
    jobType: process.env.VIP_FB_SCOUT_JOB_TYPE?.trim() || 'fb.person',
    hosts: ['facebook.com', 'instagram.com', 'threads.net'],
    label: 'Facebook/Instagram Scout',
    defaultTimeoutMs: 300_000,
  },
  x: {
    // x-recon uses Grok to search X and exposes the cited X permalinks in its
    // x.subject envelope. It intentionally has a longer budget than Facebook.
    jobType: process.env.VIP_XAI_SCOUT_JOB_TYPE?.trim() || 'x.subject',
    hosts: ['x.com', 'twitter.com'],
    label: 'Grok / X Scout',
    defaultTimeoutMs: 600_000,
  },
};

function personScoutPayload(
  scout: SocialScout,
  company: Record<string, unknown>,
  person: Record<string, unknown>,
  timeoutMs: number,
): Record<string, unknown> {
  const personName = first(person, ['name']);
  const companyName = str(company.name);
  if (scout === 'facebook') {
    return {
      person: personName,
      company: companyName,
      address: str(company.address),
      website: str(company.website),
      budget: Math.min(Math.max(Number(process.env.VIP_FB_SCOUT_BUDGET ?? 8), 1), 25),
      timeoutMs,
    };
  }
  return {
    // The company qualifier is part of the actual X/Grok search subject so a
    // common name does not silently turn into a namesake investigation.
    subject: `${personName} ${companyName}`.trim(),
    max: Math.min(Math.max(Number(process.env.VIP_XAI_SCOUT_MAX ?? 12), 1), 40),
    budget: Math.min(Math.max(Number(process.env.VIP_XAI_SCOUT_BUDGET ?? 4), 1), 10),
    timeoutMs,
  };
}

/** Convert supported worker envelopes to the evidence-only VIP ledger shape. */
export function scoutParsed(scout: SocialScout, result: unknown): Record<string, unknown> | null {
  const value = object(result);
  const direct = object(value.parsed);
  if (Object.keys(direct).length) return direct;
  const raw = str(value.answer || value.text || value.output);
  if (raw) return extractJson(raw).value;
  if (Array.isArray(value.contacts) || Array.isArray(value.facts) || Array.isArray(value.signals)) return value;

  const native = object(value.result);
  if (!Object.keys(native).length) return null;
  if (scout === 'facebook') {
    const confidence = str(native.confidence).toLowerCase();
    const url = directUrl(first(native, ['facebook_url', 'profile_url', 'page_url']));
    // fb.person has already resolved name + company. A weak lead is not enough
    // to identify a person in a VIP report, even though it is useful worker
    // telemetry, so it contributes no ledger row.
    if (!url || !['confirmed', 'likely'].includes(confidence)) return { contacts: [], facts: [], signals: [] };
    return {
      contacts: [],
      facts: [{
        category: 'Public social profile',
        fact: 'A public Facebook profile/page was matched to the scoped person and company.',
        evidence_class: 'social_platform', evidence_url: url, source_date: null,
      }],
      signals: [],
    };
  }

  // x-recon labels whether Grok actually rendered each permalink. An X URL
  // alone is not sufficient: only cited threads are direct worker evidence.
  const threads = rows(native.threads)
    .filter((thread) => thread.cited === true && Boolean(directUrl(first(thread, ['url', 'evidence_url']))))
    .slice(0, 10);
  const facts = threads.map((thread) => {
    const author = first(thread, ['author']) || 'an X account';
    const detail = first(thread, ['topic', 'excerpt']) || 'a public post relevant to the scoped person/company';
    return {
      category: 'Cited X post', fact: `${author} posted about ${detail}.`, evidence_class: 'social_platform',
      evidence_url: directUrl(first(thread, ['url', 'evidence_url'])), source_date: thread.date ?? null,
    };
  });
  const signals = threads.filter((thread) => Boolean(str(thread.date))).map((thread) => ({
    date: thread.date, fact: first(thread, ['topic', 'excerpt']) || 'Cited X discussion relevant to the scoped person/company.',
    evidence_class: 'social_platform', evidence_url: directUrl(first(thread, ['url', 'evidence_url'])),
    outreach_use: 'Use only when the cited discussion is relevant to the conversation.',
  }));
  return { contacts: [], facts, signals };
}

async function runPersonScout(
  scout: SocialScout,
  company: Record<string, unknown>,
  person: Record<string, unknown>,
): Promise<{ parsed: Record<string, unknown> | null; metadata: Record<string, unknown>; failed: boolean }> {
  const config = scoutConfig[scout];
  if (!jobs.liveTypes().includes(config.jobType)) {
    return { parsed: null, metadata: { status: 'unavailable', lane: config.label, worker_job_type: config.jobType }, failed: false };
  }
  const configuredTimeout = Number(process.env.VIP_SOCIAL_SCOUT_TIMEOUT_MS);
  const timeoutMs = Math.min(Math.max(Number.isFinite(configuredTimeout) ? configuredTimeout : config.defaultTimeoutMs, 30_000), 600_000);
  const started = Date.now();
  try {
    // Private resolvers intentionally do not cross into worker payloads. The
    // payload below is the actual fb.person / x.subject worker contract.
    const job = jobs.create(config.jobType, personScoutPayload(scout, company, person, timeoutMs), timeoutMs);
    const settled = await jobs.wait(job.id, timeoutMs + 5_000);
    if (!settled || settled.status === 'pending' || settled.status === 'running') {
      return { parsed: null, metadata: { status: 'timeout', lane: config.label, worker_job_type: config.jobType, job_id: job.id, ms: Date.now() - started }, failed: true };
    }
    if (settled.status !== 'done') {
      return { parsed: null, metadata: { status: 'failed', lane: config.label, worker_job_type: config.jobType, job_id: job.id, error: settled.error, ms: Date.now() - started }, failed: true };
    }
    const parsed = scoutParsed(scout, settled.result);
    if (!parsed) {
      return { parsed: null, metadata: { status: 'invalid_output', lane: config.label, worker_job_type: config.jobType, job_id: job.id, ms: Date.now() - started }, failed: true };
    }
    return {
      parsed: keepDiscoveryEvidenceFromHosts(parsed, config.hosts),
      metadata: { status: 'completed', lane: config.label, worker_job_type: config.jobType, job_id: job.id, ms: Date.now() - started },
      failed: false,
    };
  } catch (err) {
    return { parsed: null, metadata: { status: 'failed', lane: config.label, worker_job_type: config.jobType, error: (err as Error).message ?? String(err), ms: Date.now() - started }, failed: true };
  }
}

function personSynthesisPrompt(ledger: Record<string, unknown>): string {
  return `Write a concise VIP qualification brief using only this validated public-professional ledger: ${JSON.stringify(ledger)}
Return exactly one JSON object in a fenced code block with keys summary (max 120 words), research_angles (max 4 short strings), person, contacts, facts, signals. Copy person, contacts, facts and signals exactly, including every id and URL.Copy every URL as a literal raw https:// string exactly as it appears in the ledger, never as a Markdown link and never wrapped in brackets. Do not browse, add, remove, rename, infer, or introduce any new URL, fact, affiliation, contact detail, or sensitive personal data. No prose outside JSON.`;
}

async function ask(model: string, prompt: string, timeoutMs: number): Promise<{
  raw: string; parsed: Record<string, unknown> | null; parse_error: string | null;
  model: string; engine: string; ms: number;
}> {
  const out = await gateway.askModel(model, prompt, { timeoutMs });
  const parsed = extractJson(out.answer);
  return { raw: out.answer, parsed: parsed.value, parse_error: parsed.error, model: out.model, engine: out.engine, ms: out.ms };
}

/** OpenAI-compatible translation endpoint, isolated from the research gateway. */
export async function translateChinese(finalReport: Record<string, unknown>): Promise<{
  translated: Record<string, unknown>; model: string; ms: number; validation_errors: string[];
}> {
  const baseUrl = (process.env.TRANSLATION_BASE_URL?.trim() || 'https://e-router.up.railway.app/v1').replace(/\/+$/, '');
  const apiKey = process.env.TRANSLATION_API_KEY?.trim();
  const model = process.env.TRANSLATION_MODEL?.trim() || 'step-3.7-flash';
  if (!apiKey) throw new Error('Chinese translation is not configured; set TRANSLATION_API_KEY');
  const started = Date.now();
  const translated = structuredClone(finalReport);
  const entries = translationEntries(finalReport);
  // Small batches avoid provider 503s on lengthy evidence ledgers while
  // retaining a deterministic one-to-one mapping to the canonical report.
  const batches: TranslationEntry[][] = [];
  for (let offset = 0; offset < entries.length; offset += 30) {
    // Large enough to avoid provider request-rate throttling, still far below
    // the one-shot report payload that triggered upstream 503s.
    batches.push(entries.slice(offset, offset + 30));
  }
  // The batches are independent: each carries its own texts and writes to its own
  // paths, and the endpoint is a stateless OpenAI-compatible completion. Running
  // them one after another was costing a full round trip per batch -- ~137s on a
  // report with seven batches -- for no isolation the parallel version does not
  // also have. Nothing in the queue governs this lane; it is not a browser and it
  // is not somebody's logged-in account.
  //
  // Bounded rather than unbounded, because the 503s that motivated small batches
  // in the first place were rate pressure, and firing twenty requests at once is
  // exactly that pressure in a different shape.
  const width = Math.max(1, Number(process.env.TRANSLATION_CONCURRENCY) || 4);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      const batch = batches[index];
      if (!batch) return;
      const texts = await translationResponse(baseUrl, apiKey, model, batch.map((entry) => entry.text));
      batch.forEach((entry, at) => putTranslation(translated, entry.path, texts[at]!));
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, batches.length) }, worker));
  // A validation failure used to throw, which meant one bad field destroyed the
  // whole Chinese report and the reader got nothing. The translation is built by
  // copying the English report and replacing text in place, so every id, URL,
  // phone number and email is already carried over structurally -- a validation
  // error flags a discrepancy worth knowing about, not a document worth binning.
  // So it ships, and it ships carrying the list of what did not check out.
  const errors = validateChineseTranslation(translated, finalReport);
  return { translated, model, ms: Date.now() - started, validation_errors: errors };
}

async function runBusinessSearch(publicId: string, reportId: string, request: Record<string, unknown>): Promise<void> {
  if (active.has(publicId)) return;
  active.add(publicId);
  try {
    await db.updateReport(publicId, { status: 'running', error: null });
    if (!jobs.liveTypes().includes('gmap.scan')) throw new Error('Google Maps worker is offline');
    const timeoutMs = Math.min(Math.max(num(request.timeoutMs, 600_000), 60_000), 1_200_000);
    const keyword = str(request.keyword).trim();
    const place = str(request.place).trim();
    // Keep location-only searches working while a Mac mini may still be running
    // the previous worker, which required a non-empty keyword. Updated workers
    // use searchMode/originalPlace to preserve the proper field semantics.
    const locationOnly = !keyword && Boolean(place);
    const job = jobs.create('gmap.scan', {
      keyword: locationOnly ? place : keyword,
      place: locationOnly ? null : place || null,
      searchMode: locationOnly ? 'location_only' : undefined,
      originalPlace: locationOnly ? place : undefined,
      max: request.max,
      userId: request.userId,
    }, timeoutMs);
    await db.updateReport(publicId, { jobId: job.id });
    const settled = await jobs.wait(job.id, timeoutMs + 5_000);
    if (!settled || settled.status !== 'done') throw new Error(settled?.error ?? 'Google Maps scan did not finish');
    const scan = object(settled.result);
    const saved = object(scan.saved);
    const savedId = saved.reportId != null ? String(saved.reportId) : null;
    const durable = savedId ? await db.searchResult(savedId) : null;
    const companies = durable?.companies ?? rows(scan.businesses);
    const result = { search: durable?.report ?? scan, companies, scan_metadata: {
      blocked: scan.blocked, limited_view: scan.limitedView, capped: scan.capped,
      save_error: scan.saveError ?? null,
    } };
    const partial = Boolean(scan.saveError || !savedId);
    await db.updateReport(publicId, {
      status: partial ? 'partial' : 'completed', searchReportId: savedId,
      result, error: partial ? str(scan.saveError, 'Scan completed but database persistence was incomplete') : null,
      completed: true,
    });
  } catch (err) {
    await db.updateReport(publicId, { status: 'failed', error: (err as Error).message ?? String(err), completed: true }).catch(() => {});
  } finally {
    active.delete(publicId);
  }
}

type PersonResearchLaunch = {
  sourceReportId: string;
  company: Record<string, unknown>;
  person: Record<string, unknown>;
  requesterId: string | null;
  identityHints?: PersonIdentityHints;
  autoTriggered: boolean;
  selectionRule?: string;
};

/**
 * The sole launcher for both POST /api/person-research and the P01 child that
 * company research creates. Keeping this shared is deliberate: the automatic
 * brief must always enter the current VIP pipeline (Gemini/AGY + available
 * social scouts + independent audit), rather than preserving an older fork.
 */
async function launchPersonResearch(input: PersonResearchLaunch): Promise<db.PublishedReport> {
  const { sourceReportId, company, person, requesterId, autoTriggered } = input;
  const identityHints = input.identityHints ?? {};
  const personId = first(person, ['id']);
  if (autoTriggered) {
    const existing = await db.findPersonResearchReport(sourceReportId, personId);
    if (existing) {
      if ((existing.status === 'queued' || existing.status === 'running') && !active.has(existing.public_id)) {
        void runPersonResearch(existing.public_id, existing.id, company, person);
      }
      return existing;
    }
  }
  const personSnapshot = {
    id: personId,
    name: first(person, ['name']),
    role: first(person, ['role', 'current_role', 'position']),
    role_url: first(person, ['role_url', 'role_evidence_url', 'evidence_url']),
    relevance: first(person, ['relevance', 'why_relevant', 'outreach_relevance']),
    evidence_class: first(person, ['evidence_class', 'source_type']),
    personal_profile_url: directUrl(person.personal_profile_url) ?? null,
  };
  const request = {
    sourceReportId,
    personId,
    requesterId,
    emailProvided: Boolean(identityHints.email),
    mobileProvided: Boolean(identityHints.mobile),
    autoTriggered,
    ...(input.selectionRule ? { selectionRule: input.selectionRule } : {}),
    pipelineVersion: 'vip-gemini-fb-xai-v1',
    personSnapshot,
  };
  let report: db.PublishedReport;
  try {
    report = await db.createReport({
      type: 'person_research', title: first(person, ['name']) + ' VIP brief',
      userId: str(request.requesterId) || null, request, companyId: String(company.id ?? '') || null,
    });
  } catch (err) {
    const raced = autoTriggered ? await db.findPersonResearchReport(sourceReportId, personId) : null;
    if (!raced) throw err;
    report = raced;
  }
  if (report.status === 'queued' || report.status === 'running') {
    void runPersonResearch(report.public_id, report.id, company, person, identityHints);
  }
  return report;
}

async function startAutoPersonResearch(
  sourcePublicId: string,
  company: Record<string, unknown>,
  person: Record<string, unknown>,
  companyRequest: Record<string, unknown>,
): Promise<db.PublishedReport> {
  return launchPersonResearch({
    sourceReportId: sourcePublicId,
    company,
    person,
    requesterId: str(companyRequest.requesterId || companyRequest.userId) || null,
    autoTriggered: true,
    selectionRule: 'company_report_p01',
  });
}

async function runCompanyResearch(
  publicId: string,
  reportId: string,
  company: Record<string, unknown>,
  companyRequest: Record<string, unknown>,
): Promise<void> {
  if (active.has(publicId)) return;
  active.add(publicId);
  const parsedForLedger: Record<string, unknown>[] = [];
  // Why rounds produced nothing, and how many produced something. The count is
  // the load-bearing half: see publishOutcome.
  const failures: string[] = [];
  let produced = 0;
  let autoPersonResearch: Record<string, unknown> | null = null;
  const triggerAutoPersonResearch = async (): Promise<void> => {
    if (autoPersonResearch) return;
    const topPerson = highestRankedPerson(company, parsedForLedger);
    if (!topPerson) {
      // Say so. This used to return in silence, so a company report simply had no
      // VIP brief and nothing anywhere explained why.
      autoPersonResearch = {
        selection_rule: 'company_report_p01',
        not_started: 'No person had been validated at the time the people audit finished, so there was no P01 to research.',
      };
      return;
    }
    try {
      const child = await startAutoPersonResearch(publicId, company, topPerson, companyRequest);
      autoPersonResearch = {
        report_id: child.public_id,
        person_id: first(topPerson, ['id']),
        person_name: first(topPerson, ['name']),
        selection_rule: 'company_report_p01',
        started_before_company_completion: true,
      };
    } catch (err) {
      autoPersonResearch = {
        person_id: first(topPerson, ['id']),
        person_name: first(topPerson, ['name']),
        selection_rule: 'company_report_p01',
        start_error: (err as Error).message ?? String(err),
      };
    }
  };
  try {
    await db.updateReport(publicId, { status: 'running', error: null });
    await db.initResearchRun(reportId);

    // Round 03 takes the same company record the run was started with and crawls
    // Facebook on the mini's job queue. It reads nothing Round 01 or Round 02
    // produce, and it runs on a different machine down a different lane -- so
    // awaiting it in file order was buying nothing and costing its whole duration
    // (159s on the run this was measured against). Started here, it overlaps the
    // Gemini and ChatGPT rounds and is collected below, before the ledger is
    // built. `catch` is attached immediately so a rejection while nobody is
    // awaiting it cannot become an unhandled rejection.
    // Stamped inside the chain, not at collection: the round finishes while
    // Round 01 is still running, and `Date.now()` at the point we get round to
    // awaiting it would report the overlap as if Facebook had been slow.
    const r3started = Date.now();
    const r3Pending = round03Facebook(company)
      .then((value) => ({ ok: true as const, value, ms: Date.now() - r3started }))
      .catch((error: unknown) => ({ ok: false as const, error: error as Error, ms: Date.now() - r3started }));

    try {
      // Do not pin to the mini: it is opportunistic capacity and can be offline.
      // The gateway chooses a live mini when present and otherwise a ready container.
      const r1 = await ask('agy', round01Prompt(company), 420_000);
      if (r1.parsed) {
        for (const row of [...rows(r1.parsed.contacts), ...rows(r1.parsed.people), ...rows(r1.parsed.candidate_people), ...rows(r1.parsed.signals)]) row._round = 'round01';
        parsedForLedger.push(r1.parsed);
        produced += 1;
      } else failures.push(r1.parse_error ?? 'Round 01 returned no JSON object.');
      await db.saveRound(reportId, 'round01', r1, r1.parsed ? 'completed' : 'invalid_output', { model: r1.model, engine: r1.engine, ms: r1.ms });
    } catch (err) {
      failures.push((err as Error).message ?? String(err));
      await db.saveRound(reportId, 'round01', { error: (err as Error).message }, 'failed', { model: 'agy' });
    }

    const r1Context = parsedForLedger[0] ?? { contacts: [], people: [], signals: [] };
    const round02: Record<string, unknown> = { calls: {} };
    const KINDS = ['contacts', 'people', 'signals'] as const;
    // The three audits read the same Round 01 context and write nothing the other
    // two read: they were serial only because they were written as a loop. They
    // now go out together.
    //
    // This is safe now and was not before. The mini runs one ChatGPT lane per
    // signed-in account -- three of them -- so three calls land on three accounts
    // in three ego lite task spaces. Sent concurrently into a single lane they
    // would have queued, and queue.ts refuses on ESTIMATED WAIT rather than making
    // a caller sit: the third call would have come back 429 instead of slow. Width
    // has to exist before fan-out is an improvement.
    const settled = await Promise.all(KINDS.map(async (kind) => {
      try {
        return { kind, call: await ask('chatgpt', round02Prompt(kind, company, r1Context), 300_000) };
      } catch (err) {
        return { kind, error: err as Error };
      }
    }));
    // Collected in KINDS order, not completion order. `buildLedger` dedupes across
    // sources and first-seen wins, so letting whichever call finished first land
    // first would make the published rows depend on network timing.
    for (const outcome of settled) {
      const { kind } = outcome;
      if (outcome.error) {
        failures.push(outcome.error.message ?? String(outcome.error));
        object(round02.calls)[kind] = { error: outcome.error.message };
        continue;
      }
      const call = outcome.call;
      object(round02.calls)[kind] = call;
      if (call.parsed) {
        for (const row of [...rows(call.parsed[kind]), ...(kind === 'people' ? rows(call.parsed.candidate_people) : [])]) row._round = 'round02';
        parsedForLedger.push(call.parsed);
        produced += 1;
      } else failures.push(call.parse_error ?? 'Round 02 ' + kind + ' returned no JSON object.');
    }
    // Was triggered the moment the people audit landed, to overlap the signals
    // call. All three now finish together, so there is no longer an earlier
    // moment to seize -- it still starts before the company report completes.
    await triggerAutoPersonResearch();
    const r2Ok = Object.values(object(round02.calls)).some((v) => object(v).parsed);
    await db.saveRound(reportId, 'round02', round02, r2Ok ? (failures.length ? 'partial' : 'completed') : 'failed', { model: 'chatgpt', split_calls: 3 });

    // Collected, not started, here: by now it has usually already finished.
    const r3Settled = await r3Pending;
    if (r3Settled.ok) {
      const r3 = r3Settled.value;
      // Reaching a verdict is this round doing its job, so a confirmed "this
      // business has no Facebook page" counts as output exactly as a page full of
      // contacts does. Only a lane that was not there to ask produces nothing.
      if (r3.status !== 'skipped') produced += 1;
      if (r3.parsed) parsedForLedger.push(r3.parsed);
      else if (r3.status === 'skipped') failures.push(str(r3.artifact.access_evidence));
      await db.saveRound(reportId, 'round03', r3.artifact, r3.status, {
        model: 'fb.company@mini', engine: 'fb-recon', ms: r3Settled.ms,
        access_mode: str(r3.artifact.access_mode) || null,
      });
    } else {
      failures.push(r3Settled.error.message ?? String(r3Settled.error));
      await db.saveRound(reportId, 'round03', { error: r3Settled.error.message }, 'failed', { model: 'fb.company@mini' });
    }

    const ledger = buildLedger(company, parsedForLedger);
    let finalReport: Record<string, unknown> = { ...ledger, summary: null, outreach_angles: [], synthesis_mode: 'validated_ledger_fallback' };
    let r4Artifact: Record<string, unknown>;
    try {
      const r4 = await ask('agy', round04Prompt(ledger), 420_000);
      // Repair formatting, then judge integrity, then publish the repaired
      // object -- not the raw one, and not nothing.
      const r4Final = r4.parsed ? normaliseUrls(r4.parsed) : null;
      const fidelityErrors = r4Final ? validateFinal(r4Final, ledger) : [r4.parse_error ?? 'invalid final output'];
      if (r4Final && !fidelityErrors.length) {
        finalReport = { ...r4Final, synthesis_mode: 'gemini_validated' };
        produced += 1;
      } else {
        // The rows stay canonical -- an integrity failure means the model altered
        // the record, and the ledger is what we trust. But its PROSE is not the
        // record, and deleting the summary as collateral left the reader with a
        // wall of rows and no reading of them. Keep it, labelled unverified,
        // beside the errors that made it unverified.
        if (r4Final) {
          finalReport = {
            ...finalReport,
            summary: r4Final.summary ?? null,
            outreach_angles: r4Final.outreach_angles ?? [],
            synthesis_mode: 'validated_ledger_with_unverified_summary',
            synthesis_warning: 'Rows below are the validated ledger. The summary and outreach angles come from a synthesis that failed fidelity checks and are unverified: '
              + fidelityErrors.join('; '),
            synthesis_fidelity_errors: fidelityErrors,
          };
        }
        failures.push('Final synthesis rejected: ' + fidelityErrors.join(', ') + '.');
      }
      r4Artifact = { ...r4, fidelity_errors: fidelityErrors, fallback_used: fidelityErrors.length > 0 };
      await db.saveRound(reportId, 'round04', r4Artifact, fidelityErrors.length ? 'rejected_fallback_used' : 'completed', { model: r4.model, engine: r4.engine, ms: r4.ms });
    } catch (err) {
      failures.push((err as Error).message ?? String(err));
      r4Artifact = { error: (err as Error).message, fallback_used: true };
      await db.saveRound(reportId, 'round04', r4Artifact, 'failed_fallback_used', { model: 'agy' });
    }
    if (autoPersonResearch) finalReport = { ...finalReport, auto_person_research: autoPersonResearch };
    await db.saveFinal(reportId, ledger, finalReport);
    try {
      const cn = await translateChinese(finalReport);
      await db.saveTranslation(reportId, cn.translated, {
        language: 'zh-CN', model: cn.model, ms: cn.ms,
        status: cn.validation_errors.length ? 'completed_with_discrepancies' : 'completed',
        ...(cn.validation_errors.length ? { validation_errors: cn.validation_errors } : {}),
      });
      // Publishing an imperfect translation is not the same as publishing a clean
      // one, so the report says so -- but the Chinese text is delivered either way.
      if (cn.validation_errors.length) {
        failures.push('Chinese translation published with discrepancies: ' + cn.validation_errors.join('; '));
      }
    } catch (err) {
      // Do not silently label an English-only dossier as bilingual. The English
      // evidence report stays publishable, but callers receive a visible gap and
      // the durable run records why Chinese content is not present.
      //
      // Recorded as a `failures` entry rather than a `hadFailure` flag so it runs
      // through publishOutcome with every other gap: a missing translation is a
      // reason for `partial`, and only "no round produced anything" is `failed`.
      failures.push('Chinese translation failed: ' + ((err as Error).message ?? String(err)));
      await db.saveTranslation(reportId, {}, {
        language: 'zh-CN', model: process.env.TRANSLATION_MODEL?.trim() || 'step-3.7-flash',
        status: 'failed', error: (err as Error).message ?? String(err),
      });
    }
    const outcome = publishOutcome(produced, failures);
    await db.updateReport(publicId, {
      status: outcome.status, result: finalReport, error: outcome.error, completed: true,
    });
  } catch (err) {
    await db.updateReport(publicId, { status: 'failed', error: (err as Error).message ?? String(err), completed: true }).catch(() => {});
  } finally {
    active.delete(publicId);
  }
}

async function runPersonResearch(
  publicId: string,
  reportId: string,
  company: Record<string, unknown>,
  person: Record<string, unknown>,
  identityHints: PersonIdentityHints = {},
): Promise<void> {
  if (active.has(publicId)) return;
  active.add(publicId);
  let hadFailure = false;
  const parsedForLedger: Record<string, unknown>[] = [];
  try {
    await db.updateReport(publicId, { status: 'running', error: null });
    await db.initPersonResearchRun(reportId);
    let discoveryMetadata: Record<string, unknown> = { status: 'failed', model: process.env.VIP_GEMINI_MODEL?.trim() || 'agy' };
    try {
      const discovery = await ask(process.env.VIP_GEMINI_MODEL?.trim() || 'agy', personDiscoveryPrompt(company, person, identityHints), 420_000);
      if (discovery.parsed) {
        const redacted = redactIdentityHintsFromDiscovery(discovery.parsed, identityHints);
        for (const row of [...rows(redacted.contacts), ...rows(redacted.facts), ...rows(redacted.signals)]) row._round = 'person_discovery';
        parsedForLedger.push(redacted);
        discoveryMetadata = { status: 'completed', model: discovery.model, engine: discovery.engine, ms: discovery.ms };
      } else hadFailure = true;
      if (!discovery.parsed) discoveryMetadata = { status: 'invalid_output', model: discovery.model, engine: discovery.engine, ms: discovery.ms };
    } catch (err) {
      hadFailure = true;
      discoveryMetadata = { status: 'failed', model: process.env.VIP_GEMINI_MODEL?.trim() || 'agy', error: (err as Error).message ?? String(err) };
    }

    const [facebookScout, xScout] = await Promise.all([
      runPersonScout('facebook', company, person),
      runPersonScout('x', company, person),
    ]);
    for (const [round, scout] of [['facebook_scout', facebookScout], ['xai_x_scout', xScout]] as const) {
      if (scout.failed) hadFailure = true;
      if (!scout.parsed) continue;
      for (const row of [...rows(scout.parsed.contacts), ...rows(scout.parsed.facts), ...rows(scout.parsed.signals)]) row._round = round;
      parsedForLedger.push(scout.parsed);
    }

    let auditMetadata: Record<string, unknown> = { status: 'failed', model: 'chatgpt' };
    try {
      const audit = await ask('chatgpt', personAuditPrompt(company, person, parsedForLedger[0] ?? {}), 300_000);
      if (audit.parsed) {
        const redacted = redactIdentityHintsFromDiscovery(audit.parsed, identityHints);
        for (const row of [...rows(redacted.contacts), ...rows(redacted.facts), ...rows(redacted.signals)]) row._round = 'person_independent_audit';
        parsedForLedger.push(redacted);
        auditMetadata = { status: 'completed', model: audit.model, engine: audit.engine, ms: audit.ms };
      } else hadFailure = true;
      if (!audit.parsed) auditMetadata = { status: 'invalid_output', model: audit.model, engine: audit.engine, ms: audit.ms };
    } catch (err) {
      hadFailure = true;
      auditMetadata = { status: 'failed', model: 'chatgpt', error: (err as Error).message ?? String(err) };
    }

    const ledger = buildPersonLedger(company, person, parsedForLedger);
    await db.savePersonResearchRun(reportId, {
      discovery: { contacts: ledger.contacts, facts: ledger.facts, signals: ledger.signals },
      ledger,
      status: { discovery: discoveryMetadata.status, facebook_scout: facebookScout.metadata.status, xai_x_scout: xScout.metadata.status, independent_audit: auditMetadata.status },
      metadata: { discovery: discoveryMetadata, facebook_scout: facebookScout.metadata, xai_x_scout: xScout.metadata, independent_audit: auditMetadata },
    });
    let finalReport: Record<string, unknown> = { ...ledger, summary: null, research_angles: [], synthesis_mode: 'validated_ledger_fallback' };
    let synthesisMetadata: Record<string, unknown> = { status: 'failed', model: 'chatgpt' };
    try {
      const synthesis = await ask('chatgpt', personSynthesisPrompt(ledger), 300_000);
      // Repair formatting, then judge integrity, then publish the repaired
      // object -- not the raw one, and not nothing.
      const personFinal = synthesis.parsed ? normaliseUrls(synthesis.parsed) : null;
      const fidelityErrors = personFinal ? validatePersonFinal(personFinal, ledger) : [synthesis.parse_error ?? 'invalid final output'];
      if (personFinal && !fidelityErrors.length) {
        finalReport = { ...personFinal, synthesis_mode: 'chatgpt_validated' };
      } else {
        hadFailure = true;
        // Same as the company report: keep the validated rows, keep the prose,
        // and say which of the two is unverified rather than binning the prose.
        if (personFinal) {
          finalReport = {
            ...finalReport,
            summary: personFinal.summary ?? null,
            research_angles: personFinal.research_angles ?? [],
            synthesis_mode: 'validated_ledger_with_unverified_summary',
            synthesis_warning: 'Facts and contacts below are the validated ledger. The summary and research angles come from a synthesis that failed fidelity checks and are unverified: '
              + fidelityErrors.join('; '),
            synthesis_fidelity_errors: fidelityErrors,
          };
        }
      }
      synthesisMetadata = { status: fidelityErrors.length ? 'rejected_fallback_used' : 'completed', model: synthesis.model, engine: synthesis.engine, ms: synthesis.ms, fidelity_errors: fidelityErrors };
    } catch (err) {
      hadFailure = true;
      synthesisMetadata = { status: 'failed', model: 'chatgpt', error: (err as Error).message ?? String(err) };
    }
    await db.savePersonResearchRun(reportId, {
      synthesis: { synthesis_mode: finalReport.synthesis_mode, contact_count: rows(finalReport.contacts).length, fact_count: rows(finalReport.facts).length, signal_count: rows(finalReport.signals).length },
      ledger,
      finalReport,
      status: { discovery: discoveryMetadata.status, facebook_scout: facebookScout.metadata.status, xai_x_scout: xScout.metadata.status, independent_audit: auditMetadata.status, synthesis: synthesisMetadata.status },
      metadata: { discovery: discoveryMetadata, facebook_scout: facebookScout.metadata, xai_x_scout: xScout.metadata, independent_audit: auditMetadata, synthesis: synthesisMetadata },
      completed: true,
    });
    await db.updateReport(publicId, {
      status: hadFailure ? 'partial' : 'completed', result: finalReport,
      error: hadFailure ? 'VIP brief completed with a research or validation gap; only validated public-professional evidence is published.' : null,
      completed: true,
    });
  } catch (err) {
    await db.updateReport(publicId, { status: 'failed', error: (err as Error).message ?? String(err), completed: true }).catch(() => {});
  } finally {
    active.delete(publicId);
  }
}

async function publicDetail(report: db.PublishedReport): Promise<Record<string, unknown>> {
  if (report.report_type === 'business_search') {
    const search = report.source_search_report_id ? await db.searchResult(report.source_search_report_id) : null;
    return { report, search: search?.report ?? report.result?.search ?? null, companies: search?.companies ?? report.result?.companies ?? [] };
  }
  const run = report.report_type === 'company_research' ? await db.researchRun(report.id) : null;
  const chinese = object(run?.translated_report);
  return {
    report,
    final: report.result,
    // Kept separate from final so existing EN clients retain their exact shape.
    final_cn: Object.keys(chinese).length ? chinese : null,
    translation: report.report_type === 'company_research' ? object(run?.translation_metadata) : null,
  };
}

async function personResearchInput(report: db.PublishedReport): Promise<{ company: Record<string, unknown>; person: Record<string, unknown> } | null> {
  const request = object(report.request);
  const sourceId = str(request.sourceReportId);
  const personId = str(request.personId);
  if (!sourceId || !personId || !report.company_id) return null;
  const [source, company] = await Promise.all([db.getReport(sourceId), db.getCompany(report.company_id)]);
  if (!source || source.report_type !== 'company_research' || !company) return null;
  const person = rows(source.result?.people).find((row) => first(row, ['id']) === personId) ?? object(request.personSnapshot);
  if (first(person, ['id']) !== personId || !first(person, ['name']) || !first(person, ['role', 'current_role', 'position'])) return null;
  return person ? { company, person } : null;
}

/** A requester opening/polling a queued report also revives work after a deploy. */
async function ensureRunning(report: db.PublishedReport): Promise<void> {
  if ((report.status !== 'queued' && report.status !== 'running') || active.has(report.public_id)) return;
  if (report.report_type === 'business_search') {
    void runBusinessSearch(report.public_id, report.id, object(report.request));
    return;
  }
  if (report.report_type === 'person_research') {
    const input = await personResearchInput(report);
    if (input) void runPersonResearch(report.public_id, report.id, input.company, input.person);
    return;
  }
  if (report.company_id) {
    const company = await db.getCompany(report.company_id);
    if (company) void runCompanyResearch(report.public_id, report.id, company, object(report.request));
  }
}

/** handlePublic sits outside the authed router, so it has no Ctx to answer with. */
function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Same reason, for the request side. Capped because this route is unauthenticated. */
async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 8192) throw new Error('request body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handlePublic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  const pageMatch = /^\/r\/([A-Za-z0-9_-]{20})$/.exec(p);
  const jsonMatch = /^\/public\/reports\/([A-Za-z0-9_-]{20})$/.exec(p);
  const researchMatch = /^\/public\/reports\/([A-Za-z0-9_-]{20})\/research$/.exec(p);
  const personResearchMatch = /^\/public\/reports\/([A-Za-z0-9_-]{20})\/person-research$/.exec(p);

  // Start a company dossier from the shared report page.
  //
  // WHY THIS IS NOT /api/company-research. That route is behind the bearer gate,
  // and this page is deliberately outside it — the opaque id IS the capability.
  // Putting LAB_TOKEN in a public page to reach the authed route would hand a
  // root shell on the lab to anyone holding a share link.
  //
  // The capability is scoped instead of borrowed: the companyId must already be
  // one this report lists. Holding the link lets you research the businesses in
  // it, and nothing else — an arbitrary id from elsewhere is refused.
  if ((req.method ?? 'GET') === 'POST' && researchMatch) {
    if (!db.configured()) return sendJson(res, 503, { error: 'reports are not configured' }), true;
    const parent = await db.getReport(researchMatch[1]!);
    if (!parent || parent.report_type !== 'business_search') {
      return sendJson(res, 404, { error: 'report not found' }), true;
    }
    const body = await readBody(req);
    const companyId = str(body.companyId || body.company_id).trim();
    const listed = parent.source_search_report_id
      ? await db.searchResult(parent.source_search_report_id)
      : null;
    const company = (listed?.companies ?? []).find((c) => String(c.id) === companyId);
    if (!company) {
      return sendJson(res, 404, { error: 'that company is not listed in this report', companyId }), true;
    }
    // One dossier per company per report. A second click — or a shared link
    // opened by three people at once — should land on the run already going,
    // not start a fourth costing four more rounds of deep research.
    const existing = await db.findCompanyReport(companyId);
    if (existing) return sendJson(res, 200, { report: envelope(req, existing) }), true;
    const request = { companyId, requesterId: 'report:' + parent.public_id };
    const report = await db.createReport({
      type: 'company_research', title: str(company.name, 'Company') + ' intelligence report',
      userId: request.requesterId, request, companyId,
    });
    void runCompanyResearch(report.public_id, report.id, company);
    return sendJson(res, 202, { report: envelope(req, report) }), true;
  }

  // Start a VIP brief for any person listed in a shared company dossier.
  //
  // Same capability rule as /research above: the personId must already be one
  // this dossier lists, so holding the link lets you brief the people named in
  // it and nobody else. The authed /api/person-research keeps its own route
  // because it accepts identity resolvers (email/mobile), and that is exactly
  // the input an unauthenticated page must never be able to supply.
  if ((req.method ?? 'GET') === 'POST' && personResearchMatch) {
    if (!db.configured()) return sendJson(res, 503, { error: 'reports are not configured' }), true;
    const parent = await db.getReport(personResearchMatch[1]!);
    if (!parent || parent.report_type !== 'company_research' || !parent.company_id
      || (parent.status !== 'completed' && parent.status !== 'partial')) {
      return sendJson(res, 404, { error: 'completed company research report not found' }), true;
    }
    const body = await readBody(req);
    const personId = str(body.personId || body.person_id).trim();
    const person = rows(parent.result?.people).find((row) => first(row, ['id']) === personId);
    const company = await db.getCompany(parent.company_id);
    if (!person || !company) {
      return sendJson(res, 404, { error: 'that person is not listed in this report', personId }), true;
    }
    // One brief per person per dossier, for the same reason the authed route
    // joins instead of starting a second run: P01 already has an automatic
    // brief, and a shared link opened by three people must not start three.
    const existing = await db.findPersonBrief(parent.public_id, personId);
    if (existing) return sendJson(res, 200, { report: envelope(req, existing) }), true;
    const report = await launchPersonResearch({
      sourceReportId: parent.public_id,
      company,
      person,
      requesterId: 'report:' + parent.public_id,
      identityHints: {},
      autoTriggered: false,
    });
    return sendJson(res, 202, { report: envelope(req, report) }), true;
  }

  if ((req.method ?? 'GET') !== 'GET' || (!pageMatch && !jsonMatch)) return false;
  if (!db.configured()) {
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(ui.notFoundPage());
    return true;
  }
  const report = await db.getReport((pageMatch ?? jsonMatch)![1]!);
  if (!report) {
    if (jsonMatch) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'report not found' }));
    } else {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(ui.notFoundPage());
    }
    return true;
  }
  await ensureRunning(report);
  if (jsonMatch) {
    const payload = JSON.stringify(await publicDetail(report));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(payload);
    return true;
  }
  let html: string;
  if (report.report_type === 'business_search') {
    const search = report.source_search_report_id ? await db.searchResult(report.source_search_report_id) : null;
    html = ui.searchPage(report, { report: search?.report ?? object(report.result?.search), companies: search?.companies ?? rows(report.result?.companies) });
  } else if (report.report_type === 'person_research') html = ui.personPage(report);
  else {
    const run = await db.researchRun(report.id);
    const chinese = object(run?.translated_report);
    html = ui.companyPage(report, Object.keys(chinese).length ? chinese : null, await db.listPersonBriefs(report.public_id));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
  res.end(html);
  return true;
}

/** Authenticated product API routes. */
export async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  const method = req.method ?? 'GET';
  if (!p.startsWith('/api/business-search') && !p.startsWith('/api/company-research') && !p.startsWith('/api/person-research') && p !== '/api/reports') return false;
  if (!db.configured()) {
    ctx.json(res, 503, { error: 'report database is not configured; link DATABASE_URL to the Railway service' });
    return true;
  }

  if (method === 'GET' && p === '/api/reports') {
    const rawType = url.searchParams.get('type');
    const rawStatus = url.searchParams.get('status');
    const type = rawType === 'business_search' || rawType === 'company_research' || rawType === 'person_research' ? rawType : null;
    const allowedStatuses = new Set(['queued', 'running', 'completed', 'partial', 'failed']);
    const status = allowedStatuses.has(rawStatus ?? '') ? rawStatus as db.ReportStatus : null;
    const limit = Math.min(Math.max(Math.round(Number(url.searchParams.get('limit') ?? 40) || 40), 1), 100);
    const offset = Math.max(Math.round(Number(url.searchParams.get('offset') ?? 0) || 0), 0);
    const listed = await db.listReports({ type, status, limit, offset });
    const reports = listed.reports.map((report) => {
      const result = object(report.result);
      const finalEntity = object(result.entity);
      const companies = rows(result.companies);
      return {
        ...envelope(req, report),
        preview: report.report_type === 'company_research' ? {
          company_id: report.company_id,
          entity: finalEntity,
          summary: str(result.summary) || null,
          contacts: rows(result.contacts).length,
          people: rows(result.people).length,
          signals: rows(result.signals ?? result.business_signals).length,
        } : report.report_type === 'person_research' ? {
          company_id: report.company_id,
          person: object(result.person),
          summary: str(result.summary) || null,
          facts: rows(result.facts).length,
          signals: rows(result.signals).length,
        } : {
          keyword: str(object(report.request).keyword) || null,
          place: str(object(report.request).place) || null,
          companies: companies.length || Number(object(result.search).found ?? 0) || null,
        },
      };
    });
    ctx.json(res, 200, { reports, total: listed.total, limit, offset });
    return true;
  }

  if (method === 'POST' && p === '/api/business-search') {
    const body = await ctx.readJson(req);
    const keyword = str(body.keyword).trim();
    const place = str(body.place || body.location).trim();
    if (!keyword && !place) {
      ctx.json(res, 400, { error: 'keyword or place/location is required' });
      return true;
    }
    const max = Math.min(Math.max(Math.round(num(body.max, 100)), 1), 200);
    const request = { keyword, place: place || null, max, userId: str(body.requesterId || body.userId) || null, timeoutMs: num(body.timeoutMs, 600_000) };
    const title = keyword
      ? `${keyword}${place ? ' in ' + place : ''}`
      : `Businesses in ${place}`;
    const report = await db.createReport({ type: 'business_search', title, userId: str(request.userId) || null, request });
    void runBusinessSearch(report.public_id, report.id, request);
    ctx.json(res, 202, { report: envelope(req, report) });
    return true;
  }

  if (method === 'POST' && p === '/api/company-research') {
    const body = await ctx.readJson(req);
    const companyId = str(body.companyId || body.company_id).trim();
    if (!/^\d+$/.test(companyId)) {
      ctx.json(res, 400, { error: 'companyId is required and must be a company id returned by a business-search report' });
      return true;
    }
    const company = await db.getCompany(companyId);
    if (!company) {
      ctx.json(res, 404, { error: 'company not found', companyId });
      return true;
    }
    const request = { companyId, requesterId: str(body.requesterId || body.userId) || null };
    const report = await db.createReport({
      type: 'company_research', title: str(company.name, 'Company') + ' intelligence report',
      userId: str(request.requesterId) || null, request, companyId,
    });
    void runCompanyResearch(report.public_id, report.id, company, request);
    ctx.json(res, 202, { report: envelope(req, report) });
    return true;
  }

  if (method === 'POST' && p === '/api/person-research') {
    const body = await ctx.readJson(req);
    const sourceReportId = str(body.companyResearchId || body.company_research_id).trim();
    const personId = str(body.personId || body.person_id).trim();
    const email = str(body.email).trim();
    const mobile = str(body.mobile ?? body.mobileNumber ?? body.phone).trim();
    if (!/^[A-Za-z0-9_-]{20}$/.test(sourceReportId) || !personId) {
      ctx.json(res, 400, { error: 'companyResearchId and personId from a completed company report are required' });
      return true;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.json(res, 400, { error: 'email must be a valid optional identity hint' });
      return true;
    }
    if (mobile && !normalizeMobileHint(mobile)) {
      ctx.json(res, 400, { error: 'mobile must contain 7 to 15 digits and may use +, spaces, parentheses, periods, or hyphens' });
      return true;
    }
    const source = await db.getReport(sourceReportId);
    if (!source || source.report_type !== 'company_research' || (source.status !== 'completed' && source.status !== 'partial') || !source.company_id) {
      ctx.json(res, 404, { error: 'completed company research report not found', companyResearchId: sourceReportId });
      return true;
    }
    const person = rows(source.result?.people).find((row) => first(row, ['id']) === personId);
    const company = await db.getCompany(source.company_id);
    if (!person || !company) {
      ctx.json(res, 404, { error: 'validated person or source company not found', personId });
      return true;
    }
    // One brief per person per company report. The portal shows a VIP button on
    // every validated person, and P01 already has an automatic brief -- so the
    // first thing most people click is a person who is already being researched.
    // Joining that run is right; starting a second four-round pass is not.
    const running = await db.findPersonBrief(sourceReportId, personId);
    if (running) {
      ctx.json(res, 200, { report: envelope(req, running) });
      return true;
    }
    const report = await launchPersonResearch({
      sourceReportId,
      company,
      person,
      requesterId: str(body.requesterId || body.userId) || null,
      identityHints: { ...(email ? { email } : {}), ...(mobile ? { mobile } : {}) },
      autoTriggered: false,
    });
    ctx.json(res, 202, { report: envelope(req, report) });
    return true;
  }

  const one = /^\/api\/(business-search|company-research|person-research)\/([A-Za-z0-9_-]{20})$/.exec(p);
  if (method === 'GET' && one) {
    const report = await db.getReport(one[2]!);
    const expected = one[1] === 'business-search' ? 'business_search' : one[1] === 'person-research' ? 'person_research' : 'company_research';
    if (!report || report.report_type !== expected) {
      ctx.json(res, 404, { error: 'report not found' });
      return true;
    }
    await ensureRunning(report);
    const detail = await publicDetail(report);
    const run = report.report_type === 'company_research'
      ? await db.researchRun(report.id)
      : report.report_type === 'person_research' ? await db.personResearchRun(report.id) : null;
    ctx.json(res, 200, { report: envelope(req, report), data: detail, research_run: run });
    return true;
  }

  ctx.json(res, 405, { error: 'method not allowed' });
  return true;
}
