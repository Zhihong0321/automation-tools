import test from 'node:test';
import assert from 'node:assert/strict';
import { enabled, handle, handlePage, handlePublic } from './divedeeper.ts';
import { buildReport } from './divedeeper/report-html.ts';
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
  for (const part of ['Part 1', 'Part 2', 'Part 3', 'Company dossier', '1★ review with no reply', 'Reply to reviews', 'id="src-1"']) assert.ok(html.includes(part), part);
  assert.ok(!/undefined|\[object Object\]/.test(html.replace(/<style[\s\S]*?<\/style>/, '')));
});

test('a lane that cannot load comes back partial instead of throwing', async () => {
  const r = await runLane('Z', 'missing', 'test-0', { company: 'Acme' });
  assert.equal(r.status, 'partial');
  assert.match(r.warnings[0], /no lane file/);
});
