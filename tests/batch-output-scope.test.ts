/**
 * scripts/write-description.ts and scripts/write-tags.ts — the two sanctioned
 * Bash writers of the headless enrichment session — may only write inside
 * temp-descriptions/. Before this pin `--batch-dir=<anywhere>` (or a `../` in
 * the event id) wrote any *.md / *.tags.json anywhere on disk, which turned the
 * enrichment allowlist into an instruction channel (overwrite .claude/CLAUDE.md).
 *
 * The CLI cases spawn the real scripts with cwd = repo root, exactly as
 * auto-enrich.sh does. The happy path writes under temp-descriptions/ (gitignored)
 * in a directory named after this process and removes it.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync, readFileSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { resolveBatchOutputPath, BATCH_OUTPUT_ROOT } from '../src/utils/batch-output-path';

const ROOT = join(import.meta.dir, '..');
const SCOPE = resolve(ROOT, BATCH_OUTPUT_ROOT);
const TEST_BATCH = `${BATCH_OUTPUT_ROOT}/__scope-test-${process.pid}`;
const OUTSIDE = mkdtempSync(join(tmpdir(), 'aa-batch-escape-'));

const ESCAPE_TARGET = join(ROOT, '__scope-escape.md');
function cleanup() {
  rmSync(join(ROOT, TEST_BATCH), { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
  mkdirSync(OUTSIDE, { recursive: true }); // keep the escape target dir present for the next test
  rmSync(ESCAPE_TARGET, { force: true }); // what an unguarded traversal would leave at the repo root
}
beforeAll(cleanup);
afterAll(cleanup);

function run(script: string, args: string[]) {
  const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', script), ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
}

describe('resolveBatchOutputPath — containment rule', () => {
  test('a batch dir inside temp-descriptions/ is allowed, relative to the repo root not the cwd', () => {
    const r = resolveBatchOutputPath(ROOT, 'temp-descriptions/batch-7', 'ev.md');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dir).toBe(join(SCOPE, 'batch-7'));
      expect(r.filePath).toBe(join(SCOPE, 'batch-7', 'ev.md'));
    }
  });
  test('the flat default directory is allowed', () => {
    expect(resolveBatchOutputPath(ROOT, 'temp-descriptions', 'ev.md').ok).toBe(true);
  });
  test('traversal in --batch-dir is refused', () => {
    expect(resolveBatchOutputPath(ROOT, 'temp-descriptions/../.claude', 'CLAUDE.md').ok).toBe(false);
    expect(resolveBatchOutputPath(ROOT, '../elsewhere', 'x.md').ok).toBe(false);
  });
  test('an absolute --batch-dir outside the repo is refused', () => {
    expect(resolveBatchOutputPath(ROOT, OUTSIDE, 'x.md').ok).toBe(false);
  });
  test('a sibling directory that merely shares the prefix is refused', () => {
    expect(resolveBatchOutputPath(ROOT, 'temp-descriptions-evil', 'x.md').ok).toBe(false);
  });
  test('a symlink under temp-descriptions/ is refused as a --batch-dir and as the target file (lexical checks alone followed it — Codex 2026-09-17)', () => {
    const linkDir = join(SCOPE, `__link-${process.pid}`);
    const realDir = join(SCOPE, `__real-${process.pid}`);
    try {
      mkdirSync(SCOPE, { recursive: true });
      symlinkSync(OUTSIDE, linkDir);
      mkdirSync(realDir, { recursive: true });
      writeFileSync(join(OUTSIDE, 'target.md'), 'x');
      symlinkSync(join(OUTSIDE, 'target.md'), join(realDir, 'ev-1.md'));
      expect(resolveBatchOutputPath(ROOT, `temp-descriptions/__link-${process.pid}`, 'ev-1.md').ok).toBe(false);
      expect(resolveBatchOutputPath(ROOT, `temp-descriptions/__real-${process.pid}`, 'ev-1.md').ok).toBe(false);
      expect(resolveBatchOutputPath(ROOT, `temp-descriptions/__real-${process.pid}`, 'ev-2.md').ok).toBe(true);
      // and through the real writer: the symlinked batch dir must not carry a write outside
      const r = run('write-description.ts', ['ev-1', `--batch-dir=temp-descriptions/__link-${process.pid}`, 'INJECTED']);
      expect(r.code).toBe(1);
      expect(r.err).toContain('write-description: FAILED');
      expect(existsSync(join(OUTSIDE, 'ev-1.md'))).toBe(false);
    } finally {
      rmSync(linkDir, { force: true });
      rmSync(realDir, { recursive: true, force: true });
      rmSync(join(OUTSIDE, 'target.md'), { force: true });
      rmSync(join(OUTSIDE, 'ev-1.md'), { force: true });
    }
  });

  test('traversal in the event id (filename) is refused even with a good --batch-dir', () => {
    const r = resolveBatchOutputPath(ROOT, 'temp-descriptions/batch-7', '../../docs/INTENT.md');
    expect(r.ok).toBe(false);
  });
});

describe('write-description.ts / write-tags.ts — the sanctioned writers stay inside temp-descriptions/', () => {
  test('fixture precondition: the escape target is outside the repo and empty', () => {
    expect(OUTSIDE.startsWith(ROOT)).toBe(false);
    expect(existsSync(join(OUTSIDE, 'CLAUDE.md'))).toBe(false);
  });

  test('write-description: --batch-dir outside the repo → exit 1, ONE stderr line, nothing written', () => {
    const r = run('write-description.ts', ['CLAUDE', `--batch-dir=${OUTSIDE}`, 'INJECTED INSTRUCTIONS']);
    expect(r.code).toBe(1);
    expect(r.err.trim().split('\n')).toHaveLength(1);
    expect(r.err).toContain('write-description: FAILED');
    expect(r.err).toContain('temp-descriptions');
    expect(existsSync(join(OUTSIDE, 'CLAUDE.md'))).toBe(false);
  });

  test('write-description: traversal in the event id → exit 1, nothing written', () => {
    const r = run('write-description.ts', ['../../__scope-escape', `--batch-dir=${TEST_BATCH}`, 'x']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('write-description: FAILED');
    expect(existsSync(ESCAPE_TARGET)).toBe(false);
  });

  test('write-tags: --batch-dir outside the repo → exit 1, ONE stderr line, nothing written', () => {
    const r = run('write-tags.ts', ['CLAUDE', `--batch-dir=${OUTSIDE}`, 'Music']);
    expect(r.code).toBe(1);
    expect(r.err.trim().split('\n')).toHaveLength(1);
    expect(r.err).toContain('write-tags: FAILED');
    expect(existsSync(join(OUTSIDE, 'CLAUDE.tags.json'))).toBe(false);
  });

  test('happy path: both writers still write inside a batch dir under temp-descriptions/', () => {
    const d = run('write-description.ts', ['ev-1', `--batch-dir=${TEST_BATCH}`, 'A description.']);
    expect(d.err).toBe('');
    expect(d.code).toBe(0);
    expect(readFileSync(join(ROOT, TEST_BATCH, 'ev-1.md'), 'utf-8')).toBe('A description.');
    const t = run('write-tags.ts', ['ev-1', `--batch-dir=${TEST_BATCH}`, 'Music']);
    expect(t.err).toBe('');
    expect(t.code).toBe(0);
    expect(JSON.parse(readFileSync(join(ROOT, TEST_BATCH, 'ev-1.tags.json'), 'utf-8'))).toEqual(['Music']);
  });
});
