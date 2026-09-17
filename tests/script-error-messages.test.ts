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
import { Database } from 'bun:sqlite';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { runOutcome } from '../scripts/scrape-all';

const ROOT = resolve(import.meta.dir, '..');
const FORMAT = /FAILED — .+ — try: /;

let noDbDir: string; // temp cwd with no data/ at all
let imagesDir: string; // temp cwd with data/images/*.webp but no data/events.db
let badDbDir: string; // temp cwd whose data/events.db is not a SQLite file at all
let configDir: string; // temp dir holding a MALFORMED indexnow config (never config/)
let badConfigPath: string; // <configDir>/indexnow-malformed.json — unparseable JSON
let missingConfigPath: string; // <configDir>/indexnow-absent.json — never created
let schemaOkDir: string; // temp cwd: seeded DB, every row's schema generates
let schemaErrDir: string; // temp cwd: same, plus ONE row whose date cannot be formatted

const BAD_DATE = 'not-a-date';

/**
 * A temp cwd holding a data/events.db seeded from src/db/schema.sql.
 *
 * Synthetic on purpose: a copy of production would stop exercising the error
 * branch the moment production happened to hold no unformattable date.
 * tests/preload/prod-db-guard.preload.ts keys on the repo's absolute
 * data/events.db, so a temp path opens normally.
 */
function seedSchemaCwd(prefix: string, badDate: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, 'data'), { recursive: true });
  const db = new Database(join(dir, 'data', 'events.db'));
  db.exec(readFileSync(join(ROOT, 'src', 'db', 'schema.sql'), 'utf-8'));
  const insert = db.prepare(
    `INSERT INTO events (id, title, description, start_date, venue_name, type, genres,
       url, price_type, source, location_status, created_at, updated_at)
     VALUES (?, ?, 'd', ?, 'Gazarte', 'music', 'jazz', 'https://example.test/',
       'free', 'more', 'verified_athens', datetime('now'), datetime('now'))`,
  );
  insert.run('rule5-ok', 'Formattable Row', '2030-01-01');
  if (badDate) insert.run('rule5-bad', 'Unformattable Row', BAD_DATE);
  db.close();
  return dir;
}

beforeAll(() => {
  noDbDir = mkdtempSync(join(tmpdir(), 'aa-rule5-nodb-'));
  imagesDir = mkdtempSync(join(tmpdir(), 'aa-rule5-images-'));
  mkdirSync(join(imagesDir, 'data', 'images'), { recursive: true });
  writeFileSync(join(imagesDir, 'data', 'images', 'orphan.webp'), 'not-a-real-image');
  badDbDir = mkdtempSync(join(tmpdir(), 'aa-rule5-baddb-'));
  mkdirSync(join(badDbDir, 'data', 'images'), { recursive: true });
  writeFileSync(join(badDbDir, 'data', 'events.db'), 'not a database');
  writeFileSync(join(badDbDir, 'data', 'images', 'orphan.webp'), 'not-a-real-image');
  // INDEXNOW_CONFIG lets the malformed-config path be exercised without ever
  // touching the real config/indexnow.json (which this repo ships, valid).
  configDir = mkdtempSync(join(tmpdir(), 'aa-rule5-indexnow-'));
  badConfigPath = join(configDir, 'indexnow-malformed.json');
  writeFileSync(badConfigPath, '{ "indexnow_key": ');
  missingConfigPath = join(configDir, 'indexnow-absent.json');
  schemaOkDir = seedSchemaCwd('aa-rule5-schema-ok-', false);
  schemaErrDir = seedSchemaCwd('aa-rule5-schema-err-', true);
});

