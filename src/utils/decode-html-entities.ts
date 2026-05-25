/**
 * HTML-entity decoding at the ingest chokepoint.
 *
 * Bug class: athinorama.gr (and historically more.com) ship venue names with
 * undecoded HTML entities (`&#171;`, `&#187;`, `&#39;`, `&amp;`, `&apos;`,
 * and others) that flow straight into the events table and break whitelist
 * matching against `config/athens-venues.json` — same canonical Athens venues
 * fail to match purely because they're entity-encoded.
 *
 * Root-cause fix (S154 2026-05-25): decode at `src/db/database.ts upsertEvent`
 * entry BEFORE the `isAthensEvent` check so the location filter receives the
 * decoded form. Prior sessions symptom-patched by adding entity-encoded
 * variations to the whitelist (`config/athens-venues.json` still contains e.g.
 * `Κέντρο Πολιτισμού – Ίδρυμα &#171;Σταύρος Νιάρχος&#187;`); this module
 * obsoletes that workaround for *future* scrapes. Existing DB rows are not
 * re-decoded — they're cleared on the next re-scrape of each event.
 *
 * Decode scope: `venue.name`, `venue.address`, `title`. Description is
 * intentionally NOT decoded — it's longer free-text on the content/enrichment
 * surface, out of scope for venue matching.
 *
 * Idempotency: `he.decode` is a fixed point on already-decoded text — safe
 * to call on every event every scrape, including re-scrapes of existing rows.
 */

import he from 'he';
import type { Event } from '../types';

/**
 * Return a new Event with `title`, `venue.name`, and `venue.address` decoded
 * via `he.decode`. Does not mutate the input.
 */
export function decodeEventFields(event: Event): Event {
  return {
    ...event,
    title: he.decode(event.title),
    venue: {
      ...event.venue,
      name: he.decode(event.venue.name),
      address: he.decode(event.venue.address),
    },
  };
}
