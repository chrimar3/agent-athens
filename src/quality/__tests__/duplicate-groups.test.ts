/**
 * Tests for findDuplicateGroups() — transitive duplicate grouping.
 *
 * Dedup-arc requirements (2026-07-05):
 * 1. THE FIXTURE: 4 real Island Athens Riviera listings of one Monolink
 *    event (4 sources, incl. the "Monilink" edit-distance-1 typo and the
 *    pipe-delimited residentadvisor title) must collapse to ONE group.
 * 2. Greek accent asymmetry: ALL-CAPS unaccented vs accented titles match.
 * 3. residentadvisor date-tails ("Rivo I Sat Aug 8") are stripped.
 * 4. "pres." promoter prefixes expose lineup segments.
 * 5. Venue-name-in-title suffixes are stripped ("Valeron at Island…").
 * 6. Guards: repertory nights, festival lineups, sequels (digit ED1),
 *    umbrella-vs-headliner never merge.
 *
 * Every positive case here is a REAL block from specs/dedup-diagnostic.md;
 * every guard is a real legitimate-co-location block from the same sample.
 */

import { describe, test, expect } from 'bun:test';
import {
  findDuplicateGroups,
  type DuplicateGroup,
} from '../duplicate-detector';
import type { VenueEntry } from '../../utils/text-normalize';

const venueConfig: VenueEntry[] = [
  { canonical_name: 'Island Athens Riviera', variations: ['Island'], neighborhood: 'Varkiza' },
  { canonical_name: 'Bolivar Beach Bar', variations: ['Bolivar'], neighborhood: 'Piraeus' },
  { canonical_name: 'Θέατρο Ψυρρή', variations: [], neighborhood: 'Psyri' },
  { canonical_name: 'Δημοτικό Θέατρο Λυκαβηττού', variations: [], neighborhood: 'Lycabettus' },
  { canonical_name: 'ΚΠΙΣΝ', variations: ['SNFCC'], neighborhood: 'Kallithea' },
  { canonical_name: 'Πλατεία Νερού', variations: [], neighborhood: 'Faliro' },
];

