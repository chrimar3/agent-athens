import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'fs';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { verdict } from '../scripts/hooks/db-guard';

const ROOT = resolve(import.meta.dir, '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'db-guard.ts');
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });
const file = (tool_name: string, file_path: string) => ({ tool_name, tool_input: { file_path } });

describe('db-guard: direct destruction', () => {
  test('sqlite3 DELETE against events.db', () => {
    expect(verdict(bash('sqlite3 data/events.db "DELETE FROM events;"'))).toContain('db-guard');
  });
  test('sqlite3 DROP TABLE', () => {
    expect(verdict(bash("sqlite3 data/events.db 'DROP TABLE events'"))).toContain('db-guard');
  });
  test('sqlite3 without -readonly, even for SELECT', () => {
    expect(verdict(bash('sqlite3 data/events.db "SELECT COUNT(*) FROM events"'))).toContain('db-guard');
  });
  test('rm of the db file', () => {
    expect(verdict(bash('rm -f data/events.db'))).toContain('db-guard');
  });
  test('redirection over the db file', () => {
    expect(verdict(bash('echo corrupted > data/events.db'))).toContain('db-guard');
  });
});

describe('db-guard: bypasses that defeated the first implementation', () => {
  // Each of these returned null (allow) from the draft hook.
  test('chained command after a harmless readonly prefix', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT 1" && rm -f data/events.db'))).toContain('db-guard');
  });
  test('WAL sidecar deletion (DB runs in WAL mode; sidecars hold committed txns)', () => {
    expect(verdict(bash('rm data/events.db-wal'))).toContain('db-guard');
  });
  test('WAL sidecar via the Write tool', () => {
    expect(verdict(file('Write', 'data/events.db-wal'))).toContain('db-guard');
  });
  test('directory-level deletion with no .db substring', () => {
    expect(verdict(bash('rm -rf data'))).toContain('db-guard');
  });
  test('backups directory deletion (S194: DB loss + backup loss is the catastrophe)', () => {
    expect(verdict(bash('rm -rf ~/agent-athens-backups'))).toContain('db-guard');
  });
  test('sqlite3 dot-command shelling out under -readonly', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db ".shell rm data/events.db"'))).toContain('db-guard');
  });
  test('sqlite3 .open re-opens read-write', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db ".open data/events.db"'))).toContain('db-guard');
  });
  test('ATTACH under -readonly', () => {
    expect(verdict(bash(`sqlite3 -readonly data/events.db "ATTACH 'x.db' AS w"`))).toContain('db-guard');
  });
  test('URI filename upgrading the open mode', () => {
    expect(verdict(bash('sqlite3 -readonly "file:data/events.db?mode=rwc" "DELETE FROM events"'))).toContain('db-guard');
  });
  test('sqlite3 -init runs dot-commands from a file the session can write (2026-09-17 Codex: `.shell` via -init escaped every check)', () => {
    expect(verdict(bash('sqlite3 -readonly -init temp-descriptions/batch-1/payload.sql :memory: "select 1"'))).toContain('db-guard');
    expect(verdict(bash('sqlite3 -readonly --init temp-descriptions/batch-1/payload.sql data/events.db "select 1"'))).toContain('db-guard');
  });
  test('sqlite3 -cmd and -A (archive extract writes files) are refused too', () => {
    expect(verdict(bash('sqlite3 -readonly -cmd "select 1" data/events.db'))).toContain('db-guard');
    expect(verdict(bash('sqlite3 -readonly -A --extract temp-descriptions/x.zip'))).toContain('db-guard');
  });
  test('a plain read-only query is still allowed (the grant must stay usable)', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT title FROM events LIMIT 3"'))).toBeNull();
  });

  test('mcp__filesystem__write_file to the DB is blocked (the hook was blind to mcp__* file tools — 2026-09-17 Codex)', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'data/events.db' } })).toContain('db-guard');
  });
  test('mcp__filesystem__edit_file to a protected file is blocked', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__edit_file', tool_input: { path: '.claude/settings.json' } })).toContain('db-guard');
  });
  test('mcp__filesystem__move_file is inspected on BOTH source and destination', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__move_file', tool_input: { source: 'x.txt', destination: 'data/events.db' } })).toContain('db-guard');
  });
  test('a non-file mcp tool (read) still passes through', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__read_file', tool_input: { path: 'data/events.db' } })).toBeNull();
  });

  test('find -delete (Bash(find *) was granted until Task 1)', () => {
    expect(verdict(bash(`find . -name '*.db' -delete`))).toContain('db-guard');
  });
  test('git clean removes the gitignored DB and sidecars', () => {
    expect(verdict(bash('git clean -fdx'))).toContain('db-guard');
  });
  test('interpreter eval driving bun:sqlite', () => {
    expect(
      verdict(bash(`bun -e 'new (require("bun:sqlite").Database)("data/events.db").run("DELETE FROM events")'`)),
    ).toContain('db-guard');
  });
  test('tee as an overwrite verb', () => {
    expect(verdict(bash('tee data/events.db < /dev/null'))).toContain('db-guard');
  });
  test('clobber redirect form >|', () => {
    expect(verdict(bash('cat /dev/null >| data/events.db'))).toContain('db-guard');
  });
  test('cp over the db (silent rollback to stale data)', () => {
    expect(verdict(bash('cp old-backup.db data/events.db'))).toContain('db-guard');
  });
});

