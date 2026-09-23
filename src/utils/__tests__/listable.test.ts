import { describe, test, expect } from 'bun:test';
import { isListable, selectListable } from '../event-lifecycle';

// A merged loser keeps its own page (URL disposition is a pending GEO ruling —
// specs/dedup-url-disposition-proposal.md) but must never appear in a listing
// beside its survivor: that is the visible "same show twice" defect.
describe('isListable', () => {
  test('a live event is listable', () => {
    expect(isListable({ mergedInto: undefined })).toBe(true);
  });

  test('a dedup loser is not listable', () => {
    expect(isListable({ mergedInto: 'survivor-id' })).toBe(false);
  });
});

// selectListable works on the CURRENT population (already lifecycle-filtered).
// The survivor of record is often an earlier, finished run of the same
// production (live 2026-09-22: 11 of 19 current losers had a past survivor);
// dropping every loser then erased real autumn runs from all listings.
describe('selectListable — one listing per duplicate group', () => {
  const ev = (id: string, startDate: string, mergedInto?: string) => ({ id, startDate, mergedInto });

  test('current survivor present → its losers are dropped', () => {
    const out = selectListable([ev('s', '2026-10-01'), ev('l1', '2026-10-01', 's'), ev('x', '2026-10-02')]);
    expect(out.map(e => e.id)).toEqual(['s', 'x']);
  });

  test('survivor not current → the soonest current loser stands in', () => {
    const out = selectListable([ev('late', '2026-11-20', 'old'), ev('soon', '2026-10-12', 'old'), ev('x', '2026-10-02')]);
    expect(out.map(e => e.id)).toEqual(['soon', 'x']);
  });

  test('a lone current loser of a past survivor stays listed', () => {
    expect(selectListable([ev('autumn-run', '2026-09-27', 'spring-run')]).map(e => e.id)).toEqual(['autumn-run']);
  });

  test('input order is preserved for everything kept', () => {
    const out = selectListable([ev('b', '2026-10-05'), ev('l', '2026-10-01', 'gone'), ev('a', '2026-10-03')]);
    expect(out.map(e => e.id)).toEqual(['b', 'l', 'a']);
  });
});
