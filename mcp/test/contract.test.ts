/**
 * Feed contract (M1.3) on the synthetic fixtures. The same check runs against
 * the live feed with `bun run scripts/feed-contract.ts`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkFeedContract } from '../scripts/feed-contract';

const doc = () => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.el.json'), 'utf8'));

describe('feed contract', () => {
  test('the fixture feed passes', () => {
    const r = checkFeedContract(doc());
    expect(r.elements).toBe(8);
    expect(r.violations).toEqual([]);
  });
  test('an element toRecord cannot read is a violation', () => {
    const d = doc();
    delete d.dataFeedElement[2].url;
    expect(checkFeedContract(d).violations).toEqual(['element 2: toRecord() returned null (needs string name, url and startDate)']);
  });
  test('duplicate ids and off-site urls are violations', () => {
    const d = doc();
    d.dataFeedElement[1].url = d.dataFeedElement[0].url;
    d.dataFeedElement[3].url = 'https://example.com/events/x/';
    const v = checkFeedContract(d).violations;
    expect(v.some((x) => x.includes('duplicate id'))).toBe(true);
    expect(v.some((x) => x.includes('not an agentathens.com url'))).toBe(true);
  });
  test('missing optional fields are counted, and flagged over 5%', () => {
    const r = checkFeedContract(doc());
    // Fixture precondition: two of the eight events carry no Offer, so the check has something to count.
    expect(r.missing['offers']).toBe(2);
    expect(r.flagged).toContain('offers');
    expect(r.missing['name']).toBe(0);
  });
});
