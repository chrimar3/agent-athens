#!/usr/bin/env bun
/**
 * Addressless-venue auto-proposal (Phase 2A, spec §5.3 — the response half of
 * mistakes.md:1197's "pre-build check" proposal; the detection half is the
 * deadman's addresslessVenuesSignal / ADDRESSLESS_VENUES status).
 *
 * Geocodes publishable venues that resolve to no address and writes PROPOSALS
 * to data/venue-address-proposals.json for the decisions queue. NEVER writes
 * config/athens-venues.json — that file is curated; auto-writing it would
 * recreate the config symptom-patch pollution class (known-issues.md:1173).
 * Advisory by design: exit 0 always; the F2b gate stays the enforcement point.
 *
 * Runs in daily-automated.sh full mode BEFORE the build phase, so proposals
 * exist before the gate could fire.
 */
import { Database } from 'bun:sqlite';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const PROPOSALS_PATH = join(ROOT, 'data', 'venue-address-proposals.json');

export interface AddressProposal {
  venue: string;
  proposedAddress: string | null;
  geocodeConfidence: 'high' | 'medium' | 'low' | null;
  locationType: string | null;
  since: string; // YYYY-MM-DD first proposed
}

export type ProposalGeocoder = (
  venue: string,
) => Promise<{ displayName: string; confidence: 'high' | 'medium' | 'low'; googleLocationType?: string } | null>;

export async function buildProposals(venues: string[], geocode: ProposalGeocoder): Promise<AddressProposal[]> {
  const today = new Date().toISOString().slice(0, 10);
  const out: AddressProposal[] = [];
  for (const venue of [...new Set(venues)]) {
    let hit: Awaited<ReturnType<ProposalGeocoder>> = null;
    try {
      hit = await geocode(venue);
    } catch {
      hit = null; // fault isolation: a quota/network failure still surfaces the venue
    }
    out.push({
      venue,
      proposedAddress: hit?.displayName ?? null,
      geocodeConfidence: hit?.confidence ?? null,
      locationType: hit?.googleLocationType ?? null,
      since: today,
    });
  }
  return out;
}

if (import.meta.main) {
  // Same population as the deadman's addresslessVenuesSignal (deadman-watchdog.ts
  // ~:201) — keep the WHERE clauses in sync if either changes.
  const db = new Database(join(ROOT, 'data', 'events.db'), { readonly: true });
  const rows = db
    .query(
      `SELECT DISTINCT venue_name FROM events
       WHERE location_status IN ('verified_athens', 'pass_through')
         AND merged_into IS NULL
         AND is_cancelled = 0
         AND (venue_address IS NULL OR TRIM(venue_address) = '')
         AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`,
    )
    .all() as Array<{ venue_name: string }>;
  db.close();

  const { geocodeVenue } = await import('../src/utils/geocode');
  const proposals = await buildProposals(
    rows.map((r) => r.venue_name),
    async (v) => {
      const g = await geocodeVenue(v);
      return g ? { displayName: g.displayName, confidence: g.confidence, googleLocationType: g.googleLocationType } : null;
    },
  );
  writeFileSync(PROPOSALS_PATH, JSON.stringify(proposals, null, 2) + '\n');
  console.log(`[venue-autofix] ${proposals.length} addressless publishable venue(s) → ${PROPOSALS_PATH}`);
  const found = proposals.filter((p) => p.proposedAddress).length;
  console.log(`[venue-autofix] geocoded ${found}/${proposals.length}; the rest need manual research (decisions queue)`);
}
