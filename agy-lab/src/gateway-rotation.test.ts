import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The profile root is read from HOME at import time, so point it at a scratch
// volume before the gateway (and through it, sessions and browser) loads.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cgpt-rotation-'));
process.env.HOME = home;
delete process.env.CGPT_DEFAULT_SESSION;

const probe = (status: string) => ({ status, detail: '', at: new Date().toISOString(), ms: 1 });
const manifest = {
  'openai-a': { id: 'openai-a', label: 'a', createdAt: '', kind: 'chatgpt', lastProbe: probe('ready') },
  'openai-b': { id: 'openai-b', label: 'b', createdAt: '', kind: 'chatgpt', lastProbe: probe('ready') },
  'openai-c': { id: 'openai-c', label: 'c', createdAt: '', kind: 'chatgpt', lastProbe: probe('logged_out') },
};
for (const id of Object.keys(manifest)) fs.mkdirSync(path.join(home, 'profiles', id, 'Default'), { recursive: true });
fs.writeFileSync(path.join(home, 'profiles', 'manifest.json'), JSON.stringify(manifest));

const { resolveModel, defaultSession } = await import('./gateway.ts');

test('a bare chatgpt takes turns across every ready account and skips signed-out ones', () => {
  const picks = Array.from({ length: 4 }, () => resolveModel('chatgpt@container').session);
  assert.deepEqual(picks, ['openai-a', 'openai-b', 'openai-a', 'openai-b']);
});

test('naming an account pins it, and naming the alias does not rotate', () => {
  assert.equal(resolveModel('chatgpt:openai-c@container').session, 'openai-c');
  const before = resolveModel('chatgpt@container').session;
  // One non-rotating read: had it advanced, the next pick would land on `before` again.
  defaultSession('chatgpt');
  assert.notEqual(resolveModel('chatgpt@container').session, before);
});

test('CGPT_DEFAULT_SESSION still pins one account', () => {
  process.env.CGPT_DEFAULT_SESSION = 'openai-b';
  try {
    assert.deepEqual([1, 2, 3].map(() => resolveModel('chatgpt@container').session), ['openai-b', 'openai-b', 'openai-b']);
  } finally {
    delete process.env.CGPT_DEFAULT_SESSION;
  }
});
