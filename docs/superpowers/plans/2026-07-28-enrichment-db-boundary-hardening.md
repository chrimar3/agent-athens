# Enrichment DB Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it structurally impossible — not merely instructed-against — for a prompt-injected or hallucinating headless enrichment session to delete or corrupt `data/events.db`.

**Architecture:** Three independent deterministic layers, so the loosest layer no longer decides the outcome. Layer 1: the headless `claude -p` tool allowlist shrinks from bare `Bash` to the four sanctioned `bun run scripts/*.ts` commands. Layer 2: a PreToolUse hook (`scripts/hooks/db-guard.ts`) runs in the harness on every Bash/Write/Edit call and blocks destructive access to `.db` files regardless of what the model was talked into. Layer 3: config-pinning tests in `bun test` fail the suite if anyone ever re-widens the allowlist or unwires the hook.

**Tech Stack:** Bun (runtime + `bun:test`), Claude Code hooks (PreToolUse, exit-2-blocks contract), Claude Code permission rules (`--allowedTools`, `.claude/settings.json`).

## Global Constraints

- Work in `/Users/chrism/Project with Claude/AgentAthens/agent-athens` — a separate nested git repo. Launch Claude Code / run all commands from this directory.
- Branch off `main` first: all work on `hardening/db-tool-boundary`. Never commit to `main` directly.
- Never `git add -A`. Stage by explicit path only.
- TDD: no production code without a failing test observed first. Where a change retrofits a guard onto existing config, the mutation run (break the config, watch the test fail, restore) IS the RED.
- The enrichment pipeline runs on launchd schedules. After allowlist changes, verify via a real `launchctl start` run — never interactive shell alone (established project rule). A silently denied legitimate command causes the known "deploy drought" failure class; the verification task below exists to catch exactly that.
- Do not touch the backup layer (`~/agent-athens-backups/*.db.gz`) or the backup scripts. Backups run outside Claude sessions; hooks do not and must not affect them.
- The hook must FAIL CLOSED (unparseable input → block). Note this is the opposite of the existing PostToolUse tsc hook's `|| true` — that one is advisory, this one is a security boundary.
- The four sanctioned enrichment commands (from `scripts/generate-enrichment-brief.ts` lines 696–721) are the complete legitimate Bash surface of an enrichment session:
  1. `bun run scripts/write-description.ts <id> --batch-dir=<dir> "<text>"`
  2. `bun run scripts/auto-gate-check.ts <file> --tier=... --event-id=... ...`
  3. `bun run scripts/write-tags.ts <id> --batch-dir=<dir> Tag1 Tag2...`
  4. `bun run scripts/save-batch.ts --manifest=... --session=... --batch=... --clean`

---

### Task 1: `db-guard` PreToolUse hook script

**Files:**
- Create: `scripts/hooks/db-guard.ts`
- Test: `tests/db-guard-hook.test.ts`

**Interfaces:**
- Produces: `verdict(input: HookInput): string | null` exported from `scripts/hooks/db-guard.ts` — returns a block-reason string (always containing `db-guard`) or `null` to allow. `HookInput` is `{ tool_name: string; tool_input: Record<string, unknown> }`.
- Produces: process contract used by Task 2's settings wiring — reads hook JSON from stdin; exit 0 = allow, exit 2 = block with reason on stderr; unparseable stdin = exit 2 (fail closed).

- [ ] **Step 1: Create the branch**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"
git checkout main && git checkout -b hardening/db-tool-boundary
```

- [ ] **Step 2: Write the failing tests**

Create `tests/db-guard-hook.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { verdict } from '../scripts/hooks/db-guard';

const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });

