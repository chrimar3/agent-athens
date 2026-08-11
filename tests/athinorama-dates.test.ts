import { describe, test, expect } from 'bun:test';
import { parseTheaterDateRange } from '../scripts/scrape-all';

// refDate: 2026-08-11. Cards are minimal athinorama markup snippets matching
// the real "Πρεμιέρα: </strong>DD/MM" / "Εως: </strong>DD/MM" label format
// (scrape-all.ts:496-498). Each fixture asserts its own precondition so a
// markup-format change fails loudly instead of the parser going vacuous.
const ref = new Date('2026-08-11T12:00:00Z');

describe('parseTheaterDateRange rollover window (the 13-instance S204 class)', () => {
  test('premiere ~6 months ahead within the window → next-year roll is KEPT (real early booking)', () => {
    const c = 'Πρεμιέρα: </strong>15/2';
    expect(c).toContain('Πρεμιέρα'); // precondition
    expect(parseTheaterDateRange(c, ref).startDate).toBe('2027-02-15');
  });

  test('premiere last month does NOT roll 11 months into next year (stale past listing)', () => {
    // 9/7 vs ref 11 Aug: old code produced 2027-07-09 — the rollover class.
    const r = parseTheaterDateRange('Πρεμιέρα: </strong>9/7', ref);
    expect(r.startDate).toBeNull();
  });

  test('end-date rollover also windowed', () => {
    const r = parseTheaterDateRange('Εως: </strong>5/7', ref);
    expect(r.endDate).toBeNull(); // 2027-07-05 would be 11 months out
  });

  test('ongoing show with a NEAR future end keeps today-start behavior', () => {
    const r = parseTheaterDateRange('Εως: </strong>20/9', ref);
    expect(r.startDate).toBe('2026-08-11');
    expect(r.endDate).toBe('2026-09-20');
  });
});

describe('range-artifact flag (S206: range-start is "the modal state of the field")', () => {
  test('ongoing-show synthesized start is flagged', () => {
    const r = parseTheaterDateRange('Εως: </strong>20/9', ref);
    expect(r.startIsRangeArtifact).toBe(true);
  });

  test('printed premiere is NOT flagged', () => {
    const r = parseTheaterDateRange('Πρεμιέρα: </strong>15/9', ref);
    expect(r.startIsRangeArtifact).toBe(false);
    expect(r.startDate).toBe('2026-09-15');
  });

  test('premiere+until range uses the printed premiere and is NOT flagged', () => {
    const r = parseTheaterDateRange('Πρεμιέρα: </strong>10/9 … Εως: </strong>20/12', ref);
    expect(r.startDate).toBe('2026-09-10');
    expect(r.endDate).toBe('2026-12-20');
    expect(r.startIsRangeArtifact).toBe(false);
  });
});
