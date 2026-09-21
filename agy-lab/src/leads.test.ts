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

test('leads with contact research are highlighted with contact numbers found', () => {
  const html = page();

  // Metrics summary includes statContacts
  assert.match(html, /id="statContacts"/);
  assert.match(html, /Contacts Found/);

  // Filter option includes contacts_found
  assert.match(html, /value="contacts_found"/);
  assert.match(html, /Contacts Found \(Highlighted\)/);

  // CSS classes for highlight and badge
  assert.match(html, /\.lead-row\.has-contact-research/);
  assert.match(html, /\.contact-pill/);
  assert.match(html, /\.vip\.contact-vip/);

  // Verify renderLeads formats contact research info correctly
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(script);

  const leadResearched = {
    id: '101',
    name: 'E Cube Trading',
    category: 'Commercial Trading',
    address: 'Johor Bahru',
    phone: '012-3456789',
    website: 'https://ecube.example.com',
    maps_url: 'https://maps.google.com/?q=ecube',
    rating: 4.8,
    reviews: 24,
    lead_status: 'unassigned',
    assigned_to: null,
    lead_notes: null,
    branch_count: 0,
    research_public_id: null,
    contact_public_id: 'ct_report_99999',
    contact_status: 'completed',
    contact_phones_count: 5,
    contact_decision_makers_count: 3,
  };

  const leadUnresearched = {
    id: '102',
    name: 'Normal Business',
    category: 'Retail',
    address: 'Skudai',
    phone: '07-5551234',
    website: null,
    maps_url: null,
    rating: null,
    reviews: null,
    lead_status: 'unassigned',
    assigned_to: null,
    lead_notes: null,
    branch_count: 0,
    research_public_id: null,
    contact_public_id: null,
    contact_status: null,
    contact_phones_count: 0,
    contact_decision_makers_count: 0,
  };

  let capturedHtml = '';
  const leadState = { selected: {}, telemarketers: [] };
  const el = (id: string) => ({
    set innerHTML(val: string) { capturedHtml = val; },
    get innerHTML() { return capturedHtml; },
  });
  const esc = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s: any) => String(s == null ? '' : s).replace(/"/g, '&quot;');
  const safeUrl = (s: any) => s;

  const renderLeadsMatch = /function renderLeads\(leads\)\{([\s\S]*?)\}\nvar teleState/.exec(script);
  assert.ok(renderLeadsMatch, 'found renderLeads in script');

  const runner = new Function('leads', 'leadState', 'el', 'esc', 'attr', 'safeUrl', `
    ${renderLeadsMatch[0]}
    return renderLeads(leads);
  `);

  runner([leadResearched, leadUnresearched], leadState, el, esc, attr, safeUrl);

  // Researched lead row is highlighted
  assert.match(capturedHtml, /class="lead-row has-contact-research"/);
  assert.match(capturedHtml, /5 Contact Numbers Found/);
  assert.match(capturedHtml, /3 Leaders/);
  assert.match(capturedHtml, /href="\/r\/ct_report_99999"/);
  assert.match(capturedHtml, /class="vip contact-vip"/);

  // Unresearched lead row is not highlighted with has-contact-research
  assert.match(capturedHtml, /class="lead-row"/);
  assert.match(capturedHtml, /onclick="startContact\(this\)">Contacts ⚡<\/button>/);
});
