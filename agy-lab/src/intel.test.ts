import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, classifyEvidence, buildPersonLedger, extractJson, facebookLedgerRows, highestRankedPerson, normaliseUrls, publishOutcome, round01Prompt, seniorityScore, translateChinese, unwrapUrl, validateChineseTranslation, validateFinal, validatePersonFinal } from './intel.ts';
import { companyPage, personPage, searchPage } from './reportui.ts';
import type { PublishedReport } from './reportdb.ts';

test('extractJson accepts fenced output and rejects prose without an object', () => {
  assert.deepEqual(extractJson('```json\n{"contacts":[]}\n```').value, { contacts: [] });
  assert.match(extractJson('No usable data').error ?? '', /no JSON/);
});

test('Round 03 admits only what Facebook published, and only off a trusted page', () => {
  const page = {
    found: true, confidence: 'confirmed', facebook_url: 'https://www.facebook.com/Riomation2u',
    phone: '016-712 7666', email: 'riomation.services@gmail.com', followers: '418', reviews: 2,
    messenger_url: 'https://m.me/Riomation2u', messenger_source: 'detected',
  };
  const discovered = {
    company_url: 'https://www.facebook.com/Riomation2u',
    people: [
      { name: 'Lim Wei Kang', role: 'Owner', confidence: 'likely', source: 'Page post signed by the owner',
        profile_url: 'https://www.facebook.com/lim.wk.5', messenger_url: 'https://m.me/lim.wk.5', messenger_source: 'derived' },
      { name: 'Siti', role: null, confidence: 'weak', source: 'named in a comment',
        profile_url: null, messenger_url: null, messenger_source: null },
    ],
  };
  const built = facebookLedgerRows(page, discovered);
  const purposes = built.contacts.map((c) => c.purpose);
  assert.deepEqual(purposes, ['Facebook Page phone', 'Facebook Page email', 'Messenger — company page', 'Messenger — Lim Wei Kang']);
  // The owner's Messenger link was derived from his profile URL rather than
  // published. It is still a link that opens a chat with him, so it is kept and
  // labelled derived instead of being discarded.
  const derived = built.contacts.find((c) => String(c.purpose).startsWith('Messenger — Lim'))!;
  assert.equal(derived.derived, true);
  assert.equal(derived.evidence_class, 'facebook_link_derived_from_profile');
  // Both named humans survive. Siti has no stated role; that is said on her row
  // rather than being a reason to delete her.
  assert.equal(built.people.length, 2);
  assert.equal(built.people[0].personal_profile_url, 'https://www.facebook.com/lim.wk.5');
  const siti = built.people.find((p) => p.name === 'Siti')!;
  assert.equal(siti.role_stated, false);
  assert.match(String(siti.role), /Role not stated/);
  assert.match(String(built.signals[0].fact), /418 followers and 2 reviews/);
});

test('Round 03 grades an unconfident page match instead of binning it', () => {
  // This used to return empty for a `weak` match: the page's phone, email,
  // Messenger link, follower count and every person on it were thrown away
  // because the match was not certain. A weak match that really is this company
  // is a real finding; whether to believe it is the reader's call.
  const weak = facebookLedgerRows(
    { confidence: 'weak', facebook_url: 'https://www.facebook.com/SomeOtherShop', phone: '011-000 0000' },
    { people: [{ name: 'Someone', role: 'Director', profile_url: 'https://www.facebook.com/someone.1' }] },
  );
  assert.equal(weak.pageUrl, 'https://www.facebook.com/SomeOtherShop');
  assert.equal(weak.contacts.length, 1);
  assert.equal(weak.people.length, 1);
  assert.equal(weak.contacts[0].evidence_class, 'facebook_page_unconfirmed_match');
  assert.equal(weak.contacts[0].facebook_match_confidence, 'weak');
  // And the risk is stated plainly rather than handled by deletion.
  assert.match(weak.gaps.join(' '), /may belong to a different business/);
  // And the rows it does build survive the ledger's own evidence filter.
  const strong = facebookLedgerRows({ confidence: 'likely', facebook_url: 'https://www.facebook.com/RealShop', phone: '016-712 7666' }, null);
  const ledger = buildLedger({ id: '9', name: 'Real Shop' }, [{ contacts: strong.contacts, people: strong.people, signals: strong.signals }]);
  assert.equal((ledger.contacts as Record<string, unknown>[]).length, 1);
  assert.equal((ledger.contacts as Record<string, unknown>[])[0].introduced_by, 'round03');
});

