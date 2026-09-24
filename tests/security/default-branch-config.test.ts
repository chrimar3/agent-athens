/**
 * Security loop round 8 — CI limits come from the default branch.
 *
 * The ci job's test floor (.github/scripts/test-report-floor.json) and the
 * dependency-audit ignore list (.github/audit-ignore.json) decide how a PR is
 * judged. Read from the checkout, a PR could lower the floor, exclude its own
 * test file or ignore the advisory it introduces in the same diff. They are
 * now read from origin/<default branch> by .github/scripts/default-branch-file.sh
 * (like secret-scan.sh with its gitleaks config), with the checked-out copy
 * used only while the default branch has no such file (the PR that first adds
 * it), which is logged.
 *
 * Fixtures: a bare "origin" whose main carries the strict files, and a
 * checkout (like a CI PR checkout: no origin/main ref yet) carrying relaxed
 * copies. Nothing touches the network.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dir, '..', '..');
const HELPER = join(ROOT, '.github', 'scripts', 'default-branch-file.sh');
const REPORT_CHECK = join(ROOT, '.github', 'scripts', 'test-report-check.sh');
const AUDIT = join(ROOT, '.github', 'scripts', 'dependency-audit.sh');

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmpDirs.push(d); return d; };

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_NOSYSTEM: '1' };

function sh(cwd: string, cmd: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...GIT_ENV, ...env } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function put(dir: string, rel: string, body: string) {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

const FLOOR = '.github/scripts/test-report-floor.json';
const IGNORE = '.github/audit-ignore.json';
const TESTS = ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts'];
const TEST_BODY = "import { test } from 'bun:test';\ntest('t', () => {});\n";

/** origin/main with `mainFiles`; a checkout with `prFiles` and no origin/main ref yet. */
function fixture(mainFiles: Record<string, string>, prFiles: Record<string, string>) {
  const origin = tmp('aa-dbf-origin-');
  sh(origin, ['git', 'init', '-q', '--bare', '-b', 'main']);
  const seed = tmp('aa-dbf-seed-');
  sh(seed, ['git', 'init', '-q', '-b', 'main']);
  for (const [rel, body] of Object.entries(mainFiles)) put(seed, rel, body);
  put(seed, 'README', 'seed\n');
  sh(seed, ['git', 'add', '-A']);
  sh(seed, ['git', 'commit', '-q', '-m', 'main']);
  const pushed = sh(seed, ['git', 'push', '-q', `file://${origin}`, 'HEAD:refs/heads/main']);
  if (pushed.code !== 0) throw new Error(`fixture push failed: ${pushed.err}`);

  const co = tmp('aa-dbf-checkout-');
  sh(co, ['git', 'init', '-q', '-b', 'pr']);
  sh(co, ['git', 'remote', 'add', 'origin', `file://${origin}`]);
  for (const [rel, body] of Object.entries(prFiles)) put(co, rel, body);
  return co;
}

const floor = (min: number, exclude: string[] = [], also: string[] = []) =>
  JSON.stringify({ min_executed_tests: min, exclude, also_required: also });

