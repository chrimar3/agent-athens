/**
 * Rule 5 — "script error messages speak to the retrier" (GitHub issue #2).
 *
 * Every script that can fail must exit non-zero with ONE stderr line:
 *   "<script>: FAILED — <what failed> — try: <what to do next>"
 *
 * Each case below spawns the real CLI with a bad input that fails BEFORE any
 * network call or DB write:
 *   - cwd = a temp dir with NO data/ directory, so a cwd-relative
 *     'data/events.db' cannot be opened (and cannot be created either — the
 *     2026-06-30 empty-events.db incident class);
 *   - an unknown flag combined with --dry-run, so the pre-fix script (which
 *     ignores unknown flags) still exits before touching anything;
 *   - cwd = a temp dir whose data/events.db is NOT a SQLite file, so the first
 *     query throws deep inside the script and the top-level error ROUTER
 *     (main().catch / try-catch / uncaughtException) is what has to turn that
 *     throw into the single Rule 5 line. A guard-side fail() cannot satisfy
 *     these cases — they run past every guard.
 *
 * The production DB is never opened: scripts whose DB path is anchored to
 * import.meta.dir (mark-duplicates, price-acquisition-chain, health-check, …)
 * have no safe CLI failure path yet and are deliberately NOT covered here —
 * see the follow-up issue.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const FORMAT = /FAILED — .+ — try: /;

let noDbDir: string; // temp cwd with no data/ at all
let imagesDir: string; // temp cwd with data/images/*.webp but no data/events.db
let badDbDir: string; // temp cwd whose data/events.db is not a SQLite file at all

beforeAll(() => {
  noDbDir = mkdtempSync(join(tmpdir(), 'aa-rule5-nodb-'));
  imagesDir = mkdtempSync(join(tmpdir(), 'aa-rule5-images-'));
  mkdirSync(join(imagesDir, 'data', 'images'), { recursive: true });
  writeFileSync(join(imagesDir, 'data', 'images', 'orphan.webp'), 'not-a-real-image');
  badDbDir = mkdtempSync(join(tmpdir(), 'aa-rule5-baddb-'));
  mkdirSync(join(badDbDir, 'data', 'images'), { recursive: true });
  writeFileSync(join(badDbDir, 'data', 'events.db'), 'not a database');
  writeFileSync(join(badDbDir, 'data', 'images', 'orphan.webp'), 'not-a-real-image');
});

afterAll(() => {
  rmSync(noDbDir, { recursive: true, force: true });
  rmSync(imagesDir, { recursive: true, force: true });
  rmSync(badDbDir, { recursive: true, force: true });
});

function run(script: string, args: string[], cwd: string = ROOT) {
  const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', script), ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: r.exitCode,
    out: new TextDecoder().decode(r.stdout),
    err: new TextDecoder().decode(r.stderr),
  };
}

/** Non-zero exit + exactly one stderr line in the Rule 5 shape, naming the script. */
function expectRule5(r: { code: number; err: string }, script: string): string {
  expect(r.code).not.toBe(0);
  const lines = r.err.trim().split('\n').filter((l) => l.trim().length > 0);
  // ONE line: a stack trace or a bun source excerpt would make this > 1.
  expect(lines).toHaveLength(1);
  expect(lines[0]).toStartWith(`${script.replace(/\.ts$/, '')}: FAILED — `);
  expect(lines[0]).toMatch(FORMAT);
  return lines[0];
}

describe('fixture preconditions (the tests below are vacuous without these)', () => {
  test('temp cwds carry no data/events.db', () => {
    expect(existsSync(join(noDbDir, 'data'))).toBe(false);
    expect(existsSync(join(imagesDir, 'data', 'events.db'))).toBe(false);
    expect(existsSync(join(imagesDir, 'data', 'images', 'orphan.webp'))).toBe(true);
  });
  test('badDbDir carries a data/events.db that is not a SQLite file', () => {
    // If this ever became a real DB the router cases below would go vacuous:
    // the scripts would succeed and never reach their top-level catch.
    expect(existsSync(join(badDbDir, 'data', 'events.db'))).toBe(true);
    expect(readFileSync(join(badDbDir, 'data', 'events.db'), 'utf-8')).toBe('not a database');
    expect(existsSync(join(badDbDir, 'data', 'images', 'orphan.webp'))).toBe(true);
  });
});

describe('run-enrichment-pipeline.ts', () => {
  const S = 'run-enrichment-pipeline.ts';
  test('missing data/events.db → FAILED line names the DB path (was: stack trace with exit 0)', () => {
    const line = expectRule5(run(S, ['--sync'], noDbDir), S);
    expect(line).toContain('data/events.db');
    expect(existsSync(join(noDbDir, 'data', 'events.db'))).toBe(false);
  });
  test('--count=abc → FAILED line names --count', () => {
    expect(expectRule5(run(S, ['--prompts', '--count=abc'], noDbDir), S)).toContain('--count');
  });
  test('--tier=gold → FAILED line names --tier', () => {
    expect(expectRule5(run(S, ['--prompts', '--tier=gold'], noDbDir), S)).toContain('--tier');
  });
  test('--save without --id → FAILED line names --id', () => {
    expect(expectRule5(run(S, ['--save'], noDbDir), S)).toContain('--id');
  });
});

