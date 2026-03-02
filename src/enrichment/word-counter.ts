/**
 * Word Counter Utility
 *
 * Counts words in text for validating AI-generated descriptions.
 * Supports Unicode (Greek) and handles various punctuation.
 *
 * Per spec: Descriptions must be 150-300 words.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.2)
 */

// ============================================================================
// Types
// ============================================================================

export interface WordCountResult {
  count: number;
  valid?: boolean;
  reason?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_WORDS = 150;
const MAX_WORDS = 300;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Count words in text
 *
 * Handles:
 * - Multiple whitespace (spaces, tabs, newlines)
 * - Unicode characters (Greek)
 * - Punctuation (ignored)
 * - Hyphenated words (counted as one)
 *
 * @param text - Text to count words in
 * @returns Word count result
 */
export function countWords(text: string): WordCountResult {
  if (!text || typeof text !== 'string') {
    return { count: 0 };
  }

  // Normalize whitespace
  const normalized = text
    // Replace newlines and tabs with spaces
    .replace(/[\n\t\r]/g, ' ')
    // Remove punctuation but keep hyphens within words
    .replace(/["""''«».,!?;:()[\]{}…—–]/g, ' ')
    // Remove standalone hyphens
    .replace(/\s-\s/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { count: 0 };
  }

  // Split by whitespace and filter empty strings
  const words = normalized.split(' ').filter(word => word.length > 0);

  return { count: words.length };
}

/**
 * Validate word count against 150-300 word requirement
 *
 * @deprecated Use validateWordCountForType() with per-event matrix ranges instead.
 * @param text - Text to validate
 * @returns Validation result with count and reason if invalid
 */
export function validateWordCount(text: string): WordCountResult {
  const result = countWords(text);

  if (result.count < MIN_WORDS) {
    return {
      ...result,
      valid: false,
      reason: `Description too short: ${result.count} words (minimum ${MIN_WORDS})`,
    };
  }

  if (result.count > MAX_WORDS) {
    return {
      ...result,
      valid: false,
      reason: `Description too long: ${result.count} words (maximum ${MAX_WORDS})`,
    };
  }

  return {
    ...result,
    valid: true,
  };
}

/**
 * Validate word count against per-event-type matrix ranges.
 *
 * @param text - Text to validate
 * @param min - Minimum word count from enrichment matrix
 * @param max - Maximum word count from enrichment matrix
 * @returns Validation result with count and reason if invalid
 */
export function validateWordCountForType(
  text: string,
  min: number,
  max: number,
): WordCountResult {
  const result = countWords(text);

  if (result.count < min) {
    return {
      ...result,
      valid: false,
      reason: `Too short: ${result.count} words (minimum ${min})`,
    };
  }

  if (result.count > max) {
    return {
      ...result,
      valid: false,
      reason: `Too long: ${result.count} words (maximum ${max})`,
    };
  }

  return {
    ...result,
    valid: true,
  };
}

/**
 * Get word count limits
 *
 * @deprecated Use getWordTarget() from enrichment-matrix.ts for per-event ranges.
 */
export function getWordLimits(): { min: number; max: number } {
  return { min: MIN_WORDS, max: MAX_WORDS };
}
