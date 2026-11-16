// VIP tiers for the email list: every lead email gets one tier, from who it belongs to.
//   1  the CEO, an owner or founder: a named person with a top role
//   2  a manager, director, head, PIC: a named person with a middle role
//   3  a named person whose position is not known (or not one of the above)
//   4  an email with no person behind it: info@, sales@, admin@ and the like
// Nothing here ever removes a lead: a role that does not read clearly lands in tier 3, a row with
// no person in tier 4, and a bad or missing field is just treated as empty.

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABELS: Record<Tier, string> = {
  1: 'Tier 1: CEO / owner',
  2: 'Tier 2: manager / director / head / PIC',
  3: 'Tier 3: named person, position unknown',
  4: 'Tier 4: general email',
};

/** English, Malay and Chinese titles of the person who runs or owns the company. */
const TOP = /\b(ceo|c\.e\.o|chief executive|founder|co-?founder|owner|co-?owner|proprietor|managing director|md|president|chairman|chairwoman|chairperson|managing partner|senior partner|founding partner|equity partner|pengarah urusan|pengerusi|pemilik|pengasas|tuan punya)\b|老板|老闆|东主|東主|董事长|董事長|董事总经理|董事總經理|总裁|總裁|创办人|創辦人|创始人|創始人/i;

/** Titles of the people who manage, direct or head a part of the company, or are the person in charge. */
const MIDDLE = /\b(manager|director|chief [a-z]+ officer|coo|cfo|cto|cmo|cio|head|hod|hop|pic|p\.i\.c|person in charge|person-in-charge|gm|deputy|vice[- ]president|vp|svp|evp|pengurus|pengarah|ketua)\b|经理|經理|总监|總監|主管|主任|负责人|負責人/i;

/** A deputy or assistant to the top role is a tier 2 person, not the boss. */
const BELOW_TOP = /\b(vice[- ]president|vp|svp|evp|deputy|assistant|asst\.?|associate|timbalan)\b/i;

/** Support staff of a boss, and people who no longer hold the role: not the boss, position unclear. */
const NOT_THE_ROLE = /\b(secretary|personal assistant|executive assistant|pa to|assistant to|asst\.? to|setiausaha)\b|\b(former|formerly|retired|previous|past|late)\b|\bex-|前任|已退休/i;

const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();

export function tierOf(row: { person_name?: unknown; person_role?: unknown }): Tier {
  if (!text(row.person_name)) return 4;
  const role = text(row.person_role);
  if (!role || NOT_THE_ROLE.test(role)) return 3;
  if (TOP.test(role)) return BELOW_TOP.test(role) ? 2 : 1;
  if (MIDDLE.test(role)) return 2;
  return 3;
}

/** "1", "1,2", "1-2" or "all" (also empty) as the set of tiers asked for; null is every tier. */
export function parseTiers(value: unknown): Set<Tier> | null {
  const s = text(value).toLowerCase();
  if (!s || s === 'all') return null;
  const out = new Set<Tier>();
  for (const part of s.split(',')) {
    const range = /^\s*([1-4])\s*-\s*([1-4])\s*$/.exec(part);
    if (range) { for (let t = Number(range[1]); t <= Number(range[2]); t++) out.add(t as Tier); continue; }
    const one = /^\s*([1-4])\s*$/.exec(part);
    if (one) out.add(Number(one[1]) as Tier);
  }
  return out.size ? out : null;
}

export function tierCounts(rows: Array<{ tier: Tier }>): Record<Tier, number> {
  const out: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of rows) out[r.tier]++;
  return out;
}
