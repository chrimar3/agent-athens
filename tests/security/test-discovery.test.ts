/**
 * Security loop round 9 — the documented test command never runs test files
 * planted in container-writable folders.
 *
 * A plain `bun test` discovers every *.test.ts / *_spec.ts under the working
 * directory, including gitignored data/ and logs/, which the container writes,
 * and runs them on the Mac. The documented command is now `bun run test`
 * (package.json → scripts/run-tests.sh): it refuses when a test-named file sits
 * in data/, logs/, dist/, tmp/, tmp*\/ or temp*\/, and otherwise passes bun the
 * exact list `.github/scripts/test-report-check.sh --list` prints, so bun
 * discovers nothing.
 *
 * Every case runs the real runner in a scratch copy (package.json test script,
 * bunfig.toml, tests/preload/, the runner and the list builder copied from the
 * repository) with marker-writing test files planted, and checks the markers.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, symlinkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

/** A test file that leaves a marker named `tag` in `markers/` when bun loads it. */
function markerTest(markers: string, tag: string): string {
  return `import { test } from 'bun:test';\nimport { writeFileSync } from 'fs';\n` +
    `writeFileSync(${JSON.stringify(join(markers, tag))}, 'ran');\ntest('t', () => {});\n`;
}

type Fixture = { dir: string; markers: string; plant: (rel: string) => void };

/** Scratch copy of the repository's test entry points, with one honest test. */
function fixture(floor: object = {}): Fixture {
  const parent = mkdtempSync(join(tmpdir(), 'aa-test-discovery-'));
  tmpDirs.push(parent);
  const dir = join(parent, 'repo');
  const markers = join(parent, 'markers');
  mkdirSync(markers, { recursive: true });
  for (const rel of ['bunfig.toml', 'tests/preload', 'scripts/run-tests.sh', '.github/scripts/test-report-check.sh']) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: PKG.scripts.test } }));
  writeFileSync(join(dir, '.github/scripts/test-report-floor.json'),
    JSON.stringify({ min_executed_tests: 1, exclude: [], also_required: [], ...floor }));
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'tests', 'honest.test.ts'), markerTest(markers, 'honest'));
  const plant = (rel: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), markerTest(markers, rel.replace(/[^A-Za-z0-9._-]/g, '_')));
  };
  return { dir, markers, plant };
}