describe('db-guard: self-protection (the critical bypass)', () => {
  // Rewrite a sanctioned script, then invoke it legitimately.
  test('Write to a sanctioned enrichment script', () => {
    expect(verdict(file('Write', 'scripts/write-description.ts'))).toContain('db-guard');
  });
  test('Edit of the hook itself', () => {
    expect(verdict(file('Edit', 'scripts/hooks/db-guard.ts'))).toContain('db-guard');
  });
  test('Write to the settings file that wires the hook', () => {
    expect(verdict(file('Write', '.claude/settings.json'))).toContain('db-guard');
  });
  test('Write to the bunfig preload wiring', () => {
    expect(verdict(file('Write', 'bunfig.toml'))).toContain('db-guard');
  });
  test('MultiEdit is inspected too (matcher catches it; verdict must not ignore it)', () => {
    expect(
      verdict({ tool_name: 'MultiEdit', tool_input: { edits: [{ file_path: 'data/events.db' }] } }),
    ).toContain('db-guard');
  });
  test('NotebookEdit path field is inspected', () => {
    expect(verdict({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'data/events.db' } })).toContain('db-guard');
  });
});

describe('db-guard: legitimate work must not be blocked', () => {
  test('readonly SELECT', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events"'))).toBeNull();
  });
  test('double-dash --readonly spelling', () => {
    expect(verdict(bash('sqlite3 --readonly data/events.db "SELECT 1"'))).toBeNull();
  });
  test('the four sanctioned enrichment commands', () => {
    const sanctioned = [
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "text"',
      'bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/ev-1.md --tier=standard --event-id=ev-1',
      'bun run scripts/write-tags.ts ev-1 --batch-dir=temp-descriptions/batch-1 Music LiveMusic',
      'bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean',
    ];
    for (const c of sanctioned) expect(verdict(bash(c))).toBeNull();
  });
  test('concerns.jsonl write in the batch dir', () => {
    expect(verdict(file('Write', 'temp-descriptions/batch-1/concerns.jsonl'))).toBeNull();
  });
  test('ordinary shell and source edits', () => {
    expect(verdict(bash('ls -la temp-descriptions'))).toBeNull();
    expect(verdict(file('Edit', 'src/generate-site.ts'))).toBeNull();
    expect(verdict(file('Edit', '.claude/notes/mistakes.md'))).toBeNull();
  });
  test('non-file tools are ignored', () => {
    expect(verdict({ tool_name: 'WebSearch', tool_input: { query: 'venue events.db' } })).toBeNull();
  });
});

