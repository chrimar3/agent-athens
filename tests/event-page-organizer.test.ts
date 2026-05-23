// S142 — Event.organizer bare-@id emission for Component-B venues.
//
// Component-B = venue.sameAs is populated (canonical identity refs). For those
// events we emit Event.organizer as a bare-@id reference to the canonical venue
// node already pushed into @graph. The brief's design intent:
//   - Bare-@id reference to ${BASE_URL}/venues/{slug}/#venue (the existing
//     canonical venue node, NOT a separate #organizer fragment)
//   - Emit ONLY when venue.sameAs is a non-empty array
//   - Reuses the canonical venue node — no new @graph member
//
// The S141 orphan-reference FAIL rule includes 'organizer' in
// ORPHAN_SCOPED_FRAGMENTS (schema-completeness.ts:539-541) — pointing organizer
// at #venue (already in graph) sidesteps that rule. End-to-end orphan-rule
// verification happens at build time via data/build-completeness.json totals.

import { describe, test, expect } from 'bun:test';
import { buildEventGraphEnvelope } from '../src/generators/event-page';
import { getGraph, findEntity } from './helpers/graph-helpers';
import type { Event } from '../src/types';

const BASE_URL = 'https://agentathens.com';

// A Component-B event with a Latin-slugging venue (Onassis Stegi). Used as
// the happy-path fixture. Onassis is the only Component-B venue whose
// canonical name produces a non-empty slug today — the other three (Megaron,
// GNO, Technopolis) use Greek-only names that slugify to '' (S146 territory).
function componentBEvent(): Event {
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id: "s142-test-onassis-concert",
    title: "Test Concert at Onassis Stegi",
    description: "Component-B fixture — venue has sameAs populated and a Latin slug.",
    hasNativeGreek: false,
    startDate: "2026-09-15T20:30:00+03:00",
    endDate: "2026-09-15T22:30:00+03:00",
    type: "concert",
    genres: ["classical"],
    tags: [],
    venue: {
      name: "Onassis Stegi",
      address: "Leoforos Andrea Syngrou 107, Athens 117 45",
      neighborhood: "Koukaki",
      coordinates: { lat: 37.9525, lon: 23.7203 },
      sameAs: [
        "https://www.wikidata.org/wiki/Q43064509",
        "https://en.wikipedia.org/wiki/Onassis_Cultural_Centre",
      ],
    },
    price: { type: "with-ticket", amount: 30, currency: "EUR", range: "€30-€60" },
    url: "https://example.com/onassis-test",
    source: "viva.gr",
    createdAt: "2026-05-22T10:00:00Z",
    updatedAt: "2026-05-22T10:00:00Z",
    language: "en",
    ticketUrlResolved: null,
  };
}

// GNO Greek-form Component-B event — verifies the Greek-form node emits
// organizer (no English-form sibling exists in the corpus, so this is the
// only emit path for GNO events).
function gnoGreekFormEvent(): Event {
  return {
    ...componentBEvent(),
    id: "s142-test-gno-opera",
    title: "Test Opera Performance",
    venue: {
      name: "Εθνική Λυρική Σκηνή",
      address: "Leoforos Andrea Syngrou 364, Kallithea 176 74",
      neighborhood: "Kallithea",
      coordinates: { lat: 37.9418, lon: 23.6919 },
      sameAs: [
        "https://www.wikidata.org/wiki/Q582625",
        "https://en.wikipedia.org/wiki/Greek_National_Opera",
      ],
    },
  };
}

// A non-Component-B event — venue has no sameAs (latent venue profile).
function nonComponentBEvent(): Event {
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id: "s142-test-half-note",
    title: "Test Jazz Night",
    description: "Non-Component-B fixture — venue has no sameAs.",
    hasNativeGreek: false,
    startDate: "2026-09-15T21:30:00+03:00",
    type: "concert",
    genres: ["jazz"],
    tags: [],
    venue: {
      name: "Half Note Jazz Club",
      address: "17 Trivonianou St, Mets, Athens 116 36",
      neighborhood: "Mets",
      coordinates: { lat: 37.9648, lon: 23.7432 },
      // No sameAs — venue is latent
    },
    price: { type: "with-ticket", amount: 15, currency: "EUR" },
    url: "https://example.com/half-note-test",
    source: "viva.gr",
    createdAt: "2026-05-22T10:00:00Z",
    updatedAt: "2026-05-22T10:00:00Z",
    language: "en",
    ticketUrlResolved: null,
  };
}

