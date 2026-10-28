import test from 'node:test';
import assert from 'node:assert/strict';
import { enabled, handle, handlePage, handlePublic } from './divedeeper.ts';
import { buildReport } from './divedeeper/report-html.ts';
import { buildPreview } from './divedeeper/preview-html.ts';
import { runLane } from './divedeeper/runner.ts';

const fakeReq = (method: string, path: string) => ({ method, url: path, headers: { host: 'x' } }) as any;
const fakeRes = () => ({ writeHead() {}, end() {} }) as any;

test('dive-deeper is off unless DIVE_DEEPER_ENABLED says on', () => {
  assert.equal(enabled({}), false);
  assert.equal(enabled({ DIVE_DEEPER_ENABLED: '0' }), false);
  assert.equal(enabled({ DIVE_DEEPER_ENABLED: 'true' }), true);
  assert.equal(enabled({ DIVE_DEEPER_ENABLED: '1' }), true);
});

test('with the switch off every handler declines, so the hub behaves as before', async () => {
  const before = process.env.DIVE_DEEPER_ENABLED;
  delete process.env.DIVE_DEEPER_ENABLED;
  try {
    const ctx = { json: () => assert.fail('must not answer'), readJson: async () => ({}) };
    assert.equal(await handle(fakeReq('GET', '/api/dive-deeper'), fakeRes(), new URL('http://x/api/dive-deeper'), ctx), false);
    assert.equal(handlePage(fakeReq('GET', '/dive-deeper'), fakeRes(), new URL('http://x/dive-deeper')), false);
    assert.equal(await handlePublic(fakeReq('GET', '/dd/abcdefghijklmnopqrst'), fakeRes(), new URL('http://x/dd/abcdefghijklmnopqrst')), false);
    assert.equal(await handlePublic(fakeReq('GET', '/dp/abcdefghijklmnopqrst'), fakeRes(), new URL('http://x/dp/abcdefghijklmnopqrst')), false);
  } finally {
    if (before !== undefined) process.env.DIVE_DEEPER_ENABLED = before;
  }
});

test('the report builds all three parts from data alone, and survives missing lanes', () => {
  const dive = {
    company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z',
    dossier: '# Acme\n\n## Identity\n\nAcme makes widgets [1].\n\n| Item | Detail |\n|---|---|\n| Name | Acme |',
    result: { identity: { legal_name: 'Acme Sdn Bhd', official_domains: ['acme.my'], registration_numbers: ['202301000001'] }, facts: [], sources: [{ id: 1, url: 'https://acme.my/', title: 'Acme' }], contradictions: [], gaps: [], people: { people: [] } },
  };
  const lanes = {
    'E-maps': { ran_at: '2026-10-26T01:00:00Z', findings: [{ title: '1★ review with no reply', detail: 'x', severity: 'high', source: 'https://maps.example/' }] },
    'S2-consult': { notes: { top: { summary: 'Short summary.', top5: [{ fix: 'Reply to reviews', why: 'none answered', effort: '1 hour', impact: 'high' }] } } },
  };
  const html = buildReport(dive, lanes);
  for (const part of ['id="stories"', 'Your fixes, in order', 'What a stranger sees', 'The full checklist', 'Background research', '1★ review with no reply', 'Reply to reviews', 'id="src-1"']) assert.ok(html.includes(part), part);
  assert.ok(!/undefined|\[object Object\]|NaN/.test(html.replace(/<style[\s\S]*?<\/style>/, '')));
});

test('the report speaks the editor\'s plain words and never shows the lanes\' machine labels', () => {
  const dive = { company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z', dossier: '', result: { identity: { legal_name: 'Acme Sdn Bhd' } } };
  const lanes = {
    'D-registry': { ran_at: '2026-10-26T01:00:00Z', findings: [{ title: 'CONTRADICTED: CIDB Grade G3', detail: 'register says G7', severity: 'high', verdict: 'contradicted', direction: 'undersell', source: 'https://cims.cidb.gov.my/' }] },
    'G-fixed': { ran_at: '2026-10-26T01:00:00Z', findings: [{ title: 'gpt-6.1-sol, asked "Where?": 1 wrong claim about you. [2 of 3 asks; others: doesnt_know]', detail: 'Outcomes: what=correct', severity: 'high', source: null }] },
    'S3-editor': { notes: {
      plain: { 'G-fixed#0': { title: 'An AI assistant gives customers the wrong office address', why: 'They may turn up at the wrong place.' } },
      verdict: 'You are better than your website says.',
      stories: [{ theme: 'ai', headline: 'AI assistants send customers to the wrong address', body: 'b', cost: 'c', fix: 'f' }],
    } },
  };
  const html = buildReport(dive, lanes).replace(/<style[\s\S]*?<\/style>/, '');
  for (const s of ['An AI assistant gives customers the wrong office address', 'AI assistants send customers to the wrong address', 'You are better than your website says.', 'Better than you claim']) assert.ok(html.includes(s), s);
  for (const bad of ['CONTRADICTED:', 'doesnt_know', 'gpt-6.1-sol', 'what=correct']) assert.ok(!html.includes(bad), bad);
});

test('a lane that cannot load comes back partial instead of throwing', async () => {
  const r = await runLane('Z', 'missing', 'test-0', { company: 'Acme' });
  assert.equal(r.status, 'partial');
  assert.match(r.warnings[0], /no lane file/);
});

test('the preview builds from the company-dive alone and keeps the five numbers locked', () => {
  const dive = {
    company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z', dossier: '## Identity\n\nAcme makes widgets [1].',
    result: {
      identity: { legal_name: 'Acme Sdn Bhd', address: '1 Jalan Satu, 81100 Johor Bahru, Johor', official_domains: ['acme.my'], registration_numbers: ['202301000001'], industry: 'Widget installation' },
      facts: [{ fact: 'Claims CIDB Grade G7 registration [2].' }], sources: [{ id: 1, url: 'https://acme.my/', title: 'Acme' }],
      contradictions: ['Founding month: July 2023 in [1] vs September 2023 in [2].'], gaps: ['Directors are not named.'], people: { people: [{ name: 'Ali', role: 'CEO' }] },
    },
  };
  const html = buildPreview(dive, { price: 'RM 990' }).replace(/<style[\s\S]*?<\/style>/, '');
  for (const s of ['Preview', 'Founding month: July 2023 vs September 2023.', 'Claims CIDB Grade G7 registration.', 'Not yet checked', 'Locked', 'RM 990', 'How important is an AI recommendation', 'id="src-1"']) assert.ok(html.includes(s), s);
  assert.ok(!/undefined|\[object Object\]|NaN/.test(html));
  assert.ok(!/\[\d+\]/.test(html.replace(/<details[\s\S]*<\/details>/g, '')), 'no [n] citations outside the research appendix');
  assert.ok(buildPreview({ company: 'Empty' }).includes('Empty'), 'a dive with no result still builds');
});
