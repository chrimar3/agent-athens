/**
 * Pins the DB tool boundary (see .claude/notes/decisions.md, "DB Tool Boundary").
 *
 * These assertions fail if the permission deny block is removed, the sqlite3
 * grant is re-widened, or the enrichment allowlist reverts to bare Bash — so
 * "the boundary exists" is itself under test, the same self-defending pattern
 * as tests/prod-db-guard.test.ts.
 *
 * SECURITY_PINS_SETTINGS_PATH overrides the settings file under test so the
 * mutation gate can run against a scratchpad copy instead of disarming the
 * live configuration.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SETTINGS_PATH = process.env.SECURITY_PINS_SETTINGS_PATH ?? join(ROOT, '.claude', 'settings.json');
const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
const allow: string[] = settings.permissions?.allow ?? [];
const deny: string[] = settings.permissions?.deny ?? [];

describe('permission allowlist', () => {
  test('no sqlite3 grant without -readonly', () => {
    expect(allow.filter((r) => r.includes('sqlite3') && !r.includes('-readonly'))).toEqual([]);
  });

  test('read-only sqlite3 grant is present (reads must stay frictionless)', () => {
    expect(allow.some((r) => r.includes('sqlite3') && r.includes('-readonly'))).toBe(true);
  });

  test('no bare file-reading shell grants (cat/head/tail/grep read any path; the Read/Grep tools are hook-scoped instead)', () => {
    expect(allow.filter((r) => /^Bash\((cat|head|tail|grep|less|more)[ :*)]/.test(r))).toEqual([]);
  });

  test('no bare find grant (find supports -delete and -exec rm)', () => {
    expect(allow.filter((r) => /^Bash\(find[ (:]/.test(r))).toEqual([]);
  });
});

describe('permission deny block', () => {
  // Deny is the only rule class an additive --allowedTools cannot out-vote.
  // Verified 2026-07-29: --disallowedTools overrode a settings allow rule.
  const REQUIRED_DENY = [
    'Bash(rm:*)',
    'Bash(mv:*)',
    'Bash(dd:*)',
    'Bash(tee:*)',
    'Bash(truncate:*)',
    'Bash(shred:*)',
    'Bash(git clean:*)',
    'Write(./data/**)',
    'Edit(./data/**)',
    'Write(./scripts/hooks/**)',
    'Edit(./scripts/hooks/**)',
    'Write(./.claude/settings.json)',
    'Edit(./.claude/settings.json)',
    'Write(./bunfig.toml)',
    'Edit(./bunfig.toml)',
    'Write(./tests/preload/**)',
    'Edit(./tests/preload/**)',
  ];

  test('every required deny rule is present', () => {
    expect(REQUIRED_DENY.filter((r) => !deny.includes(r))).toEqual([]);
  });
});

describe('db-guard hook wiring', () => {
  // Claude Code matcher semantics: "*" or "" matches every tool; otherwise a
  // regex over the tool name.
  const matches = (matcher: string, tool: string) =>
    matcher === '*' || matcher === '' || new RegExp(`^(?:${matcher})$`).test(tool);
  const pre: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }> = settings?.hooks?.PreToolUse ?? [];
  const entry = pre.find((e) => e.hooks?.some((h) => h.command?.includes('db-guard.ts')));

  test('PreToolUse wires db-guard', () => {
    expect(entry).toBeDefined();
  });

  test('the matcher covers the write tools and mcp filesystem write tools (else an mcp write to the DB bypasses the hook)', () => {
    for (const t of ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'mcp__filesystem__write_file', 'mcp__filesystem__edit_file', 'mcp__filesystem__move_file', 'mcp__filesystem__create_directory']) {
      expect(matches(entry!.matcher ?? '', t)).toBe(true);
    }
  });

  // Updated deliberately (security loop round 1). This used to pin that read
  // tools were NOT matched; the unattended profiles now scope Read/Glob/Grep
  // and refuse unknown tools, which the hook can only do if it sees them.
  test('the matcher covers read tools, web tools and tools it has never heard of (fail closed needs to see every tool)', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'mcp__filesystem__read_file', 'SomeFutureTool']) {
      expect(matches(entry!.matcher ?? '', t)).toBe(true);
    }
  });
});

describe('auto-enrich allowlist', () => {
  test('grants no bare Bash (the 2026-07-28 audit gap)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('ALLOWED_TOOLS='));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/Bash(?!\()/); // "Bash" allowed only as "Bash(…)"
    for (const s of ['write-description.ts', 'auto-gate-check.ts', 'write-tags.ts', 'save-batch.ts']) {
      expect(line).toContain(s);
    }
  });

  test('grants the BARE Write tool: a path-scoped Write(...) rule denies every Write under `claude -p` (2026-09-16/17: 0 successful writes in four production runs)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('ALLOWED_TOOLS='));
    expect(line).toBeDefined();
    expect(line!).toMatch(/[",]Write[",]/);
    expect(line!).not.toMatch(/Write\(/);
  });

  // Updated deliberately (security loop round 1): the export used to sit after
  // the warm-up and auth pre-check so only batch sessions were scoped. It is
  // now unconditional and first, so no `claude` process this script starts
  // runs unscoped, and the guard self-test runs under the same env.
  test('AA_ENRICHMENT_SESSION is exported unconditionally, before every claude invocation and the guard self-test', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const exported = src.indexOf('export AA_ENRICHMENT_SESSION=1');
    const selfTest = src.indexOf('run_guard_selftest()');
    const warmUp = src.indexOf('"$CLAUDE_BIN" -p "echo ready"');
    const authCheck = src.indexOf('"$CLAUDE_BIN" -p --output-format json');
    const batch = src.indexOf('"$CLAUDE_BIN" -p "$BRIEF_CONTENT"');
    for (const i of [exported, selfTest, warmUp, authCheck, batch]) expect(i).toBeGreaterThan(-1);
    for (const i of [selfTest, warmUp, authCheck, batch]) expect(exported).toBeLessThan(i);
    // exported exactly once, at top level (not inside the batch loop)
    expect(src.split('export AA_ENRICHMENT_SESSION=1').length).toBe(2);
    expect(src.split('\n').find((l) => l.includes('export AA_ENRICHMENT_SESSION=1'))).toBe('export AA_ENRICHMENT_SESSION=1');
  });

  // Replaces the 2026-08-11 pin "read-only sqlite3 stays available to headless
  // sessions": the sqlite3 shell's writefile()/edit() and abbreviated
  // dot-commands made that grant an arbitrary file write. Reads now go through
  // scripts/db-read.ts, which keeps research unblocked (the canary lesson).
  test('no sqlite3 shell in the enrichment allowlist; db-read.ts is the read path', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('ALLOWED_TOOLS='));
    expect(line).toBeDefined();
    expect(line!).not.toContain('sqlite3');
    expect(line!).toContain('Bash(bun run scripts/db-read.ts *)');
  });

  test('the guard self-test runs before any batch session is launched', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const call = src.indexOf('run_guard_selftest || exit 1');
    const batch = src.indexOf('"$CLAUDE_BIN" -p "$BRIEF_CONTENT"');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(batch);
  });
});

describe('phase3-weekly session', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'phase3-weekly.sh'), 'utf8');
  const invocation = src.split('\n').find((l) => l.includes('"$CLAUDE_BIN" -p "$PROMPT"'));

  test('the unattended claude -p call carries an explicit --allowedTools list and the unattended session scope', () => {
    expect(invocation).toBeDefined();
    expect(invocation!).toContain('--allowedTools "$PHASE3_ALLOWED_TOOLS"');
    expect(invocation!).toContain('AA_UNATTENDED_SESSION=phase3');
    expect(invocation!).toContain('AA_SESSION_EXTRA_ROOTS=');
  });

  test('the phase3 allowlist grants no bare Bash, no web tools and no file-reading or remote-reaching shell commands', () => {
    const line = src.split('\n').find((l) => l.startsWith('PHASE3_ALLOWED_TOOLS='));
    expect(line).toBeDefined();
    expect(line!).not.toMatch(/Bash(?!\()/);
    expect(line!).not.toMatch(/WebFetch|WebSearch/);
    expect(line!).not.toMatch(/Bash\((cat|head|tail|grep|curl|wget|sqlite3|git push|git -C|git config|git remote)\b/);
  });
});
