import test from 'node:test';
import assert from 'node:assert/strict';
import * as jobs from './jobs.ts';
import {
  JOB_TYPE,
  WORKER_NAME,
  createKeyPool,
  extractContactsPrompt,
  findPagesPrompt,
  laneName,
  research,
  resolveConfig,
  targetFromPayload,
  tavilySearch,
  toResearchResult,
  TAVILY_MONTHLY_LIMIT,
} from './gemini-contact-worker.ts';

const ENV = {
  GEMINI37_API_KEY: 'test-key',
  GEMINI37_BASE_URL: 'https://gemini.example',
  GEMINI37_MODEL: 'gemini-3.7-flash',
  GEMINI37_TIMEOUT_MS: '1000',
  GEMINI37_LANES: '2',
} as NodeJS.ProcessEnv;

test('gemini contact lanes register under the hub worker name', () => {
  assert.equal(JOB_TYPE, 'research.contact.gemini');
  assert.equal(laneName(0), WORKER_NAME);
  assert.equal(laneName(1), 'gemini37-contact-2');
  assert.equal(resolveConfig(ENV).lanes, 2);
  assert.equal(resolveConfig({}).apiKey, '');
});

test('find prompt uses only the name and address', () => {
  const prompt = findPagesPrompt(targetFromPayload({
    name: 'Acme Bakery',
    location: '12 Jalan Example, Johor Bahru',
    website: 'https://acme-bakery.example/contact',
  }));
  assert.match(prompt, /shop, restaurant, clinic, factory, school/);
  assert.doesNotMatch(prompt, /acme-bakery\.example/);
  assert.doesNotMatch(prompt, /lawyer|advocate|solicitor/i);
});

test('extract prompt keeps a printed title for any business', () => {
  const prompt = extractContactsPrompt(
    targetFromPayload({ name: 'Acme Bakery', location: 'Johor Bahru' }),
    ['https://acme-bakery.example/about'],
  );
  assert.match(prompt, /Head of Purchasing/);
  assert.match(prompt, /https:\/\/acme-bakery\.example\/about/);
  assert.doesNotMatch(prompt, /lawyer|advocate|solicitor/i);
});

test('the hub gives a gemini contact job to the gemini worker', async () => {
  jobs.touch('local-research', '203.0.113.8', ['research.contact']);
  jobs.touch(WORKER_NAME, '127.0.0.1', [JOB_TYPE]);
  const job = jobs.create(JOB_TYPE, { name: 'Acme Bakery', reportId: 'report-1' }, 0);
  assert.equal(await jobs.take('local-research', { types: ['research.contact'], waitMs: 0 }), null);
  const claimed = await jobs.take(WORKER_NAME, { types: [JOB_TYPE], waitMs: 0 });
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.worker, WORKER_NAME);
  assert.equal(jobs.liveTypes().includes(JOB_TYPE), true);
  jobs.finish(job.id, true, { ok: true }, null);
});

test('each gemini key runs at most two calls at once', async () => {
  const pool = createKeyPool();
  pool.setKeys(['ground-a', 'ground-b']);
  let highest = 0;
  const active = new Map<string, number>();
  await Promise.all(Array.from({ length: 8 }, async () => {
    const lease = await pool.acquire();
    const now = (active.get(lease.secret) ?? 0) + 1;
    active.set(lease.secret, now);
    highest = Math.max(highest, now);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active.set(lease.secret, (active.get(lease.secret) ?? 1) - 1);
    lease.release();
  }));
  assert.equal(highest, 2);
});

