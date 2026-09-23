import test from 'node:test';
import assert from 'node:assert/strict';
import { JOHOR_TERRITORY, buildTerritoryResponse } from './territories.ts';
import { page } from './portal.ts';

test('Johor territory dataset contains all 10 districts, towns and tamans', () => {
  assert.equal(JOHOR_TERRITORY.state, 'Johor');
  assert.equal(JOHOR_TERRITORY.districts.length, 10);

  const districtNames = JOHOR_TERRITORY.districts.map((d) => d.name);
  assert.ok(districtNames.includes('Johor Bahru'));
  assert.ok(districtNames.includes('Kulai'));
  assert.ok(districtNames.includes('Batu Pahat'));
  assert.ok(districtNames.includes('Kluang'));
  assert.ok(districtNames.includes('Muar'));
  assert.ok(districtNames.includes('Pontian'));
  assert.ok(districtNames.includes('Kota Tinggi'));
  assert.ok(districtNames.includes('Segamat'));
  assert.ok(districtNames.includes('Tangkak'));
  assert.ok(districtNames.includes('Mersing'));

  // Test Johor Jaya and Ros Merah
  const jb = JOHOR_TERRITORY.districts.find((d) => d.name === 'Johor Bahru');
  assert.ok(jb);
  const jj = jb.towns.find((t) => t.name.includes('Johor Jaya'));
  assert.ok(jj);
  const rosMerah = jj.tamans.find((tm) => tm.name.includes('Ros Merah'));
  assert.ok(rosMerah);
  assert.ok(rosMerah.queryPlace.includes('Ros Merah'));
  assert.ok(rosMerah.queryPlace.includes('Johor Jaya'));
});

test('buildTerritoryResponse aggregates stats and attaches scan metadata', () => {
  const dummyScans = [
    {
      public_id: 'report_ros_merah_123',
      status: 'completed',
      place: 'ros merah, johor jaya, johor',
      keyword: 'business',
      company_count: 142,
      created_at: new Date().toISOString(),
    },
    {
      public_id: 'report_mount_austin_456',
      status: 'running',
      place: 'taman mount austin, tebrau, johor',
      keyword: 'cafe',
      company_count: 0,
      created_at: new Date().toISOString(),
    },
  ];

  const res = buildTerritoryResponse('johor', dummyScans);
  assert.equal(res.state, 'Johor');
  assert.equal(res.stats.totalDistricts, 10);
  assert.equal(res.stats.totalTowns, 70);
  assert.equal(res.stats.totalTamans, 771);
  assert.equal(res.stats.scannedTamans, 1);
  assert.equal(res.stats.totalLeads, 142);

  const jb = res.districts.find((d) => d.name === 'Johor Bahru');
  assert.ok(jb);
  const jj = jb.towns.find((t) => t.name.includes('Johor Jaya'));
  assert.ok(jj);
  const rosMerah = jj.tamans.find((tm) => tm.name.includes('Ros Merah'));
  assert.ok(rosMerah);
  assert.ok(rosMerah.scan);
  assert.equal(rosMerah.scan?.status, 'completed');
  assert.equal(rosMerah.scan?.count, 142);
  assert.equal(rosMerah.scan?.publicId, 'report_ros_merah_123');
});

test('telemarketing Lead-Map is integrated into portal navigation and UI', () => {
  const html = page();

  // Navigation tabs
  assert.match(html, /<button class="nav-button" data-view="telemarketing"/);
  assert.match(html, /<button class="mobile-tab" data-view="telemarketing"/);

  // View section & metrics
  assert.match(html, /id="telemarketingView"/);
  assert.match(html, /id="teleDistrictsCount"/);
  assert.match(html, /id="teleTownsCount"/);
  assert.match(html, /id="teleTamansCount"/);
  assert.match(html, /id="teleScannedCount"/);

  // Controls
  assert.match(html, /id="teleStateSelect"/);
  assert.match(html, /id="teleCategory"/);
  assert.match(html, /id="teleMaxResults"/);
  assert.match(html, /id="teleFilterInput"/);
  assert.match(html, /id="teleTerritoryContainer"/);

  // Client-side methods exist
  assert.match(html, /function loadTelemarketingView\(\)/);
  assert.match(html, /function renderTerritoryCards\(\)/);
  assert.match(html, /function queueTerritoryScan\(/);
  assert.match(html, /function queueTerritoryFromBtn\(/);
  assert.match(html, /function promptLeadNotes\(/);
  assert.match(html, /data-place="/);
});

test('buildTerritoryResponse prioritizes active running scan over completed scan', () => {
  const scans = [
    {
      public_id: 'report_old_completed',
      status: 'completed',
      place: 'taman mount austin, tebrau, johor',
      keyword: 'business',
      company_count: 88,
      created_at: '2026-09-19T10:00:00Z',
    },
    {
      public_id: 'report_new_running',
      status: 'running',
      place: 'taman mount austin, tebrau, johor',
      keyword: 'cafe',
      company_count: 0,
      created_at: '2026-09-21T10:00:00Z',
    },
  ];

  const res = buildTerritoryResponse('johor', scans);
  const jb = res.districts.find((d) => d.name === 'Johor Bahru');
  const tebrau = jb?.towns.find((t) => t.name.includes('Tebrau'));
  const austin = tebrau?.tamans.find((tm) => tm.name === 'Taman Mount Austin');
  assert.ok(austin);
  assert.equal(austin.scan?.status, 'running');
  assert.equal(austin.scan?.publicId, 'report_new_running');
});

test('partial business lists with companies appear as scanned tamans', () => {
  const scans = [
    { public_id: 'sentosa-retry-failed', status: 'failed', place: 'Taman Sentosa, Johor Bahru City Centre, Johor', keyword: 'business', company_count: 0, created_at: '2026-09-24T10:00:00Z' },
    { public_id: 'sentosa', status: 'partial', place: 'Taman Sentosa, Johor Bahru City Centre, Johor', keyword: 'business', company_count: 76, created_at: '2026-09-23T10:00:00Z' },
    { public_id: 'mount-austin', status: 'partial', place: 'Taman Mount Austin, Tebrau, Johor', keyword: 'business', company_count: 120, created_at: '2026-09-23T11:00:00Z' },
  ];

  const result = buildTerritoryResponse('johor', scans);
  const jb = result.districts.find((d) => d.name === 'Johor Bahru');
  const sentosa = jb?.towns.find((t) => t.name === 'Johor Bahru City Centre')?.tamans.find((tm) => tm.name === 'Taman Sentosa');
  const austin = jb?.towns.find((t) => t.name === 'Tebrau')?.tamans.find((tm) => tm.name === 'Taman Mount Austin');

  assert.equal(sentosa?.scan?.publicId, 'sentosa');
  assert.equal(sentosa?.scan?.count, 76);
  assert.equal(austin?.scan?.publicId, 'mount-austin');
  assert.equal(austin?.scan?.count, 120);
  assert.equal(jb?.scannedTamans, 2);
  assert.equal(result.stats.scannedTamans, 2);
  assert.equal(result.stats.totalLeads, 196);

  const html = page();
  assert.match(html, /tScan\.status==='partial'&&tScan\.count>0/);
  assert.match(html, /scan\.status==='partial'&&scan\.count>0/);
  assert.match(html, /businesses · partial/);
});

