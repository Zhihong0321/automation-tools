import test from 'node:test';
import assert from 'node:assert/strict';
import { enabled, handle, handlePage, handlePublic, previewAuto } from './divedeeper.ts';
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

test('previews are written automatically unless DD_PREVIEW_AUTO says off', () => {
  assert.equal(previewAuto({}), true);
  assert.equal(previewAuto({ DD_PREVIEW_AUTO: 'on' }), true);
  assert.equal(previewAuto({ DD_PREVIEW_AUTO: 'off' }), false);
  assert.equal(previewAuto({ DD_PREVIEW_AUTO: '0' }), false);
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

test('the preview landing page builds from the company-dive alone, uses the editor notes, and keeps the five numbers locked', () => {
  const dive = {
    company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z', dossier: '## Identity\n\nAcme makes widgets [1].',
    result: {
      identity: { legal_name: 'Acme Sdn Bhd', address: '1 Jalan Satu, 81100 Johor Bahru, Johor', official_domains: ['acme.my'], registration_numbers: ['202301000001'], industry: 'Widget installation' },
      facts: [{ fact: 'Claims CIDB Grade G7 registration [2].' }], sources: [{ id: 1, url: 'https://acme.my/', title: 'Acme' }],
      contradictions: ['Founding month: July 2023 in [1] vs September 2023 in [2].'], gaps: ['Directors are not named.'], people: { people: [{ name: 'Ali', role: 'CEO' }] },
    },
  };
  const html = buildPreview(dive, { price: 'RM 990' }).replace(/<style[\s\S]*?<\/style>/, '');
  for (const s of ['Prepared for Acme Sdn Bhd', 'July 2023 vs September 2023.', 'Directors are not named.', 'Contradiction', 'Missing', 'Locked', 'RM 990', 'How important is an AI recommendation', 'id="src-1"']) assert.ok(html.includes(s), s);
  assert.ok(!/undefined|\[object Object\]|NaN/.test(html));
  assert.ok(!/\[\d+\]/.test(html.replace(/<details[\s\S]*<\/details>/g, '')), 'no [n] citations outside the research appendix');
  assert.ok(buildPreview({ company: 'Empty' }).includes('Empty'), 'a dive with no result still builds');
  // What the full report holds, in its three parts, with the company's own claims mapped to their register.
  for (const s of ['Part 1 · The deeper dive', 'Part 2 · The credibility check', 'Part 3 · Analysis and suggestions', 'How top AI sees your brand', 'How search engines index your company', 'Claims CIDB Grade G7 registration.', 'CIDB contractor register', 'acme.my', 'in Johor Bahru']) assert.ok(html.includes(s), s);
  assert.ok(buildPreview({ ...dive, finished_at: new Date('2026-10-25T10:00:00Z') }).includes('Online Presence Audit 2026'), 'a Date finished_at still gives the year');
  const edited = buildPreview(dive, {}, { hook: 'Your award label is a year out.', known: [{ label: 'Founded', value: 'July 2023' }], warnings: [{ type: 'outdated', title: 'Award label still says 2024', detail: 'd', risk: 'r' }] });
  for (const s of ['Your award label is a year out.', 'Award label still says 2024', 'Outdated', 'July 2023']) assert.ok(edited.includes(s), s);
});

test('the public preview names only leadership and shows no phone, private document or unrelated source', () => {
  const dive = {
    company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z', dossier: '| Phone | +60 11-2341 1550 (Ali Staff) | [3] |',
    result: {
      identity: { legal_name: 'Acme Sdn Bhd', official_domains: ['acme.my'] },
      people: { people: [{ name: 'Boss Bin Owner', role: 'CEO & Founder' }, { name: 'Ali Staff', role: 'Site manager, phone +60 11-2341 1550' }] },
      sources: [{ id: 1, url: 'https://acme.my/', title: 'Acme', relevant: true }, { id: 2, url: 'https://quote-app.example/proposal?uid=abc', title: 'Proposal', relevant: true }, { id: 3, url: 'https://eternally.example/', title: 'Eternally', relevant: false }],
      contradictions: ['Phone: Ali Staff gives +60 11-2341 1550 vs 012-7165685 on the site.'], gaps: [],
    },
  };
  const notes = { hook: 'Ali Staff answers on +60 11-2341 1550.', known: [{ label: 'Team', value: 'Ali Staff runs sites' }], warnings: [{ type: 'missing' as const, title: 'See ee-proposal-production.up.railway.app?uid=abc', detail: 'Ali Staff, 012-7165685', risk: 'r' }] };
  for (const html of [buildPreview(dive), buildPreview(dive, {}, notes)]) {
    for (const bad of ['Ali Staff', '2341', '7165685', 'uid=', 'proposal-production', 'quote-app.example', 'eternally.example']) assert.ok(!html.includes(bad), bad);
    assert.ok(html.includes('Boss Bin Owner'), 'leadership stays');
    assert.ok(html.includes('We read 1 public sources'), 'only relevant, non-private sources are counted');
  }
});

test('the full report lists no private document or unrelated source, and its write-up hides private links', () => {
  const dive = {
    company: 'Acme Sdn Bhd', finished_at: '2026-10-25T10:00:00Z', dossier: '| Proposal app | ee-proposal-production.up.railway.app, one per customer via uid | [2] |',
    result: { identity: { legal_name: 'Acme Sdn Bhd' }, sources: [{ id: 1, url: 'https://acme.my/', title: 'Acme', relevant: true }, { id: 2, url: 'https://x.example/inv-m2/123', title: 'Invoice', relevant: true }, { id: 3, url: 'https://other.example/', title: 'Other', relevant: false }] },
  };
  const html = buildReport(dive, {});
  for (const bad of ['ee-proposal-production', 'inv-m2', 'other.example']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('a private customer document') && html.includes('acme.my'));
});
