// Build the free preview for one company from its company-dive alone (no other lanes, no calls).
//
//   node scripts/dive-deeper/preview.ts <diveId> [out.html]
//
// Writes one standalone HTML file (default docs/dive-preview-<brand>.html). The page itself comes
// from src/divedeeper/preview-html.ts, which the hub serves at /dp/<company-dive public id>.
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from '../../src/divedeeper/lib.ts';
import { buildPreview } from '../../src/divedeeper/preview-html.ts';

const diveId = process.argv[2];
if (!diveId) { console.error('usage: node scripts/dive-deeper/preview.ts <diveId> [out.html]'); process.exit(2); }
let dive: any = null;
try { dive = JSON.parse(fs.readFileSync(path.join(OUT, `dive-${diveId}.json`), 'utf8')); } catch { /* reported below */ }
if (!dive) { console.error(`out/dive-${diveId}.json not found; run a lane once to cache the dive`); process.exit(2); }

const name = String(dive.result?.identity?.legal_name ?? dive.company);
const brand = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || 'company';
const outFile = process.argv[3] ?? path.join(import.meta.dirname, '..', '..', '..', 'docs', `dive-preview-${brand}.html`);
const html = buildPreview(dive, { price: process.env.DD_PREVIEW_PRICE, contact: process.env.DD_PREVIEW_CONTACT, order_url: process.env.DD_PREVIEW_ORDER_URL });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
