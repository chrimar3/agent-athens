/**
 * Where the sanctioned enrichment writers (scripts/write-description.ts,
 * scripts/write-tags.ts) may put their output: inside temp-descriptions/ under
 * the repo root, and nowhere else.
 *
 * The headless enrichment session may run these scripts with any argv, and
 * its brief is built from scraped pages. Without this check `--batch-dir=` (or
 * a `../` in the event id) turned the allowed command into "write any *.md
 * anywhere" — e.g. over .claude/CLAUDE.md, which every later session reads as
 * instructions. The db-guard hook scopes the file tools the same way; this is
 * the same rule for the Bash path.
 */
import { resolve, relative, isAbsolute, sep, dirname } from 'path';
import { existsSync, realpathSync, lstatSync } from 'fs';

export const BATCH_OUTPUT_ROOT = 'temp-descriptions';

export type BatchOutputPath =
  | { ok: true; dir: string; filePath: string }
  | { ok: false; reason: string };

function inside(scope: string, p: string): boolean {
  const rel = relative(scope, p);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/** Real path of `p`'s deepest EXISTING ancestor (or `p` itself): where a write would actually land. */
function realExistingAncestor(p: string): string {
  let cur = p;
  for (;;) {
    if (existsSync(cur)) {
      try { return realpathSync(cur); } catch { return cur; }
    }
    const parent = dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
}

function isSymlink(p: string): boolean {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/**
 * Resolves `outputDir` (relative paths against `repoRoot`, never the cwd) and
 * `filename` inside it, and refuses either escaping `<repoRoot>/temp-descriptions/`.
 */
export function resolveBatchOutputPath(repoRoot: string, outputDir: string, filename: string): BatchOutputPath {
  const scope = resolve(repoRoot, BATCH_OUTPUT_ROOT);
  const dir = resolve(repoRoot, outputDir);
  if (!inside(scope, dir)) return { ok: false, reason: `--batch-dir resolves outside ${BATCH_OUTPUT_ROOT}/: ${dir}` };
  const filePath = resolve(dir, filename);
  if (!inside(dir, filePath)) return { ok: false, reason: `output file resolves outside its --batch-dir: ${filePath}` };
  // The lexical checks above follow no symlink; the REAL path must land inside
  // the real scope too, and neither the batch dir nor the target file may be a
  // symlink (a link planted under temp-descriptions/ carried writes outside).
  if (isSymlink(dir) || isSymlink(filePath)) return { ok: false, reason: `symlink in the output path is refused: ${isSymlink(dir) ? dir : filePath}` };
  const scopeReal = realExistingAncestor(scope);
  if (!inside(scopeReal, realExistingAncestor(dir)) || !inside(scopeReal, realExistingAncestor(filePath))) {
    return { ok: false, reason: `output path resolves (through a symlink) outside ${BATCH_OUTPUT_ROOT}/: ${filePath}` };
  }
  return { ok: true, dir, filePath };
}