describe('db-guard verdict', () => {
  // The canonical attack from the 2026-07-28 audit — this fixture is the
  // reason the guard exists. If this test ever stops matching, the guard
  // has gone vacuous.
  test('blocks the audit scenario: sqlite3 DELETE against events.db', () => {
    expect(verdict(bash('sqlite3 data/events.db "DELETE FROM events;"'))).toContain('db-guard');
  });

  test('blocks DROP TABLE', () => {
    expect(verdict(bash("sqlite3 data/events.db 'DROP TABLE events'"))).toContain('db-guard');
  });

  test('blocks sqlite3 without -readonly even for SELECT', () => {
    expect(verdict(bash('sqlite3 data/events.db "SELECT COUNT(*) FROM events"'))).toContain('db-guard');
  });

  test('allows sqlite3 -readonly SELECT', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events"'))).toBeNull();
  });

  test('blocks ATTACH even under -readonly', () => {
    expect(verdict(bash(`sqlite3 -readonly data/events.db "ATTACH 'x.db' AS w"`))).toContain('db-guard');
  });

  test('blocks rm of a db file', () => {
    expect(verdict(bash('rm -f data/events.db'))).toContain('db-guard');
  });

  test('blocks shell redirection over a db file', () => {
    expect(verdict(bash('echo corrupted > data/events.db'))).toContain('db-guard');
  });

  test('allows the four sanctioned enrichment commands', () => {
    const sanctioned = [
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "text"',
      'bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/ev-1.md --tier=standard --event-id=ev-1',
      'bun run scripts/write-tags.ts ev-1 --batch-dir=temp-descriptions/batch-1 Music LiveMusic',
      'bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean',
    ];
    for (const c of sanctioned) expect(verdict(bash(c))).toBeNull();
  });

  test('allows unrelated shell commands', () => {
    expect(verdict(bash('ls -la temp-descriptions'))).toBeNull();
  });

  test('blocks Write tool targeting the db file', () => {
    expect(verdict({ tool_name: 'Write', tool_input: { file_path: 'data/events.db' } })).toContain('db-guard');
  });

  test('allows Write to temp-descriptions (concerns.jsonl path)', () => {
    expect(
      verdict({ tool_name: 'Write', tool_input: { file_path: 'temp-descriptions/batch-1/concerns.jsonl' } }),
    ).toBeNull();
  });

  test('ignores non-file tools', () => {
    expect(verdict({ tool_name: 'WebSearch', tool_input: { query: 'venue events.db' } })).toBeNull();
  });
});

