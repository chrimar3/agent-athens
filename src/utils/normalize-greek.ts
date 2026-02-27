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
    .replace(/[\u0300-\u036f]/g, '');
}
