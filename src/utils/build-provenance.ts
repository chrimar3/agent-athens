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
 * Format: plain KEY=VALUE lines (bash-parseable without jq):
 *   sha=<40-hex HEAD sha>
 *   sourceDirty=0|1
 *   builtAt=<ISO timestamp>
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'bun';

function git(repoRoot: string, args: string[]): string {
  const p = spawnSync(['git', '-C', repoRoot, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    throw new Error(`build-provenance: git ${args.join(' ')} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout).trim();
}

export function writeBuildProvenance(distDir: string, repoRoot: string): void {
  const scopePath = join(repoRoot, 'config/deploy-gate-scope.json');
  const scope: string[] = JSON.parse(readFileSync(scopePath, 'utf-8')).sourceScope;

  const sha = git(repoRoot, ['rev-parse', 'HEAD']);
  const porcelain = git(repoRoot, ['status', '--porcelain', '--', ...scope]);
  const sourceDirty = porcelain.length > 0 ? 1 : 0;

  writeFileSync(
    join(distDir, '.build-provenance'),
    `sha=${sha}\nsourceDirty=${sourceDirty}\nbuiltAt=${new Date().toISOString()}\n`,
  );
}