describe('generate-schema.ts', () => {
  const S = 'generate-schema.ts';
  test('missing data/events.db → FAILED line names the DB path (was: stack trace with exit 0)', () => {
    const line = expectRule5(run(S, ['--stats'], noDbDir), S);
    expect(line).toContain('data/events.db');
    expect(existsSync(join(noDbDir, 'data', 'events.db'))).toBe(false);
  });
});

describe('filter-athens-only.ts', () => {
  const S = 'filter-athens-only.ts';
  test('missing data/events.db → FAILED line names the DB path (was: stack trace)', () => {
    expect(expectRule5(run(S, ['--dry-run'], noDbDir), S)).toContain('data/events.db');
  });
  test('--days-back=abc → FAILED line names --days-back', () => {
    expect(expectRule5(run(S, ['--dry-run', '--days-back=abc'], noDbDir), S)).toContain('--days-back');
  });
  // This script DELETEs rejected_non_athens rows. The unknown-arg guard is what
  // stops a `--dry_run` typo from deleting for real, so it is pinned directly.
  test('unknown flag → FAILED line names the flag (was: ignored — a typo for --dry-run deleted for real)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--bogus'], noDbDir), S)).toContain('--bogus');
  });
});

describe('remove-duplicates.ts', () => {
  const S = 'remove-duplicates.ts';
  test('missing data/events.db → FAILED line names the DB path (was: stack trace)', () => {
    expect(expectRule5(run(S, ['--dry-run'], noDbDir), S)).toContain('data/events.db');
  });
  // This script DELETEs duplicate rows — same reason as filter-athens-only.
  test('unknown flag → FAILED line names the flag (was: ignored — a typo for --dry-run deleted for real)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--bogus'], noDbDir), S)).toContain('--bogus');
  });
});

describe('scrape-all.ts', () => {
  const S = 'scrape-all.ts';
  test('--source with no value → FAILED line names --source (was: TypeError with exit 0)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--source']), S)).toContain('--source');
  });
  test('--source bogus → FAILED line names the unknown source (was: silent "Done!" exit 0)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--source', 'bogus']), S)).toContain('bogus');
  });
  test('unknown flag → FAILED line names the flag (checked before --source)', () => {
    // The trailing value-less `--source` is a BACKSTOP, not the subject: for
    // scrape-all, `--dry-run` alone still scrapes every source over the
    // network, so a build without the unknown-flag guard must still fail on
    // `--source` before any fetch. The assertion on '--bogus' is what pins the
    // unknown-flag guard (a guard-less build reports --source instead).
    expect(expectRule5(run(S, ['--dry-run', '--bogus', '--source']), S)).toContain('--bogus');
  });
});

describe('ping-indexnow.ts', () => {
  const S = 'ping-indexnow.ts';
  test('unknown flag → FAILED line names the flag (was: ignored)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--bogus']), S)).toContain('--bogus');
  });
  test('--paths= with no paths → FAILED line names --paths (was: silent fallback to all sitemaps)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--paths=']), S)).toContain('--paths');
  });
});

describe('ingest-emails.ts', () => {
  const S = 'ingest-emails.ts';
  test('unknown flag → FAILED line names the flag (was: ignored — a typo for --dry-run fetched Gmail for real)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--bogus']), S)).toContain('--bogus');
  });
});

describe('cleanup-old-images.ts', () => {
  const S = 'cleanup-old-images.ts';
  test('images present but data/events.db missing → FAILED line, and NO stub DB is created', () => {
    const line = expectRule5(run(S, ['--dry-run'], imagesDir), S);
    expect(line).toContain('data/events.db');
    expect(existsSync(join(imagesDir, 'data', 'events.db'))).toBe(false);
  });
  test('unknown flag → FAILED line names the flag (was: ignored — a typo for --dry-run deleted for real)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--bogus'], noDbDir), S)).toContain('--bogus');
  });
});

/**
 * The OTHER half of Rule 5: the top-level error ROUTER.
 *
 * Every guard above fails BEFORE the work starts, so a build whose router was
 * reverted to `console.error` still passes all of them. These cases run past
 * every guard — a valid-looking data/events.db that is not a SQLite file — so
 * the throw can only be shaped into one Rule 5 line by the router itself:
 *   main().catch(fail)              generate-schema, run-enrichment-pipeline
 *   try { main() } catch            cleanup-old-images
 *   process.on('uncaughtException') filter-athens-only, remove-duplicates
 *
 * Routers reached only over the network or with credentials (scrape-all,
 * ping-indexnow, ingest-emails) have no side-effect-free trigger and are not
 * covered here.
 */
describe('top-level error routers (not the argument guards)', () => {
  const cases: Array<[string, string[]]> = [
    ['generate-schema.ts', ['--stats']],
    ['run-enrichment-pipeline.ts', ['--sync']],
    ['cleanup-old-images.ts', ['--dry-run']],
    ['filter-athens-only.ts', ['--dry-run']],
    ['remove-duplicates.ts', ['--dry-run']],
  ];
  for (const [script, args] of cases) {
    test(`${script}: unreadable DB throws past the guards → ONE Rule 5 line, exit 1`, () => {
      const line = expectRule5(run(script, args, badDbDir), script);
      expect(line).toContain('not a database');
      // The fixture must survive: nothing here may repair or replace the file.
      expect(readFileSync(join(badDbDir, 'data', 'events.db'), 'utf-8')).toBe('not a database');
    });
  }
});
