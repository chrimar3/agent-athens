/**
 * scripts/ingest-emails.ts used to report "completed successfully" (exit 0)
 * even when fetchEmails() returned per-email errors — the IngestionResult.errors
 * array was discarded (Codex #14 email half). failuresFrom() is the seam: a
 * non-empty errors array must produce a Rule-5 failure message.
 */
import { describe, test, expect } from 'bun:test';
import { failuresFrom } from '../scripts/ingest-emails';

describe('ingest-emails failuresFrom — unsuccessful work is not success', () => {
  test('no errors → null (clean run)', () => {
    expect(failuresFrom({ fetched: 3, saved: 3, skipped: 0, errors: [] })).toBeNull();
  });
  test('any error → a message naming the count', () => {
    const msg = failuresFrom({ fetched: 3, saved: 1, skipped: 0, errors: ['x failed', 'y failed'] });
    expect(msg).not.toBeNull();
    expect(msg).toContain('2');
    expect(msg).toContain('email');
  });
});
