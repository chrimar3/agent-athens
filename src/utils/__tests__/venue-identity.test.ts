/**
 * S146 — Venue identity (permanent JSON-LD @id slug source of truth).
 *
 * `getVenueIdentity(venue)` returns the slug used as the `@id` fragment for the
 * venue node in @graph. The cascade:
 *   1. config.slug (Tier-1 curated, permanent, Tier-A-locked)
 *   2. already-latin slugify (existing latin-named venues)
 *   3. Greek transliteration (long-tail Greek venues — identity only, no page)
 *   4. degenerate hash fallback `venue-{fnv1a32Hex}` (all-punctuation edge case)
 *
 * Collision resolution lives in `computePagedVenueSlugs` (set-level pass), NOT
 * in this per-venue helper — keeps the helper pure + deterministic.
 *
 * @see plans/s146-venue-purring-fox.md §1
 */

import { describe, test, expect } from 'bun:test';
import {
  getVenueIdentity,
  fnv1a32Hex,
  idNormalizer,
  VENUE_NAME_SCRIPT_LOCALE,
} from '../venue-identity';
import { transliterateGreekId } from '../normalize-greek';
import type { Venue } from '../../types';

// Test fixture — minimal Venue. Address is required by event-page.ts:295 to
// even materialize the venueEntity, but is not consulted by getVenueIdentity.
function venue(name: string, overrides: Partial<Venue> = {}): Venue {
  return {
    name,
    address: '1 Test St, Athens',
    ...overrides,
  };
}

describe('getVenueIdentity — cascade order', () => {
  test('T1: config.slug present → returns curated slug', () => {
    // Μέγαρο Μουσικής Αθηνών resolves via location-filter matcher → config entry
    // with slug='megaron' (added in §2). Curated path takes precedence.
    expect(getVenueIdentity(venue('Μέγαρο Μουσικής Αθηνών'))).toEqual({ slug: 'megaron' });
  });

  test('T1b: matcher variation also reaches curated slug (e.g. \'Athens Concert Hall\')', () => {
    // The location-filter matcher has variations[] + substring matching.
    // Any input that resolves to the Megaron canonical_name MUST hit slug='megaron'.
    const result = getVenueIdentity(venue('Athens Concert Hall'));
    expect(result.slug).toBe('megaron');
  });

  test('T2: already-latin venue, no config slug → slugify(name)', () => {
    // 'Gazarte' has a config entry but no `slug` field — falls through to slugify.
    // slugify('Gazarte') = 'gazarte'.
    expect(getVenueIdentity(venue('Gazarte'))).toEqual({ slug: 'gazarte' });
  });

  test('T3: Greek-only name, no config slug → transliterateGreekId fallback', () => {
    // 'Παράδεισος' — fictional long-tail venue, not in config.
    // π→p, α→a, ρ→r, α→a, δ→d, ε→e, ι→i, σ→s, ο→o, ς→s = 'paradeisos'
    expect(getVenueIdentity(venue('Παράδεισος'))).toEqual({ slug: 'paradeisos' });
  });

  test('T4: degenerate input (all-punctuation) → venue-{hash} fallback (NO throw)', () => {
    // Amended §1(c): empty-result branch returns hash fallback instead of throwing.
    // FNV-1a 32-bit hex of '@@@' is deterministic and stable across engines.
    const result = getVenueIdentity(venue('@@@'));
    expect(result.slug).toMatch(/^venue-[0-9a-f]{8}$/);
    // Stability — same input produces same hash:
    expect(getVenueIdentity(venue('@@@'))).toEqual(result);
  });

  test('T4b: empty venue name → venue-{hash} fallback', () => {
    const result = getVenueIdentity(venue(''));
    expect(result.slug).toMatch(/^venue-[0-9a-f]{8}$/);
  });
});

describe('fnv1a32Hex — degenerate fallback stability', () => {
  test('T22: pinned hex for \'@@@\' — locks hash determinism across engines', () => {
    // FNV-1a 32-bit of '@@@', computed via Bun:
    //   start: 0x811c9dc5
    //   for each '@' (0x40 = 64): hash = Math.imul(hash ^ 0x40, 0x01000193) >>> 0
    //   Three iterations → 0xd06525f7
    // If this test fails, the hash function has drifted — every degenerate
    // fallback slug in production silently changed identity. RED ALERT.
    // Note: we hash UTF-16 code units via charCodeAt, NOT UTF-8 bytes. Determ-
    // inistic across JS engines (Math.imul + charCodeAt are ECMAScript spec)
    // but NOT interoperable with byte-based FNV-1a implementations. Acceptable
    // because we own both sides of the hash — it's an internal identifier.
    expect(fnv1a32Hex('@@@')).toBe('d06525f7');
  });

  test('FNV-1a of empty string returns offset basis (canonical FNV-1a property)', () => {
    expect(fnv1a32Hex('')).toBe('811c9dc5');
  });

  test('FNV-1a returns 8 lowercase hex chars (padded)', () => {
    // Edge: inputs that hash to a small number must still pad to 8 chars.
    const result = fnv1a32Hex('');
    expect(result).toMatch(/^[0-9a-f]{8}$/);
    expect(result.length).toBe(8);
  });

  test('different inputs → different hashes (venue-keyed, not collision-prone at typical input lengths)', () => {
    expect(fnv1a32Hex('venue-a')).not.toBe(fnv1a32Hex('venue-b'));
    expect(fnv1a32Hex('Μέγαρο')).not.toBe(fnv1a32Hex('Θέατρο'));
  });
});

describe('locale seam — idNormalizer dispatch (Constitution Art. VI)', () => {
  test('T23: idNormalizer[VENUE_NAME_SCRIPT_LOCALE] resolves to the Greek transliterator', () => {
    // The seam exists even though Athens-only ships. Future Latin-script cities
    // (Barcelona/Berlin) add their own entries without touching getVenueIdentity.
    expect(VENUE_NAME_SCRIPT_LOCALE).toBe('el');
    expect(idNormalizer[VENUE_NAME_SCRIPT_LOCALE]).toBe(transliterateGreekId);
  });

  test('seam is a dispatch table, not a bare function call', () => {
    // Sanity: idNormalizer is an object, not a function. This is the seam shape.
    expect(typeof idNormalizer).toBe('object');
    expect(typeof idNormalizer.el).toBe('function');
  });
});

describe('Megaron/GNO/Technopolis emit distinct slugs (collision-healed sanity)', () => {
  test('T14: three Tier-1 Greek venues produce three distinct slugs', () => {
    const megaron = getVenueIdentity(venue('Μέγαρο Μουσικής Αθηνών')).slug;
    const opera = getVenueIdentity(venue('Εθνική Λυρική Σκηνή')).slug;
    const technopolis = getVenueIdentity(venue('Τεχνόπολη Δήμου Αθηναίων')).slug;
    expect(new Set([megaron, opera, technopolis]).size).toBe(3);
    // All non-empty (the empty-string collision class is mathematically impossible
    // at the helper output now — hash fallback ensures it).
    expect(megaron.length).toBeGreaterThan(0);
    expect(opera.length).toBeGreaterThan(0);
    expect(technopolis.length).toBeGreaterThan(0);
  });
});
