import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMissingTamans, knownKeys, lastJsonObject, matchMapsRow, parseCandidates, searchQueries, tamanKey,
  type Deps, type FoundTaman, type MapsRow, type SearchHit,
} from './taman-finder.ts';
import type { DistrictLocation, StateTerritory } from './territories.ts';

function district(name: string, towns: Array<{ name: string; tamans: string[] }>): DistrictLocation {
  return {
    id: name.toLowerCase().replace(/\W+/g, '_'), num: 1, name, state: 'Johor',
    towns: towns.map((t) => ({
      id: t.name, name: t.name, fullName: `${t.name}, ${name}`, queryPlace: `${t.name}, Johor`,
      tamans: t.tamans.map((n) => ({ name: n, queryPlace: `${n}, ${t.name}, Johor` })),
    })),
  };
}

const territories: Record<string, StateTerritory> = {
  johor: {
    state: 'Johor',
    districts: [
      district('Kulai', [{ name: 'Senai', tamans: ['Taman Daya', 'Taman Bukit Indah'] }]),
      district('Kluang', [{ name: 'Kluang', tamans: ['Taman Sri Lambak'] }]),
      district('Muar', [{ name: 'Bakri', tamans: [] }]),
    ],
  },
};

const hit = (url: string): SearchHit => ({ url, title: 'New homes', content: 'Launching soon' });

/** Fakes for every outside call, recording what was asked and saved. */
function fakes(over: Partial<Deps> = {}) {
  const calls = { search: [] as string[], llm: [] as string[], maps: [] as string[], saved: [] as FoundTaman[] };
  const deps: Partial<Deps> = {
    territories,
    search: async (q) => { calls.search.push(q); return [hit(`https://news.example/${calls.search.length}`)]; },
    llm: async (p) => { calls.llm.push(p); return '{"tamans":[]}'; },
    maps: async (q) => { calls.maps.push(q); return []; },
    save: async (rows) => { calls.saved.push(...rows); return rows.length; },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

test('tamanKey drops the area word, case and punctuation', () => {
  assert.equal(tamanKey('Taman Daya'), 'daya');
  assert.equal(tamanKey('Tmn. Daya'), 'daya');
  assert.equal(tamanKey('TMN DAYA'), 'daya');
  assert.equal(tamanKey('Bandar Seri Alam'), 'serialam');
  assert.equal(tamanKey('Bdr. Seri-Alam'), 'serialam');
  assert.equal(tamanKey('Kg. Melayu Majidee'), 'melayumajidee');
  assert.equal(tamanKey('Kampung Baru'), 'baru');
  assert.equal(tamanKey('Desa Tebrau'), 'tebrau');
  assert.equal(tamanKey('Residensi Eco Botanic 2'), 'residensiecobotanic2');
  // Only a whole leading word counts, and a bare prefix keeps its word.
  assert.equal(tamanKey('Tamarind Square'), 'tamarindsquare');
  assert.equal(tamanKey('Bandar'), 'bandar');
  assert.equal(tamanKey(''), '');
});

test('the two searches name the district and the state', () => {
  assert.deepEqual(searchQueries('Kulai', 'Johor'), [
    'taman perumahan baru Kulai Johor',
    'new housing taman Kulai Johor 2021 2022 2023 2024 2025',
  ]);
});

test('an LLM answer wrapped in prose and fences still parses', () => {
  const answer = 'Here is what I found:\n```json\n{"tamans":[{"name":"Taman Kulai Utama","evidence_url":"https://a.example"},'
    + '{"name":"  Bandar   Putra ","evidence_url":"not a url"},{"name":"Tmn Kulai Utama"},{"name":42}]}\n```\nHope this helps {not json}.';
  assert.ok(Array.isArray(lastJsonObject(answer)?.tamans));
  assert.deepEqual(parseCandidates(answer), [
    { name: 'Taman Kulai Utama', evidence_url: 'https://a.example' },
    { name: 'Bandar Putra', evidence_url: null },
  ]);
  assert.deepEqual(parseCandidates('no json here'), []);
  assert.deepEqual(lastJsonObject('first {"a":1} then {"b":{"c":"}"}}'), { b: { c: '}' } });
});

test('known tamans and town names are filtered out, and repeats are dropped', async () => {
  const keys = knownKeys(territories.johor!.districts[0]!);
  assert.ok(keys.has('daya') && keys.has('bukitindah') && keys.has('senai'));

  const { deps, calls } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[0]!] } },
    llm: async () => JSON.stringify({ tamans: [
      { name: 'Tmn Daya', evidence_url: 'https://x.example' },
      { name: 'Taman Bukit Indah' },
      { name: 'Senai' },
      { name: 'Taman Kulai Utama', evidence_url: 'https://x.example' },
      { name: 'TAMAN KULAI UTAMA' },
    ] }),
  });
  const summary = await findMissingTamans('Johor', deps);
  assert.deepEqual(calls.saved.map((r) => r.name), ['Taman Kulai Utama']);
  assert.deepEqual(calls.maps, ['Taman Kulai Utama, Kulai, Johor']);
  assert.equal(calls.saved[0]!.query_place, 'Taman Kulai Utama, Kulai, Johor');
  assert.equal(calls.saved[0]!.name_key, 'kulaiutama');
  assert.equal(summary.candidates, 1);
  assert.equal(summary.searched, 2);
});

