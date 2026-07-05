/**
 * Architectural guard: only design-by-bypass INSERT sites are allowed outside
 * the canonical upsertEvent() seam.
 *
 * Rule: every `INSERT INTO events` in non-test, non-archive production code
 * must be one of:
 *   (a) the canonical seam inside upsertEvent() at src/db/database.ts, or
 *   (b) a line inside one of the ALLOWED_BYPASSES ranges below.
 *
 * Each bypass writer is responsible for calling normalizeDateField() on
 * start_date and end_date before binding.
 *
 * Dead/broken code does NOT go on this list. See src/ingest/email-ingestion.ts
 * (its broken INSERT was replaced with a throw in Session A; allowlisting it
 * would invert this test's semantic — "bypass is fine" vs. "bypass is broken").
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const PROJECT_ROOT = join(import.meta.dir, '..');

type Bypass = { file: string; lines: [number, number]; reason: string };

// The canonical seam is upsertEvent() in src/db/database.ts — the single function
// all non-bypass writes go through. Line range covers the function body so local
// edits (e.g. adding the normalizeDateField call) don't break the guard.
const CANONICAL_SEAM: Bypass = {
  file: 'src/db/database.ts',
  lines: [170, 375],  // upsertEvent() body 251-364 (INSERT at 312); range bumped after adding the import-time duplicate gate above the INSERT (dedup arc, 2026-07-05)
  reason: 'Canonical seam: upsertEvent(). All non-bypass writes converge here.',
};

const ALLOWED_BYPASSES: readonly Bypass[] = [
  {
    file: 'scripts/scrape-all.ts',
    lines: [1360, 1410],  // range shifted +~50 after parseTheaterDateRange extraction above it (S-F2a); INSERT at 1369 within saveEvents
    reason: 'Bulk scraper batch INSERT (athinorama/more/ticketservices/clubber/halfnote/residentadvisor). Per-row upsertEvent would be too slow; normalizes via normalizeDateField at bind time.',
  },
  {
    file: 'scripts/scrape-snfcc.ts',
    lines: [555, 620],
    reason: 'SNFCC exhibition scraper. Independent INSERT with exhibition-specific columns (opening_hours, closed_days). Normalizes via normalizeDateField at bind time.',
  },
  {
    file: 'scripts/scrape-ai-tech.ts',
    lines: [1020, 1070],
    reason: 'AI/tech events scraper. Constructs start_date locally from date+time before bind. Normalizes via normalizeDateField at bind time.',
  },
] as const;

const SKIP_DIR_NAMES = new Set(['node_modules', '_archive', '__tests__', 'dist', 'tests', '.git']);

function walkTs(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      walkTs(full, out);
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function findInsertEventsSites(): Array<{ file: string; line: number; content: string }> {
  const matches: Array<{ file: string; line: number; content: string }> = [];
  const pattern = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+events\b/i;
  for (const subdir of ['src', 'scripts']) {
    const files = walkTs(join(PROJECT_ROOT, subdir));
    for (const file of files) {
      const rel = relative(PROJECT_ROOT, file).split(sep).join('/');
      // Defensive: also exclude test paths that slipped through walk
      if (rel.includes('/__tests__/') || rel.startsWith('tests/') || rel.includes('/_archive/')) continue;
      const contents = readFileSync(file, 'utf-8');
      contents.split('\n').forEach((lineText, idx) => {
        if (pattern.test(lineText)) {
          matches.push({ file: rel, line: idx + 1, content: lineText.trim() });
        }
      });
    }
  }
  return matches;
}

function isCanonicalSeam(hit: { file: string; line: number }): boolean {
  return hit.file === CANONICAL_SEAM.file && hit.line >= CANONICAL_SEAM.lines[0] && hit.line <= CANONICAL_SEAM.lines[1];
}

function isAllowedBypass(hit: { file: string; line: number }): Bypass | undefined {
  return ALLOWED_BYPASSES.find(b => b.file === hit.file && hit.line >= b.lines[0] && hit.line <= b.lines[1]);
}

describe('no-bypass: INSERT INTO events sites are either canonical or allowlisted', () => {
  const hits = findInsertEventsSites();

  test('every production INSERT matches the canonical seam or an allowlisted bypass range', () => {
    const violations = hits.filter(h => !isCanonicalSeam(h) && !isAllowedBypass(h));
    if (violations.length > 0) {
      const lines = violations.map(v => `  ${v.file}:${v.line}  →  ${v.content}`).join('\n');
      throw new Error(
        `Unexpected INSERT INTO events site(s) outside the canonical seam and the allowlist:\n${lines}\n\n` +
        `If this is a legitimate new design-by-bypass: add a range entry to ALLOWED_BYPASSES with a justification comment, ` +
        `and ensure the writer calls normalizeDateField() on start_date/end_date at bind time.\n` +
        `If this is broken/dead code: replace the INSERT with a throw referencing the resolution session (see email-ingestion.ts precedent).`
      );
    }
    expect(violations).toEqual([]);
  });

  test('canonical seam INSERT is present inside upsertEvent() at src/db/database.ts', () => {
    const canonical = hits.find(isCanonicalSeam);
    expect(canonical, `Expected an INSERT INTO events inside ${CANONICAL_SEAM.file}:${CANONICAL_SEAM.lines[0]}-${CANONICAL_SEAM.lines[1]}`).toBeDefined();
  });

  test('each allowlisted bypass range contains at least one INSERT', () => {
    for (const bypass of ALLOWED_BYPASSES) {
      const found = hits.some(h => h.file === bypass.file && h.line >= bypass.lines[0] && h.line <= bypass.lines[1]);
      expect(found, `Expected an INSERT INTO events inside ${bypass.file}:${bypass.lines[0]}-${bypass.lines[1]} (bypass entry may be stale)`).toBe(true);
    }
  });

  test('email-ingestion.ts contains no INSERT INTO events (replaced with throw)', () => {
    const hit = hits.find(h => h.file === 'src/ingest/email-ingestion.ts');
    expect(hit, 'email-ingestion.ts should have no INSERT INTO events — broken code was replaced with throw in Session A').toBeUndefined();
  });
});