describe('default-branch-file.sh', () => {
  test('reads the file from origin/<branch>, fetching it when the checkout has no ref, and says so', () => {
    const co = fixture({ [FLOOR]: floor(99) }, { [FLOOR]: floor(1) });
    const out = join(co, 'out.json');
    const r = sh(co, ['bash', HELPER, 'main', FLOOR, out]);
    expect(r.code).toBe(0);
    expect(r.err).toContain(`${FLOOR} from origin/main`);
    expect(JSON.parse(readFileSync(out, 'utf-8')).min_executed_tests).toBe(99);
  });

  test('first introduction: the default branch lacks the file → the checked-out copy, logged', () => {
    const co = fixture({}, { [FLOOR]: floor(3) });
    const out = join(co, 'out.json');
    const r = sh(co, ['bash', HELPER, 'main', FLOOR, out]);
    expect(r.code).toBe(0);
    expect(r.err).toContain('first introduction');
    expect(JSON.parse(readFileSync(out, 'utf-8')).min_executed_tests).toBe(3);
  });

  test('an unreachable default branch fails closed and writes nothing', () => {
    const co = fixture({ [FLOOR]: floor(99) }, { [FLOOR]: floor(1) });
    sh(co, ['git', 'remote', 'set-url', 'origin', `file://${join(co, 'no-such-origin')}`]);
    const out = join(co, 'out.json');
    const r = sh(co, ['bash', HELPER, 'main', FLOOR, out]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('failing closed');
    expect(existsSync(out)).toBe(false);
  });

  test('a file on neither side, a symlinked checkout copy, a bad ref or path each fail closed', () => {
    const co = fixture({}, {});
    expect(sh(co, ['bash', HELPER, 'main', FLOOR, join(co, 'o1')]).code).toBe(1);
    put(co, 'elsewhere.json', floor(1));
    mkdirSync(join(co, '.github', 'scripts'), { recursive: true });
    symlinkSync(join(co, 'elsewhere.json'), join(co, FLOOR));
    const sym = sh(co, ['bash', HELPER, 'main', FLOOR, join(co, 'o2')]);
    expect(sym.code).toBe(1);
    expect(sym.err).toContain('failing closed');
    for (const [ref, path] of [['--upload-pack=x', FLOOR], ['ma in', FLOOR], ['main', '/etc/passwd'], ['main', '../x.json'], ['', FLOOR]]) {
      const r = sh(co, ['bash', HELPER, ref, path, join(co, 'o3')]);
      expect(r.code).toBe(1);
      expect(r.err).toContain('failing closed');
    }
  });
});

describe('test-report-check.sh reads its floor from the default branch (FLOOR_REF)', () => {
  const junit = (files: string[]) => {
    const suites = files.map((f) => `  <testsuite name="${f}" file="${f}" tests="1" assertions="1" failures="0" skipped="0" time="0">\n    <testcase name="t" file="${f}" />\n  </testsuite>`);
    return `<?xml version="1.0"?>\n<testsuites name="bun test" tests="${files.length}" assertions="${files.length}" failures="0" skipped="0" time="0">\n${suites.join('\n')}\n</testsuites>\n`;
  };

  function prCheckout(mainFloor: string | null, prFloor: string) {
    const files: Record<string, string> = Object.fromEntries(TESTS.map((t) => [t, TEST_BODY]));
    const co = fixture(mainFloor === null ? {} : { [FLOOR]: mainFloor }, { ...files, [FLOOR]: prFloor });
    return co;
  }

  test('a PR that lowers the floor is still judged by the default branch\'s floor', () => {
    const co = prCheckout(floor(10), floor(1));
    writeFileSync(join(co, 'junit.xml'), junit(TESTS));
    const strict = sh(co, ['bash', REPORT_CHECK, join(co, 'junit.xml')], { FLOOR_REF: 'main' });
    expect(strict.code).toBe(1);
    expect(strict.err).toContain('below the committed floor of 10');
    // Without FLOOR_REF (a local run) the checked-out floor applies.
    const local = sh(co, ['bash', REPORT_CHECK, join(co, 'junit.xml')]);
    expect(local.code).toBe(0);
  });

  test('a PR cannot exclude its own test file: --list uses the default branch\'s exclude list', () => {
    const co = prCheckout(floor(1), floor(1, ['tests/c.test.ts']));
    const listed = sh(co, ['bash', REPORT_CHECK, '--list'], { FLOOR_REF: 'main' }).out.trim().split('\n');
    expect(listed).toEqual(TESTS);
    writeFileSync(join(co, 'junit.xml'), junit(['tests/a.test.ts', 'tests/b.test.ts']));
    const r = sh(co, ['bash', REPORT_CHECK, join(co, 'junit.xml')], { FLOOR_REF: 'main' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('tests/c.test.ts');
  });

  test('before the default branch has a floor file, the PR\'s copy is used (logged)', () => {
    const co = prCheckout(null, floor(2));
    writeFileSync(join(co, 'junit.xml'), junit(TESTS));
    const r = sh(co, ['bash', REPORT_CHECK, join(co, 'junit.xml')], { FLOOR_REF: 'main' });
    expect(r.code).toBe(0);
    expect(r.err).toContain('first introduction');
  });

  test('an unreachable default branch refuses (never falls back to the PR copy)', () => {
    const co = prCheckout(floor(1), floor(1));
    sh(co, ['git', 'remote', 'set-url', 'origin', `file://${join(co, 'gone')}`]);
    writeFileSync(join(co, 'junit.xml'), junit(TESTS));
    const r = sh(co, ['bash', REPORT_CHECK, join(co, 'junit.xml')], { FLOOR_REF: 'main' });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('could not read .github/scripts/test-report-floor.json from the default branch main');
  });
});

describe('dependency-audit.sh reads its ignore list from the default branch (AUDIT_IGNORE_REF)', () => {
  const ENTRY = {
    id: 'GHSA-jmr9-qjv8-65gv', package: 'extract-zip', severity: 'high',
    reason: 'No patched release exists; reached only when puppeteer unpacks its own browser download.',
    review_by: '2026-12-31',
  };
  const NEW = { ...ENTRY, id: 'GHSA-7pqw-9j4j-h8q3', package: 'introduced-by-this-pr' };

  function run(co: string) {
    const bun = join(co, 'fake-bun');
    writeFileSync(bun, `#!/bin/bash\nprintf '%s\\n' "$@" > "${join(co, 'argv.log')}"\nexit 0\n`);
    chmodSync(bun, 0o755);
    const r = sh(co, ['bash', AUDIT], { BUN_BIN: bun, AUDIT_IGNORE_REF: 'main', AUDIT_TODAY: '2026-09-23' });
    const argv = existsSync(join(co, 'argv.log')) ? readFileSync(join(co, 'argv.log'), 'utf-8').trim().split('\n') : [];
    return { ...r, argv };
  }

  test('an ignore entry added by the PR is not honoured; the default branch\'s entries are', () => {
    const co = fixture({ [IGNORE]: JSON.stringify({ ignore: [ENTRY] }) }, { [IGNORE]: JSON.stringify({ ignore: [ENTRY, NEW] }) });
    const r = run(co);
    expect(r.code).toBe(0);
    expect(r.argv).toEqual(['audit', '--audit-level=high', `--ignore=${ENTRY.id}`]);
    expect(r.err).toContain(`${IGNORE} from origin/main`);
  });

  test('first introduction uses the PR copy (logged); an unreachable default branch refuses before the audit', () => {
    const first = fixture({}, { [IGNORE]: JSON.stringify({ ignore: [ENTRY] }) });
    const r = run(first);
    expect(r.code).toBe(0);
    expect(r.err).toContain('first introduction');
    const gone = fixture({ [IGNORE]: JSON.stringify({ ignore: [] }) }, { [IGNORE]: JSON.stringify({ ignore: [ENTRY] }) });
    sh(gone, ['git', 'remote', 'set-url', 'origin', `file://${join(gone, 'gone')}`]);
    const g = run(gone);
    expect(g.code).toBe(1);
    expect(g.argv).toEqual([]);
    expect(g.err).toContain('dependency-audit: REFUSED');
  });
});

describe('the workflows pass the default branch', () => {
  const wf = (f: string) => parseYaml(readFileSync(join(ROOT, '.github', 'workflows', f), 'utf-8')) as {
    jobs: Record<string, { steps: Array<{ run?: string; env?: Record<string, string> }> }>;
  };

  test('ci.yml: both test-report-check.sh steps (the file list and the report) get FLOOR_REF', () => {
    const steps = wf('ci.yml').jobs.ci.steps.filter((s) => (s.run ?? '').includes('test-report-check.sh'));
    expect(steps.length).toBe(2);
    for (const s of steps) expect(s.env?.FLOOR_REF).toBe('${{ github.event.repository.default_branch }}');
  });

  test('security.yml: the audit step gets AUDIT_IGNORE_REF', () => {
    const step = wf('security.yml').jobs['dependency-audit'].steps.find((s) => (s.run ?? '').includes('dependency-audit.sh'))!;
    expect(step.env?.AUDIT_IGNORE_REF).toBe('${{ github.event.repository.default_branch }}');
  });
});
