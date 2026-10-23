import test from 'node:test';
import assert from 'node:assert/strict';
import * as jobs from './jobs.ts';
import * as pi from './pi.ts';
import {
  JOB_TYPE,
  WORKER_NAME,
  contactText,
  createKeyPool,
  extractContactsPrompt,
  laneName,
  preparePages,
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

test('a key rests below one job of credits and wakes when Tavily reports credits again', async () => {
  const pool = createKeyPool({ concurrency: 1 });
  pool.setKeys(['key-a', 'key-b']);
  pool.setUsage('key-a', 990, 1000);
  pool.setUsage('key-b', 0, 1000);
  assert.equal(pool.slots(), 2);

  // key-a spends to 997: three credits left, less than one contact job.
  pool.spend('key-a', 7);
  assert.equal(pool.slots(), 1);
  const lease = await pool.acquire();
  assert.equal(lease.secret, 'key-b');
  lease.release();

  // A 432 rests key-b too: nothing is left to hand out.
  const quota = await pool.acquire();
  quota.release(0, true);
  assert.equal(pool.slots(), 0);
  assert.deepEqual(pool.stats().map((s) => s.resting), [true, true]);

  // A later /usage read after Tavily's reset wakes the key.
  pool.setUsage('key-b', 0, 1000);
  assert.equal(pool.slots(), 1);
  assert.equal((await pool.acquire()).secret, 'key-b');
});

test('a key with no limit on its plan never rests', () => {
  const pool = createKeyPool({ concurrency: 1 });
  pool.setKeys(['paid']);
  pool.setUsage('paid', 50_000, null);
  pool.spend('paid', 1_000);
  assert.equal(pool.slots(), 1);
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

const boilerplate = Array.from({ length: 40 }, (_, i) => `Clause ${i + 1}. The user agrees that the content of this directory is provided as it is, without warranty of any kind.`);

test('a long page keeps its contact lines and a short page goes whole', () => {
  const long = ['Acme Bakery | Contact', ...boilerplate.slice(0, 20), 'Siti Aminah', 'Owner', 'Tel: 07-555 0101', ...boilerplate.slice(20)].join('\n');
  const cut = contactText(long);
  assert.match(cut, /^Acme Bakery \| Contact/);
  assert.match(cut, /Siti Aminah\nOwner\nTel: 07-555 0101/);
  assert.ok(cut.length < long.length / 3, `cut to ${cut.length} of ${long.length}`);
  assert.equal(contactText('Siti Aminah, Owner. 07-555 0101'), 'Siti Aminah, Owner. 07-555 0101');
});

test('pages sent to pi drop repeated lines, unreadable charsets and pages with nothing new', () => {
  const pages = preparePages([
    { url: 'https://acme.example/', text: 'Acme Bakery home\nCall us on 07-555 0101 today' },
    { url: 'https://www.acme.example/', text: 'Acme Bakery home\nCall us on 07-555 0101 today' },
    { url: 'https://acme.example/contact', text: '������ menu\nCall us on 07-555 0101 today\nhello@acme.example sales desk' },
  ]);
  assert.deepEqual(pages.map((page) => page.url), ['https://acme.example/', 'https://acme.example/contact']);
  assert.equal(pages[1]!.text, 'hello@acme.example sales desk');
});

test('the smaller page set puts pages that print a phone or email first', () => {
  const pages = preparePages([
    { url: 'https://news.example/a', text: 'Acme Bakery wins a local award for its bread' },
    { url: 'https://dir.example/acme', text: 'Acme Bakery listing, telephone 07-555 0101' },
    { url: 'https://acme.example/contact', text: 'Write to hello@acme.example' },
  ], { maxPages: 2 });
  assert.deepEqual(pages.map((page) => page.url), ['https://dir.example/acme', 'https://acme.example/contact']);
});

function extractFixture() {
  const fetchMock: typeof fetch = async (url) => {
    const href = String(url);
    if (href.includes('api.tavily.com')) {
      return new Response(JSON.stringify({
        results: Array.from({ length: 6 }, (_, i) => ({
          title: `Page ${i}`, url: `https://dir${i}.example/acme`, content: `Acme Bakery listing ${i}`,
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const n = /dir(\d)/.exec(href)?.[1] ?? 'x';
    const body = n === '0' ? 'Acme Bakery, telephone 07-555 0101' : `Acme Bakery review number ${n}, lovely bread`;
    return new Response(`<html><body><p>${body}</p></body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  return { fetchMock, payload: { name: 'Acme Bakery', location: 'Johor Bahru' } };
}

const answerJson = '{"people":[],"phones":[{"number":"07-555 0101","label":"","evidence_url":"https://dir0.example/acme"}],"emails":[]}';

test('an extract that thinks past its output cap is retried once on fewer pages with minimal thinking', async () => {
  const { fetchMock, payload } = extractFixture();
  const calls: Array<{ prompt: string; opts: Required<pi.AskOptions> }> = [];
  pi.setRunnerForTests(async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (calls.length === 1) throw Object.assign(new Error('Pi used its 8192 output tokens thinking and gave no answer.'), { code: 'length' });
    return answerJson;
  });
  try {
    const result = await research(payload, { fetchImpl: fetchMock, tavilyKey: 'tvly-test-key', env: { CONTACT_TIMEOUT_MS: '100000' } });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.opts.tools, false);
    assert.equal(calls[0]!.opts.maxTokens, 8192);
    assert.equal(calls[0]!.opts.timeoutMs, 50_000);
    assert.equal(calls[1]!.opts.thinking, 'minimal');
    assert.ok(calls[1]!.opts.timeoutMs >= 30_000);
    const pagesIn = (prompt: string) => prompt.match(/<page url=/g)?.length ?? 0;
    assert.equal(pagesIn(calls[0]!.prompt), 6);
    assert.equal(pagesIn(calls[1]!.prompt), 4);
    assert.match(calls[1]!.prompt, /<page url="https:\/\/dir0\.example\/acme">\nAcme Bakery, telephone 07-555 0101/);
    assert.equal((result.phone_contacts as Array<Record<string, unknown>>)[0]?.number_raw, '07-555 0101');
    assert.equal((result.research_meta as { sources: string[] }).sources.length, 4);
  } finally {
    pi.setRunnerForTests(null);
  }
});

test('an extract that fails twice reports both, and a rate limit is not retried', async () => {
  const { fetchMock, payload } = extractFixture();
  let calls = 0;
  pi.setRunnerForTests(async () => {
    calls++;
    throw Object.assign(new Error('Pi gave no answer within 90s.'), { code: 'timeout' });
  });
  try {
    await assert.rejects(
      () => research(payload, { fetchImpl: fetchMock, tavilyKey: 'tvly-test-key' }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'timeout');
        assert.match(String(err), /retry after: pi extract step failed/);
        return true;
      },
    );
    assert.equal(calls, 2);

    calls = 0;
    pi.setRunnerForTests(async () => {
      calls++;
      throw Object.assign(new Error('MiniMax rate limit: 429'), { code: 'rate_limit' });
    });
    await assert.rejects(
      () => research(payload, { fetchImpl: fetchMock, tavilyKey: 'tvly-test-key' }),
      (err: unknown) => (err as { code?: string }).code === 'rate_limit',
    );
    assert.equal(calls, 1);
  } finally {
    pi.setRunnerForTests(null);
  }
});
