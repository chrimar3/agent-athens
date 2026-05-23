/**
 * Greek text normalization — strips diacritics for accent-insensitive matching.
 *
 * "Μουσική" → "μουσικη", "Θέατρο" → "θεατρο"
 *
 * Used by: search index generation, slugify(), client-side search query normalization.
 */

export function normalizeGreek(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * S146 — Greek → Latin transliteration for permanent JSON-LD @id slugs.
 *
 * ELOT-743-DERIVED (NOT full ELOT 743). Two-stage pipeline:
 *   1. Digraph vowel pre-pass: ου/αυ/ευ rewritten BEFORE single-letter map
 *      (must run first or υ→y leaks through Μουσείο → 'moyseio').
 *   2. Single-letter base map: η→i, θ→th, υ→y, χ→ch, ω→o, ς→s, etc.
 *
 * These slugs become PERMANENT @id IRIs. Changing the table later breaks
 * entity-graph identity — the same failure mode S146 exists to fix.
 *
 * Deferred to GEO refine bucket: context-dependent αυ/ευ → av/af · ev/ef by
 * following sound; consonant clusters γγ/γκ/μπ/ντ → ng/g/b/d.
 *
 * @see plans/s146-venue-purring-fox.md §1(b)
 */
export function transliterateGreekId(name: string): string {
  let s = normalizeGreek(name);
  s = s
    .replace(/ου/g, 'ou')
    .replace(/αυ/g, 'av')
    .replace(/ευ/g, 'ev');
  s = s.replace(/[Ͱ-Ͽ]/g, ch => GREEK_SINGLE_LETTER_MAP[ch] ?? ch);
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const GREEK_SINGLE_LETTER_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i',
  θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y',
  φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/**
 * Generate a URL-safe slug from text.
 *
 * Moved here from event-page.ts during S146 to break a venue-identity ↔
 * event-page circular import. event-page.ts re-exports for back-compat with
 * existing callers (venue-page.ts, search-index.ts).
 */
export function slugify(text: string): string {
  return normalizeGreek(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}
