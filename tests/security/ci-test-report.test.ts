/**
 * Security loop round 5 — the required `ci` check cannot be forced green.
 *
 * `bun test` exits with whatever status the process ends with. One test file
 * (in a PR, unprotected) that calls process.exit(0) ends the run early with
 * exit 0: every file after it never runs, and the check goes green. The ci job
 * therefore writes a JUnit report and .github/scripts/test-report-check.sh
 * refuses unless the report is complete, names every test file the repository
 * has (tests/ and src/, the same set ci runs), records no failures, and ran at
 * least the committed floor of tests (.github/scripts/test-report-floor.json).
 * Bun writes the report only at the very end of a run, so an early exit leaves
 * no report at all.
 *
 * The checker is driven here against fixture repositories, and once end to end
 * with a real `bun test` whose first file calls process.exit(0).
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dir, '..', '..');
const CHECK = join(ROOT, '.github', 'scripts', 'test-report-check.sh');
const FLOOR = join(ROOT, '.github', 'scripts', 'test-report-floor.json');

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

type Floor = { min_executed_tests: number; exclude: string[]; also_required: string[] };

/** A throwaway repository: test files plus the floor file at the real path. */
function repo(files: string[], floor: Partial<Floor> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'aa-ci-report-'));
  tmpDirs.push(dir);
  for (const f of files) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), "import { test } from 'bun:test';\ntest('t', () => {});\n");
  }
  mkdirSync(join(dir, '.github', 'scripts'), { recursive: true });
  const full: Floor = { min_executed_tests: 2, exclude: [], also_required: [], ...floor };
  writeFileSync(join(dir, '.github', 'scripts', 'test-report-floor.json'), JSON.stringify(full));
  return dir;
}

