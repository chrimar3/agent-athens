/**
 * db-guard — PreToolUse hook (Layer 2 of the enrichment DB boundary).
 *
 * Contract: stdin = hook JSON; exit 0 = allow, exit 2 = block (reason on
 * stderr). FAILS CLOSED: unparseable/malformed input for an inspected tool
 * blocks. This is a security boundary, not an advisory linter — the bypass
 * catalog in tests/db-guard-hook.test.ts is the list of attacks that
 * defeated the first draft. Every rule here exists because a test demands it.
 */

import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { existsSync, realpathSync, lstatSync, readdirSync, statSync, type Dirent } from 'fs';
import { homedir } from 'os';

export interface HookInput {
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// The hook must also see MCP filesystem write tools: an mcp__filesystem__write_file
// to data/events.db or a protected path would otherwise bypass every check
// (2026-09-17 Codex review). Read tools are intentionally not matched.
const MCP_FILE_TOOL = /^mcp__[a-z0-9_]+__(write_file|edit_file|move_file|create_directory)$/i;
const isFileTool = (name: string): boolean => FILE_TOOLS.has(name) || MCP_FILE_TOOL.test(name);

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
  /(^|\/)scripts\/(write-description|auto-gate-check|write-tags|save-batch|db-read)\.ts$/i,
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

// ---------- unattended-session profiles (security loop round 1) ----------

// An unattended `claude -p` session reads text an attacker can influence
// (scraped pages, probe output). In those sessions reading is a boundary too,
// Bash is narrowed, and tools the hook does not know are refused. Interactive
// sessions (neither env var) keep the denylist behaviour.
//   enrichment — AA_ENRICHMENT_SESSION (auto-enrich.sh): strictest. Bash only
//                for the sanctioned scripts; writes only under temp-descriptions/.
//   unattended — AA_UNATTENDED_SESSION (phase3-weekly.sh): reads and writes in
//                the repo plus the launcher-declared AA_SESSION_EXTRA_ROOTS
//                (colon-separated absolute paths); no web tools.
// Enrichment wins when both are set (the stricter profile).
type Profile = 'interactive' | 'enrichment' | 'unattended';
function sessionProfile(): Profile {
  if (inEnrichmentSession()) return 'enrichment';
  if ((process.env.AA_UNATTENDED_SESSION ?? '') !== '') return 'unattended';
  return 'interactive';
}

const READ_PATH_TOOLS = new Set(['Read', 'NotebookRead', 'Glob', 'Grep', 'LS']);
// Tools each unattended profile may call at all. Anything else — MCP tools,
// Task/Skill in enrichment, a tool a future CLI adds — is refused. The CLI's
// --allowedTools list is the first gate; this one fails closed. (settings.json
// wires this hook with matcher "*" so it sees every tool.)
const PROFILE_TOOLS: Record<Exclude<Profile, 'interactive'>, Set<string>> = {
  enrichment: new Set([
    'Read', 'NotebookRead', 'Glob', 'Grep', 'LS',
    'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
    'Bash', 'BashOutput', 'KillShell', 'KillBash', 'TodoWrite',
    // Kept deliberately: research needs them. With secrets unreadable (the
    // read scope below) an injected fetch has nothing sensitive to carry out.
    'WebFetch', 'WebSearch',
  ]),
  unattended: new Set([
    'Read', 'NotebookRead', 'Glob', 'Grep', 'LS',
    'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
    'Bash', 'BashOutput', 'KillShell', 'KillBash', 'TodoWrite', 'Task', 'Agent',
  ]),
};

// Secret-bearing names, matched per path segment BELOW a scope root (so the
// repo's own absolute location never trips them). Refused for reads and
// writes in unattended sessions even inside the repo.
const SECRET_SEGMENT: RegExp[] = [
  /^\.env(\..*)?$/i, /^\.envrc$/i,
  /^\.netlify$/i, /^\.git$/i, /^\.git-old$/i,
  /^\.ssh$/i, /^\.gnupg$/i, /^\.aws$/i,
  /^\.npmrc$/i, /^\.netrc$/i, /^\.msmtprc$/i, /^\.pgpass$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /credential/i, /secret/i,
];
const isSecretName = (name: string) => SECRET_SEGMENT.some((re) => re.test(name));
const hasSecretSegment = (rel: string) => rel.split(/[\\/]+/).some((seg) => seg !== '' && isSecretName(seg));

function scopeRoots(profile: Profile): string[] {
  const roots = [REPO_ROOT];
  if (profile === 'unattended') {
    for (const r of (process.env.AA_SESSION_EXTRA_ROOTS ?? '').split(':')) {
      if (r !== '' && isAbsolute(r)) roots.push(resolve(r));
    }
  }
  return roots;
}

/** Absolute form of a tool path, or null when it cannot be judged safely. */
function toAbsolute(p: string): string | null {
  // Tools do not expand $VARS; refusing them keeps "$HOME/.ssh" from being
  // judged as a harmless relative directory literally named "$HOME".
  if (p.includes('\0') || p.includes('$')) return null;
  if (p === '~' || p.startsWith('~/')) return resolve(homedir(), '.' + p.slice(1));
  if (p.startsWith('~')) return null; // ~user/…
  return isAbsolute(p) ? resolve(p) : resolve(REPO_ROOT, p);
}

/**
 * One path in an unattended session: it must sit under a scope root both
 * lexically and by real path (a symlink cannot carry it out), and no segment
 * below that root may be secret-bearing.
 */
function scopedPathVerdict(p: string, roots: string[], what: string): string | null {
  const abs = toAbsolute(p);
  if (abs === null) return block(`${what}: path cannot be judged (~user, $VAR or NUL) — refused: ${p}`);
  const root = roots.find((r) => lexicallyInside(r, abs));
  if (!root) return block(`${what} outside the repository is refused in an unattended session: ${p}`);
  if (hasSecretSegment(relative(root, abs))) return block(`${what} of a secret-bearing path (.env, .git, .netlify, keys, credentials) is refused in an unattended session: ${p}`);
  if (isSymlink(abs)) {
    let target: string;
    try { target = realpathSync(abs); } catch { return block(`${what} of a dangling symlink is refused: ${p}`); }
    if (!roots.some((r) => lexicallyInside(realExistingAncestor(r), target))) return block(`${what} follows a symlink out of the repository — refused: ${p}`);
    if (hasSecretSegment(target)) return block(`${what} follows a symlink to a secret-bearing path — refused: ${p}`);
  }
  const realRoot = realExistingAncestor(root);
  const realAbs = realExistingAncestor(abs);
  if (!lexicallyInside(realRoot, realAbs)) return block(`${what} resolves (via symlink) outside the repository — refused: ${p}`);
  if (hasSecretSegment(relative(realRoot, realAbs))) return block(`${what} resolves to a secret-bearing path — refused: ${p}`);
  return null;
}

// Grep descends into a directory, and ripgrep would read any secret file
// below it. Bounded breadth-first walk; node_modules is skipped (vendored and
// too large to walk per call). The repo root always fails this (.git, .env).
const SECRET_WALK_LIMIT = 20000;
function directoryHoldsSecret(dir: string): 'yes' | 'no' | 'too-large' {
  const queue = [dir];
  let seen = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    let entries: Dirent[];
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (++seen > SECRET_WALK_LIMIT) return 'too-large';
      if (isSecretName(e.name)) return 'yes';
      if (e.isDirectory() && e.name !== 'node_modules') queue.push(join(cur, e.name));
    }
  }
  return 'no';
}

