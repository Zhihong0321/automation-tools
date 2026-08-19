// Find out where agy actually puts the credential.
//
// This is the open research question the harness exists to answer. agy's
// changelog says the CLI "bypasses the keyring when no D-Bus session bus is
// present (headless hosts and containers)" — but bypasses it in favour of WHAT,
// and written WHERE, is documented nowhere. It decides whether a login survives a
// Railway redeploy, and therefore whether any of this is usable.
//
// The method is deliberately dumb and therefore trustworthy: record every file
// under HOME before the login, record them again after, diff. Whatever appeared
// or changed IS the credential store. No guessing at library internals, no
// reading strings out of a Go binary.
import fs from 'node:fs';
import path from 'node:path';

export interface FileStamp {
  size: number;
  mtimeMs: number;
}
export type Snapshot = Record<string, FileStamp>;

/** Directories with nothing to teach us, and enough files to make the walk useless. */
const SKIP = new Set(['node_modules', '.git', '.cache', 'proc', 'sys']);
/** A guard, not a limit anyone should hit. A HOME with more files than this is a bug. */
const MAX_FILES = 20_000;

export function take(root: string): Snapshot {
  const out: Snapshot = {};
  let count = 0;

  const walk = (dir: string): void => {
    if (count >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable is fine; it simply cannot be the thing that changed
    }
    for (const e of entries) {
      if (count >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        walk(full);
      } else if (e.isFile()) {
        try {
          const st = fs.statSync(full);
          out[path.relative(root, full)] = { size: st.size, mtimeMs: st.mtimeMs };
          count++;
        } catch {
          /* vanished between readdir and stat - it was not stable enough to matter */
        }
      }
    }
  };

  walk(root);
  return out;
}

export interface Diff {
  added: string[];
  changed: string[];
  removed: string[];
  countBefore: number;
  countAfter: number;
}

export function diff(before: Snapshot, after: Snapshot): Diff {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const [p, a] of Object.entries(after)) {
    const b = before[p];
    if (!b) added.push(p);
    else if (b.size !== a.size || b.mtimeMs !== a.mtimeMs) changed.push(p);
  }
  for (const p of Object.keys(before)) if (!after[p]) removed.push(p);

  // Newest first: the credential is written at the end of the login, so it sorts
  // to the top of the list a human is about to read.
  const byMtime = (x: string, y: string) => (after[y]?.mtimeMs ?? 0) - (after[x]?.mtimeMs ?? 0);
  added.sort(byMtime);
  changed.sort(byMtime);

  return { added, changed, removed, countBefore: Object.keys(before).length, countAfter: Object.keys(after).length };
}

/**
 * Read a file for inspection, redacted by default.
 *
 * The whole point is to look at a credential file, and the whole risk is printing
 * a live refresh token into a browser tab and a chat log. Redacted mode reports
 * shape — size, whether it parses as JSON, which keys it holds — which is what
 * answers "is this the token store?" without disclosing the token.
 */
export function inspect(file: string, reveal = false): Record<string, unknown> {
  const st = fs.statSync(file);
  const out: Record<string, unknown> = { path: file, size: st.size, mtime: new Date(st.mtimeMs).toISOString() };
  if (st.size > 1 << 20) return { ...out, note: 'too large to inspect' };

  const raw = fs.readFileSync(file);
  const text = raw.toString('utf8');
  const printable = text.replace(/[\x09\x0a\x0d\x20-\x7e]/g, '').length / Math.max(1, text.length);
  out.binary = printable > 0.3;

  try {
    const parsed = JSON.parse(text) as unknown;
    out.json = true;
    out.keys = typeof parsed === 'object' && parsed ? Object.keys(parsed as object) : [];
  } catch {
    out.json = false;
  }

  out.content = reveal ? text : redact(text);
  return out;
}

/**
 * Keep enough to identify the file, never enough to use it. Long unbroken runs of
 * credential-shaped characters are what a token looks like in every format agy
 * might use — JWT, opaque refresh token, base64 blob.
 */
function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9_\-\.]{24,}/g, (m) => `${m.slice(0, 6)}...[${m.length} chars redacted]`)
    .slice(0, 4000);
}