describe('db-guard: process contract', () => {
  const run = (payload: unknown, env?: Record<string, string>) =>
    Bun.spawnSync(['bun', 'run', HOOK], {
      stdin: new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)),
      env: { ...process.env, ...env },
    });

  test('exit 2 and a stderr reason when blocking', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'sqlite3 data/events.db "DELETE FROM events"' } });
    expect(r.exitCode).toBe(2);
    expect(new TextDecoder().decode(r.stderr)).toContain('db-guard');
  });

  test('exit 0 when allowing', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }).exitCode).toBe(0);
  });

  test('unparseable stdin fails closed', () => {
    expect(run('this is not json').exitCode).toBe(2);
  });

  test('missing tool_input fails closed rather than throwing', () => {
    expect(run({ tool_name: 'Bash' }).exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Enrichment-session write scope.
// scripts/auto-enrich.sh grants the headless session the Write tool; the
// session reads scraped pages, so a prompt injection could rewrite a module
// that a sanctioned script imports (src/utils/tag-filter.ts) and then invoke
// the sanctioned script legitimately. PROTECTED_FILES covers the four entry
// scripts only — it cannot enumerate their import graph. Under
// AA_ENRICHMENT_SESSION the hook inverts to an allowlist instead.
// ---------------------------------------------------------------------------
describe('db-guard: enrichment-session write scope', () => {
  beforeEach(() => {
    process.env.AA_ENRICHMENT_SESSION = '1';
  });
  afterEach(() => {
    delete process.env.AA_ENRICHMENT_SESSION;
  });

  test('Write to a module imported by a sanctioned script is blocked', () => {
    const v = verdict(file('Write', 'src/utils/tag-filter.ts'));
    expect(v).toContain('db-guard');
    expect(v).toContain('temp-descriptions');
  });

  test('Edit of a sanctioned script stays blocked (PROTECTED_FILES still applies)', () => {
    expect(verdict(file('Edit', 'scripts/save-batch.ts'))).toContain('db-guard');
  });

  test('Write inside the batch output directory is allowed', () => {
    expect(verdict(file('Write', 'temp-descriptions/batch-1/ev-1.md'))).toBeNull();
    expect(verdict(file('Write', 'temp-descriptions/batch-1/concerns.jsonl'))).toBeNull();
    expect(verdict(file('Write', './temp-descriptions/batch-1/batch-1-review.md'))).toBeNull();
  });

  test('absolute path inside the output directory is allowed', () => {
    expect(verdict(file('Write', join(ROOT, 'temp-descriptions', 'batch-1', 'ev-1.md')))).toBeNull();
  });

  test('MultiEdit is blocked when any one path escapes the scope', () => {
    expect(
      verdict({
        tool_name: 'MultiEdit',
        tool_input: {
          edits: [
            { file_path: 'temp-descriptions/batch-1/ev-1.md' },
            { file_path: 'src/utils/tag-filter.ts' },
          ],
        },
      }),
    ).toContain('db-guard');
  });

  test('traversal out of the output directory is blocked', () => {
    expect(verdict(file('Write', 'temp-descriptions/../src/utils/tag-filter.ts'))).toContain('db-guard');
    expect(verdict(file('Write', './temp-descriptions/batch-1/../../src/x.ts'))).toContain('db-guard');
    expect(verdict(file('Write', join(ROOT, 'temp-descriptions', '..', 'src', 'x.ts')))).toContain('db-guard');
  });

  test('a path outside the repo is blocked', () => {
    expect(verdict(file('Write', '/Users/chrism/.zshrc'))).toContain('db-guard');
    expect(verdict(file('Write', 'temp-briefs/batch-1.manifest.json'))).toContain('db-guard');
  });

  // Updated deliberately (security loop round 1): an enrichment session now
  // refuses every tool outside its allowlist, MCP file tools included — even
  // a write the path scope alone would have allowed.
  test('an mcp__filesystem__write_file is refused in an enrichment session, inside temp-descriptions/ too (fail closed)', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'src/utils/tag-filter.ts' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'temp-descriptions/batch-1/ev.md' } })).toContain('db-guard');
  });

  test("the session's own auto-memory directory is refused on purpose (learned memory is an instruction channel — Codex 2026-09-16 default #12 / astra #13; observed live 2026-09-17: 14 refusals, batches unaffected)", () => {
    expect(verdict(file('Write', '/Users/chrism/.claude/projects/-Users-chrism-Project-with-Claude-AgentAthens-agent-athens/memory/venue-facts.md'))).toContain('db-guard');
    expect(verdict(file('Edit', '/Users/chrism/.claude/projects/-Users-chrism-Project-with-Claude-AgentAthens-agent-athens/memory/MEMORY.md'))).toContain('db-guard');
  });

  test('a symlink under temp-descriptions/ pointing outside is refused — as a directory and as the target file (lexical checks alone followed it)', () => {
    const outside = mkdtempSync(join(tmpdir(), 'aa-guard-symlink-'));
    const linkDir = join(ROOT, 'temp-descriptions', `__link-dir-${process.pid}`);
    const realDir = join(ROOT, 'temp-descriptions', `__real-dir-${process.pid}`);
    try {
      mkdirSync(join(ROOT, 'temp-descriptions'), { recursive: true });
      symlinkSync(outside, linkDir);
      mkdirSync(realDir, { recursive: true });
      writeFileSync(join(outside, 'target.md'), 'x');
      symlinkSync(join(outside, 'target.md'), join(realDir, 'ev-1.md'));
      expect(verdict(file('Write', `temp-descriptions/__link-dir-${process.pid}/ev-1.md`))).toContain('db-guard');
      expect(verdict(file('Write', `temp-descriptions/__real-dir-${process.pid}/ev-1.md`))).toContain('db-guard');
      // and the same real directory with a plain new file stays allowed
      expect(verdict(file('Write', `temp-descriptions/__real-dir-${process.pid}/ev-2.md`))).toBeNull();
    } finally {
      rmSync(linkDir, { force: true });
      rmSync(realDir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('a sibling directory that merely shares the prefix is blocked', () => {
    expect(verdict(file('Write', 'temp-descriptions-evil/x.md'))).toContain('db-guard');
  });

  test('NotebookEdit path field is scoped too', () => {
    expect(verdict({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'src/x.ipynb' } })).toContain('db-guard');
  });

  // Updated deliberately (security loop round 1): the enrichment session no
  // longer holds the sqlite3 shell at all — its DB reads go through
  // scripts/db-read.ts — so a raw sqlite3 call is now refused inside it.
  test('sanctioned Bash and research tools pass; the sqlite3 shell does not (reads go through db-read.ts)', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT 1"'))).toContain('db-guard');
    expect(verdict(bash('bun run scripts/db-read.ts "SELECT 1"'))).toBeNull();
    expect(
      verdict(bash('bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean')),
    ).toBeNull();
    expect(verdict({ tool_name: 'WebSearch', tool_input: { query: 'venue' } })).toBeNull();
  });
});

