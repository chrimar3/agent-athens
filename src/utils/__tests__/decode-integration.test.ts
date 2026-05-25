// Integration test: decode → checkLocation composition.
//
// Proves the end-to-end logic for the S154 deliverable:
//   1. SNFCC entity-encoded form → verified_athens (after decode + variation patch)
//   2. Daddy's entity-encoded form → verified_athens (after decode; variation already existed)
//   3. Tripoli venue → rejected_non_athens (after Τρίπολη added to rejected-locations.json)
//
// Note: existing DB rows are NOT migrated by S154 (explicit deferred bucket —
// needs re-scrape). This test confirms the LOGIC is correct so the next
// re-scrape passing through `upsertEvent` will produce the expected outcomes.

import { describe, test, expect } from 'bun:test';
import { decodeEventFields } from '../decode-html-entities';
import { checkLocation } from '../../quality/location-filter';
import type { Event } from '../../types';

function makeEvent(venueName: string, venueAddress = ''): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id: 'test',
    title: 'Test',
    description: 'Test',
    startDate: '2026-05-25T20:00:00',
    type: 'concert',
    genres: [],
    tags: [],
    venue: { name: venueName, address: venueAddress },
    price: { type: 'open' },
    source: 'test',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    language: 'el',
  };
}

describe('Decode → checkLocation integration (S154)', () => {
  test('SNFCC entity-encoded form (with Φάρος suffix) → verified_athens after decode', () => {
    // The actual DB value pre-S154 (verified via sqlite3). Pre-fix, this stayed
    // unverified because the entity-encoded form isn't in the whitelist exactly
    // (the en-dash + Φάρος-suffix combination is the variation gap S154 patches).
    const event = makeEvent('Κέντρο Πολιτισμού - Ίδρυμα &#171;Σταύρος Νιάρχος&#187; (Φάρος)');
    const decoded = decodeEventFields(event);
    const result = checkLocation({
      venue_name: decoded.venue.name,
      venue_address: decoded.venue.address,
      title: decoded.title,
    });
    expect(result.status).toBe('verified_athens');
    expect(result.matched_venue).toBe('ΚΠΙΣΝ');
  });

  test("Daddy's entity-encoded apostrophe → verified_athens after decode (no variation add needed)", () => {
    // Whitelist already had "Daddy's all day bar" (lowercase). After decoding
    // &#39; → ', the form matches directly without any variation patch.
    const event = makeEvent("Daddy&#39;s all day bar");
    const decoded = decodeEventFields(event);
    const result = checkLocation({
      venue_name: decoded.venue.name,
      venue_address: decoded.venue.address,
      title: decoded.title,
    });
    expect(result.status).toBe('verified_athens');
    expect(result.matched_venue).toBe("Daddy's All Day Bar");
  });

  test('Tripoli venue → rejected_non_athens after Τρίπολη added to blacklist', () => {
    // The actual DB value pre-S154 (Άλσος Προφήτη Ηλία Νεοχώρι - Τρίπολη).
    // Pre-fix, Τρίπολη wasn't in rejected-locations.json — added in S154.
    // After decode the &apos; → ' but that doesn't affect the city-substring
    // match; Τρίπολη in the venue text triggers the blacklist.
    const event = makeEvent('&apos;Αλσος Προφήτη Ηλία Νεοχώρι - Τρίπολη');
    const decoded = decodeEventFields(event);
    const result = checkLocation({
      venue_name: decoded.venue.name,
      venue_address: decoded.venue.address,
      title: decoded.title,
    });
    expect(result.status).toBe('rejected_non_athens');
  });

  test('Genuinely-unknown entity-encoded theater (Ρέει) stays unverified — decode is necessary-but-not-sufficient', () => {
    // S154 done-criteria honesty: decoding does NOT clear the ~95 entity-encoded
    // venues whose decoded forms aren't in the whitelist (they're in the ~970
    // Fix B queue). It just changes WHICH string fails to match.
    const event = makeEvent('&#171;Ρέει&#187; Χώρος Τεχνών');
    const decoded = decodeEventFields(event);
    const result = checkLocation({
      venue_name: decoded.venue.name,
      venue_address: decoded.venue.address,
      title: decoded.title,
    });
    // decode happened (venue.name is now the « » form), but the location is
    // still unverified because «Ρέει» Χώρος Τεχνών isn't whitelisted.
    expect(decoded.venue.name).toBe('«Ρέει» Χώρος Τεχνών');
    expect(result.status).toBe('unverified');
  });
});
