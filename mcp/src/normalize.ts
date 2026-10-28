/**
 * Text keys for matching names across scripts and spellings.
 *
 * A user's Spotify library says "Alkinoos Ioannidis"; the Agent Athens feed
 * says "Αλκίνοος Ιωαννίδης". Both reduce to the same loose key here.
 */

/** Lowercase, no accents, Greek final sigma folded, punctuation → spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Digraphs first (order matters), then single letters. Input is normalizeText()
// output, so it is lowercase and accent-free.
const DIGRAPHS: [RegExp, string][] = [
  [/ου/g, 'ou'], [/αι/g, 'ai'], [/ει/g, 'ei'], [/οι/g, 'oi'],
  [/αυ/g, 'av'], [/ευ/g, 'ev'],
  [/(^|\s)μπ/g, '$1b'], [/μπ/g, 'mp'],
  [/(^|\s)ντ/g, '$1d'], [/ντ/g, 'nt'],
  [/γκ/g, 'g'], [/γγ/g, 'ng'],
];
const LETTERS: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'y',
  φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/** Greek → Latin transliteration (close to ELOT 743) of normalized text. */
export function transliterate(normalized: string): string {
  let out = normalized;
  for (const [re, rep] of DIGRAPHS) out = out.replace(re, rep);
  return out.replace(/[α-ω]/g, (c) => LETTERS[c] ?? c);
}

/**
 * The key used for equality: normalized, transliterated, a leading "the"
 * dropped, y→i, h dropped after consonants (dh/kh spellings), doubled letters
 * collapsed. "The Cure" ≡ "cure"; "Ioannidhs" ≡ "Ιωαννίδης".
 */
export function looseKey(s: string): string {
  return transliterate(normalizeText(s))
    .replace(/^the /, '')
    .replace(/y/g, 'i')
    .replace(/([bcdfgkprt])h/g, (m, c) => (c === 't' || c === 'c' || c === 'p' ? m : c))
    .replace(/(.)\1+/g, '$1')
    .trim();
}

/** True when `needle` occurs in `hay` as a whole-word sequence. Both loose keys. */
export function containsPhrase(hay: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${hay} `.includes(` ${needle} `);
}
