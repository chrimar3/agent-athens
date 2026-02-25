/**
 * Richness Scorer — field-aware event quality scoring
 *
 * Scores raw DB rows by data completeness and source quality.
 * Used to determine which of two duplicate records becomes the "winner"
 * (keeps its ID and gets fields merged in from the loser).
 *
 * Works on raw DB rows to avoid unnecessary ORM conversion.
 */

// ============================================================================
// Source Priority — empirical quality ranking
// ============================================================================

export const SOURCE_PRIORITY: Record<string, number> = {
  'ticketservices.gr': 10, // Best AI descriptions, good prices/images
  'more.com': 9,           // Best images, good prices/descriptions
  'megaron.gr': 8,         // Official venue data, good images
  'athinorama.gr': 7,      // Widest coverage, good prices and ticket URLs
  'halfnote.gr': 7,        // Official venue data, good images
  'onassis.org': 6,        // Official venue data
  'residentadvisor.net': 5, // Unique electronic events but sparse
  'clubber.gr': 4,         // Sparse data, no images
};

const DEFAULT_SOURCE_PRIORITY = 3;

// ============================================================================
// Scoring
// ============================================================================

export interface RichnessBreakdown {
  full_description: number;
  description: number;
  image_url: number;
  price: number;
  ticket_url: number;
  time: number;
  enrichment: number;
  genres: number;
  source: number;
}

export interface RichnessResult {
  total: number;
  breakdown: RichnessBreakdown;
}

export function scoreRichness(row: Record<string, any>): RichnessResult {
  const breakdown: RichnessBreakdown = {
    full_description: scoreFullDescription(row.full_description),
    description: scoreDescription(row.description),
    image_url: scoreImage(row.image_url, row.image_source),
    price: scorePrice(row.price_amount, row.price_range),
    ticket_url: scoreTicketUrl(row.ticket_url),
    time: scoreTime(row.time_doors, row.time_peak),
    enrichment: scoreEnrichment(row.semantic_tags, row.ai_context),
    genres: scoreGenres(row.genres),
    source: SOURCE_PRIORITY[row.source] ?? DEFAULT_SOURCE_PRIORITY,
  };

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { total, breakdown };
}

// ============================================================================
// Individual Field Scorers
// ============================================================================

function scoreFullDescription(value: string | null): number {
  if (!value) return 0;
  const len = value.length;
  // 0-100 chars: 5pts, 100-300: 10pts, 300-500: 15pts, 500+: 20pts
  if (len >= 500) return 20;
  if (len >= 300) return 15;
  if (len >= 100) return 10;
  return 5;
}

function scoreDescription(value: string | null): number {
  if (!value) return 0;
  const len = value.length;
  // Proportional: up to 10pts for 200+ chars
  if (len >= 200) return 10;
  if (len >= 100) return 7;
  if (len >= 50) return 4;
  return 2;
}

function scoreImage(url: string | null, source: string | null): number {
  if (!url || url === 'not_found') return 0;
  if (source === 'not_found') return 0;
  return 10;
}

function scorePrice(amount: number | null, range: string | null): number {
  if (amount != null) return 10;
  if (range) return 5;
  return 0;
}

function scoreTicketUrl(url: string | null): number {
  if (!url) return 0;
  return 10;
}

function scoreTime(doors: string | null, peak: string | null): number {
  if (doors || peak) return 7;
  return 0;
}

function scoreEnrichment(
  semanticTags: string | null,
  aiContext: string | null
): number {
  if (semanticTags || aiContext) return 5;
  return 0;
}

function scoreGenres(genres: string | null): number {
  if (!genres) return 0;
  try {
    const parsed = JSON.parse(genres);
    if (Array.isArray(parsed) && parsed.length > 0) return 3;
  } catch {
    // Non-JSON genres string — still counts
    if (genres.length > 2) return 3;
  }
  return 0;
}
