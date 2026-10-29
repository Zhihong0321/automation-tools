// /api/email-marketing: the hub's lead emails, sent and answered through Smartlead.
//
// Leads are email-list.ts rows that carry both a company name and a usable email.
// Pushing them into a Smartlead campaign is recorded in email_marketing_lead, so the
// lead list shows which campaign each email is already in and a second push skips it.
// Campaigns, sending, replies and the inbox live in Smartlead; these routes read and
// drive them so the whole loop runs from /email-marketing.
import type http from 'node:http';
import * as db from './reportdb.ts';
import * as emailList from './email-list.ts';
import * as sl from './smartlead.ts';

type Ctx = {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
};

const BATCH = 100;
const VALID_EMAIL = /^[^@\s<>"',;]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const NOT_A_MAILBOX = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

export interface MarketingLead extends emailList.EmailRow {
  key: string;
  campaigns: { id: number; name: string | null; pushed_at: string }[];
}

export function eligible(row: emailList.EmailRow): boolean {
  return Boolean(row.company_name?.trim()) && VALID_EMAIL.test(row.email) && !NOT_A_MAILBOX.test(row.email);
}

async function pushedByEmail(): Promise<Map<string, MarketingLead['campaigns']>> {
  await db.migrate();
  const out = await db.sql<{ email: string; campaign_id: string; campaign_name: string | null; pushed_at: string }>(
    `select email, campaign_id::text, campaign_name, pushed_at from email_marketing_lead order by pushed_at`);
  const map = new Map<string, MarketingLead['campaigns']>();
  for (const r of out.rows) {
    const list = map.get(r.email) ?? [];
    list.push({ id: Number(r.campaign_id), name: r.campaign_name, pushed_at: r.pushed_at });
    map.set(r.email, list);
  }
  return map;
}

/** status: all | new (in no campaign yet) | pushed. */
export async function leads(options: { search?: string | null; source?: string | null; status?: string | null; fresh?: boolean }): Promise<{ all: MarketingLead[]; shown: MarketingLead[] }> {
  const [rows, pushed] = await Promise.all([emailList.allRows(options.fresh), pushedByEmail()]);
  const all = rows.filter(eligible).map((r) => ({ ...r, key: r.company_id + '|' + r.email, campaigns: pushed.get(r.email) ?? [] }));
  const status = options.status || 'all';
  const shown = (emailList.filter(all, options) as MarketingLead[])
    .filter((r) => status === 'all' || (status === 'new' ? r.campaigns.length === 0 : r.campaigns.length > 0));
  return { all, shown };
}

function splitName(name: string | null): { first_name?: string; last_name?: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') || undefined };
}

/**
 * The name as it reads inside an email. Maps titles carry emoji and taglines
 * ("️ ️ AK Freight Sdn Bhd | logistics Service Provider | Malaysia"); {{company_name}}
 * should say "AK Freight Sdn Bhd".
 */
export function mailName(name: string): string {
  const clean = name.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{200B}]/gu, '').replace(/\s+/g, ' ').trim();
  const first = clean.split(/\s+[|•·–—]\s+|\s+-\s+/)[0].trim();
  return first || clean;
}

export function toSmartlead(r: emailList.EmailRow): sl.LeadIn {
  const custom: Record<string, string> = { hub_company_id: r.company_id };
  if (r.category) custom.category = r.category;
  if (r.person_role) custom.role = r.person_role;
  return { email: r.email, company_name: mailName(r.company_name), ...splitName(r.person_name), custom_fields: custom };
}

/**
 * Sends the chosen rows into a campaign, 100 per call. One email reaches a campaign
 * once even when two companies share it. A failed batch is reported and the rest
 * still go.
 */
