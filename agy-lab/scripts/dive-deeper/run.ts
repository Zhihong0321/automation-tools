// Run one dive-deeper section lane on one finished company-dive, from this machine.
//
//   node scripts/dive-deeper/run.ts <section> <lane> <diveId>
//   node scripts/dive-deeper/run.ts H maps 4
//
// Loads sections/<section>-<lane>.ts, which exports
//   run(ctx, dive): Promise<{ findings: Finding[]; notes?: Record<string, unknown> }>
// and writes out/<section>-<lane>-<diveId>.json with the findings, the meter
// (requests, LLM chars/tokens, time) and every warning. Nothing is sent to the hub.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE, OUT, loadDive, makeCtx, type Finding } from './lib.ts';

const [section, lane, diveId] = process.argv.slice(2);
if (!section || !lane || !diveId) {
  console.error('usage: node scripts/dive-deeper/run.ts <section> <lane> <diveId>');
  process.exit(2);
}

const file = path.join(HERE, 'sections', `${section}-${lane}.ts`);
if (!fs.existsSync(file)) {
  console.error(`no lane file ${file}`);
  process.exit(2);
}

const dive = await loadDive(diveId, process.argv.includes('--fresh'));
const ctx = makeCtx(diveId, section, lane);
console.log(`=== ${section}/${lane} on dive ${diveId} (${dive.company})`);

let findings: Finding[] = [];
let notes: Record<string, unknown> = {};
try {
  const mod = await import(pathToFileURL(file).href);
  const out = await mod.run(ctx, dive);
  findings = out?.findings ?? [];
  notes = out?.notes ?? {};
} catch (e) {
  // The lane itself crashed: keep what we have and end partial.
  ctx.warn(`lane crashed: ${(e as Error).stack ?? e}`);
}

const ms = Date.now() - ctx.meter.started;
const result = {
  section, lane, diveId, company: dive.company,
  status: ctx.warnings.length ? 'partial' : 'done',
  ran_at: new Date().toISOString(), ms,
  findings_count: findings.length,
  meter: ctx.meter, warnings: ctx.warnings, notes, findings,
};
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `${section}-${lane}-${diveId}.json`);
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

console.log(`\n${findings.length} findings in ${(ms / 1000).toFixed(1)}s | llm ${ctx.meter.llm.calls} (${ctx.meter.llm.tokensIn}/${ctx.meter.llm.tokensOut} tok) | maps ${ctx.meter.maps.calls} | exa ${ctx.meter.exa.calls} | brave ${ctx.meter.brave.calls} | http ${ctx.meter.http.calls} | warnings ${ctx.warnings.length}`);
findings.forEach((f, i) => console.log(`${String(i + 1).padStart(2)}. [${f.severity}] ${f.title}\n    ${f.detail}${f.source ? `\n    ${f.source}` : ''}`));
console.log(`\n-> ${outFile}`);