let seq = 0;
function makeDbRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: `event-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Event',
    venue_name: 'Test Venue',
    start_date: '2026-07-05T18:00:00',
    end_date: null,
    type: 'concert',
    source: 'more.com',
    dedup_protected: 0,
    description: null,
    full_description: null,
    image_url: null,
    image_source: null,
    price_amount: null,
    price_type: 'with-ticket',
    price_range: null,
    ticket_url: null,
    time_doors: null,
    time_peak: null,
    semantic_tags: null,
    ai_context: null,
    genres: null,
    location_status: 'verified_athens',
    ...overrides,
  };
}

function groupContaining(groups: DuplicateGroup[], id: string): DuplicateGroup | undefined {
  return groups.find((g) => g.ids.includes(id));
}

// ============================================================================
// THE FIXTURE — 4 listings, one event, must collapse to ONE group
// ============================================================================

describe('Fixture — Monolink at Island Athens Riviera (4 sources → 1 group)', () => {
  const fixture = [
    makeDbRow({
      id: 'ada150e1',
      title: 'Monolink at Island Athens Riviera',
      venue_name: 'Island Athens Riviera',
      source: 'more.com',
    }),
    makeDbRow({
      id: '14520e59',
      title: 'Jafari: Monolink + Nick Jojo + Magda Kay',
      venue_name: 'Island Athens Riviera',
      source: 'clubber.gr',
      type: 'dj_set',
    }),
    makeDbRow({
      id: '118fc4cd',
      title: 'Monolink',
      venue_name: 'Island Athens Riviera',
      source: 'athinorama.gr',
    }),
    makeDbRow({
      id: '73823764',
      title: 'MONILINK | NICK JOJO | MAGDA KAY', // note the o→i typo
      venue_name: 'Island Athens Riviera',
      source: 'residentadvisor',
      type: 'dj_set',
    }),
  ];

  test('all 4 fixture listings land in exactly one group', () => {
    const groups = findDuplicateGroups(fixture, venueConfig);
    expect(groups.length).toBe(1);
    expect([...groups[0].ids].sort()).toEqual(
      ['118fc4cd', '14520e59', '73823764', 'ada150e1'].sort()
    );
  });

  test('typo tolerance: MONILINK groups with bare Monolink (edit distance 1)', () => {
    const groups = findDuplicateGroups(
      [fixture[2], fixture[3]],
      venueConfig
    );
    expect(groups.length).toBe(1);
    expect(groups[0].ids.length).toBe(2);
  });

  test('venue-suffix strip: "Monolink at Island Athens Riviera" groups with "Monolink"', () => {
    const groups = findDuplicateGroups(
      [fixture[0], fixture[2]],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });
});

// ============================================================================
// Real missed-duplicate blocks from the Phase-1 sample
// ============================================================================

describe('Accent-fold matching (Greek ALL-CAPS vs accented)', () => {
  test('ΘΕΟΦΙΛΟΣ Sold ↔ Θεόφιλος Sold (Θέατρο Ψυρρή 2026-10-06)', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'theo-more', title: 'ΘΕΟΦΙΛΟΣ Sold', venue_name: 'Θέατρο Ψυρρή', source: 'more.com', type: 'theater', start_date: '2026-10-06T21:00:00' }),
        makeDbRow({ id: 'theo-athin', title: 'Θεόφιλος Sold', venue_name: 'Θέατρο Ψυρρή', source: 'athinorama.gr', type: 'theater', start_date: '2026-10-06T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });

  test('ΑΓΡΙΟΣ ΣΠΟΡΟΣ 2ος χρόνος ↔ Άγριος σπόρος (containment across accents)', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'sporos-more', title: 'ΑΓΡΙΟΣ ΣΠΟΡΟΣ 2ος χρόνος', venue_name: 'Θέατρο Μικρό Χορν', source: 'more.com', type: 'theater', start_date: '2026-10-01T21:00:00' }),
        makeDbRow({ id: 'sporos-athin', title: 'Άγριος σπόρος', venue_name: 'Θέατρο Μικρό Χορν', source: 'athinorama.gr', type: 'theater', start_date: '2026-10-01T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });
});

describe('residentadvisor date-tail stripping', () => {
  test('"Rivo I Sat Aug 8" ↔ "Rivo" (Bolivar 2026-08-08)', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'rivo-ra', title: 'Rivo I Sat Aug 8', venue_name: 'Bolivar', source: 'residentadvisor', type: 'dj_set', start_date: '2026-08-08T21:00:00' }),
        makeDbRow({ id: 'rivo-athin', title: 'Rivo', venue_name: 'Bolivar Beach Bar', source: 'athinorama.gr', start_date: '2026-08-08T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });

  test('"Mayans with THEMBA I Thu July 2" ↔ "Themba"', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'themba-ra', title: 'Mayans with THEMBA I Thu July 2', venue_name: 'Bolivar', source: 'residentadvisor', type: 'dj_set', start_date: '2026-07-02T21:00:00' }),
        makeDbRow({ id: 'themba-athin', title: 'Themba', venue_name: 'Bolivar Beach Bar', source: 'athinorama.gr', start_date: '2026-07-02T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });
});

describe('Promoter-prefix lineup extraction ("pres.")', () => {
  test('"Bolivar & Minotaur Minotaur pres. Meduza + Dino Mfu" ↔ "Meduza"', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'meduza-clubber', title: 'Bolivar & Minotaur Minotaur pres. Meduza + Dino Mfu', venue_name: 'Bolivar', source: 'clubber.gr', type: 'dj_set', start_date: '2026-07-11T21:00:00' }),
        makeDbRow({ id: 'meduza-athin', title: 'Meduza', venue_name: 'Bolivar Beach Bar', source: 'athinorama.gr', start_date: '2026-07-11T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });
});

// ============================================================================
// Guards — legitimate co-located events must NEVER merge
// ============================================================================

describe('Guards — zero false merges', () => {
  test('repertory night: three different plays, same venue, same date', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'lys', title: 'Λυσιστράτη - Μια ξεκαρδιστική όπερα', venue_name: 'Δημοτικό Θέατρο Λυκαβηττού', source: 'athinorama.gr', type: 'theater' }),
        makeDbRow({ id: 'med', title: 'Μήδεια', venue_name: 'Δημοτικό Θέατρο Λυκαβηττού', source: 'athinorama.gr', type: 'other' }),
        makeDbRow({ id: 'per', title: 'Πέρσες', venue_name: 'Δημοτικό Θέατρο Λυκαβηττού', source: 'athinorama.gr', type: 'other' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });

  test('sequels: edit-distance-1 must NOT apply to digit differences', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'kom2', title: 'Κωμωδία της Γειτονιάς 2', venue_name: 'Λοσάντζελες', source: 'athinorama.gr', type: 'theater' }),
        makeDbRow({ id: 'kom3', title: 'Κωμωδία της Γειτονιάς 3', venue_name: 'Λοσάντζελες', source: 'more.com', type: 'theater' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });

  test('festival lineup: two GNO Percussion Festival concerts share a long prefix but are distinct', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'gno-a', title: '3rd Percussion Festival of the GNO Alternative Stage Alexej Gerassimez Concert', venue_name: 'ΚΠΙΣΝ', source: 'ticketservices.gr', type: 'festival', start_date: '2026-07-02T20:00:00' }),
        makeDbRow({ id: 'gno-b', title: '3rd Percussion Festival of the GNO Alternative Stage Benny Greb trio Concert', venue_name: 'ΚΠΙΣΝ', source: 'ticketservices.gr', type: 'festival', start_date: '2026-07-02T20:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });

  test('festival umbrella vs headliner stays unmerged (HOLD class, human decision)', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'release', title: 'RELEASE ATHENS 2026', venue_name: 'Πλατεία Νερού', source: 'more.com', start_date: '2026-07-01T18:00:00' }),
        makeDbRow({ id: 'moby', title: 'Moby', venue_name: 'Πλατεία Νερού', source: 'athinorama.gr', start_date: '2026-07-01T18:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });

  test('different events at same venue/date with unrelated titles', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'dwarves', title: 'Dwarves', venue_name: 'Gazarte', source: 'athinorama.gr', start_date: '2026-07-08T21:00:00' }),
        makeDbRow({ id: 'ledisi', title: 'Ledisi', venue_name: 'Gazarte', source: 'athinorama.gr', start_date: '2026-07-08T21:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });

  test('different dates never group even with identical titles (non-exhibition)', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'd1', title: 'Best of Μιχάλης Σεβαστέρης', venue_name: 'Λοσάντζελες', source: 'athinorama.gr', type: 'theater', start_date: '2026-07-01T21:30:00' }),
        makeDbRow({ id: 'd2', title: 'Best of Μιχάλης Σεβαστέρης', venue_name: 'Λοσάντζελες', source: 'athinorama.gr', type: 'theater', start_date: '2026-07-02T21:30:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });
});

// ============================================================================
// Transitivity mechanics
// ============================================================================

describe('Transitive grouping', () => {
  test('A↔B and B↔C put A, B, C in one group even if A↔C never matched directly', () => {
    // Real shape: bare headliner ↔ full lineup ↔ typo'd lineup.
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'a-bare', title: 'Monolink', venue_name: 'Island Athens Riviera', source: 'athinorama.gr' }),
        makeDbRow({ id: 'b-lineup', title: 'Jafari: Monolink + Nick Jojo + Magda Kay', venue_name: 'Island Athens Riviera', source: 'clubber.gr', type: 'dj_set' }),
        makeDbRow({ id: 'c-typo', title: 'MONILINK | NICK JOJO | MAGDA KAY', venue_name: 'Island Athens Riviera', source: 'residentadvisor', type: 'dj_set' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
    expect(groups[0].ids.length).toBe(3);
    expect(groups[0].pairs.length).toBeGreaterThanOrEqual(2);
  });

  test('exhibitions group by venue + overlapping date range, not exact date', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'ex-a', title: 'Barbara Kruger: Untitled', venue_name: 'ΚΠΙΣΝ', source: 'snfcc', type: 'exhibition', start_date: '2026-06-01T10:00:00', end_date: '2026-09-30T20:00:00' }),
        makeDbRow({ id: 'ex-b', title: 'BARBARA KRUGER: UNTITLED', venue_name: 'ΚΠΙΣΝ', source: 'athinorama.gr', type: 'exhibition', start_date: '2026-06-15T10:00:00', end_date: '2026-09-30T20:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(1);
  });

  test('multi-day exhibition vs one-day event at same venue does not group by accident', () => {
    const groups = findDuplicateGroups(
      [
        makeDbRow({ id: 'ex-run', title: 'Ανθολογία Γλυπτικής', venue_name: 'ΚΠΙΣΝ', source: 'snfcc', type: 'exhibition', start_date: '2026-06-01T10:00:00', end_date: '2026-09-30T20:00:00' }),
        makeDbRow({ id: 'concert', title: 'Sunset Frequencies', venue_name: 'ΚΠΙΣΝ', source: 'athinorama.gr', type: 'concert', start_date: '2026-07-08T20:00:00' }),
      ],
      venueConfig
    );
    expect(groups.length).toBe(0);
  });
});
