import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './portal.ts';

test('end-user portal combines discovery, deep research, and report library', () => {
  const html = page();
  assert.match(html, /width=device-width/);
  assert.match(html, /Find the companies worth knowing/);
  assert.match(html, /Research library/);
  assert.match(html, />Reports<\/button>/);
  assert.match(html, /\/api\/business-search/);
  assert.match(html, /\/api\/company-research/);
  assert.match(html, /person_research/);
  assert.match(html, /VIP briefs/);
  assert.match(html, /person_research/);
  assert.match(html, /\/api\/reports\?limit=/);
  assert.match(html, /Deep research →/);
  assert.match(html, /aria-label="Start deep research for /);
  assert.match(html, /Research underway/);
  assert.match(html, /Open research report for /);
  assert.match(html, /Open report any time to follow progress/);
  assert.match(html, /Enter a business, a location, or both/);
  assert.match(html, /if\(!keyword&&!place\)/);
  assert.doesNotMatch(html, /id="keyword" required/);
  // The key is entered once. A per-tab store meant every report link opened in a
  // new tab asked again, so the durable copy is a cookie mirrored to localStorage.
  assert.match(html, /document\.cookie/);
  assert.match(html, /eeKey\.read\(\)/);
  assert.doesNotMatch(html, /sessionStorage\.getItem\('ee_portal_token'\)/);
  assert.doesNotMatch(html, /eternalgy2026/i);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('portal uses a mobile bottom navigation and scoped access gate', () => {
  const html = page();
  assert.match(html, /class="mobile-nav"/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /Workspace access key/);
  assert.match(html, /never added to a report link/);
  assert.match(html, /You enter it once/);
});

test('the front page is three named choices, and each one opens its own form', () => {
  const html = page();
  // The landing used to be a market form with the company lookup hidden behind a
  // tab -- two of the three things the workspace does were invisible on arrival.
  assert.match(html, /id="chooser"/);
  assert.match(html, />Business list<\/h2>/);
  assert.match(html, />Company research<\/h2>/);
  assert.match(html, />Completed report<\/h2>/);
  // The form is not on screen until a choice is made, and the third choice is
  // the library rather than a form.
  assert.match(html, /id="searchForm" class="search-sheet hidden"/);
  assert.match(html, /function choose\(choice\)\{if\(choice==='reports'\)return switchView\('library'\)/);
  assert.match(html, /function goHome\(\)/);
  assert.doesNotMatch(html, /class="mode-tab/);
});

test('a company can be researched by name, after the operator confirms the Maps match', () => {
  const html = page();
  // The market scan was once the only way in, so a user who knew exactly which
  // company they wanted had to search a category and hunt.
  assert.match(html, /data-mode="market"/);
  assert.match(html, /data-mode="company"/);
  assert.match(html, /id="companyName"/);
  assert.match(html, />Find company</);
  // The name is a Maps lookup whose matches the user picks from -- never an
  // auto-pick, because the wrong branch costs a full four-round research run.
  assert.match(html, /Which one is yours\?/);
  assert.match(html, /Nothing is researched until you pick one/);
  assert.match(html, /state\.mode==='company'\)return startLookup\(\)/);
  assert.match(html, /keyword:name,place:place\|\|undefined,max:10/);
});

test('every validated person in a dossier can be sent to VIP research', () => {
  const html = page();
  assert.match(html, /\/api\/person-research/);
  assert.match(html, /companyResearchId:reportId,personId:personId/);
  assert.match(html, /VIP brief \\u2192/);
  assert.match(html, /Validated people/);
  // P01 already has an automatic brief. Offering "start" there would either
  // duplicate a four-round run or dead-end on the server's dedup.
  assert.match(html, /pid===autoPerson&&autoReport/);
  assert.match(html, /Open brief/);
  // Candidate people have no id the person-research route accepts, and their
  // role is unevidenced -- they are shown as leads, never as a launch button.
  assert.match(html, /Leads to verify/);
  assert.match(html, /confirm the role before a brief/);
  // Only a finished dossier has people to offer.
  assert.match(html, /var ready=deep&&\(report\.status==='completed'\|\|report\.status==='partial'\)/);
});

test('a company dossier offers ads research, and links an existing run instead', async () => {
  const ui = await import('./reportui.ts');
  const base = {
    public_id: 'AAAAAAAAAAAAAAAAAAAA', report_type: 'company_research', title: 'Solarvest',
    company_id: '42', error: null, created_at: '', updated_at: '',
    result: { entity: { name: 'SOLARVEST ENERGY SDN BHD' }, summary: 'x', people: [], contacts: [] },
  } as never;

  const done = ui.companyPage({ ...(base as object), status: 'completed' } as never, null, {}, null);
  assert.match(done, /data-ads="1"/);
  assert.match(done, /\/api\/ads-research/);
  // The crawl is keyed by the company's own name, not the report title.
  assert.match(done, /data-name="SOLARVEST ENERGY SDN BHD"/);

  // A dossier still running has nothing to advertise-research against yet.
  const running = ui.companyPage({ ...(base as object), status: 'running' } as never, null, {}, null);
  assert.doesNotMatch(running, /data-ads="1"/);

  // An existing capture is linked, never offered again -- the same rule the VIP
  // button follows, so a second crawl of one advertiser cannot be started by clicking.
  const linked = ui.companyPage(
    { ...(base as object), status: 'completed' } as never, null, {},
    { public_id: 'BBBBBBBBBBBBBBBBBBBB', status: 'completed' },
  );
  assert.match(linked, /\/r\/BBBBBBBBBBBBBBBBBBBB/);
  assert.doesNotMatch(linked, /data-ads="1"/);
});

test('the portal itself offers ads research on a finished dossier', () => {
  const html = page();
  // The portal renders its OWN dossier card, separate from the /r/:id report page.
  // Shipping the button on only one of the two surfaces is how this was missed once.
  assert.match(html, /Ads research/);
  assert.match(html, /async function startAds/);
  assert.match(html, /'\/api\/ads-research'/);
  // Only a finished company dossier -- not a business list, not a run still going.
  assert.match(html, /deep&&ready\?'<button class="text-action"/);
  // The crawl is keyed by the company name, with the report-title suffix stripped.
  assert.match(html, /function companyName/);
  assert.match(html, /intelligence report\$/);
});

test('the run trail renders every event in order, and marks the ones that failed', async () => {
  const ui = await import('./reportui.ts');
  const report = {
    public_id: 'BBBBBBBBBBBBBBBBBBBB', report_type: 'company_research', status: 'partial',
    title: 'Newpages Network Sdn Bhd intelligence report', company_id: '1042',
    error: null, created_at: '', updated_at: '',
  } as never;

  const html = ui.logPage(report, [
    { id: 1, at: '2026-08-23T16:14:37.024Z', stage: 'report', event: 'report.created', job_id: null, detail: { type: 'company_research' } },
    { id: 2, at: '2026-08-23T16:14:37.042Z', stage: 'fb.company', event: 'job.created', job_id: 'd58d1a7b4dea', detail: { type: 'fb.company' } },
    { id: 3, at: '2026-08-23T16:14:52.053Z', stage: 'fb.company', event: 'job.failed', job_id: 'd58d1a7b4dea', detail: { error: 'claude exited 1', ms: 14802 } },
    { id: 4, at: '2026-08-23T16:20:25.148Z', stage: 'final', event: 'final.saved', job_id: null, detail: { contacts: 24, people: 12 } },
  ] as never);

  // Order is the point: the trail is read top to bottom.
  assert.ok(html.indexOf('report.created') < html.indexOf('job.failed'));
  assert.ok(html.indexOf('job.failed') < html.indexOf('final.saved'));
  // Elapsed offsets from the first event, so a five-minute gap is visible at a glance.
  assert.match(html, /\+0s/);
  assert.match(html, /\+348s/);
  // A failure is tinted, not just spelled.
  assert.match(html, /<tr class="error">[\s\S]*?job\.failed/);
  // The detail of a failure is the failure, not the exit code alone.
  assert.match(html, /claude exited 1/);
  assert.match(html, /d58d1a7b4dea/);
  // And a way back to the report it describes.
  assert.match(html, /href="\/r\/BBBBBBBBBBBBBBBBBBBB"/);
});

test('a run with no trail says so instead of rendering an empty table', async () => {
  const ui = await import('./reportui.ts');
  const report = {
    public_id: 'CCCCCCCCCCCCCCCCCCCC', report_type: 'company_research', status: 'completed',
    title: 'Older run', company_id: '1', error: null, created_at: '', updated_at: '',
  } as never;
  const html = ui.logPage(report, []);
  assert.match(html, /No events recorded for this run/);
});

test('the portal script has no undefined identifiers in its job renderer', () => {
  const html = page();
  // A bare `kind` inside renderJobs (where the variable is `job.kind`) threw
  // "kind is not defined" on every render of the Active work panel, which took
  // out company research entirely. The label chain must read job.kind throughout.
  assert.doesNotMatch(html, /[^.\w]kind==='ads'/);
  assert.match(html, /job\.kind==='ads'\?'Ads'/);

  // And the whole inline script must actually parse. new Function does not run it,
  // it only compiles - which is exactly the check that was missing.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0, 'portal ships an inline script');
  for (const src of scripts) {
    assert.doesNotThrow(() => new Function(src), 'portal inline script must parse');
  }
});
