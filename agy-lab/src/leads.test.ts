import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './portal.ts';
import * as db from './reportdb.ts';

test('leads master UI is integrated in portal navigation and views', () => {
  const html = page();
  // Navigation
  assert.match(html, />Leads Master<\/button>/);
  assert.match(html, /data-view="leads"/);
  assert.match(html, /switchView\('leads'\)/);

  // View container & hero
  assert.match(html, /id="leadsView"/);
  assert.match(html, /Leads master list/);
  assert.match(html, /Deduplicated master list of all discovered companies/);

  // Metrics summary
  assert.match(html, /id="statTotal"/);
  assert.match(html, /id="statUnassigned"/);
  assert.match(html, /id="statAssigned"/);
  assert.match(html, /id="statContacted"/);

  // Filtering & controls
  assert.match(html, /id="leadSearch"/);
  assert.match(html, /id="leadTeleFilter"/);
  assert.match(html, /id="leadResearchFilter"/);
  assert.match(html, /data-lead-status="all"/);
  assert.match(html, /data-lead-status="unassigned"/);
  assert.match(html, /data-lead-status="assigned"/);
  assert.match(html, /data-lead-status="contacted"/);

  // Bulk assignment bar
  assert.match(html, /id="bulkBar"/);
  assert.match(html, /id="bulkAssignSelect"/);
  assert.match(html, /bulkAssignSelected\(\)/);
  assert.match(html, /bulkUnassignSelected\(\)/);

  // Table wrapper & pagination
  assert.match(html, /id="leadTableWrapper"/);
  assert.match(html, /id="leadPagination"/);
  assert.match(html, /btnPrevLeads/);
  assert.match(html, /btnNextLeads/);

  // Client-side script validates with no syntax errors
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('reportdb exports lead distribution and dedup interfaces', () => {
  assert.equal(typeof db.listLeads, 'function');
  assert.equal(typeof db.assignLeads, 'function');
  assert.equal(typeof db.unassignLeads, 'function');
  assert.equal(typeof db.updateLead, 'function');
  assert.equal(typeof db.listTelemarketers, 'function');
  assert.equal(typeof db.addTelemarketer, 'function');
  assert.equal(typeof db.dedupCompanies, 'function');
});
