/**
 * Tests for duplicate-detector.ts — 4-layer cross-source matching
 * AND field-merger.ts — field-level merge logic
 *
 * Uses REAL event pairs from the production database to test matching.
 * Guard tests ensure we never produce false positives.
 */

import { describe, test, expect } from 'bun:test';
import { findDuplicates, type DuplicatePair } from '../duplicate-detector';
import { mergeEvents, type MergeResult } from '../field-merger';
import type { VenueEntry } from '../../utils/text-normalize';

// ============================================================================
// Test Helpers
// ============================================================================

const testVenueConfig: VenueEntry[] = [
  {
    canonical_name: 'Μέγαρο Μουσικής Αθηνών',
    variations: ['Μέγαρο Μουσικής', 'Athens Concert Hall'],
    neighborhood: 'Ilisia',
  },
  {
    canonical_name: 'ΙΛΙΟΝ Plus',
    variations: ['ΙΛΙΟΝ plus', 'Ilion Plus'],
    neighborhood: 'Petroupoli',
  },
  {
    canonical_name: 'Piraeus Club Academy',
    variations: ['Piraeus 117 Academy'],
    neighborhood: 'Piraeus',
  },
  {
    canonical_name: 'Χώρα',
    variations: ['Chora'],
    neighborhood: 'Athens',
  },
  {
    canonical_name: 'Ωδείο Αθηνών',
    variations: ['Athens Conservatory'],
    neighborhood: 'Central Athens',
  },
  {
    canonical_name: 'ΑΙΘΟΥΣΑ ΣΥΝΑΥΛΙΩΝ ΦΙΛΙΠΠΟΣ ΝΑΚΑΣ',
    variations: ['Filippos Nakas Hall'],
    neighborhood: 'Central Athens',
  },
  {
    canonical_name: 'Bolivar Beach Bar',
    variations: ['Bolivar'],
    neighborhood: 'Piraeus',
  },
  {
    canonical_name: 'Half Note Jazz Club',
    variations: ['Half Note'],
    neighborhood: 'Mets',
  },
];

function makeDbRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: `event-${Math.random().toString(36).slice(2, 10)}`,
    title: 'Test Event',
    venue_name: 'Test Venue',
    start_date: '2026-03-15T21:00:00+03:00',
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

// Helper to extract pairs for two specific event IDs
function findPair(
  pairs: DuplicatePair[],
  idA: string,
  idB: string
): DuplicatePair | undefined {
  return pairs.find(
    (p) =>
      (p.eventA === idA && p.eventB === idB) ||
      (p.eventA === idB && p.eventB === idA)
  );
}

// ============================================================================
// Layer 1: Exact Canonical Match (confidence 1.0)
// ============================================================================

