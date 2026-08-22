import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './docs.ts';
import { document } from './openapi.ts';

test('served docs explain the complete search-to-research handoff', () => {
  const html = page();
  assert.match(html, /EE Business Intelligence API/);
  assert.match(html, /POST \/api\/business-search/);
  assert.match(html, /Location-only searches are valid/);
  assert.match(html, /data\.companies\[\]\.id/);
  assert.match(html, /POST \/api\/company-research/);
  assert.match(html, /\/api\/person-research/);
  assert.match(html, /person_research_run/);
  assert.match(html, /research_run\.round01/);
  assert.match(html, /GET \/public\/reports\/:reportId/);
  assert.match(html, /\/openapi\.json/);
  assert.doesNotMatch(html, /eternalgy2026/i);
});

test('OpenAPI contract exposes each research workflow and resolves local references', () => {
  assert.equal(document.openapi, '3.1.0');
  assert.ok(document.paths['/api/business-search'].post);
  assert.ok(document.paths['/api/reports'].get);
  assert.ok(document.paths['/api/business-search/{reportId}'].get);
  assert.ok(document.paths['/api/company-research'].post);
  assert.ok(document.paths['/api/company-research/{reportId}'].get);
  assert.ok(document.paths['/api/person-research'].post);
  assert.ok(document.paths['/api/person-research/{reportId}'].get);
  assert.ok(document.paths['/public/reports/{reportId}'].get);
  assert.deepEqual(document.paths['/public/reports/{reportId}'].get.security, []);
  const searchRequest = document.components.schemas.BusinessSearchRequest;
  assert.deepEqual(searchRequest.anyOf, [
    { required: ['keyword'] }, { required: ['place'] }, { required: ['location'] },
  ]);
  assert.equal(searchRequest.required, undefined);

  const root = document as unknown as Record<string, unknown>;
  const refs: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === '$ref' && typeof child === 'string') refs.push(child);
      else visit(child);
    }
  };
  visit(root);
  for (const ref of refs) {
    assert.match(ref, /^#\//);
    let current: unknown = root;
    for (const token of ref.slice(2).split('/')) current = (current as Record<string, unknown>)[token];
    assert.notEqual(current, undefined, `unresolved OpenAPI reference: ${ref}`);
  }
});