/** Static (glob-free) directory prefix of a Glob pattern. */
function globBase(pattern: string): string {
  const out: string[] = [];
  for (const s of pattern.split('/')) {
    if (/[*?[\]{}]/.test(s)) break;
    out.push(s);
  }
  return out.join('/') || '.';
}

function readToolVerdict(tool: string, input: Record<string, unknown>, roots: string[]): string | null {
  const str = (k: string) => (typeof input[k] === 'string' && input[k] !== '' ? (input[k] as string) : undefined);

  if (tool === 'Read' || tool === 'NotebookRead') {
    const p = str('file_path') ?? str('notebook_path');
    if (!p) return block(`${tool} call with no inspectable path (fail closed)`);
    return scopedPathVerdict(p, roots, 'Read');
  }

  if (tool === 'Glob' || tool === 'LS') {
    const base = str('path') ?? '.';
    const v = scopedPathVerdict(base, roots, tool);
    if (v) return v;
    const pattern = str('pattern');
    if (tool === 'Glob' && pattern !== undefined) {
      if (pattern.split('/').includes('..')) return block(`Glob pattern may not climb with "..": ${pattern}`);
      const prefix = globBase(pattern);
      const joined = isAbsolute(prefix) || prefix.startsWith('~') ? prefix : join(base, prefix);
      return scopedPathVerdict(joined, roots, 'Glob');
    }
    return null;
  }

  // Grep
  const target = str('path') ?? '.';
  const v = scopedPathVerdict(target, roots, 'Grep');
  if (v) return v;
  const abs = toAbsolute(target)!;
  let isDir = false;
  try { isDir = statSync(abs).isDirectory(); } catch { /* missing path: ripgrep errors, nothing is read */ }
  if (isDir) {
    const holds = directoryHoldsSecret(abs);
    if (holds === 'yes') {
      return block(
        `Grep over ${target} would descend into a secret-bearing file (.env, .git, keys…) — search a narrower directory such as config/, docs/, exemplars/, src/ or temp-descriptions/`,
      );
    }
    if (holds === 'too-large') return block(`Grep over ${target} is too large to verify as secret-free — search a narrower directory`);
  }
  return null;
}

