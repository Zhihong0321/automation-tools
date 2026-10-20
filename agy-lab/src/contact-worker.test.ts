import test from 'node:test';
import assert from 'node:assert/strict';
import * as jobs from './jobs.ts';
import * as pi from './pi.ts';
import {
  JOB_TYPE,
  WORKER_NAME,
  createKeyPool,
  extractContactsPrompt,
  laneName,
  research,
  resolveConfig,
  targetFromPayload,
  tavilySearch,
  toResearchResult,
} from './contact-worker.ts';

test('pi contact lanes register under the hub worker name', () => {
  assert.equal(JOB_TYPE, 'research.contact.pi');
  assert.equal(laneName(0), WORKER_NAME);
  assert.equal(laneName(1), 'pi-contact-2');
  assert.equal(resolveConfig({ CONTACT_LANES: '2' }).lanes, 2);
  assert.equal(resolveConfig({}).lanes, 3);
});

test('extract prompt keeps a printed title for any business and carries the page text', () => {
  const prompt = extractContactsPrompt(
    targetFromPayload({ name: 'Acme Bakery', location: 'Johor Bahru' }),
    [{ url: 'https://acme-bakery.example/about', text: 'Siti Aminah, Owner' }],
  );
  assert.match(prompt, /Head of Purchasing/);
  assert.match(prompt, /<page url="https:\/\/acme-bakery\.example\/about">\nSiti Aminah, Owner\n<\/page>/);
  assert.doesNotMatch(prompt, /lawyer|advocate|solicitor/i);
});

test('the hub gives a pi contact job to the pi worker', async () => {
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

test('each tavily key runs at most two calls at once', async () => {
  const pool = createKeyPool();
  pool.setKeys(['key-a', 'key-b']);
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

test('research runs tavily find, reads the pages, then pi extracts with no tools', async () => {
  const tavilyQueries: string[] = [];
  const fetched: string[] = [];
  const fetchMock: typeof fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('api.tavily.com')) {
      tavilyQueries.push(JSON.parse(String(init?.body ?? '{}')).query);
      return new Response(JSON.stringify({
        results: [
          { title: 'Acme Bakery About Us', url: 'https://acme-bakery.example/about', content: 'Acme Bakery in Johor Bahru. Siti Aminah is Owner.' },
          { title: 'Jobstreet', url: 'https://www.jobstreet.com.my/job/9', content: 'Ad' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    fetched.push(href);
    return new Response('<html><body><h1>About</h1><p>Siti Aminah, Owner. Mobile 07-555 0101. hello@acme-bakery.example</p><script>x()</script></body></html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    });
  };
  const prompts: Array<{ prompt: string; tools: boolean }> = [];
  pi.setRunnerForTests(async (prompt, opts) => {
    prompts.push({ prompt, tools: opts.tools });
    return '{"people":[{"name":"Siti Aminah","position":"Owner","evidence_url":"https://acme-bakery.example/about"}],"phones":[{"number":"07-555 0101","label":"Siti Aminah mobile","evidence_url":"https://acme-bakery.example/contact"}],"emails":[{"email":"hello@acme-bakery.example","label":"General","evidence_url":"https://acme-bakery.example/contact"}]}';
  });
  try {
    const result = await research({
      name: 'Acme Bakery',
      location: '12 Jalan Example, Johor Bahru',
      website: 'https://acme-bakery.example/contact',
    }, { fetchImpl: fetchMock, tavilyKey: 'tvly-test-key' });

    assert.equal(tavilyQueries.length, 2);
    assert.match(tavilyQueries[0]!, /Acme Bakery.*Johor Bahru/);
    assert.match(tavilyQueries[1]!, /official website contact/);
    assert.deepEqual(fetched.sort(), ['https://acme-bakery.example/about', 'https://acme-bakery.example/contact']);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0]!.tools, false);
    assert.match(prompts[0]!.prompt, /Siti Aminah, Owner\. Mobile 07-555 0101/);
    assert.doesNotMatch(prompts[0]!.prompt, /x\(\)/);

    const people = result.decision_makers as Array<Record<string, unknown>>;
    assert.equal(people[0]?.name, 'Siti Aminah');
    assert.equal(people[0]?.role, 'Owner');
    assert.equal(people[0]?.direct_phone, '07-555 0101');
    assert.equal((result.email_contacts as Array<Record<string, unknown>>)[0]?.email, 'hello@acme-bakery.example');
    const meta = result.research_meta as Record<string, unknown>;
    assert.match(String(meta.engine), /tavily \+ pi\//);
  } finally {
    pi.setRunnerForTests(null);
  }
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
      assert.match(String(err), /quota/);
      assert.equal((err as { code?: string }).code, 'quota');
      return true;
    },
  );
  const fetchRate: typeof fetch = async () => new Response('{"detail":"too many requests"}', { status: 429 });
  await assert.rejects(
    () => tavilySearch({ name: 'Acme', location: '', website: '', extraUrls: [] }, 'test-key', fetchRate),
    (err: unknown) => (err as { code?: string }).code === 'rate_limit',
  );
  const fetch432: typeof fetch = async () => new Response('{"detail":{"error":"This request exceeds your plan\'s set usage limit."}}', { status: 432 });
  await assert.rejects(
    () => tavilySearch({ name: 'Acme', location: '', website: '', extraUrls: [] }, 'test-key', fetch432),
    (err: unknown) => (err as { code?: string }).code === 'quota',
  );
});

test('tavily search results that mention credit or quota are not a quota error', async () => {
  const fetchOk: typeof fetch = async () => new Response(JSON.stringify({
    query: 'Acme',
    results: [{ url: 'https://www.ctoscredit.com.my/acme', title: 'Acme credit report', content: 'Import quota and credit terms for Acme Sdn Bhd' }],
  }), { status: 200 });
  const out = await tavilySearch({ name: 'Acme', location: '', website: '', extraUrls: [] }, 'test-key', fetchOk);
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0]?.url, 'https://www.ctoscredit.com.my/acme');
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
