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
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[] : [];

function origin(req: http.IncomingMessage): string {
  const forwarded = str(req.headers['x-forwarded-proto']);
  const proto = forwarded.split(',')[0]?.trim() || 'http';
  return proto + '://' + (req.headers.host ?? 'localhost');
}

function envelope(req: http.IncomingMessage, report: db.PublishedReport): Record<string, unknown> {
  const base = origin(req);
  const resource = report.report_type === 'business_search' ? 'business-search' : 'company-research';
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

function directUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (/google\.[^/]+\/search|bing\.com\/search|duckduckgo\.com/i.test(url.href)) return null;
    // A bare domain is usually the exact failure mode where a model names an
    // organisation instead of the page that supports the field.
    if ((url.pathname === '/' || !url.pathname) && !/google\.com\/maps/i.test(url.href)) return null;
    return url.href;
  } catch {
    return null;
  }
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
      const evidence = directUrl(first(row, ['evidence_url', 'source_url', 'url']));
      const raw = first(row, ['value_as_published', 'value', 'raw_value', 'contact']);
      if (!evidence || !raw) continue;
      const normalized = first(row, ['normalized_value', 'normalized']) || raw;
      const purpose = first(row, ['purpose', 'channel', 'type']) || 'Business contact';
      const key = normalized.toLowerCase() + '|' + purpose.toLowerCase();
      if (!found.has(key)) found.set(key, {
        id: id('contact', [normalized, purpose]), purpose, value_as_published: raw,
        normalized_value: normalized,
        current_status: first(row, ['current_status', 'status']) || 'published',
        evidence_class: first(row, ['evidence_class', 'source_type']) || 'unclassified',
        evidence_url: evidence,
        source_date: row.source_date ?? row.visible_source_date ?? null,
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 24);
}

function collectPeople(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.people)) {
      const evidence = directUrl(first(row, ['role_evidence_url', 'evidence_url', 'role_url', 'source_url']));
      const name = first(row, ['name']);
      const role = first(row, ['current_role', 'role', 'position']);
      if (!evidence || !name || !role) continue;
      const key = name.toLowerCase() + '|' + role.toLowerCase();
      if (!found.has(key)) found.set(key, {
        id: id('person', [name, role]), name, role,
        relevance: first(row, ['relevance', 'why_relevant', 'outreach_relevance']),
        evidence_class: first(row, ['evidence_class', 'source_type']) || 'unclassified',
        role_url: evidence,
        personal_profile_url: directUrl(row.personal_profile_url) ?? null,
        source_date: row.source_date ?? row.visible_source_date ?? null,
        introduced_by: first(row, ['introduced_by', '_round']) || null,
      });
    }
  }
  return [...found.values()].slice(0, 16);
}

