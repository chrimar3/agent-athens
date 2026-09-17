/**
 * The shell entry points launchd and the pipeline invoke directly must keep
 * their executable bit. Git tracks it, so a fresh checkout has it — but an
 * editor or tool that rewrites a file by rename (2026-09-17: a python
 * `os.replace` while fixing the lock block) silently drops it, `bash -n`
 * cannot see it, and the first symptom is a launchd job that never starts.
 */
import { describe, test, expect } from 'bun:test';
import { statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const ENTRY_POINTS = [
  'scripts/daily-automated.sh',   // launchd daily/freshness/enrichment plists; re-execs itself under caffeinate
  'scripts/auto-enrich.sh',       // launched by daily-automated.sh enrichment mode
  'scripts/deploy-gate.sh',
  'scripts/redeploy.sh',
  'scripts/phase3-weekly.sh',
  'scripts/backup-events-db.sh',
  '.github/scripts/path-guard.sh',
];

describe('executable entry points keep their mode bit', () => {
  for (const p of ENTRY_POINTS) {
    test(p, () => {
      expect(statSync(join(ROOT, p)).mode & 0o111).not.toBe(0);
    });
  }
});