test('the ledger grades evidence and discards nothing', () => {
  // The old rule deleted any row whose evidence was a homepage or http. On one
  // measured production run that binned 14 of 37 researched rows -- silently,
  // including four from the company's own site plus SEDA, MyHIJAU and CTOS.
  // Deciding what to believe is the reader's job, so every row survives and
  // carries a grade instead.
  const company = {
    id: '7', name: 'Example Solar', phone: '012-345 6789',
    maps_url: 'https://www.google.com/maps/place/Example/data=!4m2!3m1!1sabc',
  };
  const ledger = buildLedger(company, [{
    contacts: [
      { purpose: 'Careers', value: 'jobs@example.com', source_url: 'https://example.com/careers' },
      { purpose: 'Homepage', value: 'hello@example.com', source_url: 'https://example.com/' },
      { purpose: 'Insecure', value: 'sales@example.com', source_url: 'http://example.com/contact' },
      { purpose: 'Uncited', value: 'nourl@example.com' },
    ],
    people: [{ name: 'A Person', role: 'CEO', role_url: 'https://example.com/team' }],
  }]);
  const contacts = ledger.contacts as Record<string, unknown>[];
  const strength = (v: string) => contacts.find((r) => r.value_as_published === v)?.evidence_strength;

  // Four researched contacts plus the immutable Maps phone. Nothing dropped.
  assert.equal(contacts.length, 5);
  assert.equal(strength('jobs@example.com'), 'direct_page');
  assert.equal(strength('hello@example.com'), 'domain_only');
  assert.equal(strength('sales@example.com'), 'insecure_page');
  assert.equal(strength('nourl@example.com'), 'unsourced');
  assert.equal((ledger.people as unknown[]).length, 1);

  // And the report says out loud what it is made of, so the weak rows are
  // visible as weak rather than invisible as deleted.
  const breakdown = (ledger.validation as Record<string, unknown>).evidence_breakdown as Record<string, number>;
  assert.equal(breakdown.domain_only, 1);
  assert.equal(breakdown.insecure_page, 1);
  assert.equal(breakdown.unsourced, 1);
});

test('classifyEvidence grades every shape a round can return', () => {
  assert.equal(classifyEvidence('https://seda.gov.my/directory/x').strength, 'direct_page');
  assert.equal(classifyEvidence('https://www.seda.gov.my').strength, 'domain_only');
  assert.equal(classifyEvidence('https://www.seda.gov.my/').strength, 'domain_only');
  assert.equal(classifyEvidence('http://www.sungate.energy/').strength, 'insecure_domain');
  assert.equal(classifyEvidence('http://xsolar.my/about').strength, 'insecure_page');
  assert.equal(classifyEvidence('https://www.google.com/search?q=x').strength, 'search_result');
  assert.equal(classifyEvidence('China Press, 3 March').strength, 'unsourced');
  assert.equal(classifyEvidence(null).strength, 'unsourced');
  // A Markdown-wrapped URL is still that URL.
  assert.equal(classifyEvidence('[https://seda.gov.my/a](https://seda.gov.my/a)').url, 'https://seda.gov.my/a');
  // A Maps place URL stays strong even though its path looks odd.
  assert.equal(classifyEvidence('https://www.google.com/maps/place/X/data=!4m2').strength, 'direct_page');
});

test('ledger keeps named source people as candidates without weakening validated people', () => {
  const ledger = buildLedger({ id: '7', name: 'Example Solar' }, [{
    people: [{ name: 'Verified Person', role: 'CEO', role_url: 'https://example.com/team/ceo' }],
    candidate_people: [
      { name: 'Registry Contact', current_role: 'Director', source_name: 'SSM / e-Info' },
      { name: 'Employee Lead', current_role: 'Employee', source_name: 'LinkedIn company listing', source_url: 'https://www.linkedin.com/company/example/people/' },
      { name: 'Unsourced', current_role: 'Manager' },
    ],
  }]);
  assert.equal((ledger.people as unknown[]).length, 1);
  const candidates = ledger.candidate_people as Record<string, unknown>[];
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.verification_status, 'needs_direct_role_evidence');
  assert.equal(candidates.some((row) => row.name === 'Unsourced'), false);
});

