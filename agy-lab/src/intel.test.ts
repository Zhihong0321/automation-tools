import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, buildPersonLedger, extractJson, publishOutcome, validateChineseTranslation, validateFinal, validatePersonFinal } from './intel.ts';
import { companyPage, personPage, searchPage } from './reportui.ts';
import type { PublishedReport } from './reportdb.ts';

test('extractJson accepts fenced output and rejects prose without an object', () => {
  assert.deepEqual(extractJson('```json\n{"contacts":[]}\n```').value, { contacts: [] });
  assert.match(extractJson('No usable data').error ?? '', /no JSON/);
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
    facts: [{ category: 'Interview', fact: 'Discussed clean-energy projects.', evidence_url: 'https://example.com/interview' }],
    signals: [{ date: '2026-08-20', fact: 'Opened a new office.', evidence_url: 'https://example.com/news/opening' }],
  }]);
  assert.equal((ledger.facts as unknown[]).length, 2);
  assert.equal((ledger.signals as unknown[]).length, 1);
  assert.deepEqual(validatePersonFinal({ ...ledger }, ledger), []);
  const errors = validatePersonFinal({
    ...ledger,
    facts: [{ id: 'new_fact', evidence_url: 'https://example.com/invented' }],
  }, ledger);
  assert.ok(errors.some((error) => /fact id set|new URL/.test(error)));
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
  };
  const deep = companyPage(deepReport);
  for (const html of [search, deep]) {
    assert.match(html, /width=device-width/);
    assert.match(html, /@media\(max-width:760px\)/);
  }
  assert.match(search, /Example Solar/);
  assert.match(deep, /Best contact routes/);
  const bilingual = companyPage(deepReport, { ...deepReport.result, summary: '中文摘要' });
  assert.match(bilingual, /中文报告/);
  assert.match(bilingual, /中文摘要/);
});

test('VIP brief layout labels public-professional scope and evidence', () => {
  const brief = report('person_research');
  brief.title = 'A Person VIP brief';
  brief.result = {
    person: { name: 'A Person', current_role: 'CEO', company_name: 'Example Solar' },
    facts: [{ category: 'Current role', fact: 'A Person is CEO.', evidence_url: 'https://example.com/team', evidence_class: 'first_party' }],
  };
  const html = personPage(brief);
  assert.match(html, /VIP brief/);
  assert.match(html, /No private or sensitive-person data is included/);
  assert.match(html, /A Person is CEO/);
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
