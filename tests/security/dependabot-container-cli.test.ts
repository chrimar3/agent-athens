/**
 * Security loop round 4 — the container's command-line tools get update PRs.
 * docker/cli/package-lock.json pins claude-code, netlify-cli and bun for the
 * pipeline image; it is an npm lockfile, so it needs its own npm entry.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const cfg = parseYaml(readFileSync(join(import.meta.dir, '..', '..', '.github', 'dependabot.yml'), 'utf-8'));
type Update = { 'package-ecosystem': string; directory?: string; schedule?: { interval?: string }; groups?: object };

describe('.github/dependabot.yml — docker/cli', () => {
  test('an npm entry covers /docker/cli, weekly and grouped', () => {
    const u = (cfg.updates as Update[]).find((x) => x['package-ecosystem'] === 'npm' && x.directory === '/docker/cli');
    expect(u).toBeDefined();
    expect(u!.schedule?.interval).toBe('weekly');
    expect(Object.keys(u!.groups ?? {}).length).toBeGreaterThan(0);
  });
});