test('final validation rejects changed people and newly invented URLs', () => {
  const ledger = {
    entity: { maps_url: 'https://www.google.com/maps/place/Example/data=!4m2' },
    contacts: [{ id: 'contact_1', evidence_url: 'https://example.com/contact' }],
    people: [{ id: 'person_1', role_url: 'https://example.com/team' }],
    signals: [], conflicts_and_unknowns: [],
  };
  assert.deepEqual(validateFinal({ ...ledger }, ledger), []);
  const errors = validateFinal({
    ...ledger,
    people: [{ id: 'person_fake', role_url: 'https://example.com/fake' }],
  }, ledger);
  assert.ok(errors.some((e) => /people id set/.test(e)));
  assert.ok(errors.some((e) => /new URL/.test(e)));
  assert.ok(validateFinal({ ...ledger, candidate_people: [{ id: 'candidate_fake' }] }, ledger).some((e) => /candidate people id set/.test(e)));
});

test('Chinese translation keeps evidence identifiers and contact routes canonical', () => {
  const english = {
    entity: { company_id: '7', name: 'Example Solar', maps_url: 'https://example.com/maps', phone: '+6012345' },
    contacts: [{ id: 'contact_1', purpose: 'Main office', value_as_published: 'hello@example.com', normalized_value: 'hello@example.com', evidence_url: 'https://example.com/contact' }],
    people: [{ id: 'person_1', name: 'A Person', role: 'Chief Executive', role_url: 'https://example.com/team' }],
    signals: [{ id: 'signal_1', fact: 'Opened a new office.', evidence_url: 'https://example.com/news' }],
    conflicts_and_unknowns: [], summary: 'A short summary.', outreach_angles: ['Ask about expansion.'],
  };
  const chinese = {
    ...english, summary: '简短摘要。', outreach_angles: ['询问扩张计划。'],
    contacts: [{ ...english.contacts[0], purpose: '总办公室' }],
    people: [{ ...english.people[0], role: '首席执行官' }],
    signals: [{ ...english.signals[0], fact: '开设了新办公室。' }],
  };
  assert.deepEqual(validateChineseTranslation(chinese, english), []);
  chinese.contacts[0]!.evidence_url = 'https://example.com/changed';
  assert.ok(validateChineseTranslation(chinese, english).some((error) => /canonical value changed/.test(error)));
});

test('VIP ledger retains public evidence and rejects a synthesis that invents a source', () => {
  const company = { id: '7', name: 'Example Solar' };
  const person = { id: 'person_1', name: 'A Person', role: 'CEO', role_url: 'https://example.com/team' };
  const ledger = buildPersonLedger(company, person, [{
    contacts: [{ purpose: 'Company enquiries', value_as_published: 'hello@example.com', evidence_url: 'https://example.com/contact' }],
    facts: [{ category: 'Interview', fact: 'Discussed clean-energy projects.', evidence_url: 'https://example.com/interview' }],
    signals: [{ date: '2026-08-20', fact: 'Opened a new office.', evidence_url: 'https://example.com/news/opening' }],
  }]);
  assert.equal((ledger.facts as unknown[]).length, 2);
  assert.equal((ledger.contacts as unknown[]).length, 1);
  assert.equal((ledger.signals as unknown[]).length, 1);
  assert.deepEqual(validatePersonFinal({ ...ledger }, ledger), []);
  const errors = validatePersonFinal({
    ...ledger,
    facts: [{ id: 'new_fact', evidence_url: 'https://example.com/invented' }],
  }, ledger);
  assert.ok(errors.some((error) => /fact id set|new URL/.test(error)));
});

