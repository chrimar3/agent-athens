/**
 * Field Merger — best-of-both-records merging
 *
 * Given a winner and loser duplicate pair, computes an update plan
 * that fills the winner's empty fields with data from the loser.
 * Never overwrites populated fields (except special cases like
 * HTML-encoded titles or more-specific types).
 *
 * Returns an update object + changelog for audit logging.
 */

import { decodeHtmlEntities } from '../utils/text-normalize';

// ============================================================================
// Types
// ============================================================================

export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
  source: 'winner' | 'loser';
}

export interface MergeResult {
  winnerId: string;
  loserId: string;
  updates: Record<string, any>; // Fields to UPDATE on winner
  changelog: FieldChange[];
  loserSnapshot: Record<string, any>; // Full row backup for undo
}

// ============================================================================
// Type Specificity — more specific types "win"
// ============================================================================

const TYPE_SPECIFICITY: Record<string, number> = {
  classical: 10,
  opera: 10,
  dj_set: 9,
  dance: 9,
  comedy: 9,
  show: 8,
  theater: 8,
  screening: 8,
  festival: 7,
  concert: 6,
  performance: 5,
  exhibition: 5,
  workshop: 5,
  conference: 5,
  meetup: 4,
  seminar: 4,
  hackathon: 4,
  cinema: 4,
  other: 1,
};

// ============================================================================
// Main Entry Point
// ============================================================================

export function mergeEvents(
  winner: Record<string, any>,
  loser: Record<string, any>
): MergeResult {
  const updates: Record<string, any> = {};
  const changelog: FieldChange[] = [];

  // --- Title: prefer HTML-entity-free version ---
  if (winner.title && hasHtmlEntities(winner.title) && loser.title && !hasHtmlEntities(loser.title)) {
    const decoded = decodeHtmlEntities(winner.title);
    const decodedStripped = stripQuotes(decoded).trim().toLowerCase();
    const loserStripped = stripQuotes(loser.title).trim().toLowerCase();
    // Only if loser's title is effectively the same content (with or without quotes)
    if (loserStripped === decodedStripped || loser.title.trim() === decoded.trim()) {
      updates.title = loser.title;
      changelog.push({
        field: 'title',
        oldValue: winner.title,
        newValue: loser.title,
        source: 'loser',
      });
    }
  }

  // --- full_description: take non-null; if both exist, take longer ---
  mergeTextField('full_description', winner, loser, updates, changelog, true);

  // --- description: take non-null; if both exist, take longer ---
  mergeTextField('description', winner, loser, updates, changelog, true);

  // --- image_url: take non-null (skip 'not_found') ---
  if (isEmptyImage(winner.image_url) && !isEmptyImage(loser.image_url)) {
    updates.image_url = loser.image_url;
    if (loser.image_source) {
      updates.image_source = loser.image_source;
    }
    changelog.push({
      field: 'image_url',
      oldValue: winner.image_url,
      newValue: loser.image_url,
      source: 'loser',
    });
  }

  // --- price_amount / price_range: take non-null ---
  mergeSimpleField('price_amount', winner, loser, updates, changelog);
  mergeSimpleField('price_range', winner, loser, updates, changelog);

  // --- ticket_url: take non-null ---
  mergeSimpleField('ticket_url', winner, loser, updates, changelog);

  // --- time_doors / time_peak: take non-null ---
  mergeSimpleField('time_doors', winner, loser, updates, changelog);
  mergeSimpleField('time_peak', winner, loser, updates, changelog);

  // --- type: prefer more specific ---
  if (winner.type && loser.type && winner.type !== loser.type) {
    const winSpec = TYPE_SPECIFICITY[winner.type] ?? 1;
    const loseSpec = TYPE_SPECIFICITY[loser.type] ?? 1;
    if (loseSpec > winSpec) {
      updates.type = loser.type;
      changelog.push({
        field: 'type',
        oldValue: winner.type,
        newValue: loser.type,
        source: 'loser',
      });
    }
  }

  // --- end_date: prefer later date (especially for exhibitions) ---
  if (loser.end_date) {
    if (!winner.end_date || loser.end_date > winner.end_date) {
      updates.end_date = loser.end_date;
      changelog.push({
        field: 'end_date',
        oldValue: winner.end_date,
        newValue: loser.end_date,
        source: 'loser',
      });
    }
  }

  // --- genres / tags: JSON array union ---
  mergeJsonArray('genres', winner, loser, updates, changelog);
  mergeJsonArray('tags', winner, loser, updates, changelog);

  // --- ai_context / semantic_tags: take non-null ---
  mergeSimpleField('ai_context', winner, loser, updates, changelog);
  mergeSimpleField('semantic_tags', winner, loser, updates, changelog);

  return {
    winnerId: winner.id,
    loserId: loser.id,
    updates,
    changelog,
    loserSnapshot: { ...loser },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function hasHtmlEntities(text: string): boolean {
  return /&[#\w]+;/.test(text);
}

function stripQuotes(text: string): string {
  return text.replace(/[«»""''"\u201C\u201D\u2018\u2019]/g, '');
}

function isEmptyImage(url: string | null): boolean {
  return !url || url === 'not_found';
}

/**
 * Merge a simple field: take loser's value if winner's is null/empty.
 * Never overwrite a populated field.
 */
function mergeSimpleField(
  field: string,
  winner: Record<string, any>,
  loser: Record<string, any>,
  updates: Record<string, any>,
  changelog: FieldChange[]
): void {
  if (winner[field] == null && loser[field] != null) {
    updates[field] = loser[field];
    changelog.push({
      field,
      oldValue: winner[field],
      newValue: loser[field],
      source: 'loser',
    });
  }
}

/**
 * Merge text fields: take non-null; if both exist and preferLonger is true,
 * take the longer one only if it's significantly longer (1.5x).
 */
function mergeTextField(
  field: string,
  winner: Record<string, any>,
  loser: Record<string, any>,
  updates: Record<string, any>,
  changelog: FieldChange[],
  preferLonger: boolean
): void {
  const wVal = winner[field] as string | null;
  const lVal = loser[field] as string | null;

  if (!wVal && lVal) {
    // Winner empty, take loser's
    updates[field] = lVal;
    changelog.push({
      field,
      oldValue: wVal,
      newValue: lVal,
      source: 'loser',
    });
  } else if (wVal && lVal && preferLonger && lVal.length > wVal.length * 1.5) {
    // Loser has significantly longer text
    updates[field] = lVal;
    changelog.push({
      field,
      oldValue: `(${wVal.length} chars)`,
      newValue: `(${lVal.length} chars)`,
      source: 'loser',
    });
  }
}

/**
 * Merge JSON arrays: union of both, deduplicated.
 */
function mergeJsonArray(
  field: string,
  winner: Record<string, any>,
  loser: Record<string, any>,
  updates: Record<string, any>,
  changelog: FieldChange[]
): void {
  const wArr = parseJsonArray(winner[field]);
  const lArr = parseJsonArray(loser[field]);

  if (lArr.length === 0) return; // Nothing to merge from loser

  if (wArr.length === 0) {
    // Winner empty, take loser's
    updates[field] = JSON.stringify(lArr);
    changelog.push({
      field,
      oldValue: null,
      newValue: lArr,
      source: 'loser',
    });
    return;
  }

  // Union merge
  const merged = [...new Set([...wArr, ...lArr])];
  if (merged.length > wArr.length) {
    updates[field] = JSON.stringify(merged);
    changelog.push({
      field,
      oldValue: wArr,
      newValue: merged,
      source: 'loser',
    });
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not valid JSON
  }
  return [];
}
