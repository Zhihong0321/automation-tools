// S3 / editor — dive-deeper stage 3: turn the findings into a report an owner will read.
//
//   node scripts/dive-deeper/run.ts S3 editor <diveId>
//
// Reads every stage-1 lane and S2 from out/. Works out one settled set of numbers in code
// (editor.ts resolve: the register beats the research where they disagree), then:
//   1. rewrites every finding title in plain English for the owner (batches of 35),
//   2. writes the verdict, the three stories that cost the most customers, and the few
//      things a stranger would notice do not add up,
//   3. takes proof screenshots of the worst website problems, with the problem outlined.
// Every step falls back: no LLM answer keeps the lane's own wording, no browser means no shots.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, type Ctx, type Finding } from '../lib.ts';
import { resolve, type Item } from '../editor.ts';
import { takeShots, type ShotAsk } from '../shots.ts';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + ' …' : s);
const THEMES = ['reputation', 'findability', 'ai', 'website'] as const;

function stage(diveId: string, lane: string): any | null {
  const file = path.join(OUT, `${lane}-${diveId}.json`);
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch { return null; }
}

async function askJson(ctx: Ctx, prompt: string, label: string, attempts = 2): Promise<any> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const got = ctx.parseJson(await ctx.llm(prompt));
    if (got) return got;
    ctx.warn(`${label} did not parse (attempt ${attempt})`);
  }
  return null;
}