export async function push(campaignId: number, campaignName: string | null, rows: MarketingLead[]) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => !r.campaigns.some((c) => c.id === campaignId) && !seen.has(r.email) && seen.add(r.email));
  const totals = { requested: rows.length, sent: 0, added: 0, duplicates: 0, invalid: 0, blocked: 0, in_other_campaign: 0, failed: 0, errors: [] as string[] };
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    try {
      const out = await sl.addLeads(campaignId, batch.map(toSmartlead));
      totals.sent += batch.length;
      totals.added += out.upload_count ?? 0;
      totals.duplicates += (out.duplicate_count ?? 0) + (out.already_added_to_campaign ?? 0);
      totals.invalid += out.invalid_email_count ?? 0;
      totals.blocked += (out.block_count ?? 0) + (out.unsubscribed_leads?.length ?? 0);
      totals.in_other_campaign += out.skipped_in_other_campaign_count ?? 0;
      await db.sql(
        `insert into email_marketing_lead (campaign_id, email, company_id, campaign_name)
         select $1::bigint, e.email, e.company_id::bigint, $2
           from jsonb_to_recordset($3::jsonb) as e(email text, company_id text)
         on conflict (campaign_id, email) do nothing`,
        [campaignId, campaignName, JSON.stringify(batch.map((r) => ({ email: r.email, company_id: r.company_id })))]);
    } catch (err) {
      totals.failed += batch.length;
      totals.errors.push((err as Error).message);
    }
  }
  return totals;
}

// ---- campaign setup -----------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The page edits plain text; Smartlead stores HTML. Blank lines make paragraphs. */
export function textToHtml(text: string): string {
  return text.trim().split(/\r?\n\s*\r?\n/).map((p) => '<p>' + esc(p).replace(/\r?\n/g, '<br>') + '</p>').join('');
}

export function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>\s*/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readSteps(raw: unknown): sl.Step[] | null {
  if (!Array.isArray(raw)) return null;
  const steps = raw.map((s: any) => ({ subject: String(s?.subject ?? '').trim(), body: String(s?.body ?? ''), delay_days: Number(s?.delay_days) || 0 }))
    .filter((s) => s.body.trim());
  if (!steps.length) return null;
  if (!steps[0].subject) throw new Error('step 1 needs a subject');
  return steps.map((s) => ({ ...s, body: textToHtml(s.body) }));
}

function readSchedule(raw: any): sl.Schedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const days = (Array.isArray(raw.days) ? raw.days : [1, 2, 3, 4, 5]).map(Number).filter((d: number) => d >= 0 && d <= 6);
  return {
    timezone: String(raw.timezone || 'Asia/Kuala_Lumpur'),
    days: days.length ? days : [1, 2, 3, 4, 5],
    start_hour: /^\d{2}:\d{2}$/.test(raw.start_hour) ? raw.start_hour : '09:00',
    end_hour: /^\d{2}:\d{2}$/.test(raw.end_hour) ? raw.end_hour : '17:00',
    min_gap_minutes: Math.max(3, Math.round(Number(raw.min_gap_minutes) || 10)),
    max_new_per_day: Math.max(1, Math.round(Number(raw.max_new_per_day) || 50)),
  };
}

/** Applies whichever of steps / schedule / mailboxes the body carries; each part runs even if another fails. */
async function setup(id: number, body: Record<string, unknown>, isNew: boolean): Promise<string[]> {
  const errors: string[] = [];
  const attempt = async (what: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (err) { errors.push(what + ': ' + (err as Error).message); }
  };
  let steps: sl.Step[] | null = null;
  try { steps = readSteps(body.steps); } catch (err) { errors.push((err as Error).message); }
  if (steps) await attempt('sequence', () => sl.saveSequences(id, steps!));
  const schedule = readSchedule(body.schedule);
  if (schedule) await attempt('schedule', () => sl.saveSchedule(id, schedule));
  if (isNew) await attempt('settings', () => sl.saveSettings(id));
  const mailboxes = Array.isArray(body.mailbox_ids) ? body.mailbox_ids.map(Number).filter(Boolean) : [];
  if (mailboxes.length) await attempt('mailboxes', () => sl.attachMailboxes(id, mailboxes));
  return errors;
}

// ---- inbox ---------------------------------------------------------------------

const pick = (o: any, ...paths: string[]): any => {
  for (const p of paths) {
    const v = p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    if (v != null && v !== '') return v;
  }
  return null;
};

/** One inbox row, whichever field names this Smartlead build answers with. */
export function inboxItem(m: any) {
  return {
    email: pick(m, 'lead_email', 'lead.email', 'to_email', 'email'),
    name: [pick(m, 'lead_first_name', 'lead.first_name'), pick(m, 'lead_last_name', 'lead.last_name')].filter(Boolean).join(' ') || null,
    company: pick(m, 'lead_company_name', 'company_name', 'lead.company_name', 'lead.company'),
    campaign_id: pick(m, 'email_campaign_id', 'campaign_id', 'campaign.id'),
    campaign_name: pick(m, 'email_campaign_name', 'campaign_name', 'campaign.name'),
    lead_id: pick(m, 'email_lead_id', 'lead_id', 'lead.id'),
    category_id: pick(m, 'lead_category_id', 'category.id'),
    time: pick(m, 'last_reply_time', 'reply_time', 'last_message.received_at', 'last_activity_at', 'updated_at'),
    subject: pick(m, 'last_reply.subject', 'last_message.subject', 'email_subject', 'subject'),
    preview: htmlToText(pick(m, 'last_reply.email_body', 'last_message.body', 'email_body', 'reply_body') ?? '').slice(0, 280),
    unread: pick(m, 'is_read') === false,
  };
}

