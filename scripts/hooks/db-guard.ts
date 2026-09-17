/**
 * db-guard — PreToolUse hook (Layer 2 of the enrichment DB boundary).
 *
 * Contract: stdin = hook JSON; exit 0 = allow, exit 2 = block (reason on
 * stderr). FAILS CLOSED: unparseable/malformed input for an inspected tool
 * blocks. This is a security boundary, not an advisory linter — the bypass
 * catalog in tests/db-guard-hook.test.ts is the list of attacks that
 * defeated the first draft. Every rule here exists because a test demands it.
 */

import { dirname, isAbsolute, relative, resolve } from 'path';
import { existsSync, realpathSync, lstatSync } from 'fs';

export interface HookInput {
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const block = (why: string) => `db-guard: ${why}`;

// ---------- file-path rules ----------

// DB + WAL/SHM sidecars, anywhere they appear. Sidecars hold committed
// transactions — deleting one is data loss even with the .db intact.
const DB_FILE = /\.db(-wal|-shm)?$/i;
// Self-protection: the hook, its wiring, the test preload, and the four
// sanctioned scripts a session could rewrite and then legitimately invoke.
const PROTECTED_FILES = [
  /(^|\/)scripts\/hooks\//i,
  /(^|\/)\.claude\/settings(\.local)?\.json$/i,
  /(^|\/)bunfig\.toml$/i,
  /(^|\/)tests\/preload\//i,
  /(^|\/)scripts\/(write-description|auto-gate-check|write-tags|save-batch)\.ts$/i,
];

// ---------- enrichment-session write scope ----------

// PROTECTED_FILES lists the four sanctioned entry scripts; it cannot enumerate
// the modules they import. The headless enrichment session reads scraped pages,
// so a prompt injection could rewrite an imported module (src/utils/tag-filter.ts)
// and then invoke a sanctioned script legitimately. Inside that session the
// denylist is therefore inverted to an allowlist: the only directory the
// enrichment flow writes with a file tool. Derived from the brief the session
// actually receives — scripts/generate-enrichment-brief.ts writes descriptions,
// tags, concerns.jsonl and batch-N-review.md under temp-descriptions/batch-N/
// (lines 522, 565, 713, 761). temp-briefs/ is deliberately NOT here: the session
// only reads the brief, and its batch-N.manifest.json is the list save-batch.ts
// trusts for which events to write — a writable manifest is a save-redirection.
// Deliberately NOT allowed: the session's auto-memory directory under
// ~/.claude/projects/. An enrichment session reads scraped pages, so anything
// it persists into memory would be loaded as instructions by every later
// session (Codex review 2026-09-16: learned memory is an instruction channel).
// Observed live 2026-09-17: the block cost the session a few refused turns and
// nothing else. The sanctioned Bash scripts (write-description.ts,
// write-tags.ts) enforce the same temp-descriptions/ containment on their own
// output path, so --batch-dir cannot be used to write elsewhere either.
const ENRICHMENT_WRITE_DIRS = ['temp-descriptions'];
const REPO_ROOT = resolve(import.meta.dir, '..', '..');

// Non-empty, not literally "1": auto-enrich.sh exports "1", and a session that
// somehow sees a different truthy value gets the STRICTER treatment, not the
// looser one. Read per call so the process env is the single source of truth.
const inEnrichmentSession = () => (process.env.AA_ENRICHMENT_SESSION ?? '') !== '';

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

function lexicallyInside(scope: string, abs: string): boolean {
  const rel = relative(scope, abs);
  // "" = the directory itself; ".." prefix / absolute = outside it. The
  // relative() comparison is what makes temp-descriptions-evil/ a miss.
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function outOfEnrichmentScope(p: string): boolean {
  // resolve() collapses ./ and ../ before comparison, so
  // temp-descriptions/../src/x.ts is judged as src/x.ts. Relative paths resolve
  // against the repo root, not cwd — auto-enrich.sh cds there, and the hook's
  // own location is the reliable anchor. Then the REAL path is checked too: a
  // symlink planted under temp-descriptions/ (as a directory or as the target
  // file) would otherwise carry the write outside (2026-09-17 Codex review).
  const abs = isAbsolute(p) ? resolve(p) : resolve(REPO_ROOT, p);
  for (const dir of ENRICHMENT_WRITE_DIRS) {
    const scope = resolve(REPO_ROOT, dir);
    if (!lexicallyInside(scope, abs)) continue;
    if (isSymlink(abs)) return true;
    const scopeReal = realExistingAncestor(scope);
    const targetReal = realExistingAncestor(abs);
    return !lexicallyInside(scopeReal, targetReal);
  }
  return true;
}

function pathVerdict(p: string): string | null {
  if (DB_FILE.test(p)) return block(`file tool targeting database file: ${p}`);
  for (const re of PROTECTED_FILES) if (re.test(p)) return block(`file tool targeting protected path: ${p}`);
  if (inEnrichmentSession() && outOfEnrichmentScope(p)) {
    return block(
      `enrichment session may only write under ${ENRICHMENT_WRITE_DIRS.map(d => `${d}/`).join(', ')} — refused: ${p}`,
    );
  }
  return null;
}

function collectPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof input.file_path === 'string') out.push(input.file_path);
  if (typeof input.notebook_path === 'string') out.push(input.notebook_path);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).file_path === 'string') {
        out.push((e as Record<string, string>).file_path);
      }
    }
  }
  return out;
}