test('automatic VIP selection uses the company report P01 person', () => {
  const selected = highestRankedPerson({ id: '7', name: 'Example Solar' }, [{
    people: [
      { name: 'Founder One', role: 'Founder & CEO', role_url: 'https://example.com/team/founder' },
      { name: 'Director Two', role: 'Sales Director', role_url: 'https://example.com/team/sales' },
    ],
  }]);
  assert.equal(selected?.name, 'Founder One');
  assert.equal(selected?.role, 'Founder & CEO');
});

test('one person listed under several titles is one person, at their most senior title', () => {
  // The Eternalgy report carried "Gan Lai Soon" three times because the key was
  // name+role and the rounds transcribed the title three ways.
  const ledger = buildLedger({ id: '807', name: 'Eternalgy Sdn Bhd' }, [{
    people: [
      { name: 'Gan Lai Soon', role: 'Director', role_url: 'https://myhijau.my/listing/eternalgy' },
      { name: 'Gan Lai Soon', role: 'CEO & Founder; Director', role_url: 'https://goldenbullaward.com/winners/eternalgy' },
      { name: 'Gan Lai Soon', role: 'CEO & Founder / Director', role_url: 'https://example.com/award' },
      { name: 'Adam Hafiz', role: 'Solar PV Designer', role_url: 'https://linkedin.com/in/adam' },
    ],
  }]);
  const people = ledger.people as Array<Record<string, unknown>>;
  assert.equal(people.filter((p) => p.name === 'Gan Lai Soon').length, 1);
  assert.equal(people[0]!.name, 'Gan Lai Soon');
  assert.equal(people[0]!.role, 'CEO & Founder; Director');
  // Nothing sourced is discarded -- the other transcriptions are kept beside it.
  assert.ok((people[0]!.also_described_as as string[]).includes('Director'));
});

test('P01 is the most senior person, not the first one mentioned', () => {
  const selected = highestRankedPerson({ id: '9', name: 'Example Solar' }, [{
    people: [
      { name: 'Junior Ops', role: 'Site Manager', role_url: 'https://example.com/team/ops' },
      { name: 'Tech Person', role: 'Technical Officer', role_url: 'https://example.com/team/tech' },
      { name: 'The Boss', role: 'Managing Director', role_url: 'https://example.com/team/md' },
    ],
  }]);
  assert.equal(selected?.name, 'The Boss');
});

test('seniority ranks a chief executive above a manager above an engineer', () => {
  assert.ok(seniorityScore('CEO & Founder') > seniorityScore('General Manager'));
  assert.ok(seniorityScore('General Manager') > seniorityScore('Lead Electrical Engineer'));
  // Punctuation and spacing must not change the reading.
  assert.equal(seniorityScore('CEO & Founder; Director'), seniorityScore('CEO / Founder'));
});

test('round 01 forbids the shell, which is what denied it permission', () => {
  // A launchd worker has nobody to approve a shell command, so agy must be told
  // to use its own URL reader instead of choosing curl and killing the round.
  const prompt = round01Prompt({ id: '1', name: 'Example Solar', website: 'https://example.com' });
  assert.match(prompt, /read_url_content/);
  assert.match(prompt, /Never use the shell, terminal, bash, curl or wget/);
});