function run(dir: string, argv: string[]) {
  const r = Bun.spawnSync(argv, { cwd: dir, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

const markersIn = (f: Fixture) => [...new Bun.Glob('*').scanSync({ cwd: f.markers })].sort();

const PLANTED = [
  'data/x.test.ts',
  'data/deep/nested/y_spec.ts',
  'logs/z.test.ts',
  'dist/a.test.mjs',
  'tmp/b_test.ts',
  'tmp-other/c.spec.tsx',
  'temp-briefs/d.TEST.ts',
];

describe('bun run test (the documented command)', () => {
  test('package.json test script is the explicit-list runner, and CLAUDE.md documents it', () => {
    expect(PKG.scripts.test).toBe('bash scripts/run-tests.sh');
    const claude = readFileSync(join(ROOT, '.claude', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('bun run test && git push origin main');
    expect(claude).not.toMatch(/^bun test && git push/m);
  });

  test('a clean scratch copy runs its honest test and exits 0', () => {
    const f = fixture();
    const r = run(f.dir, ['bun', 'run', 'test']);
    expect(r.code).toBe(0);
    expect(r.err).toContain('running 1 test files from the explicit list');
    expect(markersIn(f)).toEqual(['honest']);
  });

  test('planted test files in data/, logs/, dist/, tmp*/, temp*/ refuse the run before any test file loads', () => {
    const f = fixture();
    for (const p of PLANTED) f.plant(p);
    const r = run(f.dir, ['bun', 'run', 'test']);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('REFUSED — test files found in container-writable folders');
    for (const p of PLANTED) expect(r.err).toContain(p);
    expect(r.err).toContain('delete them');
    expect(markersIn(f)).toEqual([]);
  });

  test('the explicit list never names a planted file, so bun is never asked to run one', () => {
    const f = fixture();
    for (const p of PLANTED) f.plant(p);
    const r = run(f.dir, ['bash', '.github/scripts/test-report-check.sh', '--list']);
    expect(r.code).toBe(0);
    expect(r.out.trim().split('\n')).toEqual(['tests/honest.test.ts']);
  });

  test('a planted file name with terminal escapes is printed inert', () => {
    const f = fixture();
    f.plant('data/\u001b[2J\u001b]0;pwned\u0007evil.test.ts');
    const r = run(f.dir, ['bun', 'run', 'test']);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('evil.test.ts');
    expect(r.err).not.toContain('\u001b');
    expect(r.err).not.toContain('\u0007');
    expect(markersIn(f)).toEqual([]);
  });

  test('a list entry outside the test folders is refused, not run', () => {
    const f = fixture({ also_required: ['../outside.test.ts'] });
    writeFileSync(join(f.dir, '..', 'outside.test.ts'), markerTest(f.markers, 'outside'));
    const r = run(f.dir, ['bun', 'run', 'test']);
    expect(r.code).toBe(1);
    expect(r.err).toContain("the test list names '../outside.test.ts'");
    expect(markersIn(f)).toEqual([]);
  });

  test('a list that cannot be built is refused with the next step', () => {
    const f = fixture();
    rmSync(join(f.dir, '.github/scripts/test-report-floor.json'));
    const r = run(f.dir, ['bun', 'run', 'test']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('could not build the test list');
    expect(markersIn(f)).toEqual([]);
  });

  test('the runner is a protected path', () => {
    const guard = JSON.parse(readFileSync(join(ROOT, '.github', 'path-guard.json'), 'utf8')) as { protected: string[] };
    expect(guard.protected).toContain('scripts/run-tests.sh');
    expect(existsSync(join(ROOT, 'scripts', 'run-tests.sh'))).toBe(true);
  });
});

// --- append to tests/security/test-discovery.test.ts with the bunfig.toml +
// --- tests/preload/planted-tests.preload.ts owner patch (security loop round 9)

describe('plain `bun test` (bunfig.toml pathIgnorePatterns + planted-tests preload)', () => {
  test('bunfig loads the planted-tests preload first and ignores the writable folders', () => {
    const bunfig = readFileSync(join(ROOT, 'bunfig.toml'), 'utf8');
    expect(bunfig).toMatch(/^preload = \["\.\/tests\/preload\/planted-tests\.preload\.ts", /m);
    for (const p of ['data/**', 'logs/**', 'dist/**', 'tmp/**', 'tmp*/**', 'temp*/**']) expect(bunfig).toContain(`"${p}"`);
  });

  test('a clean scratch copy: plain `bun test` runs the honest test', () => {
    const f = fixture();
    const r = run(f.dir, ['bun', 'test']);
    expect(r.code).toBe(0);
    expect(markersIn(f)).toEqual(['honest']);
  });

  test('planted files: plain `bun test` exits before any test file loads', () => {
    const f = fixture();
    for (const p of PLANTED) f.plant(p);
    const r = run(f.dir, ['bun', 'test']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('[planted-tests] REFUSED');
    expect(r.err).toContain('data/x.test.ts');
    expect(markersIn(f)).toEqual([]);
  });

  test('explicit ./data path and a planted symlinked directory are refused too', () => {
    const f = fixture();
    const outside = join(f.dir, '..', 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'o.test.ts'), markerTest(f.markers, 'outside'));
    mkdirSync(join(f.dir, 'data'), { recursive: true });
    symlinkSync(outside, join(f.dir, 'data', 'link'));
    const r = run(f.dir, ['bun', 'test', './data/link/o.test.ts', './tests/honest.test.ts']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('data/link/o.test.ts');
    expect(markersIn(f)).toEqual([]);
  });

  test('a symlink loop under data/ ends the scan (no hang)', () => {
    const f = fixture();
    mkdirSync(join(f.dir, 'data', 'a'), { recursive: true });
    symlinkSync(join(f.dir, 'data'), join(f.dir, 'data', 'a', 'loop'));
    const r = run(f.dir, ['bun', 'test']);
    expect(r.code).toBe(0);
    expect(markersIn(f)).toEqual(['honest']);
  });

  test.skipIf(!Bun.semver.satisfies(Bun.version, '>=1.3.11'))('bun >= 1.3.11: pathIgnorePatterns alone keeps data/ out of discovery', () => {
    const f = fixture();
    for (const p of PLANTED) f.plant(p);
    const bunfig = readFileSync(join(f.dir, 'bunfig.toml'), 'utf8').replace(/^preload = .*$/m, '');
    writeFileSync(join(f.dir, 'bunfig.toml'), bunfig);
    const r = run(f.dir, ['bun', 'test']);
    expect(r.code).toBe(0);
    expect(markersIn(f)).toEqual(['honest']);
  });
});
