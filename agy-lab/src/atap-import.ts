// Import sales agents from the Atap Solar calculator app as telemarketers.
//
// The calculator app (calculator.atap.solar) owns the roster of people who sell
// for us. Its integration API exposes those users read-only, so instead of
// retyping names into the portal one at a time, this module pulls the roster
// over HTTP and upserts each eligible user into the `telemarketer` table that
// lead assignment already reads.
//
// Auth is one header (X-Api-Password); the password lives in
// ATAP_INTEGRATION_PASSWORD, with a development fallback because the roster is
// not a secret on the order of a payment credential. Users paginate at
// limit<=100, so the fetcher walks offset pages until a short page comes back.
//
// Who counts as a sales agent: the access_level array carries roles like
// "sales", "sales consultant", "outsource sales agent (osa)" and "sales team
// manager", plus noise like "delete this", "viggy" and whole departments
// ("finance", "hr", "engineering") that match no sales role. So the rule is:
// at least one access level contains a known sales role prefix, and "blocked"
// never appears. Leaving blocked users in the deck would hand leads to people
// the office has already switched off.
import { addTelemarketer, configured, getTelemarketerDetails, type TelemarketerAgent } from './reportdb.ts';

export interface AtapUser {
  id: number;
  bubble_id: string;
  email: string | null;
  access_level: string[];
  linked_agent_profile: string | null;
  name: string | null;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

/** Lowercased role fragments in access_level that mark someone as sales-side. */
const SALES_ROLE_FRAGMENTS = ['sales', 'outsource', 'tam-jb'];

export function isSalesAgent(user: Pick<AtapUser, 'access_level'>): boolean {
  const levels = (user.access_level ?? []).map((l) => String(l).toLowerCase().trim());
  if (!levels.length) return false;
  if (levels.includes('blocked')) return false;
  return levels.some((level) => SALES_ROLE_FRAGMENTS.some((fragment) => level.includes(fragment)));
}

export interface ImportOptions {
  /** Pre-fetched roster; skips the HTTP call (tests pass a fixture here). */
  users?: AtapUser[];
  baseUrl?: string;
  password?: string;
  fetchImpl?: typeof fetch;
}

export interface ImportAgent extends TelemarketerAgent {
  source_bubble_id: string;
}

export interface ImportResult {
  /** Users returned by the roster API. */
  fetched: number;
  /** Roster names actually written to the telemarketer table. */
  imported: number;
  /** Roster users filtered out (non-sales or blocked). */
  skipped: number;
  /** Imported names that already existed in the table (contact fields refreshed). */
  updated: number;
  /** Roster names newly added to the table. */
  created: number;
  agents: ImportAgent[];
}

/**
 * Import sales agents into the telemarketer table.
 *
 * The DB upsert keeps the existing addTelemarketer semantics: an existing name
 * gets contact fields refreshed where the source has values, a new name is
 * created active. A user marked "pending" imports as inactive because pending
 * accounts are real people who have not been switched on yet -- deleting the
 * row later would orphan any leads assigned in the meantime.
 */
export async function importSalesAgents(input: ImportOptions = {}): Promise<ImportResult> {
  const users = input.users ?? (await fetchAtapUsers(input));
  const eligible = users.filter(isSalesAgent);
  const skipped = users.length - eligible.length;

  if (!configured()) {
    throw new Error('report database is not configured; link DATABASE_URL to the Railway service');
  }

  const existing = new Set(
    (await getTelemarketerDetails()).map((a) => a.name.toLowerCase()),
  );

  const agents: ImportAgent[] = [];
  let updated = 0;
  let created = 0;
  for (const user of eligible) {
    const name = (user.name ?? '').trim();
    if (!name) continue; // no name -> nothing to display or assign against
    const notes = `Imported from calculator.atap.solar · roles: ${(user.access_level ?? []).join(', ')}`;
    const agent = await addTelemarketer(name, {
      phone: user.contact ?? null,
      email: user.email ?? null,
      notes,
      active: !(user.access_level ?? []).some((l) => l.toLowerCase().trim() === 'pending'),
    });
    if (existing.has(name.toLowerCase())) updated++; else created++;
    agents.push({ ...agent, source_bubble_id: user.bubble_id });
  }

  return { fetched: users.length, imported: agents.length, skipped, updated, created, agents };
}

async function fetchAtapUsers(input: ImportOptions = {}): Promise<AtapUser[]> {
  const baseUrl = (input.baseUrl ?? process.env.ATAP_API_BASE_URL ?? 'https://calculator.atap.solar').replace(/\/$/, '');
  const password = input.password ?? process.env.ATAP_INTEGRATION_PASSWORD ?? 'eternalgy2026eternalgy2026';
  const doFetch = input.fetchImpl ?? fetch;

  const users: AtapUser[] = [];
  const seen = new Set<string>();
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const res = await doFetch(`${baseUrl}/api/integration/v1/users?limit=${pageSize}&offset=${offset}`, {
      headers: { 'X-Api-Password': password },
    });
    if (res.status === 401) throw new Error('Atap integration API rejected the password (401)');
    if (!res.ok) throw new Error(`Atap integration API returned ${res.status}`);
    const body = (await res.json()) as { success: boolean; data?: AtapUser[] };
    if (!body.success || !Array.isArray(body.data)) throw new Error('Atap integration API returned an unexpected payload');
    for (const u of body.data) {
      if (!seen.has(u.bubble_id)) {
        seen.add(u.bubble_id);
        users.push(u);
      }
    }
    if (body.data.length < pageSize) break; // short page -> last page
    if (offset > 100_000) throw new Error('Atap user list did not terminate'); // runaway guard
  }
  return users;
}
