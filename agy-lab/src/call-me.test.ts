import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, normalizeWhatsapp, ipHash, memoryStore, placeCall, submit, handlePublic, handleApi, MESSAGES,
  type Deps, type CallMeRow,
} from './call-me.ts';
import { callMePage } from './call-me-page.ts';
import { document as openApiDocument } from './openapi.ts';

const ENV = { VOXDOCK_URL: 'https://voice.test/', VOXDOCK_TOKEN: 'secret-token-value' } as NodeJS.ProcessEnv;
const CTX = { ip: '203.0.113.7', userAgent: 'test-agent' };

interface Call { url: string; init: RequestInit }
function fakeVoice(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

function setup(over: Partial<Deps> = {}) {
  const store = memoryStore();
  let n = 0;
  const deps: Partial<Deps> = { store, env: ENV, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, ...over };
  return { store, deps };
}
const good = { name: 'Ali', company: '', whatsapp: '012-345 6789', website: '' };

test('numbers are normalised to E.164, Malaysia by default, others only with +', () => {
  for (const raw of ['012-3456789', '0123456789', '60123456789', '+60 12-345 6789', '12-345 6789', ' +6012 3456789 '])
    assert.equal(normalizeWhatsapp(raw), '+60123456789', raw);
  assert.equal(normalizeWhatsapp('+65 9123 4567'), '+6591234567');
  assert.equal(normalizeWhatsapp('+44 7911 123456'), '+447911123456');
  // not mobile, too short, junk, wrong types
  for (const raw of ['03-1234 5678', '+60 3-1234 5678', '0123', '', 'abc', '012-345 6789 ext 5', '9123 4567 8901 2345'])
    assert.equal(normalizeWhatsapp(raw), null, raw);
  assert.equal(normalizeWhatsapp(undefined), null);
  assert.equal(normalizeWhatsapp(60123456789), null);
});

test('text is trimmed, stripped of control characters and capped at 120', () => {
  assert.equal(cleanText('  Ali \u0000\u0007 Bin\tAbu\n '), 'Ali Bin Abu');
  assert.equal(cleanText('x'.repeat(500)).length, 120);
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText({ a: 1 }), '');
});

test('the IP is stored only as a salted hash', () => {
  const h = ipHash('203.0.113.7', {});
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes('203'));
  assert.notEqual(h, ipHash('203.0.113.7', { CALL_ME_IP_PEPPER: 'other' }));
  assert.equal(h, ipHash('203.0.113.7', {}));
});

test('name or company: at least one is required, each alone is enough', async () => {
  const calls: Call[] = [];
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'c1', state: 'dialing' }, calls) });
  const none = await submit({ name: ' ', company: '\u0000', whatsapp: '0123456789' }, CTX, deps);
  assert.deepEqual([none.ok, none.code, none.message], [false, 'missing_name_or_company', MESSAGES.missing_name_or_company]);
  assert.equal(calls.length, 0);
  assert.equal((await submit({ name: 'Ali', whatsapp: '0123456789' }, CTX, { ...deps, uuid: () => 'a1' })).code, 'requested');
  assert.equal((await submit({ company: 'Acme', whatsapp: '0123456780' }, CTX, { ...deps, uuid: () => 'a2' })).code, 'requested');
  const rows = await store.latest(10);
  assert.equal(rows.find((r) => r.status === 'missing_name_or_company')?.whatsapp_e164, null);
});

test('an invalid number is recorded and nothing is dialled', async () => {
  const calls: Call[] = [];
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'c1' }, calls) });
  const out = await submit({ ...good, whatsapp: '03-1234 5678' }, CTX, deps);
  assert.deepEqual([out.ok, out.code, out.http], [false, 'invalid_number', 400]);
  assert.equal(calls.length, 0);
  assert.equal((await store.latest(5))[0].status, 'invalid_number');
});

