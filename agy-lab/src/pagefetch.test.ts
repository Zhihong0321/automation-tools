import test from 'node:test';
import assert from 'node:assert/strict';
import * as pagefetch from './pagefetch.ts';

type Job = Awaited<ReturnType<NonNullable<pagefetch.ReadOptions['fetchPage']>>>;

/** A myworker stand-in: answers each URL from the map, records what it was asked. */
function worker(answers: Record<string, Partial<Job> | Error>) {
  const asked: string[] = [];
  const fetchPage = async (url: string): Promise<Job> => {
    asked.push(url);
    const a = answers[url];
    if (a instanceof Error) throw a;
    return { status: 'done', worker: 'mac-mini', error: null, result: null, ...a } as Job;
  };
  return { asked, fetchPage };
}

test('pages come back in Tavily /extract shape, and cost nothing', async () => {
  const w = worker({ 'https://a.test/': { result: { content: '# A' } } });
  const out = await pagefetch.read(['https://a.test/'], { fetchPage: w.fetchPage });
  assert.deepEqual(out.results, [{ url: 'https://a.test/', raw_content: '# A' }]);
  assert.deepEqual(out.failed_results, []);
  assert.equal(out.usage.credits, 0);
  assert.equal(out.worker, 'mac-mini');
  assert.deepEqual(w.asked, ['https://a.test/']);
});

test('a page the worker could not read is a failed_result, not a thrown error', async () => {
  const w = worker({
    'https://ok.test/': { result: { content: 'text' } },
    'https://dead.test/': { status: 'failed', error: 'the host does not resolve' },
  });
  const out = await pagefetch.read(['https://ok.test/', 'https://dead.test/'], { fetchPage: w.fetchPage });
  assert.equal(out.results.length, 1);
  assert.deepEqual(out.failed_results, [{ url: 'https://dead.test/', error: 'the host does not resolve' }]);
});

test('the service being down or keyless fails each page, never the call', async () => {
  const down = Object.assign(new Error('no myworker API key is saved'), { code: 'not_installed' });
  const w = worker({ 'https://a.test/': down, 'https://b.test/': down });
  const out = await pagefetch.read(['https://a.test/', 'https://b.test/'], { fetchPage: w.fetchPage });
  assert.equal(out.results.length, 0);
  assert.equal(out.failed_results.length, 2);
  assert.match(out.failed_results[0]!.error, /no myworker API key/);
});

test('an empty page and a read still running are failed rows with a reason', async () => {
  const w = worker({ 'https://empty.test/': { result: { content: '  ' } }, 'https://slow.test/': { status: 'running' } });
  const out = await pagefetch.read(['https://empty.test/', 'https://slow.test/'], { fetchPage: w.fetchPage });
  assert.deepEqual(out.failed_results.map((f) => f.error), ['the page had no text', 'the read was still running when the service answered']);
});

test('duplicates and blanks are dropped, and a batch stops at Tavily\'s 20', async () => {
  const urls = ['https://a.test/', 'https://a.test/', ' ', ...Array.from({ length: 30 }, (_, i) => `https://p${i}.test/`)];
  const w = worker({});
  await pagefetch.read(urls, { fetchPage: w.fetchPage });
  assert.equal(w.asked.length, pagefetch.MAX_URLS);
  assert.equal(new Set(w.asked).size, w.asked.length);
});

test('a site map comes from the home page links and the sitemap, read on our workers', async () => {
  const asked: Array<[string, string | undefined]> = [];
  const fetchPage = async (url: string, o: { format?: string } = {}) => {
    asked.push([url, o.format]);
    const content = url.endsWith('/sitemap.xml')
      ? '<urlset><url><loc>https://www.a.test/about</loc></url><url><loc>https://other.test/x</loc></url><url><loc>https://a.test/logo.png</loc></url></urlset>'
      : '<a href="/contact-us">c</a><a href="https://a.test/about/">a</a><a href="mailto:x@a.test">m</a><a href="https://fb.com/a">f</a>';
    return { status: 'done', worker: 'pc-1', error: null, result: { content } } as any;
  };
  const map = await pagefetch.mapSite('https://a.test/shop', { fetchPage });
  assert.deepEqual(map.results, ['https://a.test/', 'https://a.test/contact-us', 'https://a.test/about/']);
  assert.equal(map.worker, 'pc-1');
  assert.equal(map.usage.credits, 0);
  assert.deepEqual(asked.map((a) => a[1]).sort(), ['html', 'text']);
});

test('a site no worker can read maps to nothing with the reason, never a throw', async () => {
  const fetchPage = async () => { throw new Error('myworker unreachable'); };
  const map = await pagefetch.mapSite('a.test', { fetchPage: fetchPage as any });
  assert.deepEqual(map.results, []);
  assert.match(map.error ?? '', /unreachable/);
});