afterAll(() => {
  rmSync(noDbDir, { recursive: true, force: true });
  rmSync(imagesDir, { recursive: true, force: true });
  rmSync(badDbDir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
  rmSync(schemaOkDir, { recursive: true, force: true });
  rmSync(schemaErrDir, { recursive: true, force: true });
});

function run(script: string, args: string[], cwd: string = ROOT, env?: Record<string, string>) {
  const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', script), ...args], {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
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
  test('the indexnow fixtures are malformed / absent as claimed', () => {
    // Without these two the ping-indexnow cases below assert nothing: a
    // parseable file would take the happy path, and a file that sprang into
    // existence would turn the ENOENT-skip case into the malformed case.
    expect(existsSync(badConfigPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(badConfigPath, 'utf-8'))).toThrow();
    expect(existsSync(missingConfigPath)).toBe(false);
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
  // parseInt() stops at the first non-digit, so these two USED to be accepted
  // as 5 and 1 — a typo silently changed how many prompts were printed.
  test('--count=5junk → FAILED line names --count (was: parsed as 5)', () => {
    expect(expectRule5(run(S, ['--prompts', '--count=5junk'], noDbDir), S)).toContain('--count');
  });
  test('--count=1.5 → FAILED line names --count (was: parsed as 1)', () => {
    expect(expectRule5(run(S, ['--prompts', '--count=1.5'], noDbDir), S)).toContain('--count');
  });
  test('--count= (empty) → FAILED line names --count', () => {
    expect(expectRule5(run(S, ['--prompts', '--count='], noDbDir), S)).toContain('--count');
  });
  test('--tier=gold → FAILED line names --tier', () => {
    expect(expectRule5(run(S, ['--prompts', '--tier=gold'], noDbDir), S)).toContain('--tier');
  });
  test('--save without --id → FAILED line names --id', () => {
    expect(expectRule5(run(S, ['--save'], noDbDir), S)).toContain('--id');
  });

  test('a mistyped FLAG NAME is refused like a mistyped value (--count-10, --dry_run, --bogus), before the DB is opened', () => {
    for (const bad of ['--count-10', '--dry_run', '--bogus']) {
      const line = expectRule5(run(S, ['--prompts', bad], noDbDir), S);
      expect(line).toContain(bad);
      expect(line).not.toContain('data/events.db');
    }
  });
});

describe('generate-schema.ts', () => {
  const S = 'generate-schema.ts';
  test('missing data/events.db → FAILED line names the DB path (was: stack trace with exit 0)', () => {
    const line = expectRule5(run(S, ['--stats'], noDbDir), S);
    expect(line).toContain('data/events.db');
    expect(existsSync(join(noDbDir, 'data', 'events.db'))).toBe(false);
  });

  // The seeded pair is the control: the SAME command on the SAME schema exits 0
  // when every row formats, so the non-zero below is caused by the bad row and
  // not by the temp-cwd harness.
  test('seeded DB where every row formats → exit 0, stderr empty (the control)', () => {
    const r = run(S, [], schemaOkDir);
    expect(r.err.trim()).toBe('');
    expect(r.code).toBe(0);
    // "Errors:" is printed only when the count is non-zero.
    expect(r.out).toContain('Generated: 1');
    expect(r.out).not.toContain('Errors:');
  });
  test('rows whose schema could not be generated → exit 1 + ONE Rule 5 line (was: counted, then exit 0)', () => {
    const r = run(S, [], schemaErrDir);
    // Precondition: the run must actually have hit the error branch, or this
    // pin goes vacuous the day formatSchemaDate stops throwing on BAD_DATE.
    expect(r.out).toContain('Unformattable Row');
    expect(r.out).toContain('Errors:    1');
    const line = expectRule5(r, S);
    expect(line).toContain('1 event(s)');
  });

  test('unknown argument → exit 1 naming it BEFORE the DB is opened (a --dry_run typo must not run the write path)', () => {
    const line = expectRule5(run(S, ['--dry_run'], noDbDir), S);
    expect(line).toContain('--dry_run');
    expect(line).not.toContain('data/events.db');
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
  // parseInt('45abc') is 45, so this USED to be accepted and silently widened
  // the window whose rows this script DELETEs.
  test('--days-back=45abc → FAILED line names --days-back (was: parsed as 45)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--days-back=45abc'], noDbDir), S)).toContain('--days-back');
  });
  test('--days-back=1.5 → FAILED line names --days-back (was: parsed as 1)', () => {
    expect(expectRule5(run(S, ['--dry-run', '--days-back=1.5'], noDbDir), S)).toContain('--days-back');
  });
  test('--days-back= (empty) → FAILED line names --days-back', () => {
    expect(expectRule5(run(S, ['--dry-run', '--days-back='], noDbDir), S)).toContain('--days-back');
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
  // A MISSING config is a deliberate skip (the daily pipeline must not fail
  // when no IndexNow key is configured). An UNPARSEABLE one is not the same
  // thing: it means the key that was configured is now unusable, and the old
  // code swallowed both into the same exit 0.
  test('malformed config → FAILED line names the config path (was: exit 0 "skipping")', () => {
    const r = run(S, ['--dry-run'], ROOT, { INDEXNOW_CONFIG: badConfigPath });
    const line = expectRule5(r, S);
    expect(line).toContain(badConfigPath);
  });
  test('absent config → exit 0, skip on stdout, stderr empty (unchanged)', () => {
    const r = run(S, ['--dry-run'], ROOT, { INDEXNOW_CONFIG: missingConfigPath });
    expect(r.code).toBe(0);
    expect(r.err.trim()).toBe('');
    expect(r.out).toContain(missingConfigPath);
    expect(r.out).toContain('skipping IndexNow ping');
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

/**
 * scrape-all's OTHER half of Rule 5: work that failed without throwing.
 *
 * Per-source scrape failures land in results[] with success=false and
 * persistence failures come back as saveEvents().failed — both used to end in
 * "✨ Done!" and exit 0. runOutcome() is the pure classifier main() consults
 * before it exits; spawning the real scraper here would hit the network, so
 * the classification is unit-tested and main()'s single call site is the seam.
 */
describe('scrape-all runOutcome()', () => {
  test('every source succeeded and nothing failed to persist → ok', () => {
    const o = runOutcome(
      [{ source: 'more', success: true }, { source: 'ra', success: true }],
      0,
    );
    expect(o).toEqual({ failedSources: [], persistFailed: 0, ok: true });
  });
  test('one failed source → not ok, and the id is named', () => {
    const o = runOutcome(
      [{ source: 'more', success: true }, { source: 'cometogether', success: false }],
      0,
    );
    expect(o.ok).toBe(false);
    expect(o.failedSources).toEqual(['cometogether']);
  });
  test('several failed sources are all named, in run order', () => {
    const o = runOutcome(
      [
        { source: 'cometogether', success: false },
        { source: 'more', success: true },
        { source: 'ra', success: false },
      ],
      0,
    );
    expect(o.ok).toBe(false);
    expect(o.failedSources).toEqual(['cometogether', 'ra']);
  });
  test('every source succeeded but rows failed to persist → still not ok', () => {
    // The case a source-only check would miss: the scrape "worked" and the
    // events never reached the DB.
    const o = runOutcome([{ source: 'more', success: true }], 3);
    expect(o.ok).toBe(false);
    expect(o.persistFailed).toBe(3);
    expect(o.failedSources).toEqual([]);
  });
  test('an empty run (every selected source quarantined) is ok', () => {
    // Quarantined sources are filtered out BEFORE the scrape loop, so they
    // never reach results[] — a quarantine must not read as a failure.
    expect(runOutcome([], 0).ok).toBe(true);
  });
});

describe('scrape-all.ts — the Rule 5 exit gate is wired (source seam: main() cannot run without the network)', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'scrape-all.ts'), 'utf-8');
  test('runOutcome() is called from main() with the persist counter and its verdict gates a fail()', () => {
    const call = src.indexOf('const outcome = runOutcome(results, persistFailed);');
    expect(call).toBeGreaterThan(-1);
    const gate = src.indexOf('if (!outcome.ok) {', call);
    expect(gate).toBe(src.indexOf('\n', call) + 3); // the very next line, 2-space indented
    const block = src.slice(gate, src.indexOf('\n  }\n', gate));
    expect(block).toContain('fail(');
  });
  test('persistFailed is fed from saveEvents() inside the save block, not left at 0', () => {
    const save = src.indexOf('saveEvents(allEvents, dryRun);');
    expect(save).toBeGreaterThan(-1);
    const wired = src.indexOf('persistFailed = failed;', save);
    expect(wired).toBeGreaterThan(-1);
    expect(wired - save).toBeLessThan(200);
  });
});
