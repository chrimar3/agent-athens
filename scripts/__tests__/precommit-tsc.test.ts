import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

// S178 — Pre-commit hook tests.
//
// Each test runs in its own temp git repo so the live agent-athens checkout
// is never touched. The load-bearing assertions are:
//   A — happy path passes
//   B — strand (the bug we're stopping) is blocked with TS2307
//   C — working-tree preservation after a failing run (no orphan stash, no
//       missing files) — this is the safety guarantee a flaky hook would
//       violate first, so it's the most important test
//   D — no-op stash (clean WT) doesn't break the hook
//   E — brand-new repo with no HEAD still type-checks (edge case discovered
//       in Step 0(c): `git stash` requires HEAD; hook must skip stash dance)
//
// All subprocess calls go through execFileSync with an explicit argv array
// (not shell-interpolated strings) — no shell metachar risk, and the security
// guidance about exec() applies cleanly.

const SCRIPT = resolve(import.meta.dir, '..', 'precommit-tsc.sh');

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
  },
});

const UTIL_TS = 'export function foo(): number { return 1; }\n';
const IMPORTER_TS = 'import { foo } from "./util"; const n: number = foo();\n';

interface Repo {
  dir: string;
}

function git(repo: Repo, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo.dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function initRepo(withInitialCommit = true): Repo {
  const dir = mkdtempSync(join(tmpdir(), 'precommit-tsc-test-'));
  const repo: Repo = { dir };
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'a@b');
  git(repo, 'config', 'user.name', 'a');
  writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
  if (withInitialCommit) {
    git(repo, 'add', 'tsconfig.json');
    git(repo, 'commit', '-q', '-m', 'init', '--no-verify');
  }
  return repo;
}

function teardownRepo(repo: Repo): void {
  rmSync(repo.dir, { recursive: true, force: true });
}

function runHook(repo: Repo): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('bash', [SCRIPT], {
      cwd: repo.dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: e.status ?? 1,
    };
  }
}

describe('precommit-tsc.sh', () => {
  let repo: Repo;
  beforeEach(() => {
    repo = initRepo();
  });
  afterEach(() => {
    teardownRepo(repo);
  });

  test('A — clean commit (importer + util both staged) passes', () => {
    writeFileSync(join(repo.dir, 'util.ts'), UTIL_TS);
    writeFileSync(join(repo.dir, 'importer.ts'), IMPORTER_TS);
    git(repo, 'add', 'util.ts', 'importer.ts');
    const r = runHook(repo);
    expect(r.status).toBe(0);
  });

  test('B — strand blocked (importer staged, util unstaged on disk) with TS2307', () => {
    writeFileSync(join(repo.dir, 'util.ts'), UTIL_TS);
    writeFileSync(join(repo.dir, 'importer.ts'), IMPORTER_TS);
    git(repo, 'add', 'importer.ts');
    const r = runHook(repo);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/TS2307/);
    expect(r.stdout + r.stderr).toMatch(/Cannot find module/);
  });

  test('C — working-tree preservation after a failing run (no orphan stash, no missing files)', () => {
    writeFileSync(join(repo.dir, 'util.ts'), UTIL_TS);
    writeFileSync(join(repo.dir, 'importer.ts'), IMPORTER_TS);
    git(repo, 'add', 'importer.ts');
    runHook(repo); // expected non-zero — the strand case
    expect(existsSync(join(repo.dir, 'util.ts'))).toBe(true);
    expect(existsSync(join(repo.dir, 'importer.ts'))).toBe(true);
    expect(git(repo, 'stash', 'list').trim()).toBe('');
    const status = git(repo, 'status', '--porcelain');
    expect(status).toContain('A  importer.ts');
    expect(status).toContain('?? util.ts');
  });

  test('D — clean WT (everything staged, nothing to stash) runs without error', () => {
    writeFileSync(join(repo.dir, 'util.ts'), UTIL_TS);
    writeFileSync(join(repo.dir, 'importer.ts'), IMPORTER_TS);
    git(repo, 'add', 'util.ts', 'importer.ts');
    // No unstaged or untracked files — only staged. `git stash` is a no-op.
    const r = runHook(repo);
    expect(r.status).toBe(0);
    expect(git(repo, 'stash', 'list').trim()).toBe('');
  });

  test('E — no HEAD (brand-new repo, first commit ever) still type-checks', () => {
    teardownRepo(repo);
    repo = initRepo(false); // skip initial commit — no HEAD yet
    writeFileSync(join(repo.dir, 'util.ts'), UTIL_TS);
    writeFileSync(join(repo.dir, 'importer.ts'), IMPORTER_TS);
    git(repo, 'add', 'tsconfig.json', 'util.ts', 'importer.ts');
    const r = runHook(repo);
    expect(r.status).toBe(0);
  });
});
