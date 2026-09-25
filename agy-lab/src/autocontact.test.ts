import test from 'node:test';
import assert from 'node:assert/strict';
import * as autoContact from './autocontact.ts';

const company = (id: string) => ({ id, name: 'Co ' + id });
const live = () => ['research.contact', 'chatgpt.ask'];

test('default contact reports require a dedicated research worker', () => {
  assert.equal(autoContact.contactResearchJobType(), 'research.contact');
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

test('cloud AGY queues only when its dedicated worker is live and auto queue is enabled', async () => {
  const previousModel = process.env.CONTACT_RESEARCH_MODEL;
  const previousToken = process.env.AGY_WEB_TOKEN;
  const previousAutoQueue = process.env.AGY_WEB_AUTO_QUEUE;
  let launched = 0;
  process.env.CONTACT_RESEARCH_MODEL = 'agy-web';
  process.env.AGY_WEB_TOKEN = 'test-token';
  try {
    autoContact.init({
      liveTypes: () => ['research.contact.cloud'],
      backlog: async () => [company('cloud')],
      launch: async () => { launched++; },
    });
    assert.equal(await autoContact.tick(), 0);
    process.env.AGY_WEB_AUTO_QUEUE = 'true';
    assert.equal(await autoContact.tick(), 1);
    assert.equal(launched, 1);
    autoContact.init({ liveTypes: () => [], backlog: async () => [company('cloud')], launch: async () => { launched++; } });
    assert.equal(await autoContact.tick(), 0);
  } finally {
    if (previousModel === undefined) delete process.env.CONTACT_RESEARCH_MODEL; else process.env.CONTACT_RESEARCH_MODEL = previousModel;
    if (previousToken === undefined) delete process.env.AGY_WEB_TOKEN; else process.env.AGY_WEB_TOKEN = previousToken;
    if (previousAutoQueue === undefined) delete process.env.AGY_WEB_AUTO_QUEUE; else process.env.AGY_WEB_AUTO_QUEUE = previousAutoQueue;
  }
});

test('a live worker queues min(BATCH, backlog) and logs the count', async () => {
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
  }
});

test('launch receives autoQueued true', async () => {
  let opts: { autoQueued?: boolean } | undefined;
  autoContact.init({
    liveTypes: live,
    backlog: async () => [company('9')],
    launch: async (_row, next) => { opts = next; },
  });
  await autoContact.tick();
  assert.equal(opts?.autoQueued, true);
});
