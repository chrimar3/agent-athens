/**
 * Security loop round 6 — which issue text the unattended agents may read.
 *
 * Judges found (1) the nightly analyst deduped by searching ALL issues, so a
 * stranger's issue title/body reached it as input, and (2) the nightly worker
 * acted on any issue the analyst bot filed — the analyst's reading of scraped
 * data and third-party text — with no person in between.
 *
 * Now (.github/scripts/trusted-issue-thread.sh, behaviour tested in
 * tests/trusted-issue-thread.test.ts):
 *   - the analyst dedupes against `trusted-issue-thread.sh --titles`, which
 *     lists only number/state/labels/title of issues by maintainers or the
 *     analyst bot (the script's one trust rule);
 *   - the worker's reader refuses (exit 3) a bot-filed issue until a
 *     maintainer applied `maintainer-approved` and nothing was edited since.
 * These tests pin the prompt text that routes the agents through those gates.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const WORKER = read('.claude/worker.md');
const TRIAGE = read('.claude/analyst-triage.md');
const DEEP = read('.claude/analyst-deep.md');
const SCRIPT = read('.github/scripts/trusted-issue-thread.sh');
const READER = 'bash .github/scripts/trusted-issue-thread.sh';

describe('analyst: duplicate search sees only trusted authors', () => {
  test('triage dedupes against the --titles list and nothing else', () => {
    const step5 = TRIAGE.split('\n').find((l) => l.startsWith('5. '))!;
    expect(step5).toContain(`${READER} --titles all`);
    expect(step5).toMatch(/ONLY/);
    expect(step5).toMatch(/Never `gh issue list`\/`gh search issues`\/`gh issue view`/);
    expect(step5).toMatch(/untrusted/);
  });

  test('the old all-issues search is gone from both analyst prompts', () => {
    for (const md of [TRIAGE, DEEP]) {
      expect(md).not.toMatch(/search issues `--state all`/);
      expect(md).not.toMatch(/gh (issue|search) [^\n`]*--state all/);
    }
  });

  test('the sensor-repair lookup (step 0) uses the same trusted list', () => {
    const step0 = TRIAGE.split('\n').find((l) => l.startsWith('0. '))!;
    expect(step0).toContain('trusted title list');
  });

  test('the deep dive files issues with the same dedupe', () => {
    expect(DEEP).toContain('`--titles` list only');
  });

  test('--titles reuses the thread reader\'s trust rule (one rule, one place)', () => {
    expect(SCRIPT).toContain('TRUSTED="($MAINTAINER or $IS_BOT)"');
    const list = SCRIPT.split('\n').find((l) => l.includes('LIST_FILTER='))!;
    expect(list).toContain('if $TRUSTED then');
    expect(list).toContain('select(has(\\"pull_request\\") | not)');
    expect(list).not.toContain('.body');
  });
});

describe('worker: a bot-filed issue needs a maintainer-applied maintainer-approved label', () => {
  test('the prompt explains exit 3 for an unapproved bot issue and forbids self-approval', () => {
    const step1 = WORKER.split('\n').find((l) => l.startsWith('1. '))!;
    expect(step1).toContain(`REPO=chrimar3/agent-athens ${READER} <N>`);
    expect(step1).toMatch(/analyst bot filed it and no maintainer has approved it/);
    expect(step1).toContain('`maintainer-approved`');
    expect(step1).toMatch(/Never apply `maintainer-approved` yourself/);
    expect(step1).toMatch(/needs-input/);
  });

  test('the reader enforces it: label name, User actor, no later edit', () => {
    expect(SCRIPT).toContain('APPROVAL_LABEL="maintainer-approved"');
    expect(SCRIPT).toContain('.actor_type\')" = "User" ]');
    expect(SCRIPT).toContain('lastEditedAt');
    expect(SCRIPT).toMatch(/select\(\.event == "renamed" and \.at > \$t\)/);
  });
});

describe('no agent prompt reads issues around the gates', () => {
  const prompts: [string, string][] = [
    ['.claude/worker.md', WORKER], ['.claude/analyst-triage.md', TRIAGE], ['.claude/analyst-deep.md', DEEP],
  ];
  for (const dir of ['.claude/commands', '.claude/agents']) {
    if (!existsSync(join(ROOT, dir))) continue;
    for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.md'))) prompts.push([`${dir}/${f}`, read(`${dir}/${f}`)]);
  }

  test('gh issue view / gh search appear only in "never" instructions; gh issue list only as the worker\'s numbers-only queue pick', () => {
    for (const [file, md] of prompts) {
      for (const line of md.split('\n')) {
        for (const m of line.matchAll(/gh (issue view|search issues|issue list)[^`]*/g)) {
          const ok = /never/i.test(line.slice(0, m.index)) || (file === '.claude/worker.md' && m[0].startsWith('gh issue list --label queue --json number,createdAt'));
          if (!ok) throw new Error(`${file}: "${m[0]}" reads issues outside trusted-issue-thread.sh`);
        }
      }
    }
  });
});