test('a call goes to the voice service with the contract body, and the call id is saved', async () => {
  const calls: Call[] = [];
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'call-9', state: 'dialing' }, calls) });
  const out = await submit({ name: 'Ali', company: 'Acme', whatsapp: '012-345 6789' }, CTX, deps);
  assert.deepEqual([out.ok, out.code, out.message], [true, 'requested', MESSAGES.requested]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://voice.test/v1/visitor-calls');
  assert.equal(calls[0].init.method, 'POST');
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.authorization, 'Bearer secret-token-value');
  assert.equal(h['content-type'], 'application/json');
  assert.ok(calls[0].init.signal, 'a timeout signal is set');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { request_ref: '00000000-0000-4000-8000-000000000001', phone: '+60123456789', name: 'Ali', company: 'Acme' });
  const row = (await store.latest(1))[0];
  assert.equal(row.status, 'requested');
  assert.equal(row.voxdock_call_id, 'call-9');
  assert.equal(row.whatsapp_e164, '+60123456789');
  assert.equal(row.user_agent, 'test-agent');
  assert.ok(!JSON.stringify(row).includes('203.0.113.7'), 'no raw IP is stored');
  // an absent name is omitted from the body
  const calls2: Call[] = [];
  await submit({ company: 'Acme', whatsapp: '012-345 6780' }, CTX, { ...deps, fetch: fakeVoice(201, { call_id: 'x' }, calls2), store: memoryStore() });
  assert.deepEqual(Object.keys(JSON.parse(String(calls2[0].init.body))), ['request_ref', 'phone', 'company']);
});

test('each voice-service answer maps to a status', async () => {
  const cases: Array<[number, unknown, string]> = [
    [200, { call_id: 'a' }, 'requested'],
    [201, { call_id: 'a' }, 'requested'],
    [202, { call_id: 'a', state: 'dialing' }, 'requested'],
    [409, { error: 'busy' }, 'busy'],
    [429, { error: 'phone_limit' }, 'limited'],
    [400, { error: 'invalid_phone' }, 'invalid_number'],
    [400, { error: 'name_or_company_required' }, 'missing_name_or_company'],
    [400, { error: 'invalid_request' }, 'error'],
    [503, { error: 'calling_disabled' }, 'error'],
    [401, { error: 'unauthorized' }, 'error'],
    [403, { error: 'forbidden' }, 'error'],
    [500, 'not json', 'error'],
  ];
  for (const [status, body, want] of cases) {
    const r = await placeCall({ env: ENV, fetch: fakeVoice(status, body) }, { request_ref: 'r', phone: '+60123456789' });
    assert.equal(r.status, want, `${status} ${JSON.stringify(body)}`);
  }
  // end to end: what the visitor sees
  const { deps } = setup({ fetch: fakeVoice(409, { error: 'busy' }) });
  const busy = await submit(good, CTX, deps);
  assert.deepEqual([busy.ok, busy.code, busy.message], [false, 'busy', MESSAGES.busy]);
  const { deps: d2 } = setup({ fetch: fakeVoice(503, { error: 'calling_disabled' }) });
  const err = await submit(good, CTX, d2);
  assert.deepEqual([err.ok, err.code, err.message], [false, 'error', MESSAGES.generic]);
});

test('network failure and timeout become a labelled error, never a throw', async () => {
  const boom = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  const timeout = (async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
  for (const f of [boom, timeout]) {
    const { store, deps } = setup({ fetch: f });
    const out = await submit(good, CTX, deps);
    assert.deepEqual([out.ok, out.code, out.message], [false, 'error', MESSAGES.generic]);
    const row = (await store.latest(1))[0];
    assert.equal(row.status, 'error');
    assert.ok(row.detail && row.detail.length < 120);
    assert.ok(!row.detail!.includes('secret-token-value'));
  }
});

test('without VOXDOCK_URL or VOXDOCK_TOKEN the request is saved as not_configured', async () => {
  for (const env of [{}, { VOXDOCK_URL: 'https://voice.test' }, { VOXDOCK_TOKEN: 'abc' }] as NodeJS.ProcessEnv[]) {
    const calls: Call[] = [];
    const { store, deps } = setup({ env, fetch: fakeVoice(202, { call_id: 'x' }, calls) });
    const out = await submit(good, CTX, deps);
    assert.deepEqual([out.ok, out.code, out.message], [false, 'not_configured', MESSAGES.generic]);
    assert.equal(calls.length, 0);
    assert.equal((await store.latest(1))[0].status, 'not_configured');
  }
});

test('the honeypot looks like success but dials nothing and is recorded as spam', async () => {
  const calls: Call[] = [];
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'x' }, calls) });
  const out = await submit({ ...good, website: 'http://spam.example' }, CTX, deps);
  assert.deepEqual([out.ok, out.message, out.http], [true, MESSAGES.requested, 200]);
  assert.equal(calls.length, 0);
  assert.equal((await store.latest(1))[0].status, 'spam');
});

