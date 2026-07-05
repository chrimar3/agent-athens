/**
 * Duplicate Detector — 4-layer cross-source event matching
 *
 * Detects duplicate events from different sources by comparing
 * canonicalized titles within same venue + date groups.
 *
 * Layers (in order of confidence):
 * 1. Exact canonical title match (1.0)
 * 2. Title containment (0.9)
 * 3. Token overlap ≥ 70% (0.75) — with edit-distance-1 typo tolerance
 * 4. Artist extraction (0.6) — bare headliner vs. full-lineup listing
 *
 * Safety: events MUST share canonical venue + overlapping dates
 * before any title comparison. Protected events are always skipped.
 * Digit-bearing tokens must agree ("… 2" vs "… 3" sequels never match).
 * Typo tolerance (edit distance 1) only applies to digit-free
 * tokens/segments of ≥5 chars.
 *
 * Two entry points:
 * - findDuplicates()      → pairwise, first-match-wins (daily merge script)
 * - findDuplicateGroups() → ALL pairs + union-find into transitive groups
 *   (dedup-arc mark-duplicates pass + import gate). A 4-listing event
 *   ("Monolink" fixture) is ONE group here, not two disjoint pairs.
 */

import {
  canonicalizeTitle,
  canonicalizeVenue,
  extractSignificantTokens,
  extractArtistSegments,
  withinEditDistanceOne,
  type VenueEntry,
} from '../utils/text-normalize';
import { normalize } from '../utils/normalize-key';

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

export interface DuplicateGroup {
  ids: string[]; // all member event IDs (transitive closure)
  pairs: DuplicatePair[]; // supporting evidence edges
}

interface Canonical {
  venue: string;
  title: string; // canonicalized, venue-suffix-stripped, accent-folded
  raw: string; // original title (delimiters intact, for segment extraction)
  tokens: string[];
  date: string;
  digits: string; // sorted digit-bearing tokens — sequel/date guard
}

// ============================================================================
// Main Entry Points
// ============================================================================

export function findDuplicates(
  events: Record<string, any>[],
  venueConfig: VenueEntry[]
): DuplicatePair[] {
  // First-match-wins pairwise semantics (matched events are not compared
  // again). Consumed by scripts/merge-duplicates.ts which merges one pair
  // per transaction.
  return collectPairs(events, venueConfig, true);
}

/**
 * Transitive grouping: collects ALL matching pairs (no first-match-wins
 * suppression) and unions them into groups. Required so N listings of one
 * event collapse to a single group even when not every pair matches
 * directly (A↔B, B↔C ⇒ {A,B,C}).
 */
export function findDuplicateGroups(
  events: Record<string, any>[],
  venueConfig: VenueEntry[]
): DuplicateGroup[] {
  const pairs = collectPairs(events, venueConfig, false);

  // Union-find over pair edges
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const pair of pairs) union(pair.eventA, pair.eventB);

  const groupsByRoot = new Map<string, DuplicateGroup>();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, { ids: [], pairs: [] });
    groupsByRoot.get(root)!.ids.push(id);
  }
  for (const pair of pairs) {
    groupsByRoot.get(find(pair.eventA))!.pairs.push(pair);
  }

  return [...groupsByRoot.values()].filter((g) => g.ids.length >= 2);
}

// ============================================================================
// Shared Pair Collection
// ============================================================================