/** One message of a thread, normalised. */
export function threadMessage(h: any) {
  const type = String(pick(h, 'type', 'direction') ?? '').toUpperCase();
  return {
    inbound: type === 'REPLY' || type === 'INBOUND',
    stats_id: pick(h, 'stats_id', 'email_stats_id'),
    message_id: pick(h, 'message_id', 'id'),
    time: pick(h, 'time', 'sent_at', 'received_at'),
    from: pick(h, 'from'),
    to: pick(h, 'to'),
    subject: pick(h, 'subject'),
    body_html: String(pick(h, 'email_body', 'body') ?? ''),
    body: htmlToText(String(pick(h, 'email_body', 'body') ?? '')),
    seq: pick(h, 'email_seq_number'),
  };
}

/** Every campaign thread with this email, found from Smartlead's lead record. */
async function threads(email: string, onlyCampaign: number | null) {
  const lead = await sl.call('GET', '/leads/?email=' + encodeURIComponent(email)).catch(() => null);
  if (!lead?.id) return { lead: null, threads: [] };
  const camps: any[] = (lead.lead_campaign_data ?? []).filter((c: any) => !onlyCampaign || Number(c.campaign_id) === onlyCampaign);
  const out = [];
  for (const c of camps) {
    const h = await sl.messageHistory(Number(c.campaign_id), Number(lead.id)).catch((err) => ({ history: [], error: (err as Error).message }));
    out.push({
      campaign_id: Number(c.campaign_id), campaign_name: c.campaign_name, category_id: c.lead_category_id,
      last_sent_at: c.last_sent_at, last_reply_at: c.last_reply_at,
      messages: (h.history ?? []).map(threadMessage), error: (h as any).error ?? null,
    });
  }
  return {
    lead: { id: Number(lead.id), email: lead.email, first_name: lead.first_name, last_name: lead.last_name, company_name: lead.company_name, custom_fields: lead.custom_fields, unsubscribed: lead.is_unsubscribed },
    threads: out,
  };
}

// ---- routes --------------------------------------------------------------------

let categoryCache: { at: number; list: any[] } | null = null;
async function categories() {
  if (!categoryCache || Date.now() - categoryCache.at > 3600_000) categoryCache = { at: Date.now(), list: await sl.leadCategories() };
  return categoryCache.list.map((c) => ({ id: c.id, name: c.name, sentiment: c.sentiment_type }));
}

function campaignRow(c: any, a: any) {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    id: c.id, name: c.name, status: c.status, created_at: c.created_at,
    leads: n(a?.campaign_lead_stats?.total), not_started: n(a?.campaign_lead_stats?.notStarted), in_progress: n(a?.campaign_lead_stats?.inprogress),
    completed: n(a?.campaign_lead_stats?.completed), interested: n(a?.campaign_lead_stats?.interested),
    sent: n(a?.unique_sent_count ?? a?.sent_count), opened: n(a?.unique_open_count ?? a?.open_count), clicked: n(a?.unique_click_count ?? a?.click_count),
    replied: n(a?.reply_count), bounced: n(a?.bounce_count), unsubscribed: n(a?.unsubscribed_count),
  };
}

const intParam = (url: URL, name: string, dflt: number, max: number) =>
  Math.min(Math.max(Math.round(Number(url.searchParams.get(name) ?? dflt) || dflt), 0), max);