test('a matching Maps row verifies a candidate and a non-matching one rejects it', async () => {
  const rows: Record<string, MapsRow[]> = {
    'Taman Kulai Utama, Kulai, Johor': [
      { name: 'Kedai Runcit Ali', full_address: 'Jalan 1, Kulai, Johor' },
      { name: 'Taman Kulai Utama', full_address: 'Jalan Utama 3, 81000 Kulai, Johor', place_id: 'ChIJ1' },
    ],
    // The name matches but the address is in another state.
    'Taman Seri Murni, Kulai, Johor': [{ name: 'Taman Seri Murni', full_address: '12, Jalan Murni, 47000 Sungai Buloh, Selangor' }],
  };
  const { deps, calls } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[0]!] } },
    llm: async () => '{"tamans":[{"name":"Taman Kulai Utama","evidence_url":"https://e.example/1"},{"name":"Taman Seri Murni"}]}',
    maps: async (q) => rows[q] ?? [],
  });
  const summary = await findMissingTamans('johor', deps);
  assert.deepEqual(calls.saved, [
    {
      state: 'Johor', district: 'Kulai', name: 'Taman Kulai Utama', name_key: 'kulaiutama',
      query_place: 'Taman Kulai Utama, Kulai, Johor', evidence_url: 'https://e.example/1',
      maps_name: 'Taman Kulai Utama', maps_address: 'Jalan Utama 3, 81000 Kulai, Johor', verified: true,
    },
    {
      state: 'Johor', district: 'Kulai', name: 'Taman Seri Murni', name_key: 'serimurni',
      query_place: 'Taman Seri Murni, Kulai, Johor', evidence_url: null,
      maps_name: null, maps_address: null, verified: false,
    },
  ]);
  assert.equal(summary.verified, 1);
  assert.equal(summary.saved, 2);
  assert.deepEqual(summary.perDistrict, [{ district: 'Kulai', candidates: 2, verified: 1 }]);
});

test('matchMapsRow accepts a longer Maps name and needs the district or state in the address', () => {
  const rows = [{ name: 'Taman Kulai Utama Fasa 2', full_address: 'Kulai, Johor' }];
  assert.equal(matchMapsRow('Taman Kulai Utama', 'Kulai', 'Johor', rows), rows[0]);
  assert.equal(matchMapsRow('Taman Kulai Utama', 'Kulai', 'Johor', [{ name: 'Taman Kulai Utama', full_address: 'Shah Alam, Selangor' }]), null);
  assert.equal(matchMapsRow('Taman Lain', 'Kulai', 'Johor', rows), null);
});

test('without a Maps key every candidate is saved unverified', async () => {
  const { deps, calls } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[2]!] } },
    llm: async () => '{"tamans":[{"name":"Taman Bakri Jaya"}]}',
    maps: null,
  });
  const summary = await findMissingTamans('johor', deps);
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0]!.verified, false);
  assert.equal(summary.verified, 0);
});

test('a district whose search throws is recorded and the rest still run', async () => {
  const { deps, calls } = fakes({
    search: async (q) => {
      calls.search.push(q);
      if (q.includes('Kluang')) throw new Error('every Tavily key is out of credits');
      return [hit(`https://news.example/${calls.search.length}`)];
    },
    llm: async (p) => {
      calls.llm.push(p);
      return p.includes('district of Muar') ? '{"tamans":[{"name":"Taman Bakri Jaya"}]}' : '{"tamans":[{"name":"Taman Kulai Utama"}]}';
    },
  });
  const summary = await findMissingTamans('johor', deps);
  assert.equal(summary.districts, 3);
  assert.deepEqual(summary.errors, [{ district: 'Kluang', error: 'every Tavily key is out of credits' }]);
  assert.deepEqual(calls.saved.map((r) => r.district), ['Kulai', 'Muar']);
  assert.equal(calls.llm.length, 2);
  assert.equal(summary.searched, 4);
  assert.deepEqual(summary.perDistrict.map((p) => p.district), ['Kulai', 'Kluang', 'Muar']);
});

test('one failed search of the pair still uses the other', async () => {
  const { deps, calls } = fakes({
    territories: { johor: { state: 'Johor', districts: [territories.johor!.districts[2]!] } },
    search: async (q) => {
      if (q.startsWith('new housing')) throw new Error('timeout');
      return [hit('https://one.example')];
    },
    llm: async () => '{"tamans":[{"name":"Taman Bakri Jaya"}]}',
  });
  const summary = await findMissingTamans('johor', deps);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.searched, 1);
  assert.equal(calls.saved.length, 1);
});

test('an unknown state is refused', async () => {
  await assert.rejects(findMissingTamans('Atlantis', fakes().deps), /unknown state/);
});
