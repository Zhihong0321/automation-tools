// Run one company dive on this machine, with the country pack (draft packs too), and save it.
//
//   node scripts/country-dive.ts "<company>" "<country>" [--no-pack] [--no-people]
//   node scripts/country-dive.ts "Singapore Airlines" "Singapore"
//
// The same research code the hub runs (companydive.ts run()), so the result shows what the
// pack really changes. --no-pack runs the same company with every pack off, for a before and
// after. Nothing is written to the hub or its database: keys come from the local vault
// (D:\Tools\my-vault\vault.json), Tavily and Exa through the US proxy.
//
// Output: scripts/country-dive-out/<CC>-<company>-<pack|no-pack>.json (the result and log)
// and .md (the dossier). It spends real calls: about 15 Tavily, 8-16 Brave, up to 20 Exa and
// 10-15 LLM calls.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const [company, country] = args;
if (!company || !country) {
  console.error('usage: node scripts/country-dive.ts "<company>" "<country>" [--no-pack] [--no-people]');
  process.exit(2);
}

const VAULT = process.env.VAULT_PATH ?? 'D:/Tools/my-vault/vault.json';
type Cred = { name: string; secret?: string; baseUrl?: string };
const raw = JSON.parse(fs.readFileSync(VAULT, 'utf8'));
const vault: Cred[] = (Array.isArray(raw) ? raw : (raw.credentials ?? raw.items ?? Object.values(raw))).flat();
const cred = (name: string) => vault.find((c) => c?.name === name);

// The env core falls back to when there is no hub database (core/README.md).
const llmKey = cred('VECTIDE_DEEPSEEK_KEY');
process.env.CONTACT_LLM_URL ??= llmKey?.baseUrl ?? '';
process.env.CONTACT_LLM_KEY ??= llmKey?.secret ?? '';
process.env.CONTACT_LLM_MODEL ??= 'deepseek-v4.1-flash-1017';
process.env.BRAVE_API_KEYS ??= ['BRAVE_SEARCH_API_KEY', 'BRAVE_SEARCH_API_KEY_2'].map((n) => cred(n)?.secret).filter(Boolean).join(',');
process.env.EXA_API_KEY ??= cred('EXA_API_KEY')?.secret ?? '';
if (flags.has('--no-pack')) process.env.COUNTRY_PACKS = 'off';
else process.env.COUNTRY_PACKS_DRAFT = '1';

const { exa, tavily, brave } = await import('../src/core/index.ts');
const proxyCred = cred('EXA_PROXY_US');
const proxy = proxyCred?.baseUrl && proxyCred.secret ? { url: proxyCred.baseUrl.replace(/\/+$/, ''), token: proxyCred.secret } : null;
if (!proxy) { console.error('EXA_PROXY_US is missing from the vault: Tavily has no keys on this machine'); process.exit(2); }
// One proxy setting serves both pools (core/proxy.ts).
exa.setProxy(proxy);
await tavily.refresh();
await exa.refresh();
if (!(await brave.refresh()).length) { console.error('No Brave keys in the vault'); process.exit(2); }

const countries = await import('../src/countries.ts');
const { run } = await import('../src/companydive.ts');
const { pack, note } = countries.forCountry(country);
const mode = flags.has('--no-pack') ? 'no-pack' : 'pack';
console.log(`=== ${company} (${country}), ${mode}: ${note || 'no country pack for this country'}`);

const log: Array<{ at: string; stage: string; msg: string }> = [];
const progress = (stage: string, msg: string) => {
  log.push({ at: new Date().toISOString(), stage, msg });
  console.log(`[${stage}] ${msg}`);
};
const alongside = flags.has('--no-people') ? undefined : async (identity: unknown, facts: unknown) => {
  const people = await import('../src/companydive-people.ts');
  const row = { id: 0, public_id: null, options: null, company, country, status: 'running', stage: 'people', log: [], result: { identity, facts }, dossier: null, error: null, tavily_calls: 0, tavily_credits: 0, brave_calls: 0, llm_calls: 0, created_at: '', finished_at: null } as any;
  const found = await people.findPeople(row, async () => {});
  progress('people', `People step ${found.status}: ${found.people.length} people linked`);
  return found;
};

const started = Date.now();
const { result, writeDossier } = await run(company, country, progress, alongside as any);
const dossier = await writeDossier();

const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const OUT = path.join(import.meta.dirname, 'country-dive-out');
fs.mkdirSync(OUT, { recursive: true });
const base = path.join(OUT, `${pack?.code ?? 'XX'}-${slug}-${mode}`);
fs.writeFileSync(base + '.json', JSON.stringify({ company, country, mode, pack: pack?.code ?? null, note, minutes: (Date.now() - started) / 60_000, log, result }, null, 2));
fs.writeFileSync(base + '.md', dossier);

const cited = new Set(result.facts.flatMap((f) => f.sources));
const people = (result.people as { people?: unknown[] } | undefined)?.people ?? [];
console.log(`
=== summary (${mode})
legal name       ${result.identity.legal_name ?? '(none)'}
aliases          ${(result.identity.aliases ?? []).join(' | ') || '(none)'}
registration     ${(result.identity.registration_numbers ?? []).join(', ') || '(none)'}
official domains ${(result.identity.official_domains ?? []).join(', ') || '(none)'}
facts            ${result.facts.length}
sources          ${result.sources.length} found, ${result.sources.filter((s) => s.relevant).length} relevant, ${cited.size} cited
people           ${people.length}
calls            Brave ${result.braveCalls}, Tavily ${result.tavily.length}, LLM ${result.llm.length}
warnings         ${result.warnings.length ? result.warnings.join(' | ') : 'none'}
minutes          ${((Date.now() - started) / 60_000).toFixed(1)}
saved            ${base}.json and .md`);
process.exit(0);
