/**
 * Build-provenance stamp (clean-tree deploy gate, Option 3 Phase 1 — 2026-07-07).
 *
 * The build writes dist/.build-provenance recording WHICH commit the artifacts
 * were built from and whether the SOURCE scope was dirty at build time.
 * scripts/deploy-gate.sh refuses any deploy whose stamp is missing, sha-
 * mismatched against HEAD, or built-from-dirty — closing the 2026-07-06 23:17Z
 * breach where a local verification build from an uncommitted tree (the
 * stashed dedup-301 strand) was auto-deployed to production.
 *
 * sourceDirty is computed over config/deploy-gate-scope.json's sourceScope —
 * the SAME scope the gate checks (single source of truth). Untracked files
 * inside the scope count as dirty: the breached strand included an untracked
 * test file.
 *
 * distHash binds the stamp to the bytes in dist/: the gate recomputes it
 * before deploying and refuses when dist/ changed after the build (an edit,
 * an added or a removed file). It is computed LAST, over the finished tree.
 *
 * Format: plain KEY=VALUE lines (bash-parseable without jq):
 *   sha=<40-hex HEAD sha>
 *   sourceDirty=0|1
 *   distHash=<64-hex sha256, see computeDistHash>
 *   builtAt=<ISO timestamp>
 *
 * CLI (used by scripts/deploy-gate.sh so there is one hash implementation):
 *   bun src/utils/build-provenance.ts dist-hash <distDir>   → prints the hex hash
 */

import { lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync, CryptoHasher } from 'bun';

export const STAMP_NAME = '.build-provenance';

function git(repoRoot: string, args: string[]): string {
  const p = spawnSync(['git', '-C', repoRoot, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    throw new Error(`build-provenance: git ${args.join(' ')} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout).trim();
}

/**
 * Deterministic content hash of a directory tree.
 *
 * Entries are sorted by the UTF-8 bytes of their '/'-joined relative path.
 * Each contributes `F\0<path>\0<sha256(bytes)>\n` (regular file) or
 * `L\0<path>\0<link target>\n` (symlink, not followed); the result is the
 * sha256 of that manifest. The stamp file at the top level is excluded so the
 * hash can be written into it. Directories contribute through their contents.
 */
export function computeDistHash(distDir: string): string {
  const entries: { rel: string; kind: 'F' | 'L'; abs: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) entries.push({ rel, kind: 'L', abs });
      else if (st.isDirectory()) walk(abs, rel);
      else if (st.isFile()) {
        if (rel !== STAMP_NAME) entries.push({ rel, kind: 'F', abs });
      } else {
        throw new Error(`build-provenance: unsupported file type in dist: ${rel}`);
      }
    }
  };
  walk(distDir, '');
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf-8'), Buffer.from(b.rel, 'utf-8')));

  const manifest = new CryptoHasher('sha256');
  for (const e of entries) {
    const body = e.kind === 'F'
      ? new CryptoHasher('sha256').update(readFileSync(e.abs)).digest('hex')
      : readlinkSync(e.abs);
    manifest.update(`${e.kind}\0${e.rel}\0${body}\n`);
  }
  return manifest.digest('hex');
}

export function writeBuildProvenance(distDir: string, repoRoot: string): void {
  const scopePath = join(repoRoot, 'config/deploy-gate-scope.json');
  const scope: string[] = JSON.parse(readFileSync(scopePath, 'utf-8')).sourceScope;

  const sha = git(repoRoot, ['rev-parse', 'HEAD']);
  const porcelain = git(repoRoot, ['status', '--porcelain', '--', ...scope]);
  const sourceDirty = porcelain.length > 0 ? 1 : 0;

  const distHash = computeDistHash(distDir);

  writeFileSync(
    join(distDir, STAMP_NAME),
    `sha=${sha}\nsourceDirty=${sourceDirty}\ndistHash=${distHash}\nbuiltAt=${new Date().toISOString()}\n`,
  );
}

if (import.meta.main) {
  const [cmd, dir] = process.argv.slice(2);
  if (cmd !== 'dist-hash' || !dir) {
    console.error('build-provenance: usage: bun src/utils/build-provenance.ts dist-hash <distDir>');
    process.exit(2);
  }
  try {
    console.log(computeDistHash(dir));
  } catch (e) {
    console.error(`build-provenance: FAILED to hash ${dir} — ${(e as Error).message} — try: rebuild with \`bun run build\``);
    process.exit(1);
  }
}