test('a Markdown-wrapped URL is repaired, not rejected', () => {
  const raw = 'https://goldenbullaward.com/winner/inhome-solar-sdn-bhd/';
  assert.equal(unwrapUrl('[' + raw + '](' + raw + ')'), raw);
  assert.equal(unwrapUrl('[' + raw + ']'), raw);
  assert.equal(unwrapUrl(raw), raw);

  // A VIP brief published 17 evidence links wrapped like this, and the fix for
  // it rejected the whole synthesis instead -- costing a real report its
  // summary over a bracket. Formatting is repaired and published.
  const ledger = { facts: [{ id: 'fact_1', evidence_url: raw }], contacts: [], signals: [] };
  const wrapped = { facts: [{ id: 'fact_1', evidence_url: '[' + raw + '](' + raw + ')' }], contacts: [], signals: [] };
  const repaired = normaliseUrls(wrapped);
  assert.deepEqual(repaired, { facts: [{ id: 'fact_1', evidence_url: raw }], contacts: [], signals: [] });
  assert.deepEqual(validatePersonFinal(repaired, ledger), []);

  // The same URL emitted raw is still accepted.
  assert.deepEqual(validatePersonFinal({ facts: [{ id: 'fact_1', evidence_url: raw }], contacts: [], signals: [] }, ledger), []);

  // Integrity still rejects: repairing the wrapper does not admit a URL that is
  // not in the ledger, in either validator.
  const invented = 'https://example.com/invented';
  const forgedPerson = normaliseUrls({ facts: [{ id: 'fact_1', evidence_url: '[' + invented + '](' + invented + ')' }], contacts: [], signals: [] });
  assert.ok(validatePersonFinal(forgedPerson, ledger).some((e) => e.startsWith('new URL:')));
  const companyLedger = { contacts: [{ id: 'c_1', evidence_url: raw }], people: [], candidate_people: [] };
  const forgedCompany = normaliseUrls({ contacts: [{ id: 'c_1', evidence_url: '[' + invented + '](' + invented + ')' }], people: [], candidate_people: [] });
  assert.ok(validateFinal(forgedCompany, companyLedger).some((e) => e.startsWith('new URL:')));

  // Prose that merely contains a link, and a bracketed non-URL, are untouched.
  assert.deepEqual(
    normaliseUrls({ summary: 'See [the award page](' + raw + ') for detail.', note: '[redacted]', count: 3, missing: null }),
    { summary: 'See [the award page](' + raw + ') for detail.', note: '[redacted]', count: 3, missing: null },
  );
});

test('an imperfect Chinese translation is delivered, not binned', async () => {
  // One mismatched row used to throw, and the reader got no Chinese report at
  // all. The translation is built by copying the English report and replacing
  // text in place, so ids, URLs and phone numbers carry over structurally.
  const canonical = { contacts: [{ id: 'c1', value_as_published: 'a@b.com' }], people: [], signals: [], summary: 'Hello' };
  const errors = validateChineseTranslation({ ...canonical, summary: '你好' }, canonical);
  assert.deepEqual(errors, []);
  // A genuine discrepancy is still reported -- it is just no longer fatal.
  const broken = validateChineseTranslation({ ...canonical, contacts: [] }, canonical);
  assert.ok(broken.length > 0);
});

test('the Chinese translation sends its batches at once, not one after another', async () => {
  // This is the regression that mattered: seven independent batches were awaited
  // in a loop, one full round trip each, and the endpoint is a stateless
  // completion API that nothing in the queue governs. If somebody puts the
  // `for (... ) { await ... }` back, peak concurrency drops to 1 and this fails.
  const summary: Record<string, string> = {};
  for (let i = 0; i < 90; i++) summary['field_' + i] = 'text ' + i;
  const finalReport = { contacts: [], people: [], signals: [], notes: summary };

  let inflight = 0;
  let peak = 0;
  const realFetch = globalThis.fetch;
  const previousKey = process.env.TRANSLATION_API_KEY;
  process.env.TRANSLATION_API_KEY = 'test-key';
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    inflight++;
    peak = Math.max(peak, inflight);
    const sent = JSON.parse(init.body) as { messages: Array<{ content: string }> };
    const input = JSON.parse(sent.messages[1]!.content.split('INPUT: ')[1]!) as string[];
    // Long enough that a serial implementation cannot overlap by luck.
    await new Promise((resolve) => setTimeout(resolve, 40));
    inflight--;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '```json\n' + JSON.stringify({ translations: input.map((t) => 'ZH:' + t) }) + '\n```' } }] }),
    };
  }) as unknown as typeof globalThis.fetch;

  try {
    const out = await translateChinese(finalReport);
    // Three batches of 30, and every one of them mapped back to its own path.
    assert.equal(peak, 3, 'expected all three batches in flight together, saw peak ' + peak);
    assert.equal((out.translated.notes as Record<string, string>).field_0, 'ZH:text 0');
    assert.equal((out.translated.notes as Record<string, string>).field_89, 'ZH:text 89');
  } finally {
    globalThis.fetch = realFetch;
    if (previousKey === undefined) delete process.env.TRANSLATION_API_KEY;
    else process.env.TRANSLATION_API_KEY = previousKey;
  }
});

