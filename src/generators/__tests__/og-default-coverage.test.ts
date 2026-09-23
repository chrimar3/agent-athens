import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TYPE_COLORS } from '../og-image';

// Category pages reference /images/og/<type>-default.png for their filter
// type; defaults are generated only for TYPE_COLORS keys. Round-1 review:
// tech/other were missing — 294 og:image tags pointed at files never written.
describe('every EventType has a generated OG default', () => {
  test('TYPE_COLORS covers the EventType union', () => {
    const types = readFileSync(join(import.meta.dir, '../../types.ts'), 'utf-8');
    const union = types.match(/export type EventType\s*=([^;]+);/)![1];
    const members = [...union.matchAll(/'([a-z_]+)'|"([a-z_]+)"/g)].map(m => m[1] ?? m[2]);
    expect(members.length).toBeGreaterThanOrEqual(12); // precondition: parsed the real union
    expect(members.filter(t => !(t in TYPE_COLORS))).toEqual([]);
  });
});