/** The worst website problems a screenshot can prove, plus the homepage on a phone for the cover. */
export function shotAsks(R: ReturnType<typeof resolve>, ownSite: string | null): ShotAsk[] {
  const site = R.items.filter((x) => x.area === 'website' && x.source && /^https?:/.test(x.source));
  const asks: ShotAsk[] = [];
  const add = (x: Item | undefined, find: string | null, caption: string) => {
    if (x && !asks.some((a) => a.url === x.source)) asks.push({ key: x.key, url: x.source!, find, caption });
  };
  const leak = site.find((x) => x.check === 'leaked-note');
  add(leak, leak ? String(leak.raw?.evidence ?? '').slice(0, 50) : null, 'Text left on the page that was never meant for customers');
  // The masked number in page data is invisible; shoot the one printed on the page, if any.
  const masked = site.find((x) => x.check === 'llm' && /\*{3,}/.test(String(x.raw?.evidence ?? '')));
  const maskedNo = String(masked?.raw?.evidence ?? '').match(/\+?\d[\d*]{6,}\d/)?.[0] ?? null;
  if (masked && maskedNo) add(masked, maskedNo, 'A phone number customers cannot dial');
  add(site.find((x) => x.check === 'placeholder'), 'Coming Soon', 'A service page with nothing on it');
  add(site.find((x) => x.check === 'page-status' && x.severity === 'high'), null, 'A page your homepage links to, which does not exist');
  const out = asks.slice(0, 4);
  if (ownSite) out.unshift({ key: 'cover', url: ownSite, find: null, caption: 'Your homepage on a phone', mobile: true });
  return out;
}

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const L = Object.fromEntries(['E-maps', 'H-maps', 'H-web', 'C-merged', 'D-registry', 'G-fixed', 'G-grounded', 'S2-consult'].map((l) => [l, stage(ctx.diveId, l)]));
  for (const [l, v] of Object.entries(L)) if (!v) ctx.warn(`${l}-${ctx.diveId}.json missing; the report skips what it covers`);
  const R = resolve(dive, L);
  const now = ctx.now();
  const name = R.name;

  // ---- 1. Plain titles. ----
  const plain: Record<string, { title: string; why: string }> = {};
  const batches: Item[][] = [];
  for (let i = 0; i < R.items.length; i += 35) batches.push(R.items.slice(i, i + 35));
  // Vectide's content filter refuses a whole batch over one review it dislikes, so a refused
  // batch is split in half until only the refused findings keep their own wording.
  const rewrite = async (b: Item[], label: string): Promise<void> => {
    const got = await askJson(ctx,
      `You are editing an audit report for the owner of ${name}, a small Malaysian business. Rewrite each finding below for the owner.\n` +
      `Rules: "title" is one plain sentence of at most 14 words, speaking to the owner as "you"; keep the exact numbers, dates, names and page paths that matter; ` +
      `no jargon, no labels like VERIFIED or CONTRADICTED, no URLs, no AI model names (say "an AI assistant"), no HTTP codes (say "the page does not exist"). ` +
      `"why" is at most 25 words: what it means for a customer or for the business. For good news, say why it helps. Never add facts that are not in the finding.\n\n` +
      b.map((x, i) => `${i} | ${x.area} | ${x.severity} | ${clip(x.title, 260)} | ${clip(x.detail, 320)}`).join('\n') +
      `\n\nReturn JSON only: {"items": [{"i": 0, "title": "", "why": ""}]} with one entry per finding, in order.`,
    label, b.length === 35 ? 2 : 1);
    if (!got && b.length > 1) {
      const half = Math.ceil(b.length / 2);
      await Promise.all([rewrite(b.slice(0, half), `${label}a`), rewrite(b.slice(half), `${label}b`)]);
      return;
    }
    for (const e of got?.items ?? []) {
      const x = b[Number(e?.i)];
      if (x && typeof e.title === 'string' && e.title.trim()) plain[x.key] = { title: e.title.trim(), why: String(e.why ?? '').trim() };
    }
  };
  await Promise.all(batches.map((b, n) => rewrite(b, `plain titles ${n + 1}/${batches.length}`)));
  ctx.log(`plain titles: ${Object.keys(plain).length} of ${R.items.length}`);
  if (Object.keys(plain).length < R.items.length) ctx.warn(`${R.items.length - Object.keys(plain).length} findings keep their original wording`);

  // ---- 2. Verdict, stories and what does not add up. ----
  const T = (x: Item) => plain[x.key]?.title ?? x.title;
  const urgent = (area: string) => R.items.filter((x) => x.area === area && (x.severity === 'high' || x.severity === 'medium')).slice(0, 10).map((x) => `- [${x.severity}] ${T(x)}`).join('\n');
  const facts = {
    areas: R.areas.map((a) => ({ area: a.id, status: a.status[1], measured: a.metric })),
    reviews: { answered: `${R.reviews.replied} of ${R.reviews.total}`, listings: R.reviews.listings, unanswered_bad_reviews: R.reviews.unanswered_low.map((x) => ({ stars: x.stars, date: x.date, days_without_reply: x.days_open, text: clip(x.text, 200) })), review_spikes: R.reviews.bursts, same_reviewers_on_two_listings: R.reviews.cross_reviewers, praised_for: R.reviews.praise },
    google_maps: R.maps.by_area.map((a) => ({ town: a.area, your_best_rank: a.best_rank, of: a.of, shown_first: a.top.slice(0, 3) })), no_maps_listing_in: R.maps.no_listing_in, your_listing: R.maps.our,
    ai_assistants: { recommended_you: `${R.ai.named_us} of ${R.ai.trade_answers} answers to "${R.ai.trade_question}"`, named_instead: R.ai.share.slice(0, 5), from_memory: R.ai.memory?.models, with_web_search: R.ai.search?.models, wrong_things_said: R.ai.memory?.wrong_examples },
    licences: { cidb_grade_on_official_register: R.credentials.cidb_grade, claims: R.credentials.list.map((c: any) => `${c.verdict}${c.direction ? ` (${c.direction})` : ''}: ${clip(c.claim, 120)}`) },
    website: R.website,
  };
  // Only these register results may settle a mismatch; the editor cites one by its R-number.
  const regs = R.credentials.list.filter((c: any) => !/can't check/.test(c.verdict));
  const regLines = regs.map((c: any, i: number) => `R${i + 1}: ${c.verdict}${c.direction ? ` (${c.direction})` : ''}: ${clip(c.claim, 110)}; ${clip(c.detail, 160)}`).join('\n');
  const mismatchesIn = (dive?.result?.contradictions ?? []).slice(0, 14).map((c: string) => `- ${c.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()}`).join('\n');
  const ed = await askJson(ctx,
    `You are the senior consultant signing an online presence audit for the owner of ${name} (${R.identity.industry}). Write the editorial parts. Plain British English, warm but direct, no hype, no jargon, every claim backed by the facts below. Speak to the owner as "you".\n\n` +
    `Measured facts (settled; where an official register is given it is the truth):\n${JSON.stringify(facts)}\n\n` +
    `Urgent and needs-work items by area:\n${THEMES.map((t) => `## ${t}\n${urgent(t) || '(none)'}`).join('\n')}\n\n` +
    `Things public sources disagree on about the company:\n${mismatchesIn || '(none)'}\n\n` +
    `Official register results (the only things that settle anything):\n${regLines || '(none)'}\n\n` +
    `Return JSON only:\n{"verdict": "3 sentences: where they stand, the single biggest risk, the single biggest opportunity. Use real numbers.",\n` +
    `"stories": [{"theme": "one of ${THEMES.join(', ')}", "headline": "at most 12 words, includes a real number", "body": "2-3 sentences: what we found and why it matters", "cost": "1 sentence: how this loses customers or money", "fix": "1 sentence: the first thing to do"}] (exactly 3, different themes, the three costing the most customers first),\n` +
    `"mismatch": [{"issue": "1 sentence a customer, bank or tender officer would notice", "settled_by": "the R-number of the register result above that settles it, or null; directories, portfolio sites and the company's own pages settle nothing"}] (at most 5, the ones that most hurt trust; drop any the register settles in the company's favour unless their own site still says the wrong thing)}`,
  'editorial');
  if (!ed) ctx.warn('editorial did not parse; the report uses its built-in wording');
  const stories = (ed?.stories ?? []).filter((s: any) => THEMES.includes(s?.theme)).filter((s: any, i: number, a: any[]) => a.findIndex((x) => x.theme === s.theme) === i).slice(0, 3);

  // ---- 3. Proof screenshots. ----
  const ownSite = (L['S2-consult']?.notes?.own_sites ?? [])[0] ?? (R.identity.domains[0] ? `https://${R.identity.domains[0]}/` : null);
  const shots = await takeShots(shotAsks(R, ownSite), ctx.warn);
  // A shot asked to find text that was not there proves nothing; keep it only for the cover and 404s.
  const kept = shots.filter((s) => s.found || !s.find);
  ctx.log(`screenshots: ${kept.length} of ${shots.length} kept`);

  return {
    findings: [{ title: 'Report edited', detail: `${Object.keys(plain).length} plain titles, ${stories.length} stories, ${kept.length} screenshots`, severity: 'info', source: null, checked_at: now }],
    notes: { plain, verdict: ed?.verdict ?? null, stories, mismatch: (Array.isArray(ed?.mismatch) ? ed.mismatch : []).slice(0, 5).map((m: any) => {
      const reg = regs[Number(String(m?.settled_by ?? '').replace(/\D/g, '')) - 1];
      return { issue: String(m?.issue ?? ''), settled: reg ? `${reg.verdict === 'verified' ? 'confirms' : reg.direction === 'undersell' ? 'shows better than you claim' : reg.verdict === 'contradicted' ? 'contradicts' : 'has no record of'}: ${clip(reg.claim, 110)}` : null, source: reg?.source ?? null };
    }).filter((m: any) => m.issue), shots: kept },
  };
}