function report(type: 'business_search' | 'company_research' | 'person_research'): PublishedReport {
  return {
    id: '1', public_id: 'abcdefghijklmnopqrst', report_type: type, status: 'completed',
    title: 'Mobile report', user_id: null, request: {}, source_search_report_id: null,
    company_id: null, job_id: null, result: {}, error: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  };
}

test('both public report layouts include mobile viewport and report content', () => {
  const search = searchPage(report('business_search'), {
    report: { found: 1 },
    companies: [{ id: '4', name: 'Example Solar', phone: '0123', maps_url: 'https://maps.example/one' }],
  });
  const deepReport = report('company_research');
  deepReport.result = {
    contacts: [{ purpose: 'Main', value: '+60123', evidence_url: 'https://example.com/contact' }],
    people: [
      { id: 'person_aaaa', name: 'A Person', role: 'CEO', role_url: 'https://example.com/team' },
      { id: 'person_bbbb', name: 'Second Person', role: 'CFO', role_url: 'https://example.com/team' },
      { name: 'Nameless Id', role: 'Unknown' },
    ],
    candidate_people: [{ name: 'A Lead', role: 'Employee', source_name: 'LinkedIn listing', verification_note: 'Confirm current role.' }],
    auto_person_research: { report_id: 'abcdefghijklmnopqrst', person_name: 'A Person' },
  };
  const deep = companyPage(deepReport);
  for (const html of [search, deep]) {
    assert.match(html, /width=device-width/);
    assert.match(html, /@media\(max-width:760px\)/);
  }
  assert.match(search, /Example Solar/);
  assert.match(deep, /Best contact routes/);
  assert.match(deep, /People to verify/);
  // P01 already has a brief, so their control LINKS to it and must not offer to
  // start a second one.
  assert.match(deep, /A Person.*\/r\/abcdefghijklmnopqrst/);
  assert.doesNotMatch(deep, /data-person="person_aaaa"/);
  // Everyone else gets a button that starts their own brief. Before this, the
  // fifteen people who were not P01 had no control at all.
  assert.match(deep, /Second Person.*data-person="person_bbbb"/);
  assert.match(deep, /Person research/);
  // A person the pipeline could not give an id to cannot be researched by id,
  // so they get no button rather than one that would 400.
  assert.doesNotMatch(deep, /Nameless Id<\/h3>\s*<button/);
  // The trigger posts to the authenticated endpoint and never puts the key in a URL.
  assert.match(deep, /\/api\/person-research/);
  assert.match(deep, /Bearer/);
  assert.doesNotMatch(deep, /token=/);
  const bilingual = companyPage(deepReport, { ...deepReport.result, summary: '中文摘要' });
  assert.match(bilingual, /中文报告/);
  assert.match(bilingual, /中文摘要/);
  assert.match(bilingual, /data-report-language="en"/);
  assert.match(bilingual, /data-report-language-panel="zh-CN" hidden/);
});

