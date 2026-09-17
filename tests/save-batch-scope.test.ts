/**
 * scripts/save-batch.ts is a sanctioned Bash command of the headless enrichment
 * session. It reads a manifest (whose output_dir it trusts for saving and for
 * `--clean` unlink/rmdir), so both the --manifest path and the manifest's
 * output_dir must be confined to the batch directories. Before this, a manifest
 * written inside the allowed temp-descriptions/ could name output_dir anywhere,
 * turning the granted command into an arbitrary-path delete (Codex 2026-09-17).
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, rmSync, writeFileSync, mkdtempSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { pathWithinRoots } from '../src/utils/batch-output-path';

const ROOT = resolve(import.meta.dir, '..');
const OUTSIDE = mkdtempSync(join(tmpdir(), 'aa-savebatch-escape-'));
const PROBE_MANIFEST = join(ROOT, 'temp-briefs', `__scope-test-${process.pid}.manifest.json`);
const EVIL_DIR = join(OUTSIDE, 'to-delete');

afterAll(() => { rmSync(OUTSIDE, { recursive: true, force: true }); rmSync(PROBE_MANIFEST, { force: true }); });

function run(args: string[]) {
  const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', 'save-batch.ts'), ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
}

describe('pathWithinRoots — save-step confinement', () => {
  test('a manifest inside temp-briefs/ is allowed', () => {
    expect(pathWithinRoots(ROOT, 'temp-briefs/batch-1.manifest.json', ['temp-briefs', 'temp-descriptions']).ok).toBe(true);
  });
  test('a manifest inside temp-descriptions/ is allowed', () => {
    expect(pathWithinRoots(ROOT, 'temp-descriptions/batch-1.manifest.json', ['temp-briefs', 'temp-descriptions']).ok).toBe(true);
  });
  test('an absolute path outside the repo is refused', () => {
    expect(pathWithinRoots(ROOT, '/etc/passwd', ['temp-briefs', 'temp-descriptions']).ok).toBe(false);
  });
  test('a traversal out is refused', () => {
    expect(pathWithinRoots(ROOT, 'temp-briefs/../.claude/settings.json', ['temp-briefs', 'temp-descriptions']).ok).toBe(false);
  });
  test('output_dir confinement uses temp-descriptions only (temp-briefs is not an output root)', () => {
    expect(pathWithinRoots(ROOT, 'temp-briefs/batch-1', ['temp-descriptions']).ok).toBe(false);
    expect(pathWithinRoots(ROOT, 'temp-descriptions/batch-1', ['temp-descriptions']).ok).toBe(true);
  });
});

describe('save-batch.ts — manifest and output_dir must be confined (before the DB is opened)', () => {
  test('a --manifest path outside temp-briefs/temp-descriptions is refused, exit 1, no DB touch', () => {
    const r = run(['--manifest=/etc/passwd', '--batch=1']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('save-batch: FAILED');
    expect(r.err).toContain('temp-briefs');
  });
  test('a manifest whose output_dir escapes temp-descriptions/ is refused before any save or --clean delete', () => {
    // A manifest that itself lives in an ALLOWED dir but points output_dir OUTSIDE.
    require('fs').mkdirSync(EVIL_DIR, { recursive: true });
    writeFileSync(join(EVIL_DIR, 'keep.txt'), 'must survive');
    writeFileSync(PROBE_MANIFEST, JSON.stringify({ batch_id: 1, generated_at: 'x', event_ids: [], output_dir: EVIL_DIR }));
    const r = run([`--manifest=temp-briefs/${PROBE_MANIFEST.split('/').pop()}`, '--batch=1', '--clean']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('save-batch: FAILED');
    expect(r.err).toContain('output_dir');
    expect(existsSync(join(EVIL_DIR, 'keep.txt'))).toBe(true); // --clean never reached it
  });
});
