/**
 * Venue Registry — Cached loader over config/athens-venues.json
 *
 * Provides O(1) lookup from any known venue name/variation → VenueRecord.
 * Used by src/ticketing/resolver.ts Tier 2 (registry lookup) and Tier 5
 * (venue-website fallback).
 *
 * The registry is additive over the existing athens-venues.json schema:
 * both `website` and `ticketing` are optional fields. Venues without them
 * simply don't contribute to Tier 2/5 resolution.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TicketingInfo {
  /** Primary ticket provider domain, e.g. "more.com", "ticketservices.gr". */
  provider?: string;
  /** Stable deep link to the venue's ticketing page (preferred when available). */
  url?: string;
  /** Search-URL template with {title} / {venue} placeholders. */
  search_pattern?: string;
}

export interface VenueRecord {
  canonical_name: string;
  variations: string[];
  neighborhood?: string;
  /** Street address — feeds Schema.org Place.address.streetAddress when present. */
  address?: string;
  /** Venue homepage; drives Tier 5 "Check venue website" CTA. */
  website?: string;
  /** Ticketing configuration; drives Tier 2 resolution. */
  ticketing?: TicketingInfo;
  /** Identity links (Wikidata QID URI, Google Place URL, official URL) emitted as Schema.org sameAs. */
  sameAs?: string[];
}

interface RegistryFile {
  venues: VenueRecord[];
  neighborhoods?: string[];
  pass_through_venues?: string[];
}

const REGISTRY_PATH = join(import.meta.dir, '..', '..', 'config', 'athens-venues.json');

let cache: { byKey: Map<string, VenueRecord>; all: VenueRecord[] } | null = null;

/**
 * Canonicalize a venue name for map lookup.
 *
 * Folds: NFD decomposition drops Greek and Latin diacritics; lowercase +
 * whitespace collapse handles capitalisation + spacing variants. This makes
 * "Ίλιον Plus", "ΙΛΙΟΝ Plus", "ilion  plus" all map to "ilion plus".
 *
 * Mirrors the normalize() in scripts/crossref-ticket-urls.ts so cross-tier
 * matching stays consistent.
 */
export function normalizeVenueKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCache(): { byKey: Map<string, VenueRecord>; all: VenueRecord[] } {
  const raw = readFileSync(REGISTRY_PATH, 'utf-8');
  const file = JSON.parse(raw) as RegistryFile;
  const byKey = new Map<string, VenueRecord>();

  for (const venue of file.venues) {
    const names = [venue.canonical_name, ...(venue.variations ?? [])];
    for (const name of names) {
      const key = normalizeVenueKey(name);
      if (!key) continue;
      if (byKey.has(key) && byKey.get(key)!.canonical_name !== venue.canonical_name) {
        // Collision between two distinct venues after normalisation.
        // Later registration wins; keep deterministic (file order) behaviour.
      }
      byKey.set(key, venue);
    }
  }

  return { byKey, all: file.venues };
}

function ensureCache() {
  if (!cache) cache = buildCache();
  return cache;
}

/**
 * Return the VenueRecord matching the given name, or null.
 * Handles Greek/Latin case variants and diacritics via normalizeVenueKey.
 */
export function getVenueByName(name: string | null | undefined): VenueRecord | null {
  if (!name) return null;
  const { byKey } = ensureCache();
  return byKey.get(normalizeVenueKey(name)) ?? null;
}

/** All venues in registration order; used by backfill diagnostics. */
export function getAllVenues(): VenueRecord[] {
  return ensureCache().all;
}

/**
 * Returns the set of normalized venue keys that are BOTH:
 *  - active (have at least one event in the provided events array)
 *  - reachable via the registry (canonical_name OR a variation normalizes to that key)
 *
 * Used as the ratchet denominator for place.venueSameAs coverage.
 * Per Strategist Q-B8b lock 2026-05-04: denominator = byVenue keys reachable via registry.
 */
export function getActiveReachableVenueKeys(events: { venue: { name: string } }[]): Set<string> {
  const registryKeys = new Set<string>();
  for (const record of getAllVenues()) {
    registryKeys.add(normalizeVenueKey(record.canonical_name));
    for (const variation of record.variations ?? []) {
      registryKeys.add(normalizeVenueKey(variation));
    }
  }

  const activeReachable = new Set<string>();
  for (const event of events) {
    const key = normalizeVenueKey(event.venue.name);
    if (registryKeys.has(key)) {
      activeReachable.add(key);
    }
  }

  return activeReachable;
}

/** For testing — drops the cache so a subsequent lookup re-reads the file. */
export function _resetVenueRegistryCache() {
  cache = null;
}
