import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMissingTamans, isAreaRow, knownKeys, lastJsonObject, mapsQueries, matchMapsRow, parseCandidates, searchQueries, tamanKey,
  type Deps, type FoundTaman, type MapsRow, type SearchHit,
} from './taman-finder.ts';
import type { DistrictLocation, StateTerritory } from './territories.ts';

function district(name: string, towns: Array<{ name: string; tamans: string[] }>): DistrictLocation {
  return {
    id: name.toLowerCase().replace(/\W+/g, '_'), num: 1, name, state: 'Johor',
    towns: towns.map((t) => ({
      id: t.name, name: t.name, fullName: `${t.name}, ${name}`, queryPlace: `${t.name}, ${name}, Johor`,
      tamans: t.tamans.map((n) => ({ name: n, queryPlace: `${n}, ${t.name}, Johor` })),
    })),
  };
}

const territories: Record<string, StateTerritory> = {
  johor: {
    state: 'Johor',
    districts: [
      district('Kulai', [{ name: 'Senai', tamans: ['Taman Daya'] }, { name: 'Kulai', tamans: ['Taman Kulai Besar'] }]),
      district('Kluang', [{ name: 'Kluang', tamans: ['Taman Sri Lambak'] }]),
    ],
  },
};

const hit = (url: string): SearchHit => ({ url, title: 'New homes', content: 'Launching soon' });
const area = (name: string, address: string, types: string[] = ['Housing Estate']): MapsRow => ({ name, full_address: address, types });

/** Fakes for every external call, recording what was asked and saved. */
function fakes(over: Partial<Deps> = {}) {
  const saved: FoundTaman[] = [];
  const asked = { search: [] as string[], maps: [] as Array<[string, number | undefined]>, llm: [] as string[] };
  const deps: Partial<Deps> = {
    territories,
    search: async (q) => { asked.search.push(q); return [hit('https://news.example/' + asked.search.length)]; },
    llm: async (prompt) => { asked.llm.push(prompt); return '{"tamans":[]}'; },
    maps: async (q, limit) => { asked.maps.push([q, limit]); return []; },
    save: async (rows) => { saved.push(...rows); return rows.length; },
    log: () => {},
    ...over,
  };
  return { deps, saved, asked };
}

test('tamanKey drops the area word, case and punctuation', () => {
  assert.equal(tamanKey('Tmn. Daya Indah'), 'dayaindah');
  assert.equal(tamanKey('Taman Daya-Indah'), 'dayaindah');
  assert.equal(tamanKey('Bdr Baru Uda'), 'baruuda');
  assert.equal(tamanKey('Kg. Melayu'), 'melayu');
  assert.equal(tamanKey('Tamarind Square'), 'tamarindsquare');
  assert.equal(tamanKey('Bandar'), 'bandar');
  assert.equal(tamanKey(''), '');
});

test('each town gets its own Tavily and Maps searches', () => {
  assert.deepEqual(searchQueries('Senai', 'Kulai', 'Johor'), [
    'senarai taman perumahan Senai Kulai Johor',
    'taman baru Senai Kulai Johor 2020 2021 2022 2023 2024 2025',
  ]);
  assert.deepEqual(mapsQueries('Senai, Kulai, Johor'), ['taman in Senai, Kulai, Johor', 'housing estate in Senai, Kulai, Johor']);
});

test('only residential rows in the town or district count as tamans', () => {
  const places = ['Senai', 'Kulai'];
  assert.equal(isAreaRow(area('Taman Seri Senai', '81400 Senai, Johor'), places), true);
  assert.equal(isAreaRow(area('Taman Seri Senai', '81400 Senai, Johor', ['Hardware store']), places), false);
  assert.equal(isAreaRow(area('Taman Seri Senai', 'Johor Bahru, Johor'), places), false);
  assert.equal(isAreaRow({ name: 'Taman Tiada Jenis', full_address: 'Kulai, Johor' }, places), true);
  assert.equal(isAreaRow({ name: 'Kedai Ali', full_address: 'Kulai, Johor' }, places), false);
});

test('an LLM answer wrapped in prose and fences still parses', () => {
  const answer = 'Here you go:\n```json\n{"tamans":[{"name":" Taman  Baru ","evidence_url":"https://a.example"},{"name":"Tmn Baru"},{"name":7},{"name":"Desa {Hill}","evidence_url":"ftp://x"}]}\n```';
  assert.deepEqual(parseCandidates(answer), [
    { name: 'Taman Baru', evidence_url: 'https://a.example' },
    { name: 'Desa {Hill}', evidence_url: null },
  ]);
  assert.equal(lastJsonObject('no json'), null);
});

