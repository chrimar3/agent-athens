/**
 * Duplicate Detector — 4-layer cross-source event matching
 *
 * Detects duplicate events from different sources by comparing
 * canonicalized titles within same venue + date groups.
 *
 * Layers (in order of confidence):
 * 1. Exact canonical title match (1.0)
 * 2. Title containment (0.9)
 * 3. Token overlap ≥ 70% (0.75)
 * 4. Artist extraction (0.6) — bare headliner vs. full-lineup listing
 *
 * Safety: events MUST share canonical venue + overlapping dates
 * before any title comparison. Protected events are always skipped.
 */

import {
  canonicalizeTitle,
  canonicalizeVenue,
  extractSignificantTokens,
  extractArtistSegments,
  type VenueEntry,
} from '../utils/text-normalize';

// ============================================================================
// Types
// ============================================================================

export type MatchLayer =
  | 'exact_canonical'
  | 'containment'
  | 'token_overlap'
  | 'artist_extraction';

export interface DuplicatePair {
  eventA: string; // ID
  eventB: string; // ID
  confidence: number;
  layer: MatchLayer;
  reason: string; // Human-readable explanation
}

// ============================================================================
// Main Entry Point
// ============================================================================

export function findDuplicates(
  events: Record<string, any>[],
  venueConfig: VenueEntry[]
): DuplicatePair[] {
  // 1. Filter out protected events
  const eligible = events.filter(
    (e) => !e.dedup_protected || e.dedup_protected === 0
  );

  // 2. Precompute canonical venues and titles
  const canonicals = new Map<
    string,
    { venue: string; title: string; tokens: string[]; date: string }
  >();
  for (const event of eligible) {
    canonicals.set(event.id, {
      venue: canonicalizeVenue(event.venue_name, venueConfig),
      title: canonicalizeTitle(event.title),
      tokens: extractSignificantTokens(event.title),
      date: extractDateKey(event),
    });
  }

  // 3. Group by (canonicalVenue, dateKey) — only compare within groups
  const groups = new Map<string, Record<string, any>[]>();
  for (const event of eligible) {
    const c = canonicals.get(event.id)!;
    const groupKey = `${c.venue}|${c.date}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(event);
  }

  // 4. Handle exhibitions separately — group by venue, check date overlap
  const exhibitions = eligible.filter((e) => e.type === 'exhibition');
  const nonExhibitions = eligible.filter((e) => e.type !== 'exhibition');

  // Non-exhibition groups are already built above. For exhibitions, build
  // venue-only groups and check date overlap during comparison
  const exhibitionsByVenue = new Map<string, Record<string, any>[]>();
  for (const event of exhibitions) {
    const c = canonicals.get(event.id)!;
    if (!exhibitionsByVenue.has(c.venue)) {
      exhibitionsByVenue.set(c.venue, []);
    }
    exhibitionsByVenue.get(c.venue)!.push(event);
  }

  const pairs: DuplicatePair[] = [];
  const matched = new Set<string>(); // Track already-matched IDs

  // 5. Compare within non-exhibition groups
  for (const [, group] of groups) {
    // Filter out exhibitions (handled separately)
    const nonExh = group.filter((e) => e.type !== 'exhibition');
    if (nonExh.length < 2) continue;
    comparePairs(nonExh, canonicals, pairs, matched);
  }

  // 6. Compare exhibitions with date overlap check
  for (const [, group] of exhibitionsByVenue) {
    if (group.length < 2) continue;
    comparePairsExhibition(group, canonicals, pairs, matched);
  }

  return pairs;
}

// ============================================================================
// Date Key Extraction
// ============================================================================

function extractDateKey(event: Record<string, any>): string {
  const startDate = event.start_date || '';
  // Truncate to YYYY-MM-DD
  if (startDate.includes('T')) {
    return startDate.split('T')[0];
  }
  return startDate.slice(0, 10);
}

function datesOverlap(a: Record<string, any>, b: Record<string, any>): boolean {
  const aStart = (a.start_date || '').slice(0, 10);
  const aEnd = (a.end_date || aStart).slice(0, 10);
  const bStart = (b.start_date || '').slice(0, 10);
  const bEnd = (b.end_date || bStart).slice(0, 10);

  // Overlap: aStart <= bEnd AND bStart <= aEnd
  return aStart <= bEnd && bStart <= aEnd;
}

// ============================================================================
// Pair Comparison (Non-Exhibition)
// ============================================================================

function comparePairs(
  group: Record<string, any>[],
  canonicals: Map<string, { venue: string; title: string; tokens: string[]; date: string }>,
  pairs: DuplicatePair[],
  matched: Set<string>
): void {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];

      // Skip if either already matched (prevents triple-match issues)
      if (matched.has(a.id) || matched.has(b.id)) continue;

      const match = matchTitle(a, b, canonicals);
      if (match) {
        // Same-source pairs require higher confidence (exact canonical or containment only)
        // to avoid false positives from legitimately different events at same venue.
        // This catches athinorama's dual-category listings (e.g., music + theater).
        if (a.source === b.source && match.confidence < 0.9) continue;

        pairs.push(match);
        matched.add(a.id);
        matched.add(b.id);
      }
    }
  }
}

// ============================================================================
// Pair Comparison (Exhibition — with date overlap)
// ============================================================================

function comparePairsExhibition(
  group: Record<string, any>[],
  canonicals: Map<string, { venue: string; title: string; tokens: string[]; date: string }>,
  pairs: DuplicatePair[],
  matched: Set<string>
): void {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];

      if (matched.has(a.id) || matched.has(b.id)) continue;

      // Check date range overlap
      if (!datesOverlap(a, b)) continue;

      const match = matchTitle(a, b, canonicals);
      if (match) {
        // Same-source: require higher confidence (see comparePairs)
        if (a.source === b.source && match.confidence < 0.9) continue;

        pairs.push(match);
        matched.add(a.id);
        matched.add(b.id);
      }
    }
  }
}

// ============================================================================
// 4-Layer Title Matching
// ============================================================================

function matchTitle(
  a: Record<string, any>,
  b: Record<string, any>,
  canonicals: Map<string, { venue: string; title: string; tokens: string[]; date: string }>
): DuplicatePair | null {
  const ca = canonicals.get(a.id)!;
  const cb = canonicals.get(b.id)!;

  // Layer 1: Exact canonical match
  if (ca.title === cb.title && ca.title.length > 0) {
    return {
      eventA: a.id,
      eventB: b.id,
      confidence: 1.0,
      layer: 'exact_canonical',
      reason: `Canonical titles match: "${ca.title}"`,
    };
  }

  // Layer 2: Containment
  // The shorter canonical title must be contained in the longer one.
  // Safety: shorter must have ≥ 2 significant tokens AND be ≥ 40% of longer.
  // Exception: single-token titles ≥ 5 chars are allowed (e.g., "autechre").
  const [shorter, longer] =
    ca.title.length <= cb.title.length
      ? [ca, cb]
      : [cb, ca];

  const shorterTokens = shorter.tokens;
  const isSingleDistinctiveToken =
    shorterTokens.length === 1 && shorterTokens[0].length >= 5;
  const hasEnoughTokens = shorterTokens.length >= 2 || isSingleDistinctiveToken;
  // Single distinctive tokens (e.g., "autechre") need lower ratio since the
  // word itself is highly specific. Multi-token titles use stricter 40%.
  const minLengthRatio = isSingleDistinctiveToken ? 0.25 : 0.4;
  if (
    hasEnoughTokens &&
    shorter.title.length >= 5 &&
    shorter.title.length >= longer.title.length * minLengthRatio &&
    longer.title.includes(shorter.title)
  ) {
    return {
      eventA: a.id,
      eventB: b.id,
      confidence: 0.9,
      layer: 'containment',
      reason: `"${shorter.title}" contained in "${longer.title}"`,
    };
  }

  // Layer 3: Token overlap ≥ 70%
  // Need at least 2 shared significant tokens
  if (ca.tokens.length >= 2 && cb.tokens.length >= 2) {
    const setA = new Set(ca.tokens);
    const setB = new Set(cb.tokens);
    const shared = ca.tokens.filter((t) => setB.has(t));

    if (shared.length >= 2) {
      const smallerSet = Math.min(setA.size, setB.size);
      const overlapRatio = shared.length / smallerSet;

      if (overlapRatio >= 0.7) {
        return {
          eventA: a.id,
          eventB: b.id,
          confidence: 0.75,
          layer: 'token_overlap',
          reason: `Token overlap ${(overlapRatio * 100).toFixed(0)}%: [${shared.join(', ')}]`,
        };
      }
    }
  }

  // Layer 4: Artist extraction
  // Bare-headliner vs full-lineup mismatch — e.g. "Monolink" vs
  // "Jafari: Monolink + Nick Jojo + Magda Kay". Split the longer title on
  // lineup delimiters and check whether the shorter title is one of the
  // extracted segments. The shorter title must clear the same significance
  // bar as Layer 2 (avoids a generic short word matching by accident).
  const shortC = ca.title.length <= cb.title.length ? ca : cb;
  const longC = ca.title.length <= cb.title.length ? cb : ca;
  const shortIsSignificant =
    shortC.tokens.length >= 2 ||
    (shortC.tokens.length === 1 && shortC.tokens[0].length >= 5);

  if (shortIsSignificant && shortC.title.length >= 5) {
    const segments = extractArtistSegments(longC.title);
    if (segments.includes(shortC.title)) {
      return {
        eventA: a.id,
        eventB: b.id,
        confidence: 0.6,
        layer: 'artist_extraction',
        reason: `"${shortC.title}" found as lineup segment in "${longC.title}"`,
      };
    }
  }

  return null;
}
