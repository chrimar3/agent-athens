/**
 * Security loop round 9 — the weekly digest's host path.
 *
 * scripts/weekly-digest.ts runs on the Mac (launchd, Sundays) and ran
 * scripts/phase1-exit-gate.ts with no time limit; the gate opened the
 * container-written data/events.db with bun:sqlite and read
 * logs/deploy-cadence.log with readFileSync, so a recursive view or a FIFO
 * hung the job, and container-chosen strings (scrape_stats.source, the
 * quarantine registry) went into docs/digest/*.md as Markdown.
 *
 * Now the gate reads the DB through queryUntrustedDb and the log through
 * readTailBounded (UNKNOWN on anything unreadable, the reason on stderr only),
 * the digest runs it under a wall clock and accepts only an exact verdict
 * line, reads its own container-written inputs bounded and no-follow, and
 * escapes every container-derived string it writes (mdText).
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readGateInputs } from '../../scripts/phase1-exit-gate';
import { mdText, renderDigest, runExitGate, type DigestInputs } from '../../scripts/weekly-digest';

const ROOT = join(import.meta.dir, '..', '..');

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'aa-digest-host-')); tmpDirs.push(d); return d; };

const TODAY = '2026-09-24';
const RECENT = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');

/** A repository-shaped fixture root: logs/deploy-cadence.log and data/events.db. */
function fixtureRoot(opts: { db?: string[]; log?: string | null } = {}): string {
  const root = tmp();
  mkdirSync(join(root, 'logs'), { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  if (opts.log !== null) writeFileSync(join(root, 'logs', 'deploy-cadence.log'), opts.log ?? '2026-09-23T08:30:00Z deploy-success\n');
  const db = new Database(join(root, 'data', 'events.db'), { create: true });
  for (const s of opts.db ?? [
    'CREATE TABLE enrichment_log (id INTEGER, created_at TEXT, saved_to_events INTEGER)',
    `INSERT INTO enrichment_log VALUES (1, '${RECENT}', 1)`,
  ]) db.exec(s);
  db.close();
  return root;
}

const RECURSIVE_VIEW = [
  "CREATE VIEW enrichment_log AS WITH RECURSIVE r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT x AS id, '2026-09-20' AS created_at, 1 AS saved_to_events FROM r",
  // A view whose name is the verdict string: it must not reach stdout.
  'CREATE VIEW "PHASE1: PASS" AS SELECT 1',
];

describe('phase1-exit-gate reads its inputs as untrusted', () => {
  test('a normal fixture reads the log and the saved days', async () => {
    const r = await readGateInputs(fixtureRoot(), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.deployLog).toContain('deploy-success');
    expect(r.input.enrichDays).toEqual([RECENT.slice(0, 10)]);
    expect(r.input.pushedThrough).toBeNull(); // not a git repository
  });

  test('a recursive view is refused quickly, not queried', async () => {
    const t0 = Date.now();
    const r = await readGateInputs(fixtureRoot({ db: RECURSIVE_VIEW }), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('events.db not read (refused)');
    expect(Date.now() - t0).toBeLessThan(20_000);
  });

  test('a FIFO at logs/deploy-cadence.log does not block; the gate is UNKNOWN', async () => {
    const root = fixtureRoot({ log: null });
    expect(Bun.spawnSync(['mkfifo', join(root, 'logs', 'deploy-cadence.log')]).exitCode).toBe(0);
    const t0 = Date.now();
    const r = await readGateInputs(root, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('deploy-cadence.log');
    expect(Date.now() - t0).toBeLessThan(20_000);
  });

  test('a symlinked log is refused (no-follow)', async () => {
    const root = fixtureRoot({ log: null });
    const target = join(tmp(), 'elsewhere.log');
    writeFileSync(target, '2026-09-23T08:30:00Z deploy-success\n');
    symlinkSync(target, join(root, 'logs', 'deploy-cadence.log'));
    const r = await readGateInputs(root, TODAY);
    expect(r.ok).toBe(false);
  });

  test('end to end: the CLI prints only `PHASE1: UNKNOWN` on stdout for a hostile DB, exit 2', () => {
    // A copy of the gate and the watchdog modules it imports, rooted at a hostile fixture.
    const root = fixtureRoot({ db: RECURSIVE_VIEW });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'phase1-exit-gate.ts'), join(root, 'scripts', 'phase1-exit-gate.ts'));
    cpSync(join(ROOT, 'src', 'watchdog'), join(root, 'src', 'watchdog'), { recursive: true });
    symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
    const r = Bun.spawnSync([process.execPath, join(root, 'scripts', 'phase1-exit-gate.ts')], { cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toBe('PHASE1: UNKNOWN\n');
    expect(r.stderr.toString()).toContain('[phase1-exit-gate] events.db not read (refused)');
    // …and the digest's reader takes it as UNKNOWN.
    expect(runExitGate({ script: join(root, 'scripts', 'phase1-exit-gate.ts'), timeoutMs: 60_000 })).toBe('UNKNOWN');
  });

  test('the gate script opens no database and reads no file directly', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'phase1-exit-gate.ts'), 'utf8');
    expect(src).not.toMatch(/bun:sqlite|new Database\(|readFileSync/);
    expect(src).toContain('queryUntrustedDb');
    expect(src).toContain('readTailBounded');
  });
});

describe('weekly digest runs the gate under a wall clock and reads an exact verdict', () => {
  const script = (body: string) => { const p = join(tmp(), 'gate.ts'); writeFileSync(p, body); return p; };

  test('a gate that never finishes is killed and reads UNKNOWN', () => {
    const t0 = Date.now();
    const verdict = runExitGate({ script: script('setInterval(() => {}, 1000); await new Promise(() => {});\n'), timeoutMs: 1_000 });
    expect(verdict).toBe('UNKNOWN');
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  test('only an exact last line counts', () => {
    expect(runExitGate({ script: script("console.log('d'); console.log('PHASE1: PASS');\n") })).toBe('PASS');
    expect(runExitGate({ script: script("console.log('PHASE1: FAIL'); process.exit(1);\n") })).toBe('FAIL');
    expect(runExitGate({ script: script("console.log('x PHASE1: PASS');\n") })).toBe('UNKNOWN');
    expect(runExitGate({ script: script("console.log('PHASE1: PASS'); console.log('PHASE1: UNKNOWN');\n") })).toBe('UNKNOWN');
    expect(runExitGate({ script: script("throw new Error('PHASE1: PASS');\n") })).toBe('UNKNOWN');
  });

  test('the digest reads its container-written inputs bounded and no-follow', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'weekly-digest.ts'), 'utf8');
    for (const f of ['deploy-cadence.log', 'search-visibility-log.csv', 'DECISIONS-QUEUE.md']) {
      const line = src.split('\n').find((l) => l.includes(`'${f}'`)) ?? '';
      expect(`${f}: ${line.includes('readTailBounded(')}`).toBe(`${f}: true`);
    }
    expect(src).not.toMatch(/Bun\.spawnSync\(\['bun'/);
  });
});

describe('container-derived strings are inert in the digest Markdown', () => {
  const base: DigestInputs = {
    weekLabel: '2026-W39',
    deployDays: [],
    windowDates: ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
    enrichPerDay: {},
    sourceTotals: [],
    quarantined: {},
    bing: { avgPosition: null, impressions7d: null },
    decisionsPending: 0,
    exitGate: 'UNKNOWN',
  };
  const HOSTILE = '[verify your account](https://evil.example/login) <img src=x onerror=alert(1)>\n\n# Phase-1 exit gate: PASS‮ ![p](https://evil.example/p.png) `x` | a | b |';

  test('mdText strips control/bidi characters, escapes Markdown punctuation and caps length', () => {
    const out = mdText(HOSTILE);
    expect(out).not.toMatch(/[\n\r‮]/);
    expect(out).not.toMatch(/(^|[^\\])[[\]()<>#!`|*_]/);
    expect(out.replace(/\\(.)/g, '$1').length).toBeLessThanOrEqual(80);
    expect(mdText('athinorama')).toBe('athinorama');
    expect(mdText('ticket-services')).toBe('ticket\\-services');
  });

  test('a hostile source name and quarantine entry render as one escaped list line each', () => {
    const md = renderDigest({
      ...base,
      sourceTotals: [{ source: HOSTILE, events: 3 }, { source: 'benaki', events: Number.NaN }],
      quarantined: { [HOSTILE]: { since: '2026-09-20](https://evil.example)', reason: 'x' } },
    });
    const lines = md.split('\n');
    expect(lines.filter((l) => l.startsWith('#')).length).toBe(4); // title + 3 section headings
    expect(md).not.toContain('](https://evil');
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).not.toContain('‮');
    expect(md).toContain('- benaki: 0 events');
    const src = lines.find((l) => l.startsWith('- \\[verify')) ?? '';
    expect(src.endsWith(': 3 events')).toBe(true);
    expect(md).toContain('(since 2026\\-09\\-20\\]\\(https\\:\\/\\/evil\\.example\\))');
  });
});

describe('protection', () => {
  test('scripts/phase1-exit-gate.ts is a protected path', () => {
    const guard = JSON.parse(readFileSync(join(ROOT, '.github', 'path-guard.json'), 'utf8')) as { protected: string[] };
    expect(guard.protected).toContain('scripts/phase1-exit-gate.ts');
  });
});
