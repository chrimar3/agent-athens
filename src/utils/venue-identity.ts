/**
 * S146 — Venue identity (permanent JSON-LD @id slug source of truth).
 *
 * `getVenueIdentity(venue)` returns the slug used as the `@id` fragment for
 * the venue node in JSON-LD @graph. ALL identity sites (event-page @id, url,
 * organizer, venue-page route, HTML hrefs, search-index venue records) MUST
 * route through this function — diverging at any site silently reintroduces
 * the empty-string collision class S146 exists to fix.
 *
 * Cascade:
 *   1. config.slug      — Tier-1 curated permanent (Tier-A-locked once published)
 *   2. slugify(name)    — already-latin venues (existing behavior preserved)
 *   3. transliterateGreekId(name) — long-tail Greek venues (identity only, no page)
 *   4. venue-{hash}     — degenerate fallback (all-punctuation edge case)
 *
 * Collision resolution happens at the set-level pass (`computePagedVenueSlugs`),
 * NOT here. This function is PURE — same input always produces same output, no
 * cross-venue state. Determinism across rebuilds is mandatory: these slugs
 * become permanent @id IRIs.
 *
 * @see plans/s146-venue-purring-fox.md §1
 */

import type { Venue } from '../types';
import { findVenueConfig } from '../quality/location-filter';
import { slugify, transliterateGreekId } from './normalize-greek';

/**
 * Script locale of SOURCE VENUE NAMES — locale-independent of page render.
 * Athens venue names are Greek-script. NOT the page-render locale (which would
 * wrongly emit two @ids per venue, reintroducing a collision-class bug).
 * Multi-city: when a second city ships, promote to city-config. Until then
 * a named constant is honest about it being a constant.
 */
export const VENUE_NAME_SCRIPT_LOCALE = 'el';

/**
 * Locale-keyed normalizer seam (Constitution Art. VI). Athens-only impl ships;
 * the dispatch table exists so future Latin-script cities (Barcelona/Berlin)
 * add entries without touching getVenueIdentity. Latin cities would use
 * accent-strip slugification (é→e, ß→ss, ü→ue), NOT transliteration.
 */
export const idNormalizer: Record<string, (name: string) => string> = {
  el: transliterateGreekId,
};

/**
 * FNV-1a 32-bit hash → 8-char lowercase hex.
 *
 * Used ONLY for the degenerate `venue-{hash}` fallback when all four cascade
 * stages fail (config.slug absent, slugify empty, transliteration empty).
 * Stable across JS engines (Math.imul + charCodeAt are ECMAScript spec) but
 * NOT interoperable with UTF-8-byte FNV-1a implementations — acceptable
 * because we own both sides of the hash (internal identifier).
 *
 * DO NOT replace with String.prototype.* hashing or V8-internal hashes;
 * these slugs become permanent @id IRIs.
 */
export function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Resolve a Venue to its permanent identity slug.
 *
 * Return shape is `{ slug }` (object, not bare string) so future fields can
 * be added without breaking call sites — e.g. provenance for debugging
 * ("which cascade stage produced this slug?").
 */
export function getVenueIdentity(venue: Venue): { slug: string } {
  const cfg = findVenueConfig(venue.name);
  if (cfg?.slug) return { slug: cfg.slug };

  const latin = slugify(venue.name);
  if (latin) return { slug: latin };

  const translit = idNormalizer[VENUE_NAME_SCRIPT_LOCALE](venue.name);
  if (translit) return { slug: translit };

  return { slug: `venue-${fnv1a32Hex(venue.name)}` };
}
