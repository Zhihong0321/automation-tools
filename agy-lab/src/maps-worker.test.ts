import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, scan, searchMaps, SWEEP, toBusiness } from './maps-worker.ts';
import { scanPlaceKey } from './reportdb.ts';

const config = { key: 'k123', baseUrl: 'https://mcp.example', lanes: 1 };

function row(i: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    business_id: `0x${i}:0x${i}`, place_id: `ChIJplace${i}`, name: `Biz ${i} Sdn Bhd Trading`,
    full_address: `${i}, Jalan Sagu 18, Taman Daya, 81100 Johor Bahru, Johor`,
    phone_number: '+6071234567', website: null, rating: 4.5, review_count: 12,
    types: ['Hardware store', 'Store'], place_link: `https://www.google.com/maps/place/data=!1s0x${i}`,
    is_permanently_closed: false, ...extra,
  };
}

/** A fetch that answers search_maps like scraper.tech, from a query → rows table. */
function fakeFetch(answer: (query: string, limit: string) => unknown, calls: Array<Record<string, string>> = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://mcp.example/k123');
    const args = JSON.parse(String(init.body)).params.arguments as Record<string, string>;
    calls.push(args);
    const data = answer(args.query!, args.limit!);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } }));
  }) as unknown as typeof fetch;
}

test('config reads the vault key name and stays idle without it', () => {
  assert.equal(resolveConfig({}).key, '');
  assert.equal(resolveConfig({ SCRAPER_TECH_KEY: ' abc ' }).key, 'abc');
  assert.equal(resolveConfig({}).baseUrl, 'https://mcp.scraper.tech');
});

test('a row maps onto the gmap.mjs business shape and keys on place_id', () => {
  const b = toBusiness(row(7));
  assert.deepEqual(b, {
    name: 'Biz 7 Sdn Bhd Trading', rating: 4.5, reviews: 12, category: 'Hardware store',
    address: '7, Jalan Sagu 18, Taman Daya, 81100 Johor Bahru, Johor', phone: '+6071234567',
    website: null, mapsUrl: 'https://www.google.com/maps/place/data=!1s0x7', place_id: 'ChIJplace7',
  });
  assert.equal(scanPlaceKey(b), 'ChIJplace7');
});

test('a keyword search is one call with the limit capped at 500', async () => {
  const calls: Array<Record<string, string>> = [];
  const result = await scan({ keyword: 'factory', place: 'Taman Daya, Tebrau, Johor', max: 900 }, config,
    fakeFetch(() => ({ status: 'ok', data: [row(1), row(2), row(2), row(3, { is_permanently_closed: true })] }), calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.query, 'factory in Taman Daya, Tebrau, Johor');
  assert.equal(calls[0]!.limit, '500');
  assert.equal(calls[0]!.country, 'my');
  assert.equal(result.found, 2, 'duplicates and closed places are dropped');
  assert.equal(result.blocked, false);
  assert.equal(result.requests, 1);
  assert.equal(result.storage, 'hub');
});

test('no rows is found 0, not a block', async () => {
  const result = await scan({ keyword: 'factory', place: 'Eco Business Park II' }, config,
    fakeFetch(() => ({ status: 'ok', data: [] })));
  assert.equal(result.found, 0);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.businesses, []);
});

test('a location-only search sweeps keywords until max is reached', async () => {
  const calls: Array<Record<string, string>> = [];
  let next = 0;
  // Each keyword returns 60 places, 10 of them already seen.
  const result = await scan({ keyword: 'Taman Daya, Tebrau, Johor', searchMode: 'location_only', originalPlace: 'Taman Daya, Tebrau, Johor', max: 300 }, config,
    fakeFetch(() => {
      const rows = Array.from({ length: 50 }, () => row(next++));
      return { status: 'ok', data: [...rows, ...Array.from({ length: 10 }, (_, i) => row(i))] };
    }, calls));
  assert.equal(calls[0]!.query, `${SWEEP[0]} in Taman Daya, Tebrau, Johor`);
  assert.ok(calls.every((c) => c.limit === '500'));
  // 4 keywords per batch, 50 new each: the second batch crosses 300.
  assert.equal(calls.length, 8);
  assert.equal(result.found, 300);
  assert.equal(result.capped, true);
  assert.equal(result.place, 'Taman Daya, Tebrau, Johor');
  assert.equal(result.keyword, '');
  assert.equal((result.categories as unknown[]).length, 8);
});

test('a non-ok answer fails the scan instead of reading as zero', async () => {
  await assert.rejects(
    searchMaps(config, 'factory in Taman Daya', 500, fakeFetch(() => ({ status: 'error', message: 'quota exceeded' }))),
    /quota exceeded/,
  );
});

test('a dropped connection is retried once', async () => {
  let n = 0;
  const flaky = (async (url: string, init: RequestInit) => {
    if (n++ === 0) throw new TypeError('fetch failed');
    return fakeFetch(() => ({ status: 'ok', data: [row(1)] }))(url, init);
  }) as unknown as typeof fetch;
  assert.equal((await searchMaps(config, 'q', 500, flaky)).length, 1);
  assert.equal(n, 2);
});

test('an address that repeats the business name loses the prefix', () => {
  const b = toBusiness(row(3, { name: 'KULAI RS HARDWARE', full_address: 'KULAI RS HARDWARE, No.292, Jln Lagenda 20, 81000 Kulai, Johor' }));
  assert.equal(b.address, 'No.292, Jln Lagenda 20, 81000 Kulai, Johor');
});