test('limits: 2 per number per 24h, labelled limited and recorded', async () => {
  const calls: Call[] = [];
  let t = Date.parse('2026-01-01T00:00:00Z');
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'x' }, calls), now: () => t });
  const ip = (i: number) => ({ ip: `198.51.100.${i}`, userAgent: 'ua' });
  assert.equal((await submit(good, ip(1), deps)).code, 'requested');
  assert.equal((await submit(good, ip(2), deps)).code, 'requested');
  const third = await submit(good, ip(3), deps);
  assert.deepEqual([third.ok, third.code, third.message, third.http], [false, 'limited', MESSAGES.limited, 429]);
  assert.equal(calls.length, 2);
  assert.equal((await store.latest(1))[0].status, 'limited');
  // another number is unaffected
  assert.equal((await submit({ ...good, whatsapp: '019-876 5432' }, ip(3), deps)).code, 'requested');
  // after 24h the same number may ask again
  t += 24 * 3600_000 + 1000;
  assert.equal((await submit(good, ip(4), deps)).code, 'requested');
});

test('limits: 5 per client IP per hour', async () => {
  const calls: Call[] = [];
  let t = Date.parse('2026-01-01T00:00:00Z');
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'x' }, calls), now: () => t });
  for (let i = 0; i < 5; i++) assert.equal((await submit({ ...good, whatsapp: `012-300 00${10 + i}`.replace(/\s/g, '') }, CTX, deps)).code, 'requested', `request ${i}`);
  const sixth = await submit({ ...good, whatsapp: '0123000099' }, CTX, deps);
  assert.deepEqual([sixth.code, sixth.message], ['limited', MESSAGES.limited]);
  assert.equal(calls.length, 5);
  assert.equal((await store.latest(1))[0].status, 'limited');
  // another client is fine, and the hour passes
  assert.equal((await submit({ ...good, whatsapp: '0123000099' }, { ip: '192.0.2.1', userAgent: 'u' }, deps)).code, 'requested');
  t += 3600_000 + 1000;
  assert.equal((await submit({ ...good, whatsapp: '0123000098' }, CTX, deps)).code, 'requested');
});

test('a busy answer does not use up the number limit', async () => {
  const { deps } = setup({ fetch: fakeVoice(409, { error: 'busy' }) });
  for (let i = 0; i < 3; i++) assert.equal((await submit(good, { ip: `192.0.2.${i}`, userAgent: 'u' }, deps)).code, 'busy');
});

test('a failing store never stops the answer', async () => {
  const broken = {
    insert: async () => { throw new Error('db down'); }, update: async () => { throw new Error('db down'); },
    countNumber: async () => { throw new Error('db down'); }, countIp: async () => { throw new Error('db down'); },
    latest: async () => { throw new Error('db down'); },
  };
  const out = await submit(good, CTX, { env: ENV, store: broken, fetch: fakeVoice(202, { call_id: 'x' }) });
  assert.equal(out.code, 'error');
  assert.equal(out.message, MESSAGES.generic);
});

