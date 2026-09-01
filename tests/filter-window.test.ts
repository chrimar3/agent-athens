import { describe, test, expect } from 'bun:test';
import { filterWindowClause } from '../src/quality/location-filter';

// S224 follow-up: the generator pages events up to 45 days past
// (generate-site.ts:719 "past-active events (≤45 days) get pages"), but the
// filter re-classified future-only — so a whitelist removal (Eightball)
// left a past-dated page publishable-with-no-address and F2b blocked the
// build. The filter window must cover AT LEAST the page window.
describe('filterWindowClause', () => {
  test('default window reaches 45 days back (the page window)', () => {
    const c = filterWindowClause();
    expect(c.sql).toContain("date('now'");
    expect(c.params.$windowStart).toBe("-45 days");
  });

  test('explicit daysBack is honored', () => {
    expect(filterWindowClause(7).params.$windowStart).toBe("-7 days");
  });

  test('clause stays end_date-aware for exhibitions (Tier-1)', () => {
    expect(filterWindowClause().sql).toContain("type='exhibition'");
  });
});
