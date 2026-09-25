/**
 * Unattended Claude sessions refuse risky tools regardless of project
 * settings (security loop round 7).
 *
 * scripts/auto-enrich.sh (enrichment batches over scraped text) and
 * scripts/phase3-weekly.sh (layer 2, over third-party measurement output) run
 * `claude -p` unattended. .claude/settings.json allows Bash(cat *), grep, head
 * and tail for interactive use, and --allowedTools only adds to that, so each
 * session also passes --disallowedTools: a deny rule is the one rule class an
 * allow cannot out-vote. The lists are built between `# disallowed-tools:begin`
 * and `# disallowed-tools:end` in each script; this suite runs that block
 * verbatim under bash and checks the exact claude invocation passes the result.
 *
 * Deliberate differences: the enrichment session keeps WebFetch/WebSearch
 * (its research needs them; its ALLOWED_TOOLS grants them), the Phase-3
 * session has no web tools and denies both. Read(~/**) is added only when the
 * working directories are outside $HOME (on the Mac the repo and worktrees are
 * in the owner's home folder, and denying ~/** would deny them).
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const SQL_SHELL = 'sqlite' + '3'; // spelled apart so no tooling mistakes this file for a shell call

/** Patterns every unattended session must refuse. */
const ALWAYS = [
  'Bash(cat *)', 'Bash(grep *)', 'Bash(head *)', 'Bash(tail *)', `Bash(${SQL_SHELL} *)`,
  'Bash(curl *)', 'Bash(wget *)', 'Bash(nc *)', 'Bash(env)', 'Bash(printenv *)',
  'Read(/proc/**)', 'Read(//proc/**)', 'Read(.env*)', 'Read(**/.env*)',
  'Read(~/.ssh/**)', 'Read(~/.claude/**)', 'Read(~/.config/**)',
];

function block(src: string): string {
  const b = src.indexOf('# disallowed-tools:begin');
  const e = src.indexOf('# disallowed-tools:end');
  if (b === -1 || e === -1 || e <= b) throw new Error('disallowed-tools markers missing — extraction contract broken');
  if (src.indexOf('# disallowed-tools:begin', b + 1) !== -1) throw new Error('duplicate disallowed-tools markers');
  return src.slice(b, e);
}

/** Run the block under bash with the given env and print the named variable. */
function evalList(src: string, varName: string, env: Record<string, string>): string[] {
  const script = `${block(src)}\nprintf '%s' "$${varName}"\n`;
  const r = Bun.spawnSync(['/bin/bash', '-c', script], { env: { PATH: '/usr/bin:/bin', ...env } });
  if (r.exitCode !== 0) throw new Error(new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout).split(',');
}