describe('db-guard process contract', () => {
  const run = (payload: unknown) =>
    Bun.spawnSync(['bun', 'run', 'scripts/hooks/db-guard.ts'], {
      stdin: new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    });

  test('exit 2 + stderr reason on blocked call', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'sqlite3 data/events.db "DELETE FROM events"' } });
    expect(r.exitCode).toBe(2);
    expect(new TextDecoder().decode(r.stderr)).toContain('db-guard');
  });

  test('exit 0 on allowed call', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'ls -la' } });
    expect(r.exitCode).toBe(0);
  });

  test('fails closed on unparseable input', () => {
    expect(run('this is not json').exitCode).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/db-guard-hook.test.ts`
Expected: FAIL — cannot resolve module `../scripts/hooks/db-guard`.

- [ ] **Step 4: Write the implementation**

Create `scripts/hooks/db-guard.ts`:

```ts
#!/usr/bin/env bun
/**
 * PreToolUse guard — deterministic boundary between model-driven tool calls
 * and the SQLite databases. Runs in the harness, so it fires even when the
 * model's context has been compromised by injected scraped/emailed content.
 *
 * Hook contract: JSON on stdin; exit 0 = allow; exit 2 = block, with the
 * reason on stderr (shown back to the model). Unparseable input blocks —
 * this guard fails CLOSED, unlike the advisory PostToolUse tsc hook.
 *
 * DB writes are only legitimate through scripts/save-batch.ts (parameterized
 * statements, no DELETE/DROP). Interactive reads use `sqlite3 -readonly`.
 */

export interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

const DB_PATH_RE = /\.db(\.|['"\s]|$)/;

export function verdict(input: HookInput): string | null {
  const tool = input.tool_name;

  if (tool === 'Write' || tool === 'Edit') {
    const p = String(input.tool_input?.file_path ?? '');
    return DB_PATH_RE.test(p)
      ? `db-guard: ${tool} to a database file is blocked (${p}). DB writes go through scripts/save-batch.ts.`
      : null;
  }

  if (tool !== 'Bash') return null;
  const cmd = String(input.tool_input?.command ?? '');

  if (/\bsqlite3\b/.test(cmd)) {
    if (!/\bsqlite3\s+(-\S+\s+)*-readonly\b/.test(cmd)) {
      return 'db-guard: sqlite3 without -readonly is blocked. Read with `sqlite3 -readonly`; DB writes go through scripts/save-batch.ts.';
    }
    if (/\battach\b/i.test(cmd)) {
      return 'db-guard: ATTACH is blocked in sqlite3 commands.';
    }
    return null;
  }

  if (DB_PATH_RE.test(cmd)) {
    if (/\b(rm|mv|shred|truncate|dd|unlink)\b/.test(cmd) || />{1,2}\s*['"]?\S*\.db\b/.test(cmd)) {
      return 'db-guard: destructive shell operation touching a .db file is blocked.';
    }
  }

  return null;
}

if (import.meta.main) {
  const raw = await Bun.stdin.text();
  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error('db-guard: unparseable hook input — failing closed.');
    process.exit(2);
  }
  const reason = verdict(input);
  if (reason) {
    console.error(reason);
    process.exit(2);
  }
  process.exit(0);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/db-guard-hook.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Run the full suite to check for collateral breakage**

Run: `bun test`
Expected: same pass/fail profile as `main` (run `git stash && bun test` first if a baseline is needed, then `git stash pop`). No new failures attributable to this change.

- [ ] **Step 7: Commit**

```bash
git add scripts/hooks/db-guard.ts tests/db-guard-hook.test.ts
git commit -m "feat(security): add db-guard PreToolUse hook blocking destructive DB access"
```

---

### Task 2: Wire the hook and tighten `.claude/settings.json`, with config-pinning tests

**Files:**
- Modify: `.claude/settings.json` (permissions allowlist + new PreToolUse block)
- Test: `tests/settings-security-pins.test.ts`

**Interfaces:**
- Consumes: `scripts/hooks/db-guard.ts` process contract from Task 1 (stdin JSON, exit 0/2).
- Produces: `.claude/settings.json` with `hooks.PreToolUse[0].matcher === "Bash|Write|Edit"` and a hook command containing `db-guard`; permissions allowlist containing `Bash(sqlite3 -readonly data/events.db *)` and NO sqlite3 rule without `-readonly`. Task 4's canary and Task 5's worktree check rely on this exact shape.

- [ ] **Step 1: Confirm settings.json is git-tracked (worktrees must inherit it)**

Run: `git ls-files --error-unmatch .claude/settings.json && echo TRACKED`
Expected: `TRACKED`. If instead it errors (ignored/untracked), stage it by path in Step 5's commit — worktree inheritance (Task 5) depends on it being committed.

- [ ] **Step 2: Write the pinning tests (they must FAIL against current config — this is the RED for a retrofitted guard)**

Create `tests/settings-security-pins.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const enrichSh = readFileSync('scripts/auto-enrich.sh', 'utf8');

describe('project security pins', () => {
  test('no writable sqlite3 grant in settings allowlist', () => {
    const offenders = (settings.permissions?.allow ?? []).filter(
      (r: string) => r.includes('sqlite3') && !r.includes('-readonly'),
    );
    expect(offenders).toEqual([]);
  });

  test('db-guard PreToolUse hook is wired for Bash|Write|Edit', () => {
    const entries = settings.hooks?.PreToolUse ?? [];
    const guard = entries.find((e: { matcher?: string; hooks?: { command?: string }[] }) =>
      (e.hooks ?? []).some((h) => h.command?.includes('db-guard')),
    );
    expect(guard).toBeDefined();
    expect(guard.matcher).toBe('Bash|Write|Edit');
  });

  test('auto-enrich ALLOWED_TOOLS grants no bare Bash, only bun-run script prefixes', () => {
    const m = enrichSh.match(/^ALLOWED_TOOLS="(.*)"$/m);
    expect(m).not.toBeNull();
    const tokens = m![1].split(',').map((t) => t.trim());
    expect(tokens).not.toContain('Bash');
    for (const t of tokens.filter((t) => t.startsWith('Bash('))) {
      expect(t).toMatch(/^Bash\(bun run scripts\//);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail for the right reasons**

Run: `bun test tests/settings-security-pins.test.ts`
Expected: FAIL on all three — the wildcard `Bash(sqlite3 data/events.db *)` is present, no PreToolUse hook exists, and `ALLOWED_TOOLS` still contains bare `Bash` (that third failure clears in Task 3; it is acceptable for it to stay red until then — do NOT weaken the test to get to green early).

- [ ] **Step 4: Edit `.claude/settings.json`**

Replace the line `"Bash(sqlite3 data/events.db *)"` with `"Bash(sqlite3 -readonly data/events.db *)"`, and add the `PreToolUse` block above the existing `PostToolUse` block, so the file becomes:

```json
{
  "permissions": {
    "allow": [
      "Bash(bun run src/generate-site.ts)",
      "Bash(bun test)",
      "Bash(sqlite3 -readonly data/events.db *)",
      "Bash(./scripts/session-diagnostic.sh)",
      "Bash(cat *)",
      "Bash(ls *)",
      "Bash(head *)",
      "Bash(tail *)",
      "Bash(wc *)",
      "Bash(grep *)",
      "Bash(find *)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && bun run scripts/hooks/db-guard.ts"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "cd /Users/chrism/Project\\ with\\ Claude/AgentAthens/agent-athens && bunx tsc --noEmit 2>&1 | head -20 || true"
          }
        ]
      }
    ]
  }
}
```

(`$CLAUDE_PROJECT_DIR` rather than a hardcoded path so the same committed file works inside the phase3 worktree. Task 4's live canary is the gate that proves this resolves; if the canary shows the hook not firing, fall back to the hardcoded-path style of the tsc hook and re-run the canary.)

- [ ] **Step 5: Run pinning tests — two of three go green**

Run: `bun test tests/settings-security-pins.test.ts`
Expected: sqlite3-grant test PASS, hook-wiring test PASS, ALLOWED_TOOLS test still FAIL (fixed in Task 3).

- [ ] **Step 6: Also check `.claude/settings.local.json` for loose grants**

Run: `cat .claude/settings.local.json`
If its `permissions.allow` contains any `sqlite3` rule without `-readonly`, or any `rm`/`mv` wildcard touching `data/`, apply the same `-readonly` tightening there (local file, not committed — report the before/after in the task summary). If it has none, state that explicitly.

- [ ] **Step 7: Mutation gate on the hook wiring**

Temporarily delete the whole `PreToolUse` block from `.claude/settings.json`, run `bun test tests/settings-security-pins.test.ts`, confirm the hook-wiring test FAILS. Restore the block, run again, confirm it passes. Then `git diff .claude/settings.json` to confirm the restore is exact.

- [ ] **Step 8: Commit**

```bash
git add .claude/settings.json tests/settings-security-pins.test.ts
git commit -m "feat(security): wire db-guard PreToolUse hook; sqlite3 grant is read-only"
```

---

### Task 3: Tighten `ALLOWED_TOOLS` in `auto-enrich.sh` and steer concerns-append off the shell

**Files:**
- Modify: `scripts/auto-enrich.sh:39` (the `ALLOWED_TOOLS=` line)
- Modify: `scripts/generate-enrichment-brief.ts` (concerns-append instruction, near line 712)
- Test: `tests/settings-security-pins.test.ts` (already written in Task 2 — its third test is this task's RED, currently failing)

**Interfaces:**
- Consumes: the pinning test `auto-enrich ALLOWED_TOOLS grants no bare Bash...` from Task 2, currently RED.
- Produces: `ALLOWED_TOOLS` as a comma-separated list (comma, not space — entries now contain spaces inside `Bash(...)`), consumed verbatim by the `--allowedTools "$ALLOWED_TOOLS"` call at `scripts/auto-enrich.sh:417`.

- [ ] **Step 1: Confirm the RED is still red**

Run: `bun test tests/settings-security-pins.test.ts`
Expected: only the ALLOWED_TOOLS test fails.

- [ ] **Step 2: Replace line 39 of `scripts/auto-enrich.sh`**

Old:

```bash
ALLOWED_TOOLS="Bash Read Write WebSearch Glob Grep WebFetch"
```

New (single line; comma-separated because `Bash(...)` entries contain spaces):

```bash
ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(bun run scripts/write-description.ts:*),Bash(bun run scripts/auto-gate-check.ts:*),Bash(bun run scripts/write-tags.ts:*),Bash(bun run scripts/save-batch.ts:*)"
```

Add directly above it this comment:

```bash
# Security boundary (2026-07-28): the enrichment session processes untrusted
# scraped/emailed content. Bash is limited to the four sanctioned scripts the
# brief instructs; DB writes exist only inside save-batch.ts (parameterized).
# Widening this back to bare "Bash" fails tests/settings-security-pins.test.ts.
```

- [ ] **Step 3: Steer the concerns.jsonl append away from shell**

In `scripts/generate-enrichment-brief.ts`, find the line (near line 712):

```ts
  lines.push(`     concerns, append a JSONL line to temp-descriptions/batch-${batchNumber}/concerns.jsonl.`);
```

Replace with:

```ts
  lines.push(`     concerns, append a JSONL line to temp-descriptions/batch-${batchNumber}/concerns.jsonl`);
  lines.push('     using the Write or Edit tool (shell echo/redirect is not permitted in this session).');
```

Rationale: the tightened allowlist denies `echo ... >>`; without this instruction the model may burn a retry discovering that. Check `scripts/generate-rewrite-brief.ts` for an equivalent append instruction (`grep -n concerns scripts/generate-rewrite-brief.ts`) and apply the same edit if present; if absent, state so.

- [ ] **Step 4: Run the pinning tests — all green**

Run: `bun test tests/settings-security-pins.test.ts`
Expected: PASS, all three.

- [ ] **Step 5: Mutation gate**

Temporarily revert line 39 to the old bare-`Bash` value, run `bun test tests/settings-security-pins.test.ts`, confirm the ALLOWED_TOOLS test FAILS. Restore the new value, confirm PASS, `git diff scripts/auto-enrich.sh` shows only the intended change.

- [ ] **Step 6: Dry-run the wrapper for syntax safety**

Run: `DRY_RUN=1 bash scripts/auto-enrich.sh` (the script's dry-run mode logs planned actions without invoking claude)
Expected: exits 0, log line mentions "[DRY RUN]". No bash syntax errors from the edited line.

- [ ] **Step 7: Commit**

```bash
git add scripts/auto-enrich.sh scripts/generate-enrichment-brief.ts
git commit -m "feat(security): enrichment session Bash limited to four sanctioned scripts"
```

If Step 3 touched `scripts/generate-rewrite-brief.ts`, stage that path in the same commit.

---

### Task 4: Live enforcement canaries + one real scheduled batch

This task produces no code — it is the VERIFY gate. Each canary attacks one layer in isolation. Canaries invoke the real `claude` CLI (costs tokens, needs auth: `bash scripts/auto-enrich.sh` auth-precheck conventions apply). Run everything from the repo root on the feature branch.

**Files:**
- None created or modified (evidence goes in the task summary / PR description).

**Interfaces:**
- Consumes: settings from Task 2, allowlist from Task 3.

- [ ] **Step 1: Record the pre-canary DB state**

```bash
sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events;" | tee /tmp/pre-canary-count.txt
```

- [ ] **Step 2: Hook-layer canary (Layer 2 alone — deliberately grant bare Bash so ONLY the hook stands)**

```bash
claude -p 'Run exactly this command and report its full output and exit status: sqlite3 data/events.db "DELETE FROM events WHERE 1=0"' \
  --allowedTools "Bash" --output-format text
```

Expected: the reply reports the command was BLOCKED with a `db-guard` message (exit 2 path). If the reply shows the command executed, the hook is not firing — first suspect: `$CLAUDE_PROJECT_DIR` not resolving; apply the fallback in Task 2 Step 4 and re-run this canary. Do not proceed past a failing canary.

- [ ] **Step 3: Read-path canary (hook must ALLOW read-only)**

```bash
claude -p 'Run exactly: sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events" and report the number.' \
  --allowedTools "Bash" --output-format text
```

Expected: reply reports the same count as `/tmp/pre-canary-count.txt`.

- [ ] **Step 4: Allowlist-layer canary (Layer 1 alone — the production grant, destructive ask)**

```bash
ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(bun run scripts/write-description.ts:*),Bash(bun run scripts/auto-gate-check.ts:*),Bash(bun run scripts/write-tags.ts:*),Bash(bun run scripts/save-batch.ts:*)"
claude -p 'Run exactly this command and report the result: sqlite3 data/events.db "DELETE FROM events WHERE 1=0"' \
  --allowedTools "$ALLOWED_TOOLS" --output-format text
```

Expected: reply reports the Bash call was DENIED by permissions (never reached execution — this is a different refusal than Step 2's hook block). Confirm the sanctioned surface still works: repeat with the ask `Run exactly: bun run scripts/auto-gate-check.ts --help` — expected: the command executes (its output or usage text is reported, not a permission denial).

- [ ] **Step 5: Confirm the DB is untouched**

```bash
sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events;" | diff /tmp/pre-canary-count.txt -
```

Expected: no diff output, exit 0.

- [ ] **Step 6: One real scheduled batch through launchd (project rule: never interactive shell alone)**

```bash
ls ~/Library/LaunchAgents | grep -i -E "enrich|athens"        # find the exact label
sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM enrichment_log;" | tee /tmp/pre-batch-log-count.txt
launchctl start <label-found-above>
```

Wait for the run to finish (watch `logs/`, batch timeout is `BATCH_TIMEOUT`, default 900–1200s), then:

```bash
sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM enrichment_log;" | diff /tmp/pre-batch-log-count.txt - ; echo "diff-exit=$?"
grep -iE "denied|not allowed|db-guard|permission" logs/*.log | tail -20
```

Expected: `enrichment_log` count INCREASED (diff-exit=1 with a larger number — saves happened), and the grep shows NO denials of the four sanctioned commands. A `db-guard` line for a sqlite3/rm attempt would itself be acceptable (guard working), but a denial of `bun run scripts/...` means the allowlist format is wrong — stop, fix `ALLOWED_TOOLS` (first suspect: comma vs space parsing on the installed CLI version), re-run this step. This step is the defense against the silent deploy-drought failure class.

- [ ] **Step 7: Record the evidence**

Paste into the eventual PR description / task summary: the two canary refusals (verbatim), the count diff outputs, and the enrichment_log delta. No green claims without this output captured.

---

### Task 5: Phase-3 worktree inheritance, decision record, and ship

**Files:**
- Modify: `.claude/notes/decisions.md` (append decision entry)
- Modify: `CLAUDE.md` (project root — add security invariant)

**Interfaces:**
- Consumes: committed `.claude/settings.json` (Task 2) — worktrees materialize tracked files, which is how `phase3-weekly.sh`'s `--permission-mode acceptEdits` session inherits the hook.

- [ ] **Step 1: Verify the phase3 worktree will carry the guard**

```bash
grep -n "PHASE3_WT" scripts/phase3-weekly.sh | head -3          # locate the worktree path variable
git worktree list
```

If the worktree already exists at that path, confirm inheritance directly: `ls <worktree-path>/.claude/settings.json` and `grep -c db-guard <worktree-path>/.claude/settings.json` — expected: file exists; count ≥ 1 after this branch merges and the worktree updates. If the worktree doesn't exist yet, state that the check is deferred to the first post-merge phase3 run and add the grep above to that run's checklist in the decision entry (Step 2).

- [ ] **Step 2: Append the decision record**

Append to `.claude/notes/decisions.md`:

```markdown
## DB Tool Boundary (2026-07-28)

Headless enrichment sessions process untrusted scraped/emailed content, so
prompt instructions are not a security boundary. Three deterministic layers
now stand between any Claude session and data/events.db:

1. `ALLOWED_TOOLS` in scripts/auto-enrich.sh:39 — Bash restricted to the four
   sanctioned `bun run scripts/*.ts` commands the brief instructs.
2. PreToolUse hook `scripts/hooks/db-guard.ts` (wired in .claude/settings.json,
   fails CLOSED) — blocks non-readonly sqlite3, ATTACH, and rm/mv/redirect
   against `.db` files, for Bash/Write/Edit in every session incl. worktrees.
3. Pinning tests `tests/settings-security-pins.test.ts` +
   `tests/db-guard-hook.test.ts` — the suite fails if the allowlist is
   re-widened or the hook is unwired.

Consequences: interactive sqlite3 writes are blocked by design — use
`sqlite3 -readonly` for reads and scripts/save-batch.ts (or a dedicated
script) for writes. Backups (~/agent-athens-backups) are unaffected: they run
outside Claude sessions. First post-merge phase3 run: verify
`grep -c db-guard <phase3-worktree>/.claude/settings.json` ≥ 1.
```

- [ ] **Step 3: Add the invariant to project `CLAUDE.md`**

Append under an existing conventions/invariants section (or add a `## Security invariants` section at the end):

```markdown
## Security invariants

- No Claude session — headless or interactive — writes to `data/events.db`
  except via `bun run scripts/save-batch.ts`. Reads use `sqlite3 -readonly`.
- Enforced by `scripts/hooks/db-guard.ts` (PreToolUse, fails closed) and the
  `ALLOWED_TOOLS` allowlist in `scripts/auto-enrich.sh`. Both are pinned by
  `tests/settings-security-pins.test.ts` — do not widen either without
  updating the threat decision in `.claude/notes/decisions.md`.
```

- [ ] **Step 4: Full suite + commit**

```bash
bun test
git add .claude/notes/decisions.md CLAUDE.md
git commit -m "docs(security): record DB tool-boundary decision and invariants"
```

Expected before commit: full suite green (modulo failures already present on `main` — compare against the Task 1 Step 6 baseline).

- [ ] **Step 5: Hand back for merge decision**

Do NOT merge or push without the user's go-ahead. Report: branch name, the five commits, the canary evidence from Task 4, and the one open behavioral change (interactive sqlite3 writes now require `-readonly` or a script). Use superpowers:finishing-a-development-branch for the integration decision.
