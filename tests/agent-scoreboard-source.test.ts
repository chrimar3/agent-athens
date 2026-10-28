/**
 * The analysts read the pipeline's records from the branch the pipeline writes.
 *
 * Since security loop round 3 the daily pipeline never commits to main: it
 * writes data/scoreboard.json, build-completeness.json and
 * event-set-hashes.json to refs/heads/pipeline-data with git plumbing
 * (scripts/daily-automated.sh, PIPELINE_DATA_BRANCH). The analyst prompts kept
 * reading the copy on main, frozen at 2026-09-25, so every triage run from then
 * on stopped at its staleness check (issue #11) whatever the pipeline did.
 * These tests tie every scoreboard read in the analyst prompts to that branch.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const BRANCH = read('scripts/daily-automated.sh').match(/^readonly PIPELINE_DATA_BRANCH="([^"]+)"$/m)?.[1];
const REF = `origin/${BRANCH}`;
// A cloud routine's clone may be single-branch, so the remote ref is named explicitly.
const FETCH = `git fetch --quiet origin +refs/heads/${BRANCH}:refs/remotes/${REF}`;

test('precondition: the pipeline still names its data branch', () => {
  expect(BRANCH).toBe('pipeline-data');
});

describe.each(['.claude/analyst-triage.md', '.claude/analyst-deep.md'])('%s', (file) => {
  const md = read(file);

  test('fetches the pipeline-data branch explicitly', () => {
    expect(md).toContain(FETCH);
  });

  test('every scoreboard.json mention reads it from the pipeline-data branch', () => {
    const mentions = md.split('scoreboard.json').length - 1;
    expect(mentions).toBeGreaterThan(0);
    const spans = [...md.matchAll(/`([^`\n]*)`/g)].map((m) => m[1]).filter((s) => s.includes('scoreboard.json'));
    // No mention outside a code span: prose like "read data/scoreboard.json" would send the agent to main's copy.
    expect(spans.reduce((n, s) => n + s.split('scoreboard.json').length - 1, 0)).toBe(mentions);
    for (const s of spans) expect(s).toContain(REF);
  });
});

test('triage fetches the branch in its first step, before the staleness check reads it', () => {
  const step0 = read('.claude/analyst-triage.md').split('\n').find((l) => l.startsWith('0. '))!;
  expect(step0.indexOf(FETCH)).toBeGreaterThan(-1);
  expect(step0.indexOf(FETCH)).toBeLessThan(step0.indexOf('generated_at'));
});
