import test from 'node:test';
import assert from 'node:assert/strict';
import * as autoContact from './autocontact.ts';

const company = (id: string) => ({ id, name: 'Co ' + id });
const live = () => ['research.contact', 'chatgpt.ask'];

test('default contact reports require a dedicated research worker', () => {
  const previous = process.env.GEMINI37_API_KEY;
  delete process.env.GEMINI37_API_KEY;
  try {
    assert.equal(autoContact.contactResearchJobType(), 'research.contact');
  } finally {
    if (previous === undefined) delete process.env.GEMINI37_API_KEY; else process.env.GEMINI37_API_KEY = previous;
  }
});

test('no live worker claiming the job type queues nothing', async () => {
  let launched = 0;
  autoContact.init({
    liveTypes: () => [],
    backlog: async () => [company('1')],
    launch: async () => { launched += 1; },
  });
  assert.equal(await autoContact.tick(), 0);
  assert.equal(launched, 0);
});

test('a leftover agy-web setting uses the normal research worker and ignores the removed cloud worker', async () => {
  const previousModel = process.env.CONTACT_RESEARCH_MODEL;
  const previousAutoQueue = process.env.AGY_WEB_AUTO_QUEUE;
  const previousKey = process.env.GEMINI37_API_KEY;
  delete process.env.GEMINI37_API_KEY;
  let launched = 0;
  process.env.CONTACT_RESEARCH_MODEL = 'agy-web';
  delete process.env.AGY_WEB_AUTO_QUEUE;
  try {
    assert.equal(autoContact.contactResearchJobType(), 'research.contact');
    autoContact.init({
      liveTypes: () => ['research.contact.cloud'],
      backlog: async () => [company('cloud')],
      launch: async () => { launched++; },
    });
    assert.equal(await autoContact.tick(), 0);
    autoContact.init({
      liveTypes: () => ['research.contact'],
      backlog: async () => [company('cloud')],
      launch: async () => { launched++; },
    });
    assert.equal(await autoContact.tick(), 0);
    process.env.AGY_WEB_AUTO_QUEUE = 'true';
    assert.equal(await autoContact.tick(), 1);
    assert.equal(launched, 1);
  } finally {
    if (previousModel === undefined) delete process.env.CONTACT_RESEARCH_MODEL; else process.env.CONTACT_RESEARCH_MODEL = previousModel;
    if (previousAutoQueue === undefined) delete process.env.AGY_WEB_AUTO_QUEUE; else process.env.AGY_WEB_AUTO_QUEUE = previousAutoQueue;
    if (previousKey === undefined) delete process.env.GEMINI37_API_KEY; else process.env.GEMINI37_API_KEY = previousKey;
  }
});

test('a configured Gemini key makes the hub assign contact jobs to the gemini worker', async () => {
  const previousModel = process.env.CONTACT_RESEARCH_MODEL;
  const previousKey = process.env.GEMINI37_API_KEY;
  const previousAutoQueue = process.env.AGY_WEB_AUTO_QUEUE;
  let launched = 0;
  process.env.CONTACT_RESEARCH_MODEL = 'agy-web';
  process.env.GEMINI37_API_KEY = 'test-key';
  process.env.AGY_WEB_AUTO_QUEUE = 'true';
  try {
    assert.equal(autoContact.contactResearchJobType(), 'research.contact.gemini');
    autoContact.init({
      liveTypes: () => ['research.contact'],
      backlog: async () => [company('local')],
      launch: async () => { launched++; },
    });
    assert.equal(await autoContact.tick(), 0);
    autoContact.init({
      liveTypes: () => ['research.contact.gemini'],
      backlog: async () => [company('gemini')],
      launch: async () => { launched++; },
    });
    assert.equal(await autoContact.tick(), 1);
    assert.equal(launched, 1);
  } finally {
    if (previousModel === undefined) delete process.env.CONTACT_RESEARCH_MODEL; else process.env.CONTACT_RESEARCH_MODEL = previousModel;
    if (previousKey === undefined) delete process.env.GEMINI37_API_KEY; else process.env.GEMINI37_API_KEY = previousKey;
    if (previousAutoQueue === undefined) delete process.env.AGY_WEB_AUTO_QUEUE; else process.env.AGY_WEB_AUTO_QUEUE = previousAutoQueue;
  }
});

test('a live worker queues min(BATCH, backlog) and logs the count', async () => {
  const previousKey = process.env.GEMINI37_API_KEY;
  delete process.env.GEMINI37_API_KEY;
  const launched: string[] = [];
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    autoContact.init({
      liveTypes: live,
      backlog: async (limit) => ['1', '2', '3', '4', '5'].slice(0, limit).map(company),
      launch: async (row) => { launched.push(String(row.id)); },
    });
    assert.equal(await autoContact.tick(), 3);
    assert.deepEqual(launched, ['1', '2', '3']);
    assert.ok(lines.some((line) => line.includes('[auto-queue] queued 3 contact research job(s)')));
  } finally {
    console.log = orig;
    if (previousKey === undefined) delete process.env.GEMINI37_API_KEY; else process.env.GEMINI37_API_KEY = previousKey;
  }
});

test('launch receives autoQueued true', async () => {
  const previousKey = process.env.GEMINI37_API_KEY;
  delete process.env.GEMINI37_API_KEY;
  let opts: { autoQueued?: boolean } | undefined;
  autoContact.init({
    liveTypes: live,
    backlog: async () => [company('9')],
    launch: async (_row, next) => { opts = next; },
  });
  try {
    await autoContact.tick();
    assert.equal(opts?.autoQueued, true);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI37_API_KEY; else process.env.GEMINI37_API_KEY = previousKey;
  }
});
