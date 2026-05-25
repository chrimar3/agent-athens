// Tests for HTML-entity decoding at the upsertEvent chokepoint.
//
// Bug class: athinorama.gr (and historically more.com) ship venue names with
// undecoded HTML entities (&#171;, &#187;, &#39;, &amp;, &apos;) that flow
// straight into the events table and break whitelist matching against
// config/athens-venues.json — same canonical Athens venues fail to match
// just because they're entity-encoded.
//
// Decode strategy: use `he.decode` (well-maintained, full HTML5 entity table)
// at the ingest chokepoint (src/db/database.ts upsertEvent) BEFORE the
// isAthensEvent check, so the location filter sees the decoded form.
//
// This test pins:
//   1. The exact decoder behavior on the observed 99-event sample
//   2. Decode-then-decode idempotency (re-scrapes are safe)
//   3. Already-decoded passthrough (no second-pass corruption)
//   4. The 3-field boundary: name + address + title — explicitly NOT description
//      (per S154 constraint 4 — description is content surface, out of scope)

import { describe, test, expect } from 'bun:test';
import { decodeEventFields } from '../decode-html-entities';
import type { Event } from '../../types';

function makeEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id: 'test-event',
    title: 'Test Event',
    description: 'A test event',
    startDate: '2026-05-25T20:00:00',
    type: 'concert',
    genres: [],
    tags: [],
    venue: { name: 'Test Venue', address: 'Athens' },
    price: { type: 'open' },
    source: 'test',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    language: 'el',
  };
  return { ...base, ...overrides, venue: { ...base.venue, ...(overrides.venue || {}) } };
}

describe('decodeEventFields — HTML entity decode at chokepoint', () => {
  test('decodes numeric entities in venue.name (&#171; / &#187;)', () => {
    const event = makeEvent({ venue: { name: '&#171;Ρέει&#187; Χώρος Τεχνών', address: '' } });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.name).toBe('«Ρέει» Χώρος Τεχνών');
  });

  test('decodes numeric apostrophe entity (&#39;) in venue.name', () => {
    const event = makeEvent({ venue: { name: 'Daddy&#39;s all day bar', address: '' } });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.name).toBe("Daddy's all day bar");
  });

  test("decodes named entity (&apos;) in venue.name", () => {
    const event = makeEvent({ venue: { name: '&apos;Αλσος Προφήτη Ηλία', address: '' } });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.name).toBe("'Αλσος Προφήτη Ηλία");
  });

  test('decodes &amp; in venue.address (the one embedded-address case)', () => {
    const event = makeEvent({
      venue: { name: 'Stoa', address: 'Πατησίων 99 &amp; Κοδριγκτώνος, Αθήνα' },
    });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.address).toBe('Πατησίων 99 & Κοδριγκτώνος, Αθήνα');
  });

  test('decodes entities in title (defensive — entities can appear in event titles)', () => {
    const event = makeEvent({ title: 'Έργο &#171;Άμλετ&#187; στο Φεστιβάλ' });
    const decoded = decodeEventFields(event);
    expect(decoded.title).toBe('Έργο «Άμλετ» στο Φεστιβάλ');
  });

  test('decodes the full observed S154 sample (composite case)', () => {
    const event = makeEvent({
      title: 'Παράσταση',
      venue: {
        name: 'Νέο Θέατρο &#171;Κατερίνα Βασιλάκου-Μαριάννα Τόλη&#187;',
        address: 'Πειραιώς 5 &amp; Ομήρου',
      },
    });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.name).toBe('Νέο Θέατρο «Κατερίνα Βασιλάκου-Μαριάννα Τόλη»');
    expect(decoded.venue.address).toBe('Πειραιώς 5 & Ομήρου');
  });

  test('idempotent — double decode is a fixed point (re-scrape safety)', () => {
    const event = makeEvent({ venue: { name: '&#171;Ρέει&#187; Χώρος Τεχνών', address: '' } });
    const once = decodeEventFields(event);
    const twice = decodeEventFields(once);
    expect(twice.venue.name).toBe(once.venue.name);
    expect(twice.venue.name).toBe('«Ρέει» Χώρος Τεχνών');
  });

  test('idempotent — preserves a literal & after &amp; decode (no second-pass corruption)', () => {
    // The failure mode this guards: a decoder that turns &amp; → & on pass one,
    // then mis-handles a literal & on pass two by re-interpreting it as an entity start.
    const event = makeEvent({ venue: { name: 'Foo', address: 'Bar & Baz' } });
    const once = decodeEventFields(event);
    const twice = decodeEventFields(once);
    expect(once.venue.address).toBe('Bar & Baz');
    expect(twice.venue.address).toBe('Bar & Baz');
  });

  test('passthrough — already-decoded Greek text unchanged', () => {
    const event = makeEvent({
      title: 'Συναυλία',
      venue: { name: 'Πρόβα', address: 'Αθήνα' },
    });
    const decoded = decodeEventFields(event);
    expect(decoded.title).toBe('Συναυλία');
    expect(decoded.venue.name).toBe('Πρόβα');
    expect(decoded.venue.address).toBe('Αθήνα');
  });

  test('passthrough — ASCII English venue names unchanged', () => {
    const event = makeEvent({ venue: { name: 'Half Note Jazz Club', address: 'Mets, Athens' } });
    const decoded = decodeEventFields(event);
    expect(decoded.venue.name).toBe('Half Note Jazz Club');
    expect(decoded.venue.address).toBe('Mets, Athens');
  });

  test('does NOT decode description (S154 constraint 4 — out of scope)', () => {
    // Description is longer free-text content that touches the enrichment surface.
    // Decoding it expands the blast radius beyond venue matching. If description-
    // entity-encoding ever surfaces as a real problem, that's its own session.
    const event = makeEvent({
      description: 'A great show at &#171;Πρόβα&#187; theatre',
      venue: { name: 'Πρόβα', address: '' },
    });
    const decoded = decodeEventFields(event);
    expect(decoded.description).toBe('A great show at &#171;Πρόβα&#187; theatre');
  });

  test('returns a new object — does not mutate the input event', () => {
    const event = makeEvent({ venue: { name: '&#171;Foo&#187;', address: '' } });
    const original = event.venue.name;
    decodeEventFields(event);
    expect(event.venue.name).toBe(original);
  });
});