function collectSignals(sources: Record<string, unknown>[]): Record<string, unknown>[] {
  const found = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const row of rows(source.signals ?? source.business_signals ?? source.independent_signals)) {
      const evidence = directUrl(first(row, ['evidence_url', 'source_url', 'url']));
      const fact = first(row, ['fact', 'signal', 'description']);
      if (!evidence || !fact) continue;
      const key = fact.toLowerCase().slice(0, 180) + '|' + evidence;
      if (!found.has(key)) found.set(key, {
        id: id('signal', [fact, evidence]), date: row.date ?? row.visible_source_date ?? null,
        fact, evidence_class: first(row, ['evidence_class', 'source_type', 'source_class']) || 'unclassified',
        evidence_url: evidence,
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
  const signals = collectSignals(all);
  const conflicts = parsed.flatMap((p) => rows(p.conflicts ?? p.conflicts_and_unknowns)).slice(0, 12);
  return {
    entity: {
      company_id: String(company.id ?? ''), name: company.name, category: company.category,
      address: company.address, phone: company.phone, website: company.website,
      maps_url: company.maps_url, rating: company.rating, reviews: company.reviews,
    },
    contacts, people, signals, conflicts_and_unknowns: conflicts,
    validation: {
      policy: 'Only rows with a raw direct HTTPS evidence URL are retained. Final synthesis may not add rows.',
      contact_count: contacts.length, people_count: people.length, signal_count: signals.length,
    },
  };
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
  const ledgerContacts = rows(ledger.contacts);
  const ledgerPeople = rows(ledger.people);
  if (!sameSet(finalContacts.map((r) => r.id), ledgerContacts.map((r) => r.id))) errors.push('contact id set changed');
  if (!sameSet(finalPeople.map((r) => r.id), ledgerPeople.map((r) => r.id))) errors.push('people id set changed');
  const allowedUrls = new Set<string>();
  const collectAllowed = (value: unknown): void => {
    if (typeof value === 'string' && /^https:\/\//.test(value)) {
      try { allowedUrls.add(new URL(value).href); } catch { /* malformed URLs are caught by the ledger filter */ }
    } else if (Array.isArray(value)) value.forEach(collectAllowed);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collectAllowed);
  };
  collectAllowed(ledger);
  const visit = (value: unknown): void => {
    if (typeof value === 'string' && /^https:\/\//.test(value) && !allowedUrls.has(new URL(value).href)) errors.push('new URL: ' + value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(final);
  return [...new Set(errors)];
}

function companyBaseline(company: Record<string, unknown>): string {
  return JSON.stringify({
    id: String(company.id ?? ''), name: company.name, category: company.category,
    address: company.address, phone: company.phone, website: company.website,
    maps_url: company.maps_url, rating: company.rating, reviews: company.reviews,
  });
}

function round01Prompt(company: Record<string, unknown>): string {
  return `You are Round 01 of a business lead-enrichment test. Research this exact company as of ${new Date().toISOString().slice(0, 10)}.
IMMUTABLE GOOGLE MAPS INPUT: ${companyBaseline(company)}
Find complete public company contacts and decision-relevant people. Inspect exact official contact, campaign/subscription, careers, team, partner/vendor, legal and reputable independent pages.
Rules: every retained row needs a raw full https:// evidence URL; company pages are first_party; do not infer emails/profiles/dates; no negative claims from search absence; do not explain conflicts without evidence; source date is null unless visibly published.
Return exactly one compact JSON object in one fenced code block with arrays contacts, people, signals, conflicts_and_unknowns. Contact fields: purpose,value_as_published,normalized_value,current_status,evidence_class,evidence_url,source_date. People: name,current_role,relevance,evidence_class,role_evidence_url,personal_profile_url,source_date. Signals: date,fact,evidence_class,evidence_url,outreach_use. Max 20 contacts, 12 people, 10 signals. No prose outside JSON.`;
}

function round02Prompt(kind: 'contacts' | 'people' | 'signals', company: Record<string, unknown>, r1: Record<string, unknown>): string {
  const schemas = {
    contacts: 'contacts: purpose,value_as_published,normalized_value,current_status,evidence_class,evidence_url,source_date',
    people: 'people: name,current_role,relevance,evidence_class,role_evidence_url,personal_profile_url,source_date',
    signals: 'signals: date,fact,evidence_class,evidence_url,outreach_use',
  };
  return `You are ChatGPT Round 02 auditing Gemini Round 01 for ${str(company.name)}. Do fresh web research; Round 01 is untrusted.
COMPANY BASELINE: ${companyBaseline(company)}
ROUND 01 PARSED LEADS: ${JSON.stringify(r1).slice(0, 28_000)}
Focus only on ${kind}. Confirm, correct, reject and add missed evidence. For contacts inspect subscription/campaign/careers/vendor pages. For people prioritize CEO, commercial, partnerships, procurement, operations and HR. For signals use direct issuer or specific company pages.
Return exactly one compact JSON object inside one fenced code block with ${schemas[kind]}. Every URL must be a literal raw full https:// string inside JSON, never a Markdown link label. No inferred emails or personal URLs. Search snippets and crawl dates are not evidence. Use null when unknown. Max ${kind === 'contacts' ? 20 : kind === 'people' ? 12 : 10} rows and no prose outside JSON.`;
}

function round03Prompt(company: Record<string, unknown>): string {
  return `You are Meta/Muse Round 03 for ${str(company.name)}. First determine whether this exact run can inspect live current Facebook or Instagram pages. Supplied company baseline: ${companyBaseline(company)}
Return exactly one compact JSON object in a fenced code block: {"access_mode":"live_meta_pages|public_web_only|no_live_access","access_evidence":"...","contacts":[],"people":[],"signals":[],"search_gaps":[]}.
Only fill evidence arrays when access_mode is live_meta_pages and each row has a directly observed raw https:// Meta evidence URL. Otherwise leave all evidence arrays empty. Never use model memory, snippets, guessed handles or supplied candidate URLs as evidence.`;
}

function round04Prompt(ledger: Record<string, unknown>): string {
  return `You are Gemini Round 04. Write a concise final business-intelligence synthesis using only this validated ledger: ${JSON.stringify(ledger)}
Return exactly one JSON object in a fenced code block with keys summary (max 120 words), outreach_angles (max 5 short strings), entity, contacts, people, signals, conflicts_and_unknowns. Copy entity/contacts/people/signals/conflicts arrays exactly, including every id and URL. Do not browse, add, remove, rename, infer, resolve conflicts or introduce any number/name/URL not present in the ledger. No prose outside JSON.`;
}

async function ask(model: string, prompt: string, timeoutMs: number): Promise<{
  raw: string; parsed: Record<string, unknown> | null; parse_error: string | null;
  model: string; engine: string; ms: number;
}> {
  const out = await gateway.askModel(model, prompt, { timeoutMs });
  const parsed = extractJson(out.answer);
  return { raw: out.answer, parsed: parsed.value, parse_error: parsed.error, model: out.model, engine: out.engine, ms: out.ms };
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

async function runCompanyResearch(publicId: string, reportId: string, company: Record<string, unknown>): Promise<void> {
  if (active.has(publicId)) return;
  active.add(publicId);
  const parsedForLedger: Record<string, unknown>[] = [];
  let hadFailure = false;
  try {
    await db.updateReport(publicId, { status: 'running', error: null });
    await db.initResearchRun(reportId);

    try {
      const r1 = await ask('agy@mini', round01Prompt(company), 420_000);
      if (r1.parsed) {
        for (const row of [...rows(r1.parsed.contacts), ...rows(r1.parsed.people), ...rows(r1.parsed.signals)]) row._round = 'round01';
        parsedForLedger.push(r1.parsed);
      } else hadFailure = true;
      await db.saveRound(reportId, 'round01', r1, r1.parsed ? 'completed' : 'invalid_output', { model: r1.model, engine: r1.engine, ms: r1.ms });
    } catch (err) {
      hadFailure = true;
      await db.saveRound(reportId, 'round01', { error: (err as Error).message }, 'failed', { model: 'agy@mini' });
    }

    const r1Context = parsedForLedger[0] ?? { contacts: [], people: [], signals: [] };
    const round02: Record<string, unknown> = { calls: {} };
    for (const kind of ['contacts', 'people', 'signals'] as const) {
      try {
        const call = await ask('chatgpt@mini', round02Prompt(kind, company, r1Context), 300_000);
        object(round02.calls)[kind] = call;
        if (call.parsed) {
          for (const row of rows(call.parsed[kind])) row._round = 'round02';
          parsedForLedger.push(call.parsed);
        } else hadFailure = true;
      } catch (err) {
        hadFailure = true;
        object(round02.calls)[kind] = { error: (err as Error).message };
      }
    }
    const r2Ok = Object.values(object(round02.calls)).some((v) => object(v).parsed);
    await db.saveRound(reportId, 'round02', round02, r2Ok ? (hadFailure ? 'partial' : 'completed') : 'failed', { model: 'chatgpt@mini', split_calls: 3 });

    try {
      const r3 = await ask('meta@mini', round03Prompt(company), 240_000);
      const access = str(r3.parsed?.access_mode);
      if (r3.parsed && access === 'live_meta_pages') {
        for (const row of [...rows(r3.parsed.contacts), ...rows(r3.parsed.people), ...rows(r3.parsed.signals)]) row._round = 'round03';
        parsedForLedger.push(r3.parsed);
      }
      await db.saveRound(reportId, 'round03', r3, r3.parsed ? 'completed' : 'invalid_output', { model: r3.model, engine: r3.engine, ms: r3.ms, access_mode: access || null });
    } catch (err) {
      hadFailure = true;
      await db.saveRound(reportId, 'round03', { error: (err as Error).message }, 'failed', { model: 'meta@mini' });
    }

    const ledger = buildLedger(company, parsedForLedger);
    let finalReport: Record<string, unknown> = { ...ledger, summary: null, outreach_angles: [], synthesis_mode: 'validated_ledger_fallback' };
    let r4Artifact: Record<string, unknown>;
    try {
      const r4 = await ask('agy@mini', round04Prompt(ledger), 420_000);
      const fidelityErrors = r4.parsed ? validateFinal(r4.parsed, ledger) : [r4.parse_error ?? 'invalid final output'];
      if (r4.parsed && !fidelityErrors.length) finalReport = { ...r4.parsed, synthesis_mode: 'gemini_validated' };
      else hadFailure = true;
      r4Artifact = { ...r4, fidelity_errors: fidelityErrors, fallback_used: fidelityErrors.length > 0 };
      await db.saveRound(reportId, 'round04', r4Artifact, fidelityErrors.length ? 'rejected_fallback_used' : 'completed', { model: r4.model, engine: r4.engine, ms: r4.ms });
    } catch (err) {
      hadFailure = true;
      r4Artifact = { error: (err as Error).message, fallback_used: true };
      await db.saveRound(reportId, 'round04', r4Artifact, 'failed_fallback_used', { model: 'agy@mini' });
    }
    await db.saveFinal(reportId, ledger, finalReport);
    await db.updateReport(publicId, {
      status: hadFailure ? 'partial' : 'completed', result: finalReport,
      error: hadFailure ? 'Report completed with one or more round/validation gaps; only validated fields are published.' : null,
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
  return { report, final: report.result };
}

/** A requester opening/polling a queued report also revives work after a deploy. */
async function ensureRunning(report: db.PublishedReport): Promise<void> {
  if ((report.status !== 'queued' && report.status !== 'running') || active.has(report.public_id)) return;
  if (report.report_type === 'business_search') {
    void runBusinessSearch(report.public_id, report.id, object(report.request));
    return;
  }
  if (report.company_id) {
    const company = await db.getCompany(report.company_id);
    if (company) void runCompanyResearch(report.public_id, report.id, company);
  }
}

export async function handlePublic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  const pageMatch = /^\/r\/([A-Za-z0-9_-]{20})$/.exec(p);
  const jsonMatch = /^\/public\/reports\/([A-Za-z0-9_-]{20})$/.exec(p);
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
  } else html = ui.companyPage(report);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
  res.end(html);
  return true;
}

/** Authenticated product API routes. */
export async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  const method = req.method ?? 'GET';
  if (!p.startsWith('/api/business-search') && !p.startsWith('/api/company-research') && p !== '/api/reports') return false;
  if (!db.configured()) {
    ctx.json(res, 503, { error: 'report database is not configured; link DATABASE_URL to the Railway service' });
    return true;
  }

  if (method === 'GET' && p === '/api/reports') {
    const rawType = url.searchParams.get('type');
    const rawStatus = url.searchParams.get('status');
    const type = rawType === 'business_search' || rawType === 'company_research' ? rawType : null;
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
    void runCompanyResearch(report.public_id, report.id, company);
    ctx.json(res, 202, { report: envelope(req, report) });
    return true;
  }

  const one = /^\/api\/(business-search|company-research)\/([A-Za-z0-9_-]{20})$/.exec(p);
  if (method === 'GET' && one) {
    const report = await db.getReport(one[2]!);
    const expected = one[1] === 'business-search' ? 'business_search' : 'company_research';
    if (!report || report.report_type !== expected) {
      ctx.json(res, 404, { error: 'report not found' });
      return true;
    }
    await ensureRunning(report);
    const detail = await publicDetail(report);
    const run = report.report_type === 'company_research' ? await db.researchRun(report.id) : null;
    ctx.json(res, 200, { report: envelope(req, report), data: detail, research_run: run });
    return true;
  }

  ctx.json(res, 405, { error: 'method not allowed' });
  return true;
}
