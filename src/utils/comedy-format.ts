/**
 * S175 — Comedy-format detector + derived Schema.org @type resolver.
 *
 * Layered ABOVE the EventType→@type map: a genuine stand-up event emits
 * `@type: ComedyEvent` regardless of its EventType column (theater/other/show),
 * while the EventType value itself stays UNCHANGED.
 *
 * BINDING GUARD (GEO Strategist, tag≠type): hub membership (tag="comedy")
 * must NOT drive @type. This detector keys on FORMAT signals — structured
 * stand-up tokens only — never on /comedy hub membership and never on the
 * bare word "comedy"/"κωμωδία" (63 scripted theater comedies carry those).
 * Description prose is NEVER consulted (negation trap: "is not stand-up").
 *
 * Wired derivation sites (Guard 6, S175): db/database.ts rowToEvent,
 * utils/normalize.ts normalizeEvents, generators/event-page.ts ×2,
 * generators/venue-page.ts; schema-graph-builders reads event['@type'] and
 * inherits. KNOWN NON-WIRED residual: enrichment/quality-gates.ts
 * generateSchemaOrg (writes the stored schema_json DB column, which NO
 * emission path reads for @type — do not start trusting schema_json's @type
 * without wiring it through this resolver first).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';

export const COMEDY_EVENT_TYPE = 'ComedyEvent';

/** Structural subset of Event the detector needs — callers may pass full Event. */
export interface ComedyFormatInput {
  title: string;
  type: string;
  tags?: string[];
  genres?: string[];
  venue?: { name: string };
}

// Matches stand-up / stand up / standup as whole words, case-insensitive.
// Word-bounded: "Stand-up-comedy" tag fires; "Understanding" does not.
const STANDUP_TOKEN = /\bstand[- ]?up\b/i;

// Curated allow-list of stand-up-EXCLUSIVE venues — exact name match only,
// never substring (Doryphora "Comedy" Gig Space hosts concerts; audited
// 2026-06-05). Ships empty until a venue passes a full-event-set DB audit.
const standupVenuesConfig: { venues: string[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/standup-venues.json'), 'utf-8')
);
const STANDUP_VENUES = new Set(
  standupVenuesConfig.venues.map(v => v.trim().toLowerCase())
);

export function isStandUpComedy(event: ComedyFormatInput): boolean {
  if (STANDUP_TOKEN.test(event.title)) return true;
  if (event.tags?.some(t => STANDUP_TOKEN.test(t))) return true;
  if (event.genres?.some(g => STANDUP_TOKEN.test(g))) return true;
  if (event.venue?.name && STANDUP_VENUES.has(event.venue.name.trim().toLowerCase())) return true;
  return false;
}

export function resolveEventSchemaType(event: ComedyFormatInput): string {
  if (isStandUpComedy(event)) return COMEDY_EVENT_TYPE;
  return SCHEMA_TYPE_MAP[event.type] || 'Event';
}