test('a report page asks for the access key once, not once per tab', () => {
  // The key used to live in sessionStorage, which is per-tab: every report link
  // opened in a new tab prompted again. It now goes to a first-party cookie
  // (mirrored to localStorage, because Safari expires script-written cookies) so
  // one entry covers every tab, every report and every restart.
  const deepReport = report('company_research');
  deepReport.result = {
    people: [{ id: 'person_bbbb', name: 'Second Person', role: 'CFO', role_url: 'https://example.com/team' }],
  };
  const html = companyPage(deepReport);
  assert.match(html, /var stored=eeKey\.read\(\)/);
  assert.match(html, /Max-Age='\+YEAR/);
  assert.match(html, /localStorage\.setItem\(NAME,value\)/);
  assert.doesNotMatch(html, /sessionStorage\.setItem\(KEY/);
  // Only a key the server itself rejected is thrown away, and the prompt is
  // reached solely when nothing is stored.
  assert.match(html, /response\.status===401\|\|response\.status===403\)\{\s*eeKey\.clear\(\)/);
  assert.match(html, /if\(stored\)return stored;\s*var typed=\(window\.prompt/);
  // The stored key stays out of the wire format the server reads: bearer only.
  assert.doesNotMatch(html, /token=/);
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(script[1]));
  }
});

test('VIP brief layout labels public-professional scope and evidence', () => {
  const brief = report('person_research');
  brief.title = 'A Person VIP brief';
  brief.result = {
    person: { name: 'A Person', current_role: 'CEO', company_name: 'Example Solar' },
    contacts: [{ purpose: 'Company enquiries', value_as_published: 'hello@example.com', evidence_url: 'https://example.com/contact', evidence_class: 'first_party' }],
    facts: [{ category: 'Current role', fact: 'A Person is CEO.', evidence_url: 'https://example.com/team', evidence_class: 'first_party' }],
  };
  const html = personPage(brief);
  assert.match(html, /VIP brief/);
  assert.match(html, /No private or sensitive-person data is included/);
  assert.match(html, /A Person is CEO/);
  assert.match(html, /hello@example.com/);
});

test('a run where no round produced output is failed, not partial', () => {
  // The Joe's Kitchen case: the ask lane was busy on another report, aged out of
  // the lab's live-worker table, and every round was refused before it queued.
  const offline = [
    'No mini worker is claiming agy.ask right now.',
    'No mini worker is claiming chatgpt.ask right now.',
    'No mini worker is claiming chatgpt.ask right now.',
    'No mini worker is claiming chatgpt.ask right now.',
    'No mini worker is claiming meta.ask right now.',
    'No mini worker is claiming agy.ask right now.',
  ];
  const out = publishOutcome(0, offline);
  assert.equal(out.status, 'failed');
  assert.match(out.error ?? '', /no findings/);
  // One offline engine is one fact however many rounds it turned away.
  assert.equal((out.error ?? '').match(/No mini worker/g)?.length, 3);
});

test('outcome separates a clean run from one with gaps', () => {
  assert.deepEqual(publishOutcome(6, []), { status: 'completed', error: null });
  assert.equal(publishOutcome(5, ['Round 03 returned no JSON object.']).status, 'partial');
});

test('a failed report shows the reason and lights no round pips', () => {
  const failed = report('company_research');
  failed.status = 'failed';
  failed.error = 'No research round produced any output, so this report has no findings.';
  failed.result = {};
  const html = companyPage(failed);
  assert.match(html, /Research failed/);
  assert.match(html, /no findings/);
  assert.equal(html.match(/class="round on"/g), null);
  // A genuine partial still reports what it managed to publish.
  const partial = report('company_research');
  partial.status = 'partial';
  assert.equal(companyPage(partial).match(/class="round on"/g)?.length, 3);
});

// The company-identity SQL is built in JS template literals, where `\s` is NOT
// an escape sequence and silently collapses to a bare `s`. That exact slip
// shipped once: Postgres received '(^|s)(sdns*bhd|...)$' and 's+', matched
// nothing, and every merge statement updated zero rows without erroring.
test('the identity SQL survives the template literal it is written in', async () => {
  const { NAME_KEY_SQL, REGISTERED_SQL } = await import('./reportdb.ts');
  for (const [label, sql] of [['name key', NAME_KEY_SQL], ['suffix test', REGISTERED_SQL]] as const) {
    assert.ok(sql.includes('[[:space:]]'), label + ' must use POSIX classes, not backslash escapes');
    assert.ok(!/\\/.test(sql), label + ' must contain no backslash a template literal can eat');
    assert.ok(!/\(\^\|s\)/.test(sql), label + ' shows the collapsed-escape signature (^|s)');
    assert.ok(!/sdns\*bhd/.test(sql), label + ' shows the collapsed-escape signature sdns*bhd');
  }
  assert.ok(REGISTERED_SQL.startsWith('~*'), 'the suffix test is a regex match operator');
  assert.ok(NAME_KEY_SQL.includes('lower(btrim(name))'), 'the name key normalises the name column');
});

// Person research needs a completed dossier: /api/person-research rejects a
// source report that is still running, so the page must not offer the button yet.
test('a company report still running offers no person-research button', () => {
  const running = report('company_research');
  running.status = 'running';
  running.result = { people: [{ id: 'person_cccc', name: 'Someone', role: 'CEO' }] };
  const html = companyPage(running);
  assert.doesNotMatch(html, /data-person="person_cccc"/);
});

// A brief that has finished says so, instead of reading as an invitation to start one.
test('an existing brief is linked, and its label reflects whether it is done', () => {
  const done = report('company_research');
  done.result = { people: [{ id: 'person_dddd', name: 'Finished Person', role: 'CEO' }] };
  const html = companyPage(done, null, {
    person_dddd: { public_id: 'zyxwvutsrqponmlkjihg', status: 'completed' },
  });
  assert.match(html, /\/r\/zyxwvutsrqponmlkjihg/);
  assert.match(html, /Open brief/);
  assert.doesNotMatch(html, /data-person="person_dddd"/);
});

test('the contact cap keeps what was crawled, not what arrived first', () => {
  // Replays report 4oGBOcwnj1SqbmfOVtC- (Eternalgy, 23 Aug 2026). Round 01 filed
  // 20 contacts -- five branch addresses and every social profile -- which with
  // the Maps phone and Round 02's three numbers filled all 24 slots. Round 03 is
  // merged last, so the rows fb-recon had actually crawled off the live Page
  // (its phone, its email and three Messenger links, one of them the route to a
  // named person) were sliced off the end and never reached the report.
  const round01 = {
    contacts: Array.from({ length: 20 }, (_, i) => ({
      purpose: 'branch_office', value: 'Branch ' + i + ', Johor Bahru',
      source_url: 'https://eternalgy.me', _round: 'round01',
    })),
  };
  const round02 = {
    contacts: Array.from({ length: 3 }, (_, i) => ({
      purpose: 'whatsapp', value: '+6011200000' + i, source_url: 'https://eternalgy.me', _round: 'round02',
    })),
  };
  const round03 = facebookLedgerRows(
    { confidence: 'confirmed', facebook_url: 'https://www.facebook.com/eternalgy',
      phone: '011-2067 2895', email: 'admin@eternalgy.my',
      messenger_url: 'https://m.me/eternalgy', messenger_source: 'derived' },
    { company_url: 'https://www.facebook.com/eternalgy', people: [{
      name: 'Odelia Wong', role: 'Solar consultant', confidence: 'likely', source: 'Personal page',
      profile_url: 'https://www.facebook.com/profile.php?id=61592124102749',
      messenger_url: 'https://m.me/61592124102749', messenger_source: 'derived' }] },
  );
  const ledger = buildLedger(
    { id: '807', name: 'Eternalgy Sdn Bhd', phone: '011-2067 2895',
      maps_url: 'https://www.google.com/maps/place/Eternalgy/data=!4m2!3m1!1sabc' },
    [round01, round02, { contacts: round03.contacts, people: round03.people, signals: round03.signals }],
  );
  const contacts = ledger.contacts as Record<string, unknown>[];
  const value = (purpose: string) => contacts.find((r) => r.purpose === purpose)?.value_as_published;

  // The cap still holds -- this is about which 24 survive, not how many.
  assert.equal(contacts.length, 24);
  // Every crawled row is present, including the Messenger route to the person.
  assert.equal(value('Messenger — Odelia Wong'), 'https://m.me/61592124102749');
  assert.equal(value('Messenger — company page'), 'https://m.me/eternalgy');
  assert.equal(value('Facebook Page phone'), '011-2067 2895');
  assert.equal(value('Facebook Page email'), 'admin@eternalgy.my');
  // The Maps phone is the entity's own identifier and is never displaced.
  assert.equal(value('Google Maps phone'), '011-2067 2895');
  // Survivors keep the order they were collected in: gmap, then the rounds.
  assert.equal(contacts[0].purpose, 'Google Maps phone');
  assert.equal(contacts[contacts.length - 1].introduced_by, 'round03');
  // What was dropped is Round 01 filler -- and Round 02's three numbers, far
  // fewer rows, are not starved by it.
  assert.equal(contacts.filter((r) => r.introduced_by === 'round02').length, 3);
  assert.equal(contacts.filter((r) => r.introduced_by === 'round01').length, 16);
});
