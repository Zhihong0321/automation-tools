import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, buildPersonLedger, extractJson, facebookLedgerRows, highestRankedPerson, publishOutcome, round01Prompt, seniorityScore, unwrapUrl, validateChineseTranslation, validateFinal, validatePersonFinal } from './intel.ts';
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
  assert.deepEqual(purposes, ['Facebook Page phone', 'Facebook Page email', 'Messenger — company page']);
  // The owner's link was derived from his profile URL, not published by him, so
  // it is not evidence and must not reach the ledger.
  assert.ok(!purposes.some((p) => String(p).startsWith('Messenger — Lim')));
  assert.equal(built.people.length, 1);
  assert.equal(built.people[0].personal_profile_url, 'https://www.facebook.com/lim.wk.5');
  // A name with no stated role is a real finding and a useless ledger row.
  assert.match(built.gaps.join(' '), /Siti/);
  assert.match(String(built.signals[0].fact), /418 followers and 2 reviews/);
});

test('Round 03 contributes nothing from a page it is not confident about', () => {
  const weak = facebookLedgerRows(
    { confidence: 'weak', facebook_url: 'https://www.facebook.com/SomeOtherShop', phone: '011-000 0000' },
    { people: [{ name: 'Someone', role: 'Director', profile_url: 'https://www.facebook.com/someone.1' }] },
  );
  assert.equal(weak.pageUrl, null);
  assert.deepEqual([weak.contacts.length, weak.people.length, weak.signals.length], [0, 0, 0]);
  // And the rows it does build survive the ledger's own evidence filter.
  const strong = facebookLedgerRows({ confidence: 'likely', facebook_url: 'https://www.facebook.com/RealShop', phone: '016-712 7666' }, null);
  const ledger = buildLedger({ id: '9', name: 'Real Shop' }, [{ contacts: strong.contacts, people: strong.people, signals: strong.signals }]);
  assert.equal((ledger.contacts as Record<string, unknown>[]).length, 1);
  assert.equal((ledger.contacts as Record<string, unknown>[])[0].introduced_by, 'round03');
});

test('ledger retains only direct evidence URLs and immutable Maps phone', () => {
  const company = {
    id: '7', name: 'Example Solar', phone: '012-345 6789',
    maps_url: 'https://www.google.com/maps/place/Example/data=!4m2!3m1!1sabc',
  };
  const ledger = buildLedger(company, [{
    contacts: [
      { purpose: 'Careers', value: 'jobs@example.com', source_url: 'https://example.com/careers' },
      { purpose: 'Bad', value: 'invented@example.com', source_url: 'https://example.com/' },
    ],
    people: [{ name: 'A Person', role: 'CEO', role_url: 'https://example.com/team' }],
  }]);
  const contacts = ledger.contacts as Record<string, unknown>[];
  assert.equal(contacts.length, 2);
  assert.equal(contacts.some((r) => r.value_as_published === 'invented@example.com'), false);
  assert.equal((ledger.people as unknown[]).length, 1);
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

test('a Markdown-wrapped URL is still that URL, and is not raw output', () => {
  const raw = 'https://goldenbullaward.com/winner/inhome-solar-sdn-bhd/';
  assert.equal(unwrapUrl('[' + raw + '](' + raw + ')'), raw);
  assert.equal(unwrapUrl('[' + raw + ']'), raw);
  assert.equal(unwrapUrl(raw), raw);

  // A VIP brief published 17 evidence links wrapped like this and validation
  // passed, because the check only looked at strings starting with https://.
  const ledger = { facts: [{ id: 'fact_1', evidence_url: raw }], contacts: [], signals: [] };
  const wrapped = { facts: [{ id: 'fact_1', evidence_url: '[' + raw + '](' + raw + ')' }], contacts: [], signals: [] };
  const errors = validatePersonFinal(wrapped, ledger);
  assert.ok(errors.some((e) => e.includes('not a raw https:// string')), errors.join(' | '));

  // The same URL emitted raw is still accepted.
  assert.deepEqual(validatePersonFinal({ facts: [{ id: 'fact_1', evidence_url: raw }], contacts: [], signals: [] }, ledger), []);
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
    people: [{ name: 'A Person', role: 'CEO', role_url: 'https://example.com/team' }],
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
  assert.match(deep, /A Person.*Person research/);
  assert.match(deep, /People to verify/);
  assert.match(deep, /\/r\/abcdefghijklmnopqrst/);
  const bilingual = companyPage(deepReport, { ...deepReport.result, summary: '中文摘要' });
  assert.match(bilingual, /中文报告/);
  assert.match(bilingual, /中文摘要/);
  assert.match(bilingual, /data-report-language="en"/);
  assert.match(bilingual, /data-report-language-panel="zh-CN" hidden/);
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
