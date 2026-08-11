/**
 * db-guard — PreToolUse hook (Layer 2 of the enrichment DB boundary).
 *
 * Contract: stdin = hook JSON; exit 0 = allow, exit 2 = block (reason on
 * stderr). FAILS CLOSED: unparseable/malformed input for an inspected tool
 * blocks. This is a security boundary, not an advisory linter — the bypass
 * catalog in tests/db-guard-hook.test.ts is the list of attacks that
 * defeated the first draft. Every rule here exists because a test demands it.
 */

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

function pathVerdict(p: string): string | null {
  if (DB_FILE.test(p)) return block(`file tool targeting database file: ${p}`);
  for (const re of PROTECTED_FILES) if (re.test(p)) return block(`file tool targeting protected path: ${p}`);
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
