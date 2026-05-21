import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProofSchema } from '../proof-schema';
import { METRIC_KEYS } from '../proof-metric-keys';
import { BASE_URL } from '../../config/site-url';
import type { ProofMetrics } from '../../utils/proof-metrics';

const ORG_ID = `${BASE_URL}/#organization`;
const PAGE_ID = `${BASE_URL}/en/proof/`;
const DATASET_ID = `${BASE_URL}/en/proof/#proof-data`;

function fullMetrics(): ProofMetrics {
  return {
    eventCount: 3267,
    tests: { pass: 2408, skip: 1, fail: 0, expects: 5091, files: 107, ranAt: '2026-05-22T01:18:41+03:00' },
    schema: { passClean: true, validatedAt: '2026-05-22T11:00:00.000Z' },
    indexing: { bing: { impressions7d: 21, avgPosition7d: 9.76, top10_7d: 2 }, status: 'underway' },
  };
}

describe('buildProofSchema', () => {
  test('top-level shape: @context + @graph length 3', () => {
    const s: any = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    expect(s['@context']).toBe('https://schema.org');
    expect(Array.isArray(s['@graph'])).toBe(true);
    expect(s['@graph']).toHaveLength(3);
  });

  test("WebPage at @graph[0]: @id, publisher.@id, mainEntity.@id, inLanguage, availableLanguage", () => {
    const s: any = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    const wp = s['@graph'][0];
    expect(wp['@type']).toBe('WebPage');
    expect(wp['@id']).toBe(PAGE_ID);
    expect(wp.url).toBe(PAGE_ID);
    expect(wp.publisher).toEqual({ '@id': ORG_ID });
    expect(wp.mainEntity).toEqual({ '@id': DATASET_ID });
    expect(wp.inLanguage).toBe('en');
    expect(wp.availableLanguage).toEqual(['en', 'el']);
  });

  test('Dataset at @graph[1]: @id, creator.@id, variableMeasured present', () => {
    const s: any = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    const ds = s['@graph'][1];
    expect(ds['@type']).toBe('Dataset');
    expect(ds['@id']).toBe(DATASET_ID);
    expect(ds.creator).toEqual({ '@id': ORG_ID });
    expect(ds.url).toBe(PAGE_ID);
    expect(ds.inLanguage).toBe('en');
    expect(ds.availableLanguage).toEqual(['en', 'el']);
    expect(Array.isArray(ds.variableMeasured)).toBe(true);
  });

  test('Organization graph member at @graph[2]: canonical @id from buildSiteOrganizationGraphMember()', () => {
    const s: any = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    const org = s['@graph'][2];
    expect(org['@type']).toBe('Organization');
    expect(org['@id']).toBe(ORG_ID);
    expect(typeof org.name).toBe('string');
    expect(org.name.length).toBeGreaterThan(0);
  });

  test('dateModified passes through from input (no hardcoded date literal in source)', () => {
    const dateA = '2026-05-22T11:00:00Z';
    const dateB = '2024-01-01T00:00:00Z';
    const sA: any = buildProofSchema({ metrics: fullMetrics(), dateModified: dateA });
    const sB: any = buildProofSchema({ metrics: fullMetrics(), dateModified: dateB });
    expect(sA['@graph'][0].dateModified).toBe(dateA);
    expect(sA['@graph'][1].dateModified).toBe(dateA);
    expect(sB['@graph'][0].dateModified).toBe(dateB);
    expect(sB['@graph'][1].dateModified).toBe(dateB);

    // Drift-guard: implementation source must not carry a year-literal that could
    // become a frozen-in-time default. The dateModified MUST be parameterized.
    const src = readFileSync(join(import.meta.dir, '..', 'proof-schema.ts'), 'utf-8');
    expect(src.match(/2026-\d{2}-\d{2}T/)).toBe(null);
    expect(src.match(/2025-\d{2}-\d{2}T/)).toBe(null);
  });

  test('bidirectional invariant: variableMeasured names === METRIC_KEYS (no orphans either direction)', () => {
    const s: any = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    const ds = s['@graph'][1];
    const emittedNames = ds.variableMeasured.map((v: any) => v.name).sort();
    const expectedNames = [...METRIC_KEYS].sort();
    expect(emittedNames).toEqual(expectedNames);

    // Each entry is a PropertyValue with name + value
    for (const pv of ds.variableMeasured) {
      expect(pv['@type']).toBe('PropertyValue');
      expect(typeof pv.name).toBe('string');
      expect(typeof pv.value).toBe('string');
    }
  });

  test("honest-absence: missing metrics still emit variableMeasured entries with value '—' (bidirectional invariant intact)", () => {
    const partial: ProofMetrics = {
      eventCount: 3267,
      tests: '—',
      schema: { passClean: null, validatedAt: '—' },
      indexing: '—',
    };
    const s: any = buildProofSchema({ metrics: partial, dateModified: '2026-05-22T11:00:00Z' });
    const ds = s['@graph'][1];

    // All METRIC_KEYS still present — dropping entries would break the invariant
    const emittedNames = ds.variableMeasured.map((v: any) => v.name).sort();
    expect(emittedNames).toEqual([...METRIC_KEYS].sort());

    // Absent metrics surface as '—' value, not omitted
    const findVal = (n: string) => ds.variableMeasured.find((v: any) => v.name === n)?.value;
    expect(findVal('testsPassing')).toBe('—');
    expect(findVal('schemaPassClean')).toBe('—');
    expect(findVal('bingImpressions7d')).toBe('—');
    expect(findVal('bingAvgPosition7d')).toBe('—');
    expect(findVal('bingTop10_7d')).toBe('—');

    // eventCount is always passed-in (never '—' from the reader); should be the number
    expect(findVal('eventCount')).toBe('3267');
  });

  test('no GSC trace anywhere in serialized output', () => {
    const s = buildProofSchema({ metrics: fullMetrics(), dateModified: '2026-05-22T11:00:00Z' });
    expect(JSON.stringify(s).match(/gsc/i)).toBe(null);
    expect(JSON.stringify(s).match(/search.console/i)).toBe(null);
  });
});