describe('db-guard: scope applies only inside an enrichment session', () => {
  test('without AA_ENRICHMENT_SESSION, source edits stay allowed', () => {
    delete process.env.AA_ENRICHMENT_SESSION;
    expect(verdict(file('Write', 'src/utils/tag-filter.ts'))).toBeNull();
    expect(verdict(file('Edit', 'src/generate-site.ts'))).toBeNull();
    expect(verdict(file('Write', 'temp-briefs/batch-1.manifest.json'))).toBeNull();
    expect(verdict(file('Write', '.claude/notes/mistakes.md'))).toBeNull();
  });

  test('process contract: the env var reaches a spawned hook (exit 2 + stderr)', () => {
    const r = Bun.spawnSync(['bun', 'run', HOOK], {
      stdin: new TextEncoder().encode(
        JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'src/utils/tag-filter.ts' } }),
      ),
      env: { ...process.env, AA_ENRICHMENT_SESSION: '1' },
    });
    expect(r.exitCode).toBe(2);
    expect(new TextDecoder().decode(r.stderr)).toContain('enrichment session may only write under');
  });
});

// ---------------------------------------------------------------------------
// Security loop round 1 — sqlite3 shell escapes (every session).
// The stock sqlite3 CLI compiles in SQL functions that read, write and edit
// host files, and it accepts ANY unambiguous prefix of a dot-command; -readonly
// restrains neither. The earlier word-anchored denylist let both classes
// through, so the rule is now: no file functions, no dot-commands at all, and
// no stdin/substitution route that could smuggle either past the text check.
// ---------------------------------------------------------------------------
describe('db-guard: sqlite3 shell escapes are refused in every session', () => {
  beforeEach(() => {
    delete process.env.AA_ENRICHMENT_SESSION;
    delete process.env.AA_UNATTENDED_SESSION;
  });

  const refused = [
    ['writefile()', `sqlite3 -readonly :memory: "select writefile('src/x.ts','x')"`],
    ['writefile() against the real DB path', `sqlite3 -readonly data/events.db "SELECT writefile('scripts/daily-automated.sh', 'x')"`],
    ['WRITEFILE upper-case', `sqlite3 -readonly data/events.db "SELECT WRITEFILE('a','b')"`],
    ['quoted function name', `sqlite3 -readonly data/events.db 'select "writefile"(1,2)'`],
    ['readfile()', `sqlite3 -readonly data/events.db "select readfile('.env')"`],
    ['edit() runs an editor command', `sqlite3 -readonly data/events.db "select edit('x','sh -c id')"`],
    ['edit () with a space', `sqlite3 -readonly data/events.db "select edit ('x','vi')"`],
    ['load_extension()', `sqlite3 -readonly data/events.db "select load_extension('/tmp/x.dylib')"`],
    ['fts3_tokenizer()', `sqlite3 -readonly data/events.db "select fts3_tokenizer('simple')"`],
    ['fsdir() lists host directories', `sqlite3 -readonly data/events.db "select name from fsdir('/Users')"`],
    ['abbreviated .sh (prefix of .shell)', `sqlite3 -readonly data/events.db ".sh id"`],
    ['abbreviated .syst (prefix of .system)', `sqlite3 -readonly data/events.db ".syst id"`],
    ['abbreviated .ope (prefix of .open)', `sqlite3 -readonly data/events.db ".ope data/events.db"`],
    ['any dot-command, even a harmless-looking one', `sqlite3 -readonly data/events.db ".schema events"`],
    ['dot-command after a newline inside the argument', 'sqlite3 -readonly data/events.db "select 1;\n.sh id"'],
    ['dot-command piped on stdin', `echo '.sh id' | sqlite3 -readonly data/events.db`],
    ['stdin redirected from a file', `sqlite3 -readonly data/events.db < temp-descriptions/batch-1/x.sql`],
    ['printf-escaped dot hidden from the text', `printf '\\x2esh id' | sqlite3 -readonly data/events.db`],
    ['command substitution building the argument', `sqlite3 -readonly data/events.db "$(printf '\\x2esh id')"`],
    ['ANSI-C quoting', `sqlite3 -readonly data/events.db $'\\x2esh id'`],
    ['backtick substitution', 'sqlite3 -readonly data/events.db "`cat x.sql`"'],
    ['variable expansion', 'X=.sh; sqlite3 -readonly data/events.db "$X id"'],
    ['VACUUM INTO writes a copy even on a read-only connection', `sqlite3 -readonly data/events.db "VACUUM INTO '/tmp/copy.db'"`],
  ] as const;
  for (const [name, cmd] of refused) {
    test(`refused: ${name}`, () => {
      expect(verdict(bash(cmd))).toContain('db-guard');
    });
  }

  test('an ordinary read-only SELECT (with table-qualified columns) is still allowed interactively', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT e.title, e.start_date FROM events e LIMIT 3"'))).toBeNull();
    expect(verdict(bash("sqlite3 -readonly data/events.db \"SELECT COUNT(*) FROM events WHERE notes LIKE '%edited%'\""))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Security loop round 1 — unattended sessions read scraped text, so reading is
// a boundary too: Read/Glob/Grep may not leave the repo or touch secrets even
// inside it, Bash is limited to the sanctioned commands, and tools the hook
// does not know are refused (fail closed).
// ---------------------------------------------------------------------------
describe('db-guard: enrichment-session read scope and fail-closed tools', () => {
  beforeEach(() => {
    process.env.AA_ENRICHMENT_SESSION = '1';
  });
  afterEach(() => {
    delete process.env.AA_ENRICHMENT_SESSION;
  });

  const read = (file_path: string) => ({ tool_name: 'Read', tool_input: { file_path } });
  const HOME = process.env.HOME ?? '/root';

  const secretReads = [
    '.env',
    './.env',
    '.env.local',
    '.env.production',
    join(ROOT, '.env'),
    'config/../.env',
    '.netlify/state.json',
    '.git/config',
    'certs/server.pem',
    'config/deploy.key',
    'config/gcp-credentials.json',
    'docs/client_secret.json',
    '~/.config/agentathens/gcp-kpi-reader.json',
    '~/.ssh/id_ed25519',
    `${HOME}/.ssh/id_rsa`,
    `${HOME}/.config/netlify/config.json`,
    '/etc/passwd',
    '/Users/chrism/Library/Preferences/netlify/config.json',
    '../agent-athens-phase3/.env',
    '$HOME/.ssh/id_rsa',
  ];
  for (const p of secretReads) {
    test(`Read refused: ${p}`, () => {
      expect(verdict(read(p))).toContain('db-guard');
    });
  }

  test('Glob refused outside the repo, into secret dirs, or with an absolute pattern that escapes', () => {
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: '*', path: `${HOME}/.ssh` } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: '**/*', path: '~/.config' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: '/Users/chrism/.ssh/*' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: '../**/.env' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: '**', path: '.netlify' } })).toContain('db-guard');
  });

  test('Grep refused outside the repo, on a secret file, and over the repo root (which holds .env/.git)', () => {
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'KEY', path: `${HOME}/.config/agentathens` } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'PASS', path: '.env' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'PASS' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'PASS', path: '.' } })).toContain('db-guard');
  });

  test('a Grep over a subdirectory that holds a secret-named file is refused (ripgrep would descend into it)', () => {
    const dir = join(ROOT, 'temp-descriptions', `__secret-scan-${process.pid}`);
    try {
      mkdirSync(join(dir, 'nested'), { recursive: true });
      writeFileSync(join(dir, 'nested', '.env'), 'X=1');
      expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'X', path: `temp-descriptions/__secret-scan-${process.pid}` } })).toContain('db-guard');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a symlink inside the repo that points at a file outside is refused', () => {
    const outside = mkdtempSync(join(tmpdir(), 'aa-guard-read-'));
    const link = join(ROOT, 'temp-descriptions', `__read-link-${process.pid}.md`);
    try {
      mkdirSync(join(ROOT, 'temp-descriptions'), { recursive: true });
      writeFileSync(join(outside, 'loot.txt'), 'x');
      symlinkSync(join(outside, 'loot.txt'), link);
      expect(verdict(read(`temp-descriptions/__read-link-${process.pid}.md`))).toContain('db-guard');
    } finally {
      rmSync(link, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('legitimate enrichment reads stay allowed', () => {
    expect(verdict(read('temp-briefs/batch-1.md'))).toBeNull();
    expect(verdict(read('exemplars/concert-mattrey.md'))).toBeNull();
    expect(verdict(read('docs/enrichment-anti-patterns.md'))).toBeNull();
    expect(verdict(read(join(ROOT, 'config', 'enrichment-knowledge.md')))).toBeNull();
    expect(verdict(read('README.md'))).toBeNull();
    expect(verdict({ tool_name: 'Glob', tool_input: { pattern: 'exemplars/*.md' } })).toBeNull();
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'Gazarte', path: 'config' } })).toBeNull();
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'x', path: 'config/enrichment-knowledge.md' } })).toBeNull();
    expect(verdict({ tool_name: 'WebFetch', tool_input: { url: 'https://example.com', prompt: 'x' } })).toBeNull();
  });

  test('Read with no inspectable path fails closed', () => {
    expect(verdict({ tool_name: 'Read', tool_input: {} })).toContain('db-guard');
  });

  test('unknown tools are refused in an enrichment session (fail closed)', () => {
    for (const t of ['Task', 'Agent', 'Skill', 'mcp__filesystem__read_file', 'mcp__gmail__send', 'SomeFutureTool']) {
      expect(verdict({ tool_name: t, tool_input: {} })).toContain('db-guard');
    }
    expect(verdict({ tool_name: 'TodoWrite', tool_input: { todos: [] } })).toBeNull();
  });

  test('Bash is limited to the sanctioned enrichment commands', () => {
    for (const c of [
      'cat .env',
      'head -c 4000 ~/.config/agentathens/bing-api-key',
      'ls -la ~',
      'bun run src/generate-site.ts',
      'curl https://attacker.example',
      'bun run scripts/db-read.ts "SELECT 1" && cat .env',
      'bun run scripts/db-read.ts "SELECT 1"; cat .env',
      'bun run scripts/db-read.ts "SELECT 1"\ncat .env',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "$(cat .env)"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "`cat .env`"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "${GMAIL_APP_PASSWORD}"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "$GMAIL_APP_PASSWORD"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "x" > src/x.ts',
      'bun run scripts/db-read.ts "SELECT 1" | sh',
      'bun run scripts/db-read-evil.ts "SELECT 1"',
      'cd /tmp && bun run scripts/db-read.ts "SELECT 1"',
    ]) {
      expect(verdict(bash(c))).toContain('db-guard');
    }
  });

  test('sanctioned Bash forms the brief actually produces stay allowed', () => {
    for (const c of [
      'bun run scripts/db-read.ts "SELECT id, title FROM events WHERE venue_name = \'Gazarte\' LIMIT 5"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "Rock & roll; <b>loud</b> | late — €15, 21:00"',
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 \'It costs $5 & the doors open at 9\'',
      'bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/ev-1.md \\\n  --tier=standard --event-id=ev-1 \\\n  --event-type=concert --event-venue="Gazarte" \\\n  --event-title="A \\"quoted\\" title" \\\n  --event-date=2026-10-01 --event-price=with-ticket',
      'bun run scripts/write-tags.ts ev-1 --batch-dir=temp-descriptions/batch-1 Music LiveMusic',
      'bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean 2>&1',
      'bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean 2>&1 | tail -40',
      `cd ${ROOT} && bun run scripts/db-read.ts "SELECT 1"`,
      // write-description.ts --stdin with a QUOTED heredoc: bash expands nothing
      // in the body, so text that looks like substitution is inert.
      "bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 --stdin <<'EOF'\nLine one with $(not run) and `not run` and $HOME.\n\nSecond paragraph.\nEOF",
      "bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 --stdin <<'DESC'\ntext\nDESC\n",
    ]) {
      expect(verdict(bash(c))).toBeNull();
    }
  });

  test('heredoc forms that would expand or smuggle a command are refused', () => {
    for (const c of [
      // unquoted delimiter: the body is expanded by bash
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 --stdin <<EOF\n$(cat .env)\nEOF',
      // a delimiter line inside the body ends the heredoc early; the next line runs
      "bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 --stdin <<'EOF'\ntext\nEOF\ncat .env\nEOF",
      // the substitution form agents use for commit messages runs a command
      "bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 \"$(cat <<'EOF'\ntext\nEOF\n)\"",
      // heredoc feeding a non-sanctioned command
      "cat <<'EOF' | bun run scripts/write-description.ts ev-1 --stdin\ntext\nEOF",
    ]) {
      expect(verdict(bash(c))).toContain('db-guard');
    }
  });

  test('db-read.ts is self-protected like the other sanctioned scripts', () => {
    delete process.env.AA_ENRICHMENT_SESSION;
    expect(verdict(file('Write', 'scripts/db-read.ts'))).toContain('db-guard');
  });
});