function collectPairs(
  events: Record<string, any>[],
  venueConfig: VenueEntry[],
  suppressMatched: boolean
): DuplicatePair[] {
  // 1. Filter out protected events
  const eligible = events.filter(
    (e) => !e.dedup_protected || e.dedup_protected === 0
  );

  // 2. Precompute canonical venues and titles
  const canonicals = new Map<string, Canonical>();
  for (const event of eligible) {
    const venue = canonicalizeVenue(event.venue_name, venueConfig);
    // Strip "<artist> at <venue>" / "<artist> @ <venue>" padding so the
    // bare-headliner listing from another source can match exactly
    // ("Monolink at Island Athens Riviera" ↔ "Monolink").
    const title = stripVenueSuffix(canonicalizeTitle(event.title), normalize(venue));
    canonicals.set(event.id, {
      venue,
      title,
      raw: event.title || '',
      tokens: extractSignificantTokens(title),
      date: extractDateKey(event),
      digits: digitTokens(title),
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

  const exhibitionsByVenue = new Map<string, Record<string, any>[]>();
  for (const event of exhibitions) {
    const c = canonicals.get(event.id)!;
    if (!exhibitionsByVenue.has(c.venue)) {
      exhibitionsByVenue.set(c.venue, []);
    }
    exhibitionsByVenue.get(c.venue)!.push(event);
  }

  const pairs: DuplicatePair[] = [];
  const matched = new Set<string>(); // Only consulted when suppressMatched

  // 5. Compare within non-exhibition groups
  for (const [, group] of groups) {
    // Filter out exhibitions (handled separately)
    const nonExh = group.filter((e) => e.type !== 'exhibition');
    if (nonExh.length < 2) continue;
    comparePairs(nonExh, canonicals, pairs, matched, suppressMatched, false);
  }

  // 6. Compare exhibitions with date overlap check
  for (const [, group] of exhibitionsByVenue) {
    if (group.length < 2) continue;
    comparePairs(group, canonicals, pairs, matched, suppressMatched, true);
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
// Canonical Helpers
// ============================================================================

/**
 * Strip a trailing venue name (plus optional "at/in/στο/στη" connector)
 * from an already-folded canonical title. No-op when the whole title IS
 * the venue name or the remainder would be too short to identify anything.
 */
function stripVenueSuffix(title: string, foldedVenue: string): string {
  if (!foldedVenue || title === foldedVenue) return title;
  if (!title.endsWith(' ' + foldedVenue)) return title;

  let rest = title.slice(0, title.length - foldedVenue.length - 1).trim();
  rest = rest.replace(/\s+(?:at|in|στο|στη|live)$/, '').trim();
  return rest.length >= 3 ? rest : title;
}

/** Sorted digit-bearing tokens — "sequel guard" comparison key. */
function digitTokens(title: string): string {
  return title
    .split(' ')
    .filter((t) => /\d/.test(t))
    .sort()
    .join(' ');
}

/** Fuzzy (edit-distance-1) comparison only for digit-free strings ≥5 chars. */
function fuzzyEligible(s: string): boolean {
  return s.length >= 5 && !/\d/.test(s);
}

function fuzzyEquals(a: string, b: string): boolean {
  return (
    a === b ||
    (fuzzyEligible(a) && fuzzyEligible(b) && withinEditDistanceOne(a, b))
  );
}

// ============================================================================
// Pair Comparison
// ============================================================================

function comparePairs(
  group: Record<string, any>[],
  canonicals: Map<string, Canonical>,
  pairs: DuplicatePair[],
  matched: Set<string>,
  suppressMatched: boolean,
  requireDateOverlap: boolean
): void {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];

      // First-match-wins mode: skip already-matched events (prevents
      // triple-match issues in the pair-by-pair merge script)
      if (suppressMatched && (matched.has(a.id) || matched.has(b.id))) continue;

      // Exhibitions: check date range overlap
      if (requireDateOverlap && !datesOverlap(a, b)) continue;

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
// 4-Layer Title Matching
// ============================================================================

function matchTitle(
  a: Record<string, any>,
  b: Record<string, any>,
  canonicals: Map<string, Canonical>
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

  // Sequel/date guard: when BOTH titles carry digit tokens and they differ,
  // these are different installments ("Κωμωδία της Γειτονιάς 2" vs "… 3",
  // "(2007)" vs "(1982)") — never fuzzy/partial-match them.
  if (ca.digits && cb.digits && ca.digits !== cb.digits) {
    return null;
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
  // Need at least 2 shared significant tokens. Tokens compare exactly OR
  // within edit distance 1 (≥5 chars, digit-free) — "monilink" ≈ "monolink".
  if (ca.tokens.length >= 2 && cb.tokens.length >= 2) {
    const setA = new Set(ca.tokens);
    const setB = new Set(cb.tokens);
    const tokensB = [...setB];
    const shared: string[] = [];
    for (const t of setA) {
      if (setB.has(t)) {
        shared.push(t);
      } else if (fuzzyEligible(t)) {
        const near = tokensB.find(
          (tb) => fuzzyEligible(tb) && withinEditDistanceOne(t, tb)
        );
        if (near) shared.push(`${t}≈${near}`);
      }
    }

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
  // "Jafari: Monolink + Nick Jojo + Magda Kay". Split the longer RAW title
  // (delimiters survive only there — canonicalization folds punctuation)
  // on lineup delimiters and check whether the shorter title is one of the
  // extracted segments (exact or edit-distance-1: "monilink" ≈ "monolink").
  // The shorter title must clear the same significance bar as Layer 2
  // (avoids a generic short word matching by accident).
  const shortC = ca.title.length <= cb.title.length ? ca : cb;
  const longC = ca.title.length <= cb.title.length ? cb : ca;
  const shortIsSignificant =
    shortC.tokens.length >= 2 ||
    (shortC.tokens.length === 1 && shortC.tokens[0].length >= 5);

  if (shortIsSignificant && shortC.title.length >= 5) {
    const segments = extractArtistSegments(longC.raw);
    const hit = segments.find((s) => fuzzyEquals(s, shortC.title));
    if (hit) {
      return {
        eventA: a.id,
        eventB: b.id,
        confidence: 0.6,
        layer: 'artist_extraction',
        reason: `"${shortC.title}" found as lineup segment${hit === shortC.title ? '' : ` (≈"${hit}")`} in "${longC.title}"`,
      };
    }
  }

  return null;
}