/** A JUnit report in bun's shape: one top-level <testsuite> per file. */
function report(perFile: Record<string, { tests: number; skipped?: number; failures?: number }>, opts: { truncate?: boolean } = {}): string {
  let tests = 0, skipped = 0, failures = 0;
  const suites = Object.entries(perFile).map(([file, n]) => {
    tests += n.tests; skipped += n.skipped ?? 0; failures += n.failures ?? 0;
    const cases = Array.from({ length: n.tests }, (_, i) => `      <testcase name="t${i}" classname="" time="0" file="${file}" line="2" assertions="1" />`).join('\n');
    return `  <testsuite name="${file}" file="${file}" tests="${n.tests}" assertions="${n.tests}" failures="${n.failures ?? 0}" skipped="${n.skipped ?? 0}" time="0" hostname="h">\n${cases}\n  </testsuite>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="${tests}" assertions="${tests}" failures="${failures}" skipped="${skipped}" time="0.1">\n${suites.join('\n')}\n</testsuites>\n`;
  return opts.truncate ? body.slice(0, body.lastIndexOf('</testsuites>')) : body;
}

function check(dir: string, reportPath: string) {
  const r = Bun.spawnSync(['bash', CHECK, reportPath], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function writeReport(dir: string, xml: string): string {
  const p = join(dir, 'junit.xml');
  writeFileSync(p, xml);
  return p;
}

const FILES = ['tests/a.test.ts', 'tests/sub/b.test.ts', 'src/x/__tests__/c.test.ts'];
const ALL = { 'tests/a.test.ts': { tests: 2 }, 'tests/sub/b.test.ts': { tests: 1 }, 'src/x/__tests__/c.test.ts': { tests: 1 } };

describe('test-report-check.sh — a complete, clean report passes', () => {
  test('every test file present, no failures, executed >= floor → exit 0, PASS', () => {
    const d = repo(FILES, { min_executed_tests: 4 });
    const r = check(d, writeReport(d, report(ALL)));
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('test-report: PASS');
    expect(r.out).toContain('3 test file(s)');
  });

  test('--list prints the expected files (the set ci passes to bun test), sorted', () => {
    const d = repo([...FILES, 'src/db/__tests__/migrations.test.ts', 'tests/node_modules/x/y.test.ts', 'scripts/__tests__/deploy-gate.test.ts'], {
      exclude: ['src/db/__tests__/migrations.test.ts'],
      also_required: ['scripts/__tests__/deploy-gate.test.ts'],
    });
    const r = Bun.spawnSync(['bash', CHECK, '--list'], { cwd: d, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString().trim().split('\n')).toEqual([
      'scripts/__tests__/deploy-gate.test.ts', 'src/x/__tests__/c.test.ts', 'tests/a.test.ts', 'tests/sub/b.test.ts',
    ]);
  });
});

describe('test-report-check.sh — refuses (fails closed)', () => {
  test('no report at all (bun exited before writing it, e.g. process.exit(0)) → exit 1', () => {
    const d = repo(FILES);
    const r = check(d, join(d, 'missing.xml'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
    expect(r.out).not.toContain('PASS');
  });

  test('an empty or truncated report → exit 1', () => {
    const d = repo(FILES);
    expect(check(d, writeReport(d, '')).code).toBe(1);
    const t = check(d, writeReport(d, report(ALL, { truncate: true })));
    expect(t.code).toBe(1);
    expect(t.err).toContain('REFUSED');
  });

  test('a test file missing from the report → exit 1, naming it', () => {
    const d = repo(FILES, { min_executed_tests: 1 });
    const { ['tests/sub/b.test.ts']: _gone, ...rest } = ALL;
    const r = check(d, writeReport(d, report(rest)));
    expect(r.code).toBe(1);
    expect(r.err).toContain('tests/sub/b.test.ts');
    expect(r.err).toContain('1 test file(s)');
  });

  test('an also_required file (outside tests/ and src/) missing → exit 1', () => {
    const d = repo([...FILES, 'scripts/__tests__/deploy-gate.test.ts'], { min_executed_tests: 1, also_required: ['scripts/__tests__/deploy-gate.test.ts'] });
    const r = check(d, writeReport(d, report(ALL)));
    expect(r.code).toBe(1);
    expect(r.err).toContain('scripts/__tests__/deploy-gate.test.ts');
  });

  test('an also_required file that does not exist → exit 1 (a stale floor file cannot pass silently)', () => {
    const d = repo(FILES, { min_executed_tests: 1, also_required: ['scripts/__tests__/gone.test.ts'] });
    const r = check(d, writeReport(d, report(ALL)));
    expect(r.code).toBe(1);
    expect(r.err).toContain('scripts/__tests__/gone.test.ts');
  });

  test('an excluded file need not appear; any other file still must', () => {
    const d = repo([...FILES, 'src/db/__tests__/migrations.test.ts'], { min_executed_tests: 1, exclude: ['src/db/__tests__/migrations.test.ts'] });
    expect(check(d, writeReport(d, report(ALL))).code).toBe(0);
  });

  test('executed tests (tests - skipped) below the floor → exit 1, naming both numbers', () => {
    const d = repo(FILES, { min_executed_tests: 4 });
    const r = check(d, writeReport(d, report({ ...ALL, 'tests/a.test.ts': { tests: 2, skipped: 1 } })));
    expect(r.code).toBe(1);
    expect(r.err).toContain('3 executed');
    expect(r.err).toContain('floor of 4');
  });

  test('a report recording failures → exit 1', () => {
    const d = repo(FILES, { min_executed_tests: 1 });
    const r = check(d, writeReport(d, report({ ...ALL, 'tests/a.test.ts': { tests: 2, failures: 1 } })));
    expect(r.code).toBe(1);
    expect(r.err).toContain('failure');
  });

  test('a floor file that is missing, malformed or has a non-positive floor → exit 1', () => {
    const d = repo(FILES);
    const xml = writeReport(d, report(ALL));
    const floorPath = join(d, '.github', 'scripts', 'test-report-floor.json');
    writeFileSync(floorPath, 'not json');
    expect(check(d, xml).code).toBe(1);
    writeFileSync(floorPath, JSON.stringify({ min_executed_tests: 0, exclude: [], also_required: [] }));
    expect(check(d, xml).code).toBe(1);
    rmSync(floorPath);
    expect(check(d, xml).code).toBe(1);
  });

  test('two report roots (a second document appended) → exit 1', () => {
    const d = repo(FILES, { min_executed_tests: 1 });
    const r = check(d, writeReport(d, report(ALL) + report(ALL)));
    expect(r.code).toBe(1);
  });

  test('no report path argument → exit 1', () => {
    const d = repo(FILES);
    const r = Bun.spawnSync(['bash', CHECK], { cwd: d, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(1);
  });
});

describe('end to end with a real bun test run', () => {
  function realRun(firstFileBody: string) {
    const d = repo(['tests/b.test.ts', 'tests/c.test.ts'], { min_executed_tests: 3 });
    writeFileSync(join(d, 'tests', 'a.test.ts'), firstFileBody);
    const out = join(d, 'junit.xml');
    const t = Bun.spawnSync([process.execPath, 'test', '--reporter=junit', `--reporter-outfile=${out}`, './tests/a.test.ts', './tests/b.test.ts', './tests/c.test.ts'], {
      cwd: d, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, AA_ALLOW_HOST_RUN: '1' },
    });
    return { bunCode: t.exitCode, reportExists: existsSync(out), check: check(d, out) };
  }

  test('THE ATTACK: a test file calling process.exit(0) makes bun exit 0, and the check refuses', () => {
    const r = realRun("import { test } from 'bun:test';\ntest('exit early', () => { process.exit(0); });\n");
    expect(r.bunCode).toBe(0);            // the bypass is real: bun alone would go green
    expect(r.check.code).toBe(1);
    expect(r.check.err).toContain('REFUSED');
  });

  test('a top-level process.exit(0) (outside any test) is refused too', () => {
    const r = realRun("import { test } from 'bun:test';\ntest('a', () => {});\nprocess.exit(0);\n");
    expect(r.bunCode).toBe(0);
    expect(r.check.code).toBe(1);
  });

  test('control: an honest run passes the check', () => {
    const r = realRun("import { test } from 'bun:test';\ntest('a', () => {});\n");
    expect(r.bunCode).toBe(0);
    expect(r.reportExists).toBe(true);
    expect(r.check.err).toBe('');
    expect(r.check.code).toBe(0);
  });
});

describe('the shipped floor and the ci wiring', () => {
  const floor = JSON.parse(readFileSync(FLOOR, 'utf-8')) as Floor;
  const ci = parseYaml(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8')) as {
    jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
  };
  const steps = ci.jobs.ci.steps;

  test('the floor is a real number of tests, and the excluded/required lists name real files', () => {
    expect(floor.min_executed_tests).toBeGreaterThanOrEqual(3000);
    expect(floor.exclude).toEqual(['src/db/__tests__/migrations.test.ts']);
    for (const f of [...floor.exclude, ...floor.also_required]) expect(existsSync(join(ROOT, f))).toBe(true);
    expect([...floor.also_required].sort()).toEqual(['scripts/__tests__/deploy-gate.test.ts', 'scripts/__tests__/precommit-tsc.test.ts']);
  });

  test('bun test writes a JUnit report, and a later step in the same job runs the check on that exact file', () => {
    const testIdx = steps.findIndex((s) => (s.run ?? '').includes('bun test '));
    const checkIdx = steps.findIndex((s) => (s.run ?? '').includes('.github/scripts/test-report-check.sh') && !(s.run ?? '').includes('bun test '));
    expect(testIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(testIdx);
    const run = steps[testIdx].run!;
    expect(run).toContain('--reporter=junit');
    const out = run.match(/--reporter-outfile="?([^"\s]+)"?/)?.[1];
    expect(out).toBeTruthy();
    expect(steps[checkIdx].run).toContain(out!);
    // A stale report from anything earlier in the job must not be read.
    expect(run.indexOf(`rm -f "${out}"`)).toBeGreaterThan(-1);
    expect(run.indexOf(`rm -f "${out}"`)).toBeLessThan(run.indexOf('bun test '));
  });

  test('ci passes every file the checker expects to bun test (the two lists cannot drift apart)', () => {
    const r = Bun.spawnSync(['bash', CHECK, '--list'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(0);
    const expected = r.stdout.toString().trim().split('\n');
    const run = steps.find((s) => (s.run ?? '').includes('bun test '))!.run!;
    // ci builds its list with the checker's --list, so the sets are identical by construction.
    expect(run).toContain('bash .github/scripts/test-report-check.sh --list');
    expect(expected.length).toBeGreaterThan(200);
    expect(expected).toContain('tests/path-guard.test.ts');
    expect(expected).toContain('scripts/__tests__/deploy-gate.test.ts');
    expect(expected).not.toContain('src/db/__tests__/migrations.test.ts');
  });
});
