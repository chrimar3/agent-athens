/**
 * Security loop round 9 (judge finding): when the netlify CLI output cannot be
 * parsed, run_deploy recovers the deploy id by matching today's deploy TITLE
 * in listSiteDeploys. The title is attacker-settable by anyone holding the
 * Netlify token, and the 10-minute bound used BSD `date -v`, which fails in
 * the Linux container (empty cutoff → every matching deploy qualified). The
 * recovered id was then printed as PUBLISH-RESULT and recorded on the Mac as
 * known-good.
 *
 * Now: the bound is computed portably (GNU `-d`, BSD `-v` fallback) and an
 * uncomputable bound fails the deploy; a title-recovered id is never printed
 * as a PUBLISH-RESULT line.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const src = readFileSync(join(ROOT, 'scripts', 'daily-automated.sh'), 'utf8');
const body = src.slice(src.indexOf('PARSE-OR-FAIL FALLBACK'), src.indexOf('print_publish_result() {'));

describe('deploy id recovery by title', () => {
  test('the 10-minute cutoff is portable and validated; an empty cutoff fails closed', () => {
    expect(body).toContain("date -u -d '-10 minutes' +%Y-%m-%dT%H:%M:%SZ");
    expect(body).toContain('date -u -v-10M +%Y-%m-%dT%H:%M:%SZ');
    expect(body).toMatch(/if \[\[ ! "\$cutoff" =~ \^\[0-9\]\{4\}[\s\S]{0,500}return 1/);
    // No unguarded BSD-only form left.
    expect(body).not.toMatch(/cutoff=\$\(date -u -v-10M [^|]*\)\n/);
  });

  test('the cutoff is actually computable in this environment (the container is Linux)', () => {
    const r = Bun.spawnSync(['bash', '-c', "date -u -d '-10 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-10M +%Y-%m-%dT%H:%M:%SZ"]);
    expect(r.stdout.toString().trim()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('a title-recovered deploy id is flagged and never printed as PUBLISH-RESULT', () => {
    expect(body).toContain('deploy_id_recovered=1');
    expect(body).toMatch(/if \[\[ \$deploy_id_recovered -eq 1 \]\]; then\s+log_error[^\n]*recovered by title match[\s\S]{0,300}else\s+print_publish_result "\$DEPLOY_ID"/);
    expect(src).toMatch(/local DEPLOY_ID deploy_id_recovered=0/);
  });
});