// ---------- bash rules ----------

const BASH_DB_TARGET = /\.db(-wal|-shm)?\b/i;
const BASH_DATA_DIR = /(^|[\s"'=/])data\/?(\s|$|["'])/;
const BASH_BACKUPS = /agent-athens-backups/i;
const DESTRUCTIVE_VERB = /\b(rm|unlink|shred|truncate|dd|mv|cp|tee)\b/;

function bashVerdict(cmd: string): string | null {
  const hasDbTarget = BASH_DB_TARGET.test(cmd) || BASH_DATA_DIR.test(cmd) || BASH_BACKUPS.test(cmd);

  // sqlite3: only -readonly/--readonly, and even then no escape hatches.
  if (/\bsqlite3\b/.test(cmd)) {
    if (!/(^|\s)--?readonly\b/.test(cmd)) return block('sqlite3 without -readonly');
    // -init FILE and -cmd COMMAND run dot-commands from a source the session
    // controls (`.shell …` in a file it may write), and -A drives `.archive`,
    // which can extract files — all outside the visible dot-command check
    // below. Proven with `-readonly -init payload.sql :memory:` (Codex 2026-09-17).
    if (/(^|\s)--?(init|cmd)\b/.test(cmd) || /(^|\s)-A\b/.test(cmd)) {
      return block('sqlite3 -init/-cmd/-A runs commands from a session-controlled source');
    }
    if (/\battach\b/i.test(cmd)) return block('ATTACH escapes -readonly');
    if (/["'\s]\.(shell|open|import|save|restore|backup|clone|load|system|read|once|output|excel|cd)\b/i.test(cmd)) {
      return block('sqlite3 dot-command escape hatch');
    }
    if (/mode=(rw|rwc)/i.test(cmd)) return block('URI mode upgrade under -readonly');
  }

  if (hasDbTarget && DESTRUCTIVE_VERB.test(cmd)) return block('destructive verb against protected data');
  if (hasDbTarget && />\|?\s*[^|&;\s]*\.db(-wal|-shm)?\b/i.test(cmd)) return block('redirection over database file');
  if (/\bfind\b[^]*-delete\b/.test(cmd)) return block('find -delete');
  if (/\bgit\b[^&|;]*\bclean\b/.test(cmd)) return block('git clean removes the gitignored DB');
  if (/\b(bun|node|deno)\b[^&|;]*\s(-e|--eval)\b/.test(cmd) && /(bun:sqlite|\.db\b)/i.test(cmd)) {
    return block('interpreter eval driving sqlite');
  }
  return null;
}

// ---------- verdict ----------

export function verdict(input: HookInput): string | null {
  const { tool_name, tool_input } = input;

  if (tool_name === 'Bash') {
    const cmd = tool_input?.command;
    if (typeof cmd !== 'string') return block('Bash call with no command string (fail closed)');
    return bashVerdict(cmd);
  }

  if (FILE_TOOLS.has(tool_name)) {
    const paths = collectPaths(tool_input ?? {});
    if (paths.length === 0) return block(`${tool_name} call with no inspectable path (fail closed)`);
    for (const p of paths) {
      const v = pathVerdict(p);
      if (v) return v;
    }
    return null;
  }

  return null; // uninspected tools (WebSearch, Read, …) pass through
}

// ---------- process contract ----------

if (import.meta.main) {
  const text = await new Response(Bun.stdin.stream()).text();
  let input: HookInput;
  try {
    input = JSON.parse(text) as HookInput;
  } catch {
    console.error(block('unparseable hook input (fail closed)'));
    process.exit(2);
  }
  const v = verdict(input);
  if (v !== null) {
    console.error(v);
    process.exit(2);
  }
  process.exit(0);
}
