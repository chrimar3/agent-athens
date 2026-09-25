/**
 * Security loop round 8 — every module the publish-trust code imports is a
 * protected path.
 *
 * The published-output gate (src/validators/published-artifacts.ts), the
 * _headers generator (src/generators/security-headers.ts), the URL filter
 * (src/utils/safe-url.ts) and the enrichment save chain (scripts/save-batch.ts)
 * decide what reaches the live site. They are protected, but a PR could keep
 * them untouched and weaken a module they import instead. So this test
 * parses the static imports (import … from, export … from, import 'x',
 * import type) of those roots and of the trust modules the round protected by
 * name, resolves each relative import to a file in the tree, and fails when
 * one is not matched by .github/path-guard.json — using path-guard.sh's own
 * matching (bash `[[ $f == $glob ]]`, case-insensitive). Files that exist only
 * on the other branch are skipped here and checked once the branches meet.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

/** The publish-trust roots, and the trust modules protected by name in round 8. */
const ROOTS = [
  'src/validators/published-artifacts.ts',
  'src/generators/security-headers.ts',
  'src/utils/safe-url.ts',
  'scripts/save-batch.ts',
  'src/validators/verification-allowlist.ts',
  'src/config/analytics.ts',
  'src/ticketing/ticket-trust.ts',
  'src/db/url-columns.ts',
  'scripts/lib/url-columns.ts',
];

const IMPORT_RE = /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"](\.{1,2}\/[^'"\n]+)['"]/g;

/** Relative static imports of `file` (repo-relative), resolved to existing files. */
export function relativeImports(file: string): { resolved: string[]; unresolved: string[] } {
  const src = readFileSync(join(ROOT, file), 'utf-8');
  const resolved = new Set<string>();
  const unresolved: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const base = normalize(join(dirname(file), m[1]));
    const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]
      .find((c) => existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile());
    if (hit) resolved.add(relative('.', hit));
    else unresolved.push(base);
  }
  return { resolved: [...resolved], unresolved };
}

/** Which of `files` path-guard.sh's matcher leaves unprotected. */
function unprotected(files: string[]): string[] {
  const globs: string[] = JSON.parse(readFileSync(join(ROOT, '.github', 'path-guard.json'), 'utf-8')).protected;
  const script = `
shopt -s nocasematch
n=$1; shift
globs=("\${@:1:$n}"); shift "$n"
for f in "$@"; do
  hit=0
  # shellcheck disable=SC2053
  for g in "\${globs[@]}"; do [[ "$f" == $g ]] && { hit=1; break; }; done
  [ "$hit" = 1 ] || printf '%s\\n' "$f"
done`;
  const r = Bun.spawnSync(['bash', '-c', script, 'match', String(globs.length), ...globs, ...files]);
  if (r.exitCode !== 0) throw new Error(`matcher failed: ${r.stderr.toString()}`);
  return r.stdout.toString().split('\n').filter(Boolean);
}

describe('publish-trust imports are protected (round 8)', () => {
  const present = ROOTS.filter((f) => existsSync(join(ROOT, f)));

  test('precondition: the roots on this branch are found and parsed', () => {
    expect(present).toContain('src/validators/published-artifacts.ts');
    expect(present).toContain('scripts/save-batch.ts');
    // save-batch imports its batch-output guard: the parser sees real imports.
    expect(relativeImports('scripts/save-batch.ts').resolved).toContain('src/utils/batch-output-path.ts');
  });

  test('every root is itself protected (including those not on this branch yet)', () => {
    expect(unprotected(ROOTS)).toEqual([]);
  });

  test('every relative module a root imports is protected', () => {
    const missing: string[] = [];
    for (const f of present) {
      const { resolved } = relativeImports(f);
      for (const u of unprotected(resolved)) missing.push(`${u} (imported by ${f})`);
    }
    expect(missing).toEqual([]);
  });

  test('no root has a relative import that does not resolve to a file (the walk would miss it)', () => {
    const lost: string[] = [];
    for (const f of present) for (const u of relativeImports(f).unresolved) lost.push(`${u} (imported by ${f})`);
    expect(lost).toEqual([]);
  });

  test('the parser catches multi-line, type-only, side-effect and export-from imports', () => {
    const sample = [
      "import {\n  a,\n  b,\n} from './multi';",
      "import type { T } from '../types/t';",
      "import './side-effect';",
      "export { x } from './re-export';",
      "export * from './star';",
      "import d, { e } from './mixed';",
      "import x from 'node-package';",
    ].join('\n');
    const got = [...sample.matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(got).toEqual(['./multi', '../types/t', './side-effect', './re-export', './star', './mixed']);
  });

  test('the matcher is path-guard.sh\'s: case-insensitive bash patterns', () => {
    expect(unprotected(['SRC/Config/Analytics.ts', 'src/utils/not-protected-at-all.ts'])).toEqual(['src/utils/not-protected-at-all.ts']);
    const guard = readFileSync(join(ROOT, '.github', 'scripts', 'path-guard.sh'), 'utf-8');
    expect(guard).toContain('shopt -s nocasematch');
    expect(guard).toContain('[[ "$f" == $g ]]');
  });
});
