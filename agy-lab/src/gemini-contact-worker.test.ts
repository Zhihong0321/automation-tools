import test from 'node:test';
import assert from 'node:assert/strict';
import * as jobs from './jobs.ts';
import {
  JOB_TYPE,
  WORKER_NAME,
  extractContactsPrompt,
  findPagesPrompt,
  laneName,
  research,
  resolveConfig,
  targetFromPayload,
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

test('research runs find then extract for one assigned company', async () => {
  const prompts: string[] = [];
  const fetchRedirect: typeof fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('vertexaisearch')) {
      const response = new Response('', { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://acme-bakery.example/about' });
      return response;
    }
    const body = JSON.parse(String(init?.body));
    prompts.push(body.contents[0].parts[0].text);
    assert.deepEqual(body.tools, [{ google_search: {} }]);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'high');
    const text = prompts.length === 1
      ? '{"searched":true,"queries":["Acme Bakery"],"sources":[{"url":"https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc","kind":"official","why":"site"},{"url":"https://www.jobstreet.com.my/job/9","kind":"jobs","why":"ad"}]}'
      : '{"people":[{"name":"Siti Aminah","position":"Owner","evidence_url":"https://acme-bakery.example/about"}],"phones":[{"number":"07-555 0101","label":"Siti Aminah mobile","evidence_url":"https://acme-bakery.example/contact"}],"emails":[{"email":"hello@acme-bakery.example","label":"General","evidence_url":"https://acme-bakery.example/contact"}]}';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  };
  const result = await research({
    name: 'Acme Bakery',
    location: '12 Jalan Example, Johor Bahru',
    website: 'https://acme-bakery.example/contact',
  }, { env: ENV, fetchImpl: fetchRedirect });
  assert.equal(prompts.length, 2);
  assert.doesNotMatch(prompts[0]!, /acme-bakery\.example/);
  assert.doesNotMatch(prompts[1]!, /jobstreet/i);
  const people = result.decision_makers as Array<Record<string, unknown>>;
  assert.equal(people[0]?.name, 'Siti Aminah');
  assert.equal(people[0]?.role, 'Owner');
  assert.equal(people[0]?.direct_phone, '07-555 0101');
  assert.equal((result.email_contacts as Array<Record<string, unknown>>)[0]?.email, 'hello@acme-bakery.example');
});
