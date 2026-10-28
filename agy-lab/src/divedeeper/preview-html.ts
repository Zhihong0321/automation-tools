// The free preview of the full report, built from the company-dive alone (stage 1, no extra calls).
// Same style and three versions as the full report (report-html.ts shell). It shows what public
// sources already say about the company, what does not add up, and what the full report will
// measure once ordered, with the five measured numbers shown as locked.
//   cover        company, "preview edition"
//   at a glance  what the research already holds, and the five numbers still locked
//   stranger     identity, people, the claims we found (not yet checked against registers)
//   mismatch     every place public sources disagree, and what they cannot answer
//   inside       the five chapters of the full report, each with its opener and what it measures
//   ready to use what the report hands over, and how ordering works
//   appendix     the background research and its sources
import { CHAPTER_EYEBROW, CHAPTER_ORDER, OPENERS, esc, md, shell } from './report-html.ts';

/** What the seller shows on the order page; every field optional. */
export type Offer = { price?: string; contact?: string; order_url?: string };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dateOf = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
// "July 2023 in [1][3] vs …" reads as "July 2023 vs …": the citation and the word that led into it go.
const noCites = (s: string) => s.replace(/(?:\s+(?:in|on|from|per|by|at))?\s*(?:\[\d+\])+/g, '').replace(/\s+([.,;:)])/g, '$1').replace(/\s+/g, ' ').trim();
const twoTone = (a: string, b: string) => `${esc(a)}<br><span class="g">${esc(b)}</span>`;
// Claims a buyer would want checked against an official register.
const CLAIM = /\b(CIDB|SEDA|MyHIJAU|MyHijau|SSM|ISO|certif|accredit|licen[cs]|registered|grade|award|member|partner|distributor|approved|appointed)\b/i;