export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/email-marketing' && !p.startsWith('/api/email-marketing/')) return false;
  const method = req.method ?? 'GET';
  const send = (status: number, body: unknown) => { ctx.json(res, status, body); return true; };
  try {
    if (method === 'GET' && (p === '/api/email-marketing' || p === '/api/email-marketing/status')) {
      if (!sl.configured()) return send(200, { configured: false, mailboxes: [], categories: [] });
      const [mailboxes, cats] = await Promise.all([sl.listMailboxes(), categories()]);
      return send(200, {
        configured: true,
        categories: cats,
        mailboxes: (mailboxes ?? []).map((m: any) => ({
          id: m.id, email: pick(m, 'from_email', 'email'), name: pick(m, 'from_name', 'name'), type: pick(m, 'type'),
          daily_limit: pick(m, 'message_per_day', 'max_email_per_day'), sent_today: pick(m, 'daily_sent_count'),
          warmup: pick(m, 'warmup_details.status'), reputation: pick(m, 'warmup_details.warmup_reputation'),
          smtp_ok: pick(m, 'is_smtp_success'), imap_ok: pick(m, 'is_imap_success'),
        })),
      });
    }

    if (method === 'GET' && p === '/api/email-marketing/leads') {
      if (!db.configured()) return send(503, { error: 'no report database configured' });
      const { all, shown } = await leads({
        search: url.searchParams.get('search'), source: url.searchParams.get('source'),
        status: url.searchParams.get('status'), fresh: url.searchParams.get('fresh') === '1',
      });
      const limit = Math.max(1, intParam(url, 'limit', 50, 500));
      const offset = intParam(url, 'offset', 0, 1e9);
      return send(200, {
        stats: {
          eligible: all.length,
          emails: new Set(all.map((r) => r.email)).size,
          companies: new Set(all.map((r) => r.company_id)).size,
          with_person: all.filter((r) => r.person_name).length,
          in_campaign: all.filter((r) => r.campaigns.length).length,
          not_yet: all.filter((r) => !r.campaigns.length).length,
        },
        total: shown.length, limit, offset, rows: shown.slice(offset, offset + limit),
      });
    }

    if (method === 'GET' && p === '/api/email-marketing/campaigns') {
      const list = (await sl.listCampaigns()) ?? [];
      const rows = await Promise.all(list.map(async (c) => campaignRow(c, await sl.campaignAnalytics(c.id).catch(() => null))));
      return send(200, { campaigns: rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
    }

    if (method === 'POST' && p === '/api/email-marketing/campaigns') {
      const body = await ctx.readJson(req);
      const name = String(body.name ?? '').trim();
      if (!name) return send(400, { error: 'name is required' });
      const id = await sl.createCampaign(name);
      const errors = await setup(id, body, true);
      return send(200, { id, name, errors });
    }

    const camp = p.match(/^\/api\/email-marketing\/campaigns\/(\d+)(\/.*)?$/);
    if (camp) {
      const id = Number(camp[1]);
      const sub = camp[2] ?? '';
      if (method === 'GET' && sub === '') {
        const [c, a, seq, boxes] = await Promise.all([sl.getCampaign(id), sl.campaignAnalytics(id), sl.campaignSequences(id), sl.campaignMailboxes(id)]);
        const cron = c.scheduler_cron_value ?? {};
        return send(200, {
          campaign: campaignRow(c, a),
          schedule: { timezone: cron.tz ?? null, days: cron.days ?? [], start_hour: cron.startHour ?? null, end_hour: cron.endHour ?? null, min_gap_minutes: c.min_time_btwn_emails, max_new_per_day: c.max_leads_per_day },
          steps: (seq ?? []).sort((x: any, y: any) => x.seq_number - y.seq_number).map((s: any) => ({
            seq_number: s.seq_number, subject: s.subject || '', body: htmlToText(s.email_body), delay_days: s.seq_delay_details?.delay_in_days ?? 0,
          })),
          mailboxes: (boxes ?? []).map((m: any) => ({ id: m.id, email: m.from_email, name: m.from_name })),
        });
      }
      if (method === 'POST' && sub === '/setup') {
        return send(200, { id, errors: await setup(id, await ctx.readJson(req), false) });
      }
      if (method === 'POST' && sub === '/status') {
        const status = String((await ctx.readJson(req)).status ?? '').toUpperCase();
        if (!['START', 'PAUSED', 'STOPPED'].includes(status)) return send(400, { error: 'status is START, PAUSED or STOPPED' });
        await sl.setStatus(id, status as 'START');
        return send(200, { id, status });
      }
      if (method === 'DELETE' && sub === '') {
        await sl.deleteCampaign(id);
        await db.sql(`delete from email_marketing_lead where campaign_id = $1`, [id]).catch(() => {});
        return send(200, { id, deleted: true });
      }
      if (method === 'POST' && sub === '/leads') {
        if (!db.configured()) return send(503, { error: 'no report database configured' });
        const body = await ctx.readJson(req);
        const { all, shown } = await leads({ search: body.search as string, source: body.source as string, status: body.status as string });
        const keys = Array.isArray(body.keys) ? new Set(body.keys.map(String)) : null;
        const rows = keys ? all.filter((r) => keys.has(r.key)) : (body.all === true ? shown : []);
        if (!rows.length) return send(400, { error: 'no leads chosen: send keys[] or all:true with the filter' });
        const c = await sl.getCampaign(id);
        return send(200, await push(id, c?.name ?? null, rows));
      }
      if (method === 'GET' && sub === '/leads') {
        const out = await sl.campaignLeads(id, intParam(url, 'offset', 0, 1e9), Math.max(1, intParam(url, 'limit', 50, 100)));
        return send(200, {
          total: Number(out.total_leads ?? 0),
          rows: (out.data ?? []).map((d: any) => ({
            lead_id: d.lead?.id, email: d.lead?.email, name: [d.lead?.first_name, d.lead?.last_name].filter(Boolean).join(' ') || null,
            company: d.lead?.company_name, status: d.status, category_id: d.lead_category_id, added_at: d.created_at, unsubscribed: d.lead?.is_unsubscribed,
          })),
        });
      }
      if (method === 'POST' && sub === '/test') {
        const body = await ctx.readJson(req);
        const to = String(body.email ?? '').trim();
        if (!VALID_EMAIL.test(to)) return send(400, { error: 'a test address is required' });
        const first = await sl.campaignLeads(id, 0, 1);
        const leadId = first.data?.[0]?.lead?.id;
        if (!leadId) return send(400, { error: 'add at least one lead first: the test email fills its {{fields}} from a real lead' });
        await sl.sendTest(id, Number(leadId), Math.max(1, Number(body.sequence) || 1), to);
        return send(200, { sent: true, to, as_lead: first.data[0].lead.email });
      }
      const leadAction = sub.match(/^\/leads\/(\d+)\/(pause|resume|category)$/);
      if (method === 'POST' && leadAction) {
        const leadId = Number(leadAction[1]);
        if (leadAction[2] === 'pause') await sl.pauseLead(id, leadId);
        else if (leadAction[2] === 'resume') await sl.resumeLead(id, leadId);
        else {
          const cat = (await ctx.readJson(req)).category_id;
          await sl.setCategory(id, leadId, cat == null || cat === '' ? null : Number(cat));
        }
        return send(200, { ok: true });
      }
    }

    if (method === 'GET' && p === '/api/email-marketing/inbox') {
      const filters: Record<string, unknown> = {};
      const campaign = Number(url.searchParams.get('campaign_id'));
      if (campaign) filters.campaignId = [campaign];
      const out = await sl.inboxReplies(intParam(url, 'offset', 0, 1e9), Math.max(1, intParam(url, 'limit', 20, 20)), filters);
      const list: any[] = Array.isArray(out?.data) ? out.data : Array.isArray((out as any)?.messages) ? (out as any).messages : [];
      return send(200, { rows: list.map(inboxItem) });
    }

    if (method === 'GET' && p === '/api/email-marketing/thread') {
      const email = String(url.searchParams.get('email') ?? '').trim().toLowerCase();
      if (!email) return send(400, { error: 'email is required' });
      return send(200, await threads(email, Number(url.searchParams.get('campaign_id')) || null));
    }

    if (method === 'POST' && p === '/api/email-marketing/reply') {
      const body = await ctx.readJson(req);
      const campaignId = Number(body.campaign_id);
      const text = String(body.body ?? '').trim();
      if (!campaignId || !body.stats_id || !text) return send(400, { error: 'campaign_id, stats_id and body are required' });
      await sl.reply(campaignId, {
        email_stats_id: String(body.stats_id),
        email_body: textToHtml(text),
        reply_message_id: body.message_id ? String(body.message_id) : undefined,
        reply_email_time: body.time ? String(body.time) : undefined,
        reply_email_body: body.original_html ? String(body.original_html) : undefined,
        cc: body.cc ? String(body.cc) : undefined,
      });
      return send(200, { sent: true });
    }

    return send(404, { error: 'not found' });
  } catch (err) {
    const status = err instanceof sl.SmartleadError ? (err.status >= 500 ? 502 : err.status) : 500;
    return send(status, { error: (err as Error).message });
  }
}