describe('db-guard: generic unattended session (phase3-weekly)', () => {
  const EXTRA = mkdtempSync(join(tmpdir(), 'aa-guard-extra-'));
  beforeEach(() => {
    delete process.env.AA_ENRICHMENT_SESSION;
    process.env.AA_UNATTENDED_SESSION = 'phase3';
    process.env.AA_SESSION_EXTRA_ROOTS = EXTRA;
  });
  afterEach(() => {
    delete process.env.AA_UNATTENDED_SESSION;
    delete process.env.AA_SESSION_EXTRA_ROOTS;
  });

  test('reads and writes inside the repo and the declared extra root are allowed', () => {
    expect(verdict(file('Edit', 'src/generate-site.ts'))).toBeNull();
    expect(verdict(file('Write', join(EXTRA, 'PHASE3-LOG.md')))).toBeNull();
    expect(verdict({ tool_name: 'Read', tool_input: { file_path: join(EXTRA, 'T2-SURFACE-MAP.md') } })).toBeNull();
    expect(verdict(bash('bun test'))).toBeNull();
  });

  test('secrets and out-of-scope paths are refused for reads and writes', () => {
    expect(verdict({ tool_name: 'Read', tool_input: { file_path: '.env' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'Read', tool_input: { file_path: '~/.config/agentathens/perplexity-api-key' } })).toContain('db-guard');
    expect(verdict(file('Write', '/Users/chrism/.zshrc'))).toContain('db-guard');
    expect(verdict(file('Write', '.git/hooks/pre-commit'))).toContain('db-guard');
    expect(verdict(file('Edit', 'scripts/hooks/db-guard.ts'))).toContain('db-guard');
  });

  test('unknown tools are refused (fail closed); web tools are not part of this profile', () => {
    for (const t of ['WebFetch', 'WebSearch', 'mcp__slack__post', 'Skill']) {
      expect(verdict({ tool_name: t, tool_input: {} })).toContain('db-guard');
    }
  });
});

describe('db-guard: interactive sessions keep their read behaviour', () => {
  test('Read/Glob/Grep and unknown tools are not scoped when no unattended profile is set', () => {
    delete process.env.AA_ENRICHMENT_SESSION;
    delete process.env.AA_UNATTENDED_SESSION;
    expect(verdict({ tool_name: 'Read', tool_input: { file_path: '.env' } })).toBeNull();
    expect(verdict({ tool_name: 'Grep', tool_input: { pattern: 'x' } })).toBeNull();
    expect(verdict({ tool_name: 'SomeFutureTool', tool_input: {} })).toBeNull();
  });
});

describe('db-guard: process contract for the new read scope', () => {
  test('a spawned hook refuses Read of .env with exit 2 under AA_ENRICHMENT_SESSION', () => {
    const r = Bun.spawnSync(['bun', 'run', HOOK], {
      stdin: new TextEncoder().encode(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '.env' } })),
      env: { ...process.env, AA_ENRICHMENT_SESSION: '1' },
    });
    expect(r.exitCode).toBe(2);
    expect(new TextDecoder().decode(r.stderr)).toContain('db-guard');
  });
});