test('known names are dropped; Maps rows are verified; Tavily names verified by the town list, a check, or not at all', async () => {
  const { deps, saved, asked } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[0]!] } },
    llm: async () => '{"tamans":[{"name":"Taman Daya"},{"name":"Taman Seri Senai","evidence_url":"https://n.example"},{"name":"Taman Checked"},{"name":"Taman Ghost"}]}',
    maps: async (q, limit) => {
      asked.maps.push([q, limit]);
      if (q === 'taman in Senai, Kulai, Johor') return [area('Taman Seri Senai', 'Jalan 1, 81400 Senai, Johor'), area('Taman Daya', 'Senai, Johor'), area('Taman Maps Only', '81400 Senai, Kulai, Johor')];
      if (q.startsWith('Taman Checked')) return [area('Taman Checked', 'Jalan 2, Senai, Kulai, Johor')];
      return [];
    },
  });
  const summary = await findMissingTamans('johor', deps);
  const senai = saved.filter((r) => r.query_place.endsWith('Senai, Johor'));
  assert.deepEqual(senai.map((r) => [r.name, r.verified]), [
    ['Taman Seri Senai', true], ['Taman Maps Only', true], ['Taman Checked', true], ['Taman Ghost', false],
  ]);
  assert.equal(senai.find((r) => r.name === 'Taman Seri Senai')!.maps_address, 'Jalan 1, 81400 Senai, Johor');
  assert.deepEqual(asked.maps.filter(([q]) => q.startsWith('taman in') || q.startsWith('housing estate')).map(([, l]) => l), [500, 500, 500, 500]);
  // The Kulai town does not save the Senai names again.
  assert.equal(saved.filter((r) => r.name === 'Taman Ghost').length, 1);
  assert.deepEqual(summary.perDistrict, [{ district: 'Kulai', towns: 2, candidates: 4, verified: 3 }]);
});

test('a read that thinks past its cap is retried on fewer snippets', async () => {
  let calls = 0;
  const { deps, saved } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[1]!] } },
    llm: async (prompt) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('thought too long'), { code: 'length' });
      assert.ok(prompt.length < 7_000);
      return '{"tamans":[{"name":"Taman Retry"}]}';
    },
    search: async () => Array.from({ length: 40 }, (_, i) => ({ url: 'https://x.example/' + i, title: 't', content: 'x'.repeat(900) })),
  });
  await findMissingTamans('johor', deps);
  assert.equal(calls, 2);
  assert.deepEqual(saved.map((r) => r.name), ['Taman Retry']);
});

test('a failing town is recorded and the others still run; one daerah can run alone', async () => {
  const { deps, asked } = fakes({
    search: async (q) => { asked.search.push(q); if (q.includes('Senai')) throw new Error('tavily down'); return [hit('https://ok.example')]; },
    llm: async (p) => { if (p.includes('in Kulai,')) throw new Error('llm broke'); return '{"tamans":[]}'; },
  });
  const summary = await findMissingTamans('johor', deps);
  assert.deepEqual(summary.errors.map((e) => [e.district, e.town]), [['Kulai', 'Kulai']]);
  assert.equal(summary.perDistrict.length, 2);
  assert.ok(asked.search.some((q) => q.includes('Kluang')));

  const one = fakes();
  const only = await findMissingTamans('johor', one.deps, { district: 'kluang' });
  assert.equal(only.districts, 1);
  assert.ok(one.asked.search.every((q) => q.includes('Kluang')));
});

test('without a Maps key Tavily names are saved unverified', async () => {
  const { deps, saved } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[1]!] } },
    maps: null,
    llm: async () => '{"tamans":[{"name":"Taman Unchecked"}]}',
  });
  await findMissingTamans('johor', deps);
  assert.deepEqual(saved.map((r) => [r.name, r.verified]), [['Taman Unchecked', false]]);
});

test('matchMapsRow accepts a longer Maps name and needs the district or state in the address', () => {
  assert.ok(matchMapsRow('Taman Bayu', 'Kulai', 'Johor', [area('Taman Bayu Indah Phase 2', 'Kulai, Johor')]));
  assert.equal(matchMapsRow('Taman Bayu', 'Kulai', 'Johor', [area('Taman Bayu', 'Shah Alam, Selangor')]), null);
  assert.ok(knownKeys(territories.johor!.districts[0]!).has('daya'));
});

test('an unknown state or district is refused', async () => {
  await assert.rejects(findMissingTamans('perlis', fakes().deps), /unknown state/);
  await assert.rejects(findMissingTamans('johor', fakes().deps, { district: 'Nowhere' }), /unknown district/);
});
