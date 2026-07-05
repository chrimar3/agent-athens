/**
 * normalize() — the shared matching-key fold primitive.
 *
 * Folds a string into a canonical comparison key:
 *   case-fold → final-sigma fold (ς→σ) → accent-fold (Greek AND Latin,
 *   NFD + combining-mark strip) → punctuation/symbols → space → collapse.
 *
 * This is the one primitive both the dedup matcher and the D1
 * location-verification work consume. The S182 accent asymmetry (bare
 * unaccented config tokens never matching accented DB strings) and the
 * dedup accent asymmetry (ALL-CAPS unaccented source titles never matching
 * accented ones) are the same defect class: two consumers folding
 * differently. Fold once, here.
 *
 * NOT for slugs or any permanent identifier — @id slugs use
 * transliterateGreekId in normalize-greek.ts and must never change.
 * Digits are preserved: sequels ("… 2" vs "… 3") must stay distinct.
 */

export function normalize(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