test('research runs tavily find then gemini extract for one assigned company', async () => {
  const tavilyQueries: string[] = [];
  const calls: Array<{ url: string; tools?: unknown; auth: string; body: unknown }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    const href = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (href.includes('api.tavily.com')) {
      tavilyQueries.push(body.query);
      calls.push({ url: href, auth: body.api_key, body });
      return new Response(JSON.stringify({
        results: [
          {
            title: 'Acme Bakery About Us',
            url: 'https://acme-bakery.example/about',
            content: 'Acme Bakery in Johor Bahru. Siti Aminah is Owner.',
          },
          {
            title: 'Jobstreet',
            url: 'https://www.jobstreet.com.my/job/9',
            content: 'Ad',
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    calls.push({ url: href, tools: body.tools, auth: headers['x-goog-api-key'] || '', body });
    const text = '{"people":[{"name":"Siti Aminah","position":"Owner","evidence_url":"https://acme-bakery.example/about"}],"phones":[{"number":"07-555 0101","label":"Siti Aminah mobile","evidence_url":"https://acme-bakery.example/contact"}],"emails":[{"email":"hello@acme-bakery.example","label":"General","evidence_url":"https://acme-bakery.example/contact"}]}';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await research({
    name: 'Acme Bakery',
    location: '12 Jalan Example, Johor Bahru',
    website: 'https://acme-bakery.example/contact',
  }, { env: ENV, fetchImpl: fetchMock, tavilyKey: 'tvly-test-key', officialKey: 'official-key' });

  assert.equal(tavilyQueries.length, 2);
  assert.match(tavilyQueries[0]!, /Acme Bakery.*Johor Bahru/);
  assert.match(tavilyQueries[1]!, /official website contact/);

  const officialCall = calls.find((c) => c.url.includes('generativelanguage.googleapis.com'));
  assert.ok(officialCall);
  assert.equal(officialCall.auth, 'official-key');
  assert.match(officialCall.url, /gemini-3\.8-flash/);
  assert.equal(officialCall.tools && 'url_context' in ((officialCall.tools as unknown[])[0] as object), true);

  const people = result.decision_makers as Array<Record<string, unknown>>;
  assert.equal(people[0]?.name, 'Siti Aminah');
  assert.equal(people[0]?.role, 'Owner');
  assert.equal(people[0]?.direct_phone, '07-555 0101');
  assert.equal((result.email_contacts as Array<Record<string, unknown>>)[0]?.email, 'hello@acme-bakery.example');
  const meta = result.research_meta as Record<string, unknown>;
  assert.match(String(meta.engine), /tavily/);
});

test('tavily key pool rotates round-robin and enforces monthly limit', async () => {
  const pool = createKeyPool({ monthlyLimit: 3, concurrency: 1 });
  pool.setKeys(['key-a', 'key-b']);

  // key-a, then key-b, then key-a, then key-b, etc.
  const lease1 = await pool.acquire();
  assert.equal(lease1.secret, 'key-a');
  lease1.release();

  const lease2 = await pool.acquire();
  assert.equal(lease2.secret, 'key-b');
  lease2.release();

  const lease3 = await pool.acquire();
  assert.equal(lease3.secret, 'key-a');
  lease3.release();

  const lease4 = await pool.acquire();
  assert.equal(lease4.secret, 'key-b');
  lease4.release();

  const lease5 = await pool.acquire();
  assert.equal(lease5.secret, 'key-a'); // key-a has now hit 3 uses (monthly limit: 3)
  lease5.release();

  // key-a should now be exhausted for this month
  const lease6 = await pool.acquire();
  assert.equal(lease6.secret, 'key-b'); // key-b has now hit 3 uses
  lease6.release();

  // Both key-a and key-b have hit 3 uses -> slots() is 0
  assert.equal(pool.slots(), 0);
  const stats = pool.stats();
  assert.equal(stats[0]?.usedThisMonth, 3);
  assert.equal(stats[1]?.usedThisMonth, 3);
});

test('tavily search handles rate limits and quota exceeded error', async () => {
  const fetch429: typeof fetch = async () => new Response('{"error":"usage_limit_reached"}', { status: 429 });
  await assert.rejects(
    () => tavilySearch({ name: 'Acme', location: '', website: '', extraUrls: [] }, 'test-key', fetch429),
    (err: unknown) => {
      assert.match(String(err), /rate_limit/);
      return true;
    },
  );
});


test('a returned name, phone, and email are kept even when the citation is not an exact page match', () => {
  const result = toResearchResult(
    { name: 'Kedai', website: '', extraUrls: [], location: 'Johor Bahru' },
    {
      people: [
        { name: '黄文福', position: '东主', evidence_url: 'https://shop.example/about' },
        { name: 'Ali bin Abu', position: 'Manager', evidence_url: 'https://other.example/team' },
      ],
      phones: [{ number: '012-3456789', label: 'Office', evidence_url: 'https://not-listed.example/x' }],
      emails: [{ email: 'ali@shop.example', label: 'Ali', evidence_url: '' }],
    },
    ['https://shop.example/about'],
  );
  const people = result.decision_makers as Array<Record<string, unknown>>;
  assert.deepEqual(people.map((person) => person.name).sort(), ['Ali bin Abu', '黄文福'].sort());
  assert.equal((result.phone_contacts as Array<Record<string, unknown>>)[0]?.number_raw, '012-3456789');
  assert.equal((result.email_contacts as Array<Record<string, unknown>>)[0]?.email, 'ali@shop.example');
});
