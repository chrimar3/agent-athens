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

  test('an mcp__filesystem__write_file outside temp-descriptions/ is refused in an enrichment session', () => {
    expect(verdict({ tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'src/utils/tag-filter.ts' } })).toContain('db-guard');
    expect(verdict({ tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'temp-descriptions/batch-1/ev.md' } })).toBeNull();
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

  test('Bash and non-file tools are unaffected by the scope', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT 1"'))).toBeNull();
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