function allowList(src: string, varName: string): string[] {
  const line = src.split('\n').find((l) => l.startsWith(`${varName}=`)) ?? '';
  return line.replace(new RegExp(`^${varName}="`), '').replace(/"\s*$/, '').split(',');
}

describe('auto-enrich.sh — the enrichment batch session', () => {
  const src = read('scripts/auto-enrich.sh');
  const start = src.indexOf('"$CLAUDE_BIN" -p "$BRIEF_CONTENT"');
  const invocation = src.slice(start, src.indexOf('< /dev/null', start));
  const onMac = evalList(src, 'DISALLOWED_TOOLS', { HOME: '/Users/chrism', PROJECT_DIR: '/Users/chrism/Project with Claude/AgentAthens/agent-athens' });
  const inContainer = evalList(src, 'DISALLOWED_TOOLS', { HOME: '/home/aa', PROJECT_DIR: '/workspace' });

  test('the exact batch invocation passes --disallowedTools "$DISALLOWED_TOOLS" beside --allowedTools', () => {
    expect(start).toBeGreaterThan(-1);
    expect(invocation).toContain('--allowedTools "$ALLOWED_TOOLS" \\\n');
    expect(invocation).toContain('--disallowedTools "$DISALLOWED_TOOLS" \\\n');
    // Built before the batch loop that uses it.
    expect(src.indexOf('# disallowed-tools:end')).toBeLessThan(start);
  });

  test('every required pattern is refused, in both layouts', () => {
    for (const list of [onMac, inContainer]) expect(ALWAYS.filter((t) => !list.includes(t))).toEqual([]);
  });

  test('WebFetch and WebSearch stay available: the research the brief asks for needs them', () => {
    const allowed = allowList(src, 'ALLOWED_TOOLS');
    expect(allowed).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch']));
    for (const list of [onMac, inContainer]) {
      expect(list).not.toContain('WebFetch');
      expect(list).not.toContain('WebSearch');
    }
  });

  test('nothing the session is granted is also denied (the deny would win and break the batch)', () => {
    const allowed = allowList(src, 'ALLOWED_TOOLS');
    for (const list of [onMac, inContainer]) expect(list.filter((t) => allowed.includes(t))).toEqual([]);
  });

  test('Read(~/**) only when the project is outside $HOME (the Mac repo is inside it)', () => {
    expect(onMac).not.toContain('Read(~/**)');
    expect(inContainer).toContain('Read(~/**)');
    expect(evalList(src, 'DISALLOWED_TOOLS', { HOME: '/', PROJECT_DIR: '/workspace' })).not.toContain('Read(~/**)');
    expect(evalList(src, 'DISALLOWED_TOOLS', { HOME: '/Users/chrism/', PROJECT_DIR: '/Users/chrism/x' })).not.toContain('Read(~/**)');
    expect(evalList(src, 'DISALLOWED_TOOLS', { HOME: '/Users/chris', PROJECT_DIR: '/Users/chrism/x' })).toContain('Read(~/**)');
  });
});

describe('phase3-weekly.sh — the layer-2 judgment session', () => {
  const src = read('scripts/phase3-weekly.sh');
  const invocation = src.split('\n').find((l) => l.includes('"$CLAUDE_BIN" -p "$PROMPT"')) ?? '';
  const onMac = evalList(src, 'PHASE3_DISALLOWED_TOOLS', {
    HOME: '/Users/chrism',
    PHASE3_WT: '/Users/chrism/Project with Claude/AgentAthens/agent-athens-phase3',
    BENCH: '/Users/chrism/Project with Claude/AgentAthens/agent-athens-visibility-baseline/benchmark/x',
  });
  const inContainer = evalList(src, 'PHASE3_DISALLOWED_TOOLS', { HOME: '/home/aa', PHASE3_WT: '/workspace/phase3', BENCH: '/workspace/bench' });

  test('the exact session invocation passes --disallowedTools "$PHASE3_DISALLOWED_TOOLS"', () => {
    expect(invocation).toContain('--allowedTools "$PHASE3_ALLOWED_TOOLS" --disallowedTools "$PHASE3_DISALLOWED_TOOLS" --add-dir "$BENCH"');
    expect(src.indexOf('# disallowed-tools:end')).toBeLessThan(src.indexOf(invocation));
  });

  test('every required pattern is refused, plus the web tools the session has no use for', () => {
    for (const list of [onMac, inContainer]) {
      expect([...ALWAYS, 'WebFetch', 'WebSearch'].filter((t) => !list.includes(t))).toEqual([]);
    }
  });

  test('nothing the session is granted is also denied', () => {
    const allowed = allowList(src, 'PHASE3_ALLOWED_TOOLS');
    expect(allowed.length).toBeGreaterThan(5);
    for (const list of [onMac, inContainer]) expect(list.filter((t) => allowed.includes(t))).toEqual([]);
  });

  test('Read(~/**) only when neither the worktree nor the benchmark dir is under $HOME', () => {
    expect(onMac).not.toContain('Read(~/**)');
    expect(inContainer).toContain('Read(~/**)');
    expect(evalList(src, 'PHASE3_DISALLOWED_TOOLS', { HOME: '/home/aa', PHASE3_WT: '/workspace/p', BENCH: '/home/aa/bench' })).not.toContain('Read(~/**)');
  });
});
