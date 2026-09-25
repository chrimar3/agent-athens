import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { displayNeighborhood } from '../neighborhoods';

// Every neighbourhood a whitelisted venue declares is shown on Greek pages;
// one missing from NEIGHBORHOOD_GREEK renders in Latin script there.
const config = JSON.parse(readFileSync(join(import.meta.dir, '../../../config/athens-venues.json'), 'utf-8'));
// "Unknown" is the whitelist's no-neighbourhood sentinel (~70 venues); no page renders it.
const used = [...new Set<string>(config.venues.map((v: { neighborhood?: string }) => v.neighborhood).filter(Boolean))]
  .filter(n => n !== 'Unknown');

describe('neighbourhood display names', () => {
  test('the whitelist declares neighbourhoods (precondition)', () => {
    expect(used.length).toBeGreaterThan(20);
  });

  test('every whitelisted neighbourhood has a Greek display name', () => {
    const missing = used.filter(n => /[A-Za-z]/.test(n) && !/[Ͱ-Ͽ]/.test(displayNeighborhood(n)));
    expect(missing).toEqual([]);
  });
});