// ---------- enrichment-session Bash allowlist ----------

// The only commands the enrichment brief asks for. settings.json grants
// interactive conveniences (ls, wc, the sqlite3 shell…) and `claude -p` sees
// those grants too, so it is the hook, not the CLI, that limits the enrichment
// session to these. Descriptions travel as quoted arguments, so ; & | < > are
// fine INSIDE quotes and refused outside them.
const SANCTIONED_ENRICHMENT_CMD = /^bun run scripts\/(write-description|auto-gate-check|write-tags|save-batch|db-read)\.ts(\s|$)/;
const PIPE_FILTER = /^(head|tail|wc)(\s+(-{1,2}[A-Za-z0-9=]+|\d+))*$/;
const HARMLESS_REDIRECTS = ['2>&1', '2>/dev/null', '1>/dev/null', '>/dev/null'];

/** Split on unquoted control operators; null on unbalanced quoting or an unquoted, non-harmless redirection. */
function splitTopLevel(cmd: string): { segments: string[]; ops: string[] } | null {
  const segments: string[] = [];
  const ops: string[] = [];
  let cur = '';
  let i = 0;
  let quote: '"' | "'" | null = null;
  while (i < cmd.length) {
    const c = cmd[i];
    if (quote === "'") {
      cur += c;
      if (c === "'") quote = null;
      i++;
      continue;
    }
    if (quote === '"') {
      if (c === '\\' && i + 1 < cmd.length) { cur += c + cmd[i + 1]; i += 2; continue; }
      cur += c;
      if (c === '"') quote = null;
      i++;
      continue;
    }
    if (c === '\\') {
      if (cmd[i + 1] === '\n') { cur += ' '; i += 2; continue; } // line continuation
      cur += c + (cmd[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; cur += c; i++; continue; }
    const redirect = HARMLESS_REDIRECTS.find((r) => cmd.startsWith(r, i) && (i === 0 || /\s/.test(cmd[i - 1])));
    if (redirect) { i += redirect.length; continue; }
    if (c === '<' || c === '>') return null;
    if (c === ';' || c === '\n' || c === '&' || c === '|') {
      let op = c;
      if ((c === '&' || c === '|') && (cmd[i + 1] === '&' || cmd[i + 1] === '|')) op += cmd[i + 1];
      segments.push(cur.trim());
      ops.push(op);
      cur = '';
      i += op.length;
      continue;
    }
    cur += c;
    i++;
  }
  if (quote !== null) return null;
  segments.push(cur.trim());
  return { segments, ops };
}

// ---------- unattended-session Bash allowlist (security loop round 2) ----------

// Mirrors PHASE3_ALLOWED_TOOLS in scripts/phase3-weekly.sh: the CLI list is the
// first gate, this is the fail-closed one (settings.json grants reach headless
// sessions too). No wildcard script runner: `bun run /tmp/x.ts` is refused.
const SANCTIONED_UNATTENDED_CMD =
  /^(bun run src\/generate-site\.ts|bun test|bunx tsc --noEmit -p \.|git (status|diff|log|show|add|commit|merge|switch|branch|rev-parse)(\s.*)?|(ls|wc)(\s.*)?)$/;

function unattendedBashVerdict(cmd: string, roots: string[]): string | null {
  const refuse = (why: string) =>
    block(`unattended session Bash is limited to the build, \`bun test\`, tsc, local git and ls/wc — ${why}`);
  if (/`|\$[({[A-Za-z_'"]|[<>]\(/.test(cmd)) return refuse('command substitution and $VAR expansion are refused');
  const parts = splitTopLevel(cmd);
  if (!parts) return refuse('unbalanced quoting or an unquoted redirection');
  if (parts.ops.length > 0) return refuse('chained or piped commands are refused');
  const seg = parts.segments[0];
  if (!SANCTIONED_UNATTENDED_CMD.test(seg)) return refuse(`refused: ${cmd.slice(0, 80)}`);
  // git diff/log/show --output=FILE writes anywhere; -c/--exec-path/-C reach config and other trees.
  if (/^git /.test(seg) && /(^|\s)(--output|--exec-path|-C|-c)(=|\s|$)/.test(seg)) return refuse('git --output/-C/-c are refused');
  // ls/wc may only look inside the scope roots (names of ~/.ssh are still secrets).
  if (/^(ls|wc)(\s|$)/.test(seg)) {
    for (const arg of seg.split(/\s+/).slice(1)) {
      if (arg === '' || arg.startsWith('-')) continue;
      const v = scopedPathVerdict(arg.replace(/^["']|["']$/g, ''), roots, 'ls/wc');
      if (v) return v;
    }
  }
  return null;
}

function isCdToRepo(seg: string): boolean {
  const m = /^cd\s+(.+)$/.exec(seg);
  if (!m) return false;
  let target = m[1].trim();
  if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
    target = target.slice(1, -1);
  } else {
    target = target.replace(/\\ /g, ' ');
  }
  return isAbsolute(target) && resolve(target) === REPO_ROOT;
}

// One trailing heredoc with a QUOTED delimiter (bash expands nothing in its
// body), for `write-description.ts … --stdin`. The body may not contain the
// delimiter line: bash would end the heredoc there and run what follows.
const QUOTED_HEREDOC = /^([^\n]*?)\s<<(-?)'([A-Za-z_][A-Za-z0-9_]*)'[ \t]*\n([\s\S]*)\n\3[ \t]*\n?$/;

function enrichmentBashVerdict(cmd: string): string | null {
  const refuse = (why: string) =>
    block(
      `enrichment session Bash is limited to \`bun run scripts/{db-read,write-description,auto-gate-check,write-tags,save-batch}.ts …\` — ${why}. For database reads use: bun run scripts/db-read.ts "SELECT …". For long text use: bun run scripts/write-description.ts <id> --batch-dir=… --stdin <<'EOF' (quoted delimiter, text, then EOF on its own line)`,
    );
  let head = cmd;
  const hd = QUOTED_HEREDOC.exec(cmd);
  if (hd) {
    const [, before, dash, delim, body] = hd;
    if (body.split('\n').some((l) => (dash ? l.replace(/^\t+/, '') : l) === delim)) {
      return refuse('the heredoc body contains its own delimiter line');
    }
    head = before;
  }
  // Substitution and expansion would let an argument carry file contents or
  // environment values into a sanctioned script (and from there onto the site).
  if (/`|\$[({[A-Za-z_'"]|[<>]\(/.test(head)) return refuse('command substitution and $VAR expansion are refused');
  const parts = splitTopLevel(head);
  if (!parts) return refuse('unbalanced quoting or an unquoted redirection');
  let { segments, ops } = parts;
  if (ops[0] === '&&' && isCdToRepo(segments[0])) {
    segments = segments.slice(1);
    ops = ops.slice(1);
  }
  if (!SANCTIONED_ENRICHMENT_CMD.test(segments[0])) return refuse(`refused: ${cmd.slice(0, 80)}`);
  if (ops.length === 0) return null;
  if (ops.length === 1 && ops[0] === '|' && PIPE_FILTER.test(segments[1])) return null;
  return refuse('chained or piped commands are refused (a trailing `| head|tail|wc -N` is the only pipe allowed)');
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
  const profile = sessionProfile();
  if (profile === 'enrichment' && outOfEnrichmentScope(p)) {
    return block(
      `enrichment session may only write under ${ENRICHMENT_WRITE_DIRS.map(d => `${d}/`).join(', ')} — refused: ${p}`,
    );
  }
  if (profile === 'unattended') return scopedPathVerdict(p, scopeRoots(profile), 'Write');
  return null;
}

function collectPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof input.file_path === 'string') out.push(input.file_path);
  if (typeof input.notebook_path === 'string') out.push(input.notebook_path);
  // MCP filesystem tools use path / source / destination instead of file_path.
  if (typeof input.path === 'string') out.push(input.path);
  if (typeof input.source === 'string') out.push(input.source);
  if (typeof input.destination === 'string') out.push(input.destination);
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
    // Security loop round 1: the shell accepts ANY unambiguous prefix of a
    // dot-command (.sh = .shell, .syst = .system), so a list of full names is
    // not a boundary. No dot-command at all — at the start of the command, of
    // an argument, of a line, or after a backslash escape.
    if (/(^|[\s"'\\])\.[A-Za-z]/.test(cmd)) {
      return block('sqlite3 dot-commands are refused (any, abbreviated or not) — use SQL, e.g. SELECT sql FROM sqlite_master');
    }
    // The CLI's built-in file functions are not restrained by -readonly:
    // writefile/edit write files and run an editor command, readfile/fsdir/
    // zipfile read the host, load_extension/fts3_tokenizer load code.
    if (/\b(writefile|readfile|load_extension|fts3_tokenizer|fsdir|zipfile|sqlar_compress|sqlar_uncompress)\b/i.test(cmd) || /\bedit\b[^\w(]*\(/i.test(cmd)) {
      return block('sqlite3 file/extension functions are refused (writefile, readfile, edit, load_extension, …)');
    }
    // VACUUM INTO writes a copy of the database to any path, even from a
    // read-only connection.
    if (/\bvacuum\b/i.test(cmd)) return block('VACUUM (INTO) writes files even under -readonly');
    // Anything that could build the SQL outside the visible text: stdin from a
    // pipe or redirection (printf '\x2e…'), command substitution, $'…' and
    // $VAR expansion.
    if (/[`$]/.test(cmd)) return block('sqlite3 with shell substitution or expansion is refused');
    if (/\|\s*sqlite3\b/.test(cmd) || /\bsqlite3\b[^|;&]*</.test(cmd)) return block('sqlite3 reading commands from stdin is refused');
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
  const profile = sessionProfile();

  if (profile !== 'interactive' && !PROFILE_TOOLS[profile].has(tool_name)) {
    return block(`${tool_name} is not available in an unattended ${profile} session (fail closed)`);
  }

  if (tool_name === 'Bash') {
    const cmd = tool_input?.command;
    if (typeof cmd !== 'string') return block('Bash call with no command string (fail closed)');
    return bashVerdict(cmd) ?? (profile === 'enrichment' ? enrichmentBashVerdict(cmd)
      : profile === 'unattended' ? unattendedBashVerdict(cmd, scopeRoots(profile)) : null);
  }

  if (profile !== 'interactive' && READ_PATH_TOOLS.has(tool_name)) {
    return readToolVerdict(tool_name, tool_input ?? {}, scopeRoots(profile));
  }

  if (isFileTool(tool_name)) {
    const paths = collectPaths(tool_input ?? {});
    if (paths.length === 0) return block(`${tool_name} call with no inspectable path (fail closed)`);
    for (const p of paths) {
      const v = pathVerdict(p);
      if (v) return v;
    }
    return null;
  }

  return null; // interactive: uninspected tools pass; unattended: allowlisted (WebSearch, TodoWrite, …)
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