export function buildPreview(dive: any, offer: Offer = {}): string {
  const r = dive?.result ?? {};
  const id = r.identity ?? {};
  const name = String(id.legal_name ?? dive?.company ?? 'Your company');
  const facts: any[] = r.facts ?? [];
  const sources: any[] = r.sources ?? [];
  const contradictions: string[] = (r.contradictions ?? []).map((c: string) => noCites(String(c))).filter(Boolean);
  const gaps: string[] = (r.gaps ?? []).map((g: string) => noCites(String(g))).filter(Boolean);
  const people = (r.people?.people ?? []).filter((p: any) => p.name);
  const domains: string[] = id.official_domains ?? [];
  const ssm = (id.registration_numbers ?? []).find((x: string) => /^\d{12}$/.test(x)) ?? (id.registration_numbers ?? [])[0] ?? null;
  const town = String(id.address ?? '').match(/\b\d{5}\s+([^,]+)/)?.[1]?.trim() ?? 'your town';
  // "Solar photovoltaic (PV) EPC, …" becomes "solar photovoltaic company", so the openers read as a sentence.
  const kind = String(id.industry ?? '').split(/[,(;]/)[0].trim().toLowerCase();
  const trade = !kind ? 'business like yours' : /(installer|contractor|company|firm|shop|clinic|agency|supplier|provider|consultant|service)s?$/.test(kind) ? kind : `${kind} company`;
  const claims = facts.filter((f) => CLAIM.test(String(f.fact ?? '')) && !/^(legal name|SSM registration number)|private limited/i.test(String(f.fact))).slice(0, 10);
  const year = String(dive?.finished_at ?? new Date().toISOString()).slice(0, 4);
  const made = dateOf(dive?.finished_at);
  let pageNo = 0;
  const foot = () => `<footer class="pf"><span>${esc(name)} · Online Presence Audit ${esc(year)} · Preview</span><span>${++pageNo}</span></footer>`;

  // What each chapter of the full report does for this company, and the number it unlocks.
  const inside: Record<string, { will: string; know: string[]; locked: string }> = {
    reputation: {
      will: 'We read every Google review on every Maps listing that carries your name, one by one.',
      know: ['How many reviews have a reply from you, and which complaints are still unanswered', 'Review spikes Google may treat as a review drive and hold back', 'What customers praise you for, in their own words, ready to use on your website'],
      locked: '? of ? reviews answered',
    },
    findability: {
      will: `We search Google Maps and the web the way customers do, for your service in ${town} and every town you serve.`,
      know: ['Your rank in each town, and every business shown before you', 'Towns where you have no Maps listing at all', 'What a customer sees when they search for your name'],
      locked: '# ? on Google Maps',
    },
    ai: {
      will: 'We ask AI assistants, from memory and with a web search, the questions your customers ask: who to hire, and what they know about you.',
      know: ['How often you are recommended, and who is named instead', 'Every wrong phone number, address or website an assistant gives out about you', 'The pages assistants read, and which of them list your competitors but not you'],
      locked: 'Recommended in ? of ? answers',
    },
    website: {
      will: `We read every page of ${domains.length ? domains.join(', ') : 'your websites'} and test every link, phone number and WhatsApp link the way a customer would.`,
      know: ['Dead pages, empty pages and contact details that do not connect, with screenshots', 'Phone numbers and addresses that differ between your sites and Google', 'Copy errors and claims that contradict each other'],
      locked: '? urgent faults',
    },
    credentials: {
      will: `We look up each of the ${claims.length || 'licence and award'} claims we found in the issuing body’s own register: CIDB, SEDA, MyHIJAU, award organisers and more.`,
      know: ['Which claims the official register confirms', 'Which it contradicts, including any where you undersell yourself', 'Which no public register can back, so a buyer has to take your word for them'],
      locked: '? of ? claims confirmed',
    },
  };

  const offerBox = `<div class="panel dark" style="gap:10px;padding:22px 24px">
    <p class="lbl">Order your full report</p>
    ${offer.price ? `<p style="font-family:var(--display);font-size:30px;font-weight:600;letter-spacing:-0.02em">${esc(offer.price)}</p>` : ''}
    <p>${offer.contact ? esc(offer.contact) : 'Reply to the message that brought you this preview, and we will start your full audit.'}</p>
    ${offer.order_url && /^https?:\/\//.test(offer.order_url) ? `<a href="${esc(offer.order_url)}" style="justify-self:start;background:#fff;color:var(--ink);font-weight:600;padding:8px 14px;text-decoration:none">Order the full report</a>` : ''}
  </div>`;

  const body = `<section class="page dark cover">
  <div class="cover-top"><b>${esc(name)}</b><span>Online Presence Audit ${esc(year)} · Preview</span></div>
  <div class="cover-mid"><h1>We started looking<br>into your business.<br><span class="g">Here is a first look.</span></h1></div>
  <div class="cover-bot"><div><b>Prepared for ${esc(name)}</b>${ssm ? `SSM ${esc(ssm)}` : ''}${domains.length ? ` · ${esc(domains.join(', '))}` : ''}</div><div><b>Preview edition · ${esc(made)}</b>Built from ${esc(sources.length)} public sources. The full report adds your reviews, Google Maps, AI assistants, websites and official registers.</div></div>
</section>

<nav class="chapnav" aria-label="Sections"><a href="#glance">At a glance</a><a href="#stranger">What a stranger sees</a><a href="#mismatch">What does not add up</a><a href="#inside">Inside the full report</a><a href="#order">How to order</a><a href="#appendix">Research</a></nav>

<section class="page dark" id="glance">
  <p class="eyebrow">At a glance</p>
  <h2 class="display">What we already know.<br><span class="g">What we have not measured yet.</span></h2>
  <div class="stats">
    <div><b>${esc(sources.length)}</b><span>public sources read about you</span></div>
    <div><b>${esc(facts.length)}</b><span>facts on public record</span></div>
    <div><b>${esc(contradictions.length)}</b><span>places where sources disagree about you</span></div>
    <div><b>${esc(gaps.length)}</b><span>questions public sources cannot answer</span></div>
    ${people.length ? `<div><b>${esc(people.length)}</b><span>people linked to your company</span></div>` : ''}
  </div>
  ${id.summary ? `<p class="verdict" style="margin-top:14px">${esc(id.summary)}</p>` : ''}
  <div style="margin-top:auto;display:grid;gap:10px">
    <p class="lbl">Locked until you order: the five numbers your customers decide on</p>
    <div class="rows">${CHAPTER_ORDER.map((c) => `<a href="#in-${c}"><b>${esc(CHAPTER_EYEBROW[c])}</b><span>${esc(inside[c].locked)}</span><span class="pill info">Locked</span></a>`).join('')}</div>
  </div>
  ${foot()}
</section>

<section class="page" id="stranger">
  <p class="eyebrow">What a stranger sees</p>
  <h2 class="display">Before a customer calls,<br><span class="g">this is what they can find.</span></h2>
  <p class="lead" style="max-width:40em">Customers, banks and tender officers search you before they deal with you. This is the picture public sources give of ${esc(name)} today.</p>
  <table class="band idtable"><tbody>
    <tr><td>Company</td><td><b>${esc(name)}</b>${(id.aliases ?? []).length ? ` <span class="muted">also ${esc(id.aliases.join(', '))}</span>` : ''}</td></tr>
    ${(id.registration_numbers ?? []).length ? `<tr><td>Registration</td><td>${esc([...new Set(id.registration_numbers as string[])].join(' · '))}</td></tr>` : ''}
    ${id.industry ? `<tr><td>Industry</td><td>${esc(id.industry)}</td></tr>` : ''}
    ${id.address ? `<tr><td>Address</td><td>${esc(id.address)}</td></tr>` : ''}
    ${domains.length ? `<tr><td>Websites</td><td>${esc(domains.join(', '))}</td></tr>` : ''}
  </tbody></table>
  ${people.length ? `<h3 class="sub">People linked to you in public sources</h3><table class="band"><tbody>${people.slice(0, 8).map((p: any) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(clip(String(p.role ?? ''), 110))}</td></tr>`).join('')}</tbody></table>` : ''}
  ${claims.length ? `<h3 class="sub">Your claims, as the public sees them</h3>
  <p class="kicker">Every licence, grade and award a buyer will want to check. None of them has been checked against its register yet.</p>
  <table class="band"><tbody>${claims.map((f) => `<tr><td>${esc(clip(noCites(String(f.fact)), 150))}</td><td class="where"><span class="pill fix">Not yet checked</span></td></tr>`).join('')}</tbody></table>` : ''}
  ${foot()}
</section>

${contradictions.length || gaps.length ? `<section class="page" id="mismatch">
  <p class="eyebrow">What does not add up</p>
  <h2 class="display">${contradictions.length ? `${contradictions.length} places where your story` : 'Questions a careful buyer'}<br><span class="g">${contradictions.length ? 'changes from source to source.' : 'will ask, and cannot answer.'}</span></h2>
  ${contradictions.length ? `<p class="lead" style="max-width:40em">A customer comparing installers, or a bank checking a contractor, notices when the facts change from page to page. Each one is a small doubt, and doubts add up. The full report settles each one against the official records and tells you exactly what to correct, and where.</p>
  <table class="band"><tbody>${contradictions.map((c, i) => `<tr><td class="st-cell"><span class="pill fix">${String(i + 1).padStart(2, '0')}</span></td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${gaps.length ? `<h3 class="sub">What public sources cannot tell a customer</h3><p class="kicker">When the record is silent, a buyer fills the gap with doubt.</p><table class="band"><tbody>${gaps.map((g) => `<tr><td>${esc(g)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${foot()}
</section>` : ''}

<section class="page" id="inside">
  <p class="eyebrow">Inside the full report</p>
  <h2 class="display">Five questions your customers<br><span class="g">already ask about you.</span></h2>
  <p class="lead" style="max-width:40em">This preview shows what public sources say. The full report measures what customers actually see: your reviews, your place on Google Maps, what AI assistants tell them, your websites and your registrations. Each chapter ends with what to fix first, and the work is done for you.</p>
  <div class="three">${CHAPTER_ORDER.map((c, i) => `<div class="item" id="in-${c}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div>
    <p class="lbl">${esc(CHAPTER_EYEBROW[c])}</p><h3>${esc(OPENERS[c].q[0])} ${esc(OPENERS[c].q[1])}</h3>
    <p class="small" style="margin-top:6px">${esc(OPENERS[c].body({ trade, town }))}</p>
    <div class="cols"><div><p class="lbl">What we will do</p><p>${esc(inside[c].will)}</p></div><div><p class="lbl">What you will know</p><ul class="plain">${inside[c].know.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div></div></div></div>`).join('')}</div>
  ${foot()}
</section>

<section class="page" id="order">
  <p class="eyebrow">Ready to use, and how to order</p>
  <h2 class="display">Not just a report.<br><span class="g">The fixes, written for you.</span></h2>
  <div class="grid3">
    <div class="box"><h4>Your fixes, in order</h4><p>The five changes that win back the most customers, least effort first, and a week-by-week plan for your first 30 days.</p></div>
    <div class="box"><h4>Your homepage, rewritten</h4><p>A new headline, proof points and sections built only from facts the registers confirm.</p></div>
    <div class="box"><h4>Review replies, ready to post</h4><p>A reply for every unanswered complaint, a thank-you template and a WhatsApp message asking customers for a review.</p></div>
    <div class="box"><h4>Pages to add</h4><p>One page per service and town, outlined, so customers searching in each town can find you.</p></div>
    <div class="box"><h4>Getting recommended by AI</h4><p>The pages assistants read, the corrections they need, and an FAQ written for them to quote.</p></div>
    <div class="box"><h4>Business details for Google and AI</h4><p>The structured data your web developer pastes in, so search engines and assistants read the right name, address and phone.</p></div>
  </div>
  <h3 class="sub">How it works</h3>
  <div class="fixes">
    <div><div><h4>This preview</h4><p class="w">Built from ${esc(sources.length)} public sources on ${esc(made)}. Yours to keep.</p></div><div class="tags"><span class="pill good">Done</span></div></div>
    <div><div><h4>You order the full report</h4><p class="w">${offer.contact ? esc(offer.contact) : 'Tell us to go ahead, by reply to the message that brought you this preview.'}</p></div><div class="tags"><span class="pill info">Your step</span></div></div>
    <div><div><h4>We run the full audit</h4><p class="w">Your reviews, Google Maps in every town you serve, AI assistants, every page of your websites and each claim in its official register.</p></div><div class="tags"><span class="pill info">Our work</span></div></div>
    <div><div><h4>You receive your report</h4><p class="w">One link with three versions: desktop, mobile, and A4 to print or save as PDF.</p></div><div class="tags"><span class="pill info">Delivered</span></div></div>
  </div>
  ${offerBox}
  ${foot()}
</section>

<section class="page" id="appendix">
  <p class="eyebrow">Appendix</p>
  <h2 class="display">The research behind<br><span class="g">this preview.</span></h2>
  <p class="note">Written from public sources on ${esc(made)}. The full report checks these facts against your reviews, Google, AI assistants, your websites and the official registers.</p>
  <details><summary>Background research on the company</summary><div class="dossier">${md(String(dive?.dossier ?? ''))}</div></details>
  ${sources.length ? `<details><summary>Sources (${sources.length})</summary><ol class="sources">${sources.map((s: any) => `<li id="src-${esc(s.id)}" value="${esc(s.id)}">${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(clip(String(s.title || hostOf(s.url)), 90))}</a> · ${esc(hostOf(s.url))}` : esc(s.title)}</li>`).join('')}</ol></details>` : ''}
  ${foot()}
</section>`;

  return shell(`${name}: Online Presence Audit, preview`, body);
}