// Edge case — venue has sameAs as an empty array. Must be treated as "no
// identity refs" (no organizer emitted), same as undefined. Guards against
// a plain-truthy `if (sameAs)` check that would let `[]` slip through.
function emptySameAsEvent(): Event {
  const e = componentBEvent();
  return { ...e, id: "s142-test-empty-sameas", venue: { ...e.venue, sameAs: [] } };
}

function getEventEntity(envelope: any): Record<string, any> {
  const graph = getGraph(envelope);
  const eventEntity = graph[0];
  expect(eventEntity).toBeDefined();
  // The Event entity is always the first @graph member by S138 contract.
  expect(eventEntity['@id']).toContain('#event');
  return eventEntity;
}

describe('S142 — Event.organizer emission', () => {
  test('Component-B venue (sameAs + Latin slug) emits organizer as bare-@id to #venue', () => {
    const envelope = buildEventGraphEnvelope(componentBEvent());
    const eventEntity = getEventEntity(envelope);

    expect(eventEntity.organizer).toBeDefined();
    // Bare-@id reference — single key, pointing at a #venue fragment.
    expect(Object.keys(eventEntity.organizer)).toEqual(['@id']);
    expect(eventEntity.organizer['@id']).toBe(
      `${BASE_URL}/venues/onassis-stegi/#venue`,
    );
  });

  test('organizer @id resolves to canonical venue node in @graph (S141 orphan-rule safety)', () => {
    const envelope = buildEventGraphEnvelope(componentBEvent());
    const eventEntity = getEventEntity(envelope);

    const organizerId = eventEntity.organizer['@id'];
    const venueNode = findEntity(envelope, '@id', organizerId);

    expect(venueNode).toBeDefined();
    // The referenced node must be a definition (has fields beyond just @id),
    // not just another reference — that's what makes the @id resolvable.
    expect(Object.keys(venueNode!).length).toBeGreaterThan(1);
    expect(venueNode!.name).toBe('Onassis Stegi');
    // The canonical venue node carries the sameAs identity refs (organizer
    // dereferences to these via @id merge for graph consumers).
    expect(venueNode!.sameAs).toEqual([
      'https://www.wikidata.org/wiki/Q43064509',
      'https://en.wikipedia.org/wiki/Onassis_Cultural_Centre',
    ]);
  });

  test('Greek-named venue (post-S146): emits organizer with config-curated slug', () => {
    // Pre-S146 (S142 era): slugify('Εθνική Λυρική Σκηνή') returned '' because
    // normalize-greek.ts strips diacritics but does not transliterate. The
    // S142 organizer guard suppressed emission to avoid attaching to a
    // colliding /venues//#venue node.
    //
    // S146 routes venue identity through getVenueIdentity which resolves Greek
    // canonical names to their config-curated slug ('greek-national-opera').
    // The slug-non-empty guard is now mathematically satisfied (hash fallback
    // ensures non-empty by construction), AND the resulting @id is distinct
    // per-venue. Component-B's sameAs/Wikidata identity strategy can now form
    // on this node — the original moat-fix premise.
    const envelope = buildEventGraphEnvelope(gnoGreekFormEvent());
    const eventEntity = getEventEntity(envelope);

    expect(eventEntity.organizer).toBeDefined();
    expect(eventEntity.organizer['@id']).toBe(
      'https://agentathens.com/venues/greek-national-opera/#venue'
    );
    // The referenced @id must resolve in the @graph (no dangling refs).
    const venueNode = envelope['@graph'].find(
      (m: any) => m['@id'] === eventEntity.organizer['@id']
    );
    expect(venueNode).toBeDefined();
    expect(venueNode.sameAs).toContain('https://www.wikidata.org/wiki/Q582625');
  });


  test('non-Component-B venue (no sameAs) does NOT emit organizer', () => {
    const envelope = buildEventGraphEnvelope(nonComponentBEvent());
    const eventEntity = getEventEntity(envelope);

    expect(eventEntity.organizer).toBeUndefined();
  });

  test('empty sameAs array does NOT emit organizer (guards against truthy-only check)', () => {
    const envelope = buildEventGraphEnvelope(emptySameAsEvent());
    const eventEntity = getEventEntity(envelope);

    expect(eventEntity.organizer).toBeUndefined();
  });
});