test('the page holds the heading, fields, note text and the Call me button', () => {
  const html = callMePage();
  assert.match(html, /<h1>Let Eternalgy Telemarketing AI Agent call You<\/h1>/);
  assert.match(html, /让恒浩能源的 AI 电话助理给您来电/);
  assert.match(html, /<button type="submit" id="go">Call me<\/button>/);
  assert.ok(html.includes('WhatsApp number only.'));
  assert.ok(html.includes("You must provide at least your name or your company name. We do not call a number when we don't know who or which company it belongs to."));
  assert.ok(html.includes('By pressing Call me you agree that our AI agent calls this WhatsApp number once, now.'));
  assert.ok(html.includes('e.g. 012-345 6789 or +60 12-345 6789'));
  assert.match(html, /name="website"[^>]*tabindex="-1"/);
  assert.match(html, /role="status" aria-live="polite"/);
  for (const m of Object.values(MESSAGES).slice(0, 5)) assert.ok(html.includes(m.replace('—', '\\u2014')) || html.includes(m), m);
  assert.ok(!html.includes('secret'));
});

function fakeReq(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = { method, url: path, headers: { host: 'x', ...headers }, socket: { remoteAddress: '10.0.0.1' },
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; } };
  return req as any;
}
function fakeRes() {
  const r = { status: 0, headers: {} as Record<string, string>, body: '',
    writeHead(s: number, h: Record<string, string>) { r.status = s; r.headers = h; },
    end(b: string) { r.body = b; } };
  return r;
}

test('GET /call-me serves the noindex page; other paths fall through', async () => {
  const res = fakeRes();
  assert.equal(await handlePublic(fakeReq('GET', '/call-me'), res as any, new URL('http://x/call-me')), true);
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /Call me/);
  assert.equal(await handlePublic(fakeReq('GET', '/call-mex'), fakeRes() as any, new URL('http://x/call-mex')), false);
  assert.equal(await handlePublic(fakeReq('GET', '/api/call-me-requests'), fakeRes() as any, new URL('http://x/api/call-me-requests')), false);
});

test('POST /call-me answers {ok, code, message} only, with no CORS header, even for junk bodies', async () => {
  const { store, deps } = setup({ fetch: fakeVoice(202, { call_id: 'c7' }) });
  const res = fakeRes();
  await handlePublic(fakeReq('POST', '/call-me', good, { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }), res as any, new URL('http://x/call-me'), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(res.body)).sort(), ['code', 'message', 'ok']);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const row = (await store.latest(1))[0];
  assert.equal(row.ip_hash, ipHash('198.51.100.9', ENV), 'first x-forwarded-for entry is used');
  for (const junk of ['not json', '[1,2]', '"str"', undefined]) {
    const r = fakeRes();
    assert.equal(await handlePublic(fakeReq('POST', '/call-me', junk), r as any, new URL('http://x/call-me'), deps), true);
    assert.equal(r.status, 400);
    assert.equal(JSON.parse(r.body).code, 'missing_name_or_company');
  }
});

test('GET /api/call-me-requests lists the latest requests without any IP data', async () => {
  const { deps } = setup({ fetch: fakeVoice(202, { call_id: 'c1' }) });
  await submit(good, CTX, deps);
  let sent: any;
  const ok = await handleApi(fakeReq('GET', '/api/call-me-requests'), fakeRes() as any, new URL('http://x/api/call-me-requests'),
    { json: (_r, status, body) => { sent = { status, body }; } }, deps);
  assert.equal(ok, true);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.count, 1);
  const row = sent.body.requests[0] as Partial<CallMeRow>;
  assert.equal(row.status, 'requested');
  assert.equal('ip_hash' in row, false);
  assert.equal(await handleApi(fakeReq('POST', '/api/call-me-requests'), fakeRes() as any, new URL('http://x/api/call-me-requests'), { json: () => {} }), false);
});

test('the OpenAPI contract documents both routes', () => {
  assert.ok(openApiDocument.paths['/call-me'].post);
  assert.deepEqual(openApiDocument.paths['/call-me'].post.security, []);
  assert.ok(openApiDocument.paths['/api/call-me-requests'].get);
});