describe('Layer 1 — Exact Canonical', () => {
  test('HTML entity difference: &#171;Νέκυια&#187; = Νέκυια', () => {
    const events = [
      makeDbRow({
        id: 'nekuia-athinorama',
        title: '&#171;Νέκυια&#187;',
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        source: 'athinorama.gr',
      }),
      makeDbRow({
        id: 'nekuia-ticketservices',
        title: 'Νέκυια',
        venue_name: 'Μέγαρο Μουσικής',
        source: 'ticketservices.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'nekuia-athinorama', 'nekuia-ticketservices');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(1.0);
    expect(match!.layer).toBe('exact_canonical');
  });

  test('identical titles, different sources at same venue', () => {
    const events = [
      makeDbRow({
        id: 'stars-a',
        title: 'Μέχρι να σβήσουν τ\' άστρα',
        venue_name: 'Χώρα',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'stars-b',
        title: 'Μέχρι να σβήσουν τ\' άστρα',
        venue_name: 'Chora',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'stars-a', 'stars-b');
    expect(match).toBeDefined();
    expect(match!.layer).toBe('exact_canonical');
  });

  test('case-only difference: Oathswan = OATHSWAN', () => {
    const events = [
      makeDbRow({
        id: 'oath-a',
        title: 'Oathswan',
        venue_name: 'Piraeus Club Academy',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'oath-b',
        title: 'OATHSWAN',
        venue_name: 'Piraeus 117 Academy',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'oath-a', 'oath-b');
    expect(match).toBeDefined();
    expect(match!.layer).toBe('exact_canonical');
  });
});

// ============================================================================
// Layer 2: Containment Match (confidence 0.9)
// ============================================================================

describe('Layer 2 — Containment', () => {
  test('longer title contains shorter: source prefix stripped', () => {
    const events = [
      makeDbRow({
        id: 'stam-long',
        title: 'Συναυλία Μουσικής Δωματίου Παντελής Σταματέλος Βιολί',
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        source: 'megaron.gr',
      }),
      makeDbRow({
        id: 'stam-short',
        title: 'Παντελής Σταματέλος Βιολί',
        venue_name: 'Μέγαρο Μουσικής',
        source: 'ticketservices.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'stam-long', 'stam-short');
    expect(match).toBeDefined();
    expect(match!.layer).toBe('exact_canonical'); // prefix stripping makes them exact match
  });

  test('real containment: long title contains shorter multi-token title', () => {
    const events = [
      makeDbRow({
        id: 'alcedo-long',
        title: 'ALCEDO FOLK BAND ΤΑ ΛΟΥΛΟΥΔΙΑ ΜΑΡΤΥΡΟΥΝ',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'alcedo-short',
        title: 'Alcedo folk band',
        venue_name: 'Half Note',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'alcedo-long', 'alcedo-short');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.layer).toBe('containment');
  });

  test('short single-token title does NOT match via containment', () => {
    // "ΟΠΕΚΕΜΠΛΕ" is only 1 significant token — too short for containment
    const events = [
      makeDbRow({
        id: 'opek-long',
        title: 'ΑΠΟΣΤΟΛΗΣ ΜΠΑΡΜΠΑΓΙΑΝΝΗΣ Τσολιάς εν δε Τσόλια Μπαντ ΟΠΕΚΕΜΠΛΕ',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'opek-short',
        title: 'ΟΠΕΚΕΜΠΛΕ',
        venue_name: 'Half Note',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    // May match via token overlap layer 3 if token overlap is high enough,
    // but should NOT match via containment with just 1 token
    const match = findPair(pairs, 'opek-long', 'opek-short');
    if (match) {
      expect(match.layer).not.toBe('containment');
    }
  });
});

// ============================================================================
// Layer 3: Token Overlap (confidence 0.75)
// ============================================================================

describe('Layer 3 — Token Overlap', () => {
  test('SHADOW KNIGHT vs Shadow Knight, Phyrosun & FRS', () => {
    const events = [
      makeDbRow({
        id: 'sk-more',
        title: 'SHADOW KNIGHT',
        venue_name: 'ΙΛΙΟΝ Plus',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'sk-ath',
        title: 'Shadow Knight, Phyrosun & FRS',
        venue_name: 'ΙΛΙΟΝ Plus',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'sk-more', 'sk-ath');
    expect(match).toBeDefined();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.75);
  });

  test('HOUSE ON THE BEACH variants', () => {
    const events = [
      makeDbRow({
        id: 'hotb-a',
        title: 'HOUSE ON THE BEACH',
        venue_name: 'Bolivar Beach Bar',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'hotb-b',
        title: 'House On The Beach: Timmy Regisford + DJ Thai',
        venue_name: 'Bolivar',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'hotb-a', 'hotb-b');
    expect(match).toBeDefined();
  });
});

// ============================================================================
// Guard Tests — MUST NOT MATCH
// ============================================================================

describe('Guard Tests — must NOT match', () => {
  test('same source, same title, same date → NEVER (handled by upsert)', () => {
    const events = [
      makeDbRow({
        id: 'dup-1',
        title: 'Same Event',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'dup-2',
        title: 'Same Event',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com', // same source
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'dup-1', 'dup-2');
    expect(match).toBeUndefined();
  });

  test('different dates, same title, same venue → NEVER', () => {
    const events = [
      makeDbRow({
        id: 'date-a',
        title: 'Weekly Show',
        venue_name: 'Half Note Jazz Club',
        start_date: '2026-03-15T21:00:00+03:00',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'date-b',
        title: 'Weekly Show',
        venue_name: 'Half Note Jazz Club',
        start_date: '2026-03-22T21:00:00+03:00', // different date
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'date-a', 'date-b');
    expect(match).toBeUndefined();
  });

  test('dedup_protected = 1 events → NEVER', () => {
    const events = [
      makeDbRow({
        id: 'prot-a',
        title: 'Protected Show',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com',
        dedup_protected: 1,
      }),
      makeDbRow({
        id: 'prot-b',
        title: 'Protected Show',
        venue_name: 'Half Note',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'prot-a', 'prot-b');
    expect(match).toBeUndefined();
  });

  test('different canonical venues — NEVER match even if title identical', () => {
    const events = [
      makeDbRow({
        id: 'duo-a',
        title: 'Duo Duende',
        venue_name: 'Ωδείο Αθηνών',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'duo-b',
        title: 'Duo Duende',
        venue_name: 'ΑΙΘΟΥΣΑ ΣΥΝΑΥΛΙΩΝ ΦΙΛΙΠΠΟΣ ΝΑΚΑΣ',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'duo-a', 'duo-b');
    expect(match).toBeUndefined();
  });

  test('very short title (< 5 chars) → NEVER match in layers 2/3', () => {
    const events = [
      makeDbRow({
        id: 'short-a',
        title: 'ABC',
        venue_name: 'Half Note Jazz Club',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'short-b',
        title: 'ABC XYZ Extra Words',
        venue_name: 'Half Note',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'short-a', 'short-b');
    // Short title has < 2 significant tokens, shouldn't match
    expect(match).toBeUndefined();
  });
});

// ============================================================================
// Exhibition Date Range Overlap
// ============================================================================

describe('Exhibition date overlap', () => {
  test('exhibitions with overlapping date ranges match', () => {
    const events = [
      makeDbRow({
        id: 'exh-a',
        title: 'Μεγάλη Έκθεση Τέχνης',
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        type: 'exhibition',
        start_date: '2026-03-01',
        end_date: '2026-04-30',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'exh-b',
        title: 'Μεγάλη Έκθεση Τέχνης',
        venue_name: 'Athens Concert Hall',
        type: 'exhibition',
        start_date: '2026-03-05',
        end_date: '2026-04-30',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'exh-a', 'exh-b');
    expect(match).toBeDefined();
  });

  test('exhibitions with non-overlapping dates do NOT match', () => {
    const events = [
      makeDbRow({
        id: 'exh-c',
        title: 'Μεγάλη Έκθεση Τέχνης',
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        type: 'exhibition',
        start_date: '2026-01-01',
        end_date: '2026-02-28',
        source: 'more.com',
      }),
      makeDbRow({
        id: 'exh-d',
        title: 'Μεγάλη Έκθεση Τέχνης',
        venue_name: 'Athens Concert Hall',
        type: 'exhibition',
        start_date: '2026-05-01',
        end_date: '2026-06-30',
        source: 'athinorama.gr',
      }),
    ];
    const pairs = findDuplicates(events, testVenueConfig);
    const match = findPair(pairs, 'exh-c', 'exh-d');
    expect(match).toBeUndefined();
  });
});

// ============================================================================
// Field Merger Tests
// ============================================================================

describe('mergeEvents', () => {
  test('winner missing image_url, loser has it → merged has loser image', () => {
    const winner = makeDbRow({
      id: 'winner-1',
      image_url: null,
      source: 'ticketservices.gr',
    });
    const loser = makeDbRow({
      id: 'loser-1',
      image_url: 'https://example.com/img.jpg',
      image_source: 'scraped_detail',
      source: 'athinorama.gr',
    });
    const result = mergeEvents(winner, loser);
    expect(result.updates.image_url).toBe('https://example.com/img.jpg');
  });

  test('winner missing full_description, loser has it → take loser\'s', () => {
    const winner = makeDbRow({ id: 'w2', full_description: null });
    const loser = makeDbRow({ id: 'l2', full_description: 'Long description here...' });
    const result = mergeEvents(winner, loser);
    expect(result.updates.full_description).toBe('Long description here...');
  });

  test('winner missing price_amount, loser has it → take loser\'s', () => {
    const winner = makeDbRow({ id: 'w3', price_amount: null });
    const loser = makeDbRow({ id: 'l3', price_amount: 15.00 });
    const result = mergeEvents(winner, loser);
    expect(result.updates.price_amount).toBe(15.00);
  });

  test('winner has HTML-encoded title, loser has clean → prefer clean', () => {
    const winner = makeDbRow({ id: 'w4', title: '&#171;Νέκυια&#187;' });
    const loser = makeDbRow({ id: 'l4', title: 'Νέκυια' });
    const result = mergeEvents(winner, loser);
    expect(result.updates.title).toBe('Νέκυια');
  });

  test('winner has field, loser also has field → keep winner\'s (no overwrite)', () => {
    const winner = makeDbRow({
      id: 'w5',
      image_url: 'https://winner.com/img.jpg',
      price_amount: 20,
    });
    const loser = makeDbRow({
      id: 'l5',
      image_url: 'https://loser.com/img.jpg',
      price_amount: 15,
    });
    const result = mergeEvents(winner, loser);
    // Should NOT overwrite winner's existing fields
    expect(result.updates.image_url).toBeUndefined();
    expect(result.updates.price_amount).toBeUndefined();
  });

  test('winner has ticket_url, loser doesn\'t → keep winner\'s', () => {
    const winner = makeDbRow({ id: 'w6', ticket_url: 'https://tickets.example.com' });
    const loser = makeDbRow({ id: 'l6', ticket_url: null });
    const result = mergeEvents(winner, loser);
    expect(result.updates.ticket_url).toBeUndefined();
  });

  test('genres: union-merge (deduplicate)', () => {
    const winner = makeDbRow({ id: 'w7', genres: '["rock", "metal"]' });
    const loser = makeDbRow({ id: 'l7', genres: '["metal", "punk"]' });
    const result = mergeEvents(winner, loser);
    const merged = JSON.parse(result.updates.genres);
    expect(merged).toContain('rock');
    expect(merged).toContain('metal');
    expect(merged).toContain('punk');
    expect(merged.length).toBe(3); // no duplicates
  });

  test('merge result includes changelog for audit', () => {
    const winner = makeDbRow({ id: 'w8', image_url: null });
    const loser = makeDbRow({
      id: 'l8',
      image_url: 'https://loser.com/img.jpg',
    });
    const result = mergeEvents(winner, loser);
    expect(result.changelog.length).toBeGreaterThan(0);
    expect(result.changelog[0].field).toBe('image_url');
    expect(result.changelog[0].source).toBe('loser');
  });

  test('merge result includes loserSnapshot for undo', () => {
    const winner = makeDbRow({ id: 'w9' });
    const loser = makeDbRow({ id: 'l9', title: 'Loser Title' });
    const result = mergeEvents(winner, loser);
    expect(result.loserSnapshot).toBeDefined();
    expect(result.loserSnapshot.id).toBe('l9');
  });

  test('exhibition: prefer later end_date', () => {
    const winner = makeDbRow({
      id: 'w10',
      type: 'exhibition',
      end_date: '2026-03-01',
    });
    const loser = makeDbRow({
      id: 'l10',
      type: 'exhibition',
      end_date: '2026-04-01',
    });
    const result = mergeEvents(winner, loser);
    expect(result.updates.end_date).toBe('2026-04-01');
  });

  test('type: prefer more specific (classical > concert)', () => {
    const winner = makeDbRow({ id: 'w11', type: 'concert' });
    const loser = makeDbRow({ id: 'l11', type: 'classical' });
    const result = mergeEvents(winner, loser);
    expect(result.updates.type).toBe('classical');
  });

  test('never overwrites populated field with null', () => {
    const winner = makeDbRow({
      id: 'w12',
      description: 'Has description',
      price_amount: 10,
    });
    const loser = makeDbRow({
      id: 'l12',
      description: null,
      price_amount: null,
    });
    const result = mergeEvents(winner, loser);
    expect(result.updates.description).toBeUndefined();
    expect(result.updates.price_amount).toBeUndefined();
  });
});
