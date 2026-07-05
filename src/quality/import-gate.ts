/**
 * Import-Time Duplicate Gate (dedup arc Phase 4)
 *
 * Structural half of the dedup arc: the retroactive pass
 * (scripts/mark-duplicates.ts) merged existing duplicates; this gate stops
 * scrapers from recreating them. Called by upsertEvent for NEW ids only —
 * same-id re-scrapes take the normal UPDATE path untouched.
 *
 * A candidate is checked against LIVE rows only (merged_into IS NULL) that
 * share its date (non-exhibitions) or overlap its date range (exhibitions),
 * through the same 4-layer matcher the merge pass used — one matcher, one
 * behavior, at both ends of the pipeline. Any layer match blocks the insert;
 * the caller reports which existing event the candidate duplicates.
 *
 * The S140 Pavlopoulos class (same source re-lists the same URL under a
 * changed title → new title-hashed id → second row) dies here too: the new
 * id arrives, matches the existing row's title variant, and is rejected.
 *
 * @see src/quality/duplicate-detector.ts
 * @see specs/dedup-diagnostic.md
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Database } from 'bun:sqlite';
import { findDuplicates, type DuplicatePair } from './duplicate-detector';
import type { VenueEntry } from '../utils/text-normalize';
import type { Event } from '../types';

export interface ImportDuplicateMatch {
  existingId: string;
  pair: DuplicatePair;
}

// Venue config is loaded once per process — the detector's venue-lookup
// cache is keyed on array identity, so the same array must be reused.
let _venueConfig: VenueEntry[] | null = null;

function getVenueConfig(): VenueEntry[] {
  if (!_venueConfig) {
    const raw = readFileSync(
      join(import.meta.dir, '../../config/athens-venues.json'),
      'utf-8'
    );
    _venueConfig = JSON.parse(raw).venues as VenueEntry[];
  }
  return _venueConfig;
}

/**
 * Returns the existing live event this candidate duplicates, or null if the
 * candidate is genuinely new. Never throws on missing tables/columns — the
 * ingest chokepoint must not crash collection (address-guard precedent).
 */
export function checkImportDuplicate(
  event: Event,
  db: Database
): ImportDuplicateMatch | null {
  try {
    const candidateRow: Record<string, any> = {
      id: event.id,
      title: event.title,
      venue_name: event.venue.name,
      start_date: event.startDate,
      end_date: event.endDate ?? null,
      type: event.type,
      source: event.source,
      dedup_protected: 0,
    };

    let existing: Record<string, any>[];
    if (event.type === 'exhibition') {
      // Exhibitions dedupe by venue + date-RANGE overlap (a multi-day
      // exhibition listed with slightly different ranges is one exhibition;
      // it is NOT a duplicate of one-day events during its run).
      existing = db
        .prepare(
          `SELECT id, title, venue_name, start_date, end_date, type, source, dedup_protected
           FROM events
           WHERE type = 'exhibition'
             AND merged_into IS NULL
             AND id != $id
             AND substr(start_date, 1, 10) <= substr(COALESCE($end, $start), 1, 10)
             AND substr(COALESCE(end_date, start_date), 1, 10) >= substr($start, 1, 10)`
        )
        .all({
          $id: event.id,
          $start: event.startDate,
          $end: event.endDate ?? null,
        }) as Record<string, any>[];
    } else {
      existing = db
        .prepare(
          `SELECT id, title, venue_name, start_date, end_date, type, source, dedup_protected
           FROM events
           WHERE type != 'exhibition'
             AND merged_into IS NULL
             AND id != $id
             AND substr(start_date, 1, 10) = substr($start, 1, 10)`
        )
        .all({ $id: event.id, $start: event.startDate }) as Record<string, any>[];
    }

    if (existing.length === 0) return null;

    // Same matcher as the merge pass — venue canonicalization + 4 layers.
    const pairs = findDuplicates([candidateRow, ...existing], getVenueConfig());
    const hit = pairs.find(
      (p) => p.eventA === event.id || p.eventB === event.id
    );
    if (!hit) return null;

    return {
      existingId: hit.eventA === event.id ? hit.eventB : hit.eventA,
      pair: hit,
    };
  } catch (error) {
    // Fail open: a gate crash must never block event collection.
    console.warn('[import-gate] check failed, allowing insert:', error);
    return null;
  }
}
