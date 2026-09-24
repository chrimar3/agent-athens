// The live-site check (docker/verify-live.sh in the container, judged on the
// Mac by docker/check-live.sh), the image-age reader behind aa-run.sh's
// staleness refusal (docker/image-age.sh) and the Mac-side doctor checks
// (docker/doctor-checks.sh). Everything runs against stubs: no network, no
// Docker, no real tokens.
import { beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(import.meta.dir, '..');
const DOCKER = join(ROOT, 'docker');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const run = (cmd: string[], env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(cmd, { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tmpdir(), ...env } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

// ---------------------------------------------------------------- check-live
const ID_OLD = 'a'.repeat(24);
const ID_NEW = 'b'.repeat(24);
const ID_ROGUE = 'c'.repeat(24);
const DIST = 'd'.repeat(64);
const SETTINGS = 'e'.repeat(64);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
});
const deploysLog = (...lines: string[]) => writeFileSync(join(dir, 'deploys.log'), lines.map((l) => l + '\n').join(''));
const cleanLines = (over: Record<string, string | null> = {}) => {
  const base: Record<string, string | null> = {
    deploy: `LIVE deploy_id=${ID_NEW}`,
    settings: `LIVE settings_hash=${SETTINGS}`,
    snippets: 'LIVE snippets=0',
    snippetsHash: `LIVE snippets_hash=${sha('[]')}`,
    homeStatus: 'LIVE page home status=200',
    homeCsp: `LIVE header home content-security-policy=${'1'.repeat(64)}`,
    homeHsts: `LIVE header home strict-transport-security=${'2'.repeat(64)}`,
    homeXcto: `LIVE header home x-content-type-options=${sha('nosniff')}`,
    eventStatus: 'LIVE page event status=200',
    eventCsp: `LIVE header event content-security-policy=${'1'.repeat(64)}`,
    eventHsts: `LIVE header event strict-transport-security=${'2'.repeat(64)}`,
    eventXcto: `LIVE header event x-content-type-options=${sha('nosniff')}`,
    csp: 'LIVE csp_ok=yes',
    ...over,
  };
  return ['Container agent-athens-verify-live starting', ...Object.values(base).filter((l): l is string => l !== null)].join('\n') + '\n';
};
const checkLive = (output: string, env: Record<string, string> = {}) => {
  writeFileSync(join(dir, 'out'), output);
  return run(['bash', join(DOCKER, 'check-live.sh'), join(dir, 'out'), join(dir, 'deploys.log'), join(dir, 'live-baseline')], env);
};
const withBaseline = () => writeFileSync(join(dir, 'live-baseline'), `settings_hash=${SETTINGS}\n`);

describe('docker/check-live.sh', () => {
  test('clean output passes, and the first clean run creates the baseline', () => {
    deploysLog(`2026-09-01T08:00:00Z ${ID_OLD} ${DIST}`, `2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    const r = checkLive(cleanLines());
    expect(r.out).not.toContain('ALERT');
    expect(r.code).toBe(0);
    expect(r.out).toContain('created the live-site baseline');
    expect(r.out).toContain('Review the Netlify site settings');
    expect(readFileSync(join(dir, 'live-baseline'), 'utf8')).toBe(`settings_hash=${SETTINGS}\n`);
    // Second run compares against it.
    const again = checkLive(cleanLines());
    expect(again.code).toBe(0);
    expect(again.out).toContain('site settings match the baseline');
  });

  test('a deploy the pipeline did not record alerts', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    const r = checkLive(cleanLines({ deploy: `LIVE deploy_id=${ID_ROGUE}` }));
    expect(r.code).toBe(8);
    expect(r.out).toContain('is not one the pipeline recorded');
  });

  test('no deploys.log at all alerts', () => {
    withBaseline();
    expect(checkLive(cleanLines()).code).toBe(8);
  });

  test('an older recorded deploy (rollback outside the pipeline) alerts', () => {
    deploysLog(`2026-09-01T08:00:00Z ${ID_OLD} ${DIST}`, `2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    const r = checkLive(cleanLines({ deploy: `LIVE deploy_id=${ID_OLD}` }));
    expect(r.code).toBe(8);
    expect(r.out).toContain('older than the newest pipeline deploy');
  });

  test('an older deploy is fine when the newest record is the restore of it', () => {
    deploysLog(
      `2026-09-01T08:00:00Z ${ID_OLD} ${DIST}`,
      `2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`,
      `2026-09-02T09:00:00Z ${ID_OLD} restore`,
    );
    withBaseline();
    const r = checkLive(cleanLines({ deploy: `LIVE deploy_id=${ID_OLD}` }));
    expect(r.out).not.toContain('ALERT');
    expect(r.code).toBe(0);
    // …but after that restore, a different deploy going live alerts.
    const moved = checkLive(cleanLines({ deploy: `LIVE deploy_id=${ID_NEW}` }));
    expect(moved.code).toBe(8);
    expect(moved.out).toContain('restored');
  });

  test('malformed deploys.log lines are ignored, not trusted', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`, `junk ${ID_ROGUE} whatever`, `$(touch ${join(dir, 'pwned')})`);
    withBaseline();
    expect(checkLive(cleanLines()).code).toBe(0);
    expect(checkLive(cleanLines({ deploy: `LIVE deploy_id=${ID_ROGUE}` })).code).toBe(8);
    expect(existsSync(join(dir, 'pwned'))).toBe(false);
  });

  test('snippet injection alerts', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    const r = checkLive(cleanLines({ snippets: 'LIVE snippets=2' }));
    expect(r.code).toBe(8);
    expect(r.out).toContain('2 snippet(s)');
    expect(checkLive(cleanLines({ snippets: null })).code).toBe(8);
  });

  test('changed site settings alert until re-baselined with AA_ACCEPT_LIVE_BASELINE=1', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    const changed = `LIVE settings_hash=${'f'.repeat(64)}`;
    const r = checkLive(cleanLines({ settings: changed }));
    expect(r.code).toBe(8);
    expect(r.out).toContain('Netlify site settings changed');
    expect(r.out).toContain('AA_ACCEPT_LIVE_BASELINE=1');
    const accepted = checkLive(cleanLines({ settings: changed }), { AA_ACCEPT_LIVE_BASELINE: '1' });
    expect(accepted.code).toBe(0);
    expect(readFileSync(join(dir, 'live-baseline'), 'utf8')).toBe(`settings_hash=${'f'.repeat(64)}\n`);
    expect(checkLive(cleanLines({ settings: changed })).code).toBe(0);
  });

  test('a malformed baseline alerts, and no baseline is created while alerting', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    writeFileSync(join(dir, 'live-baseline'), 'settings_hash=nothex\n');
    expect(checkLive(cleanLines()).out).toContain('malformed');
    unlinkSync(join(dir, 'live-baseline'));
    expect(checkLive(cleanLines({ csp: 'LIVE csp_ok=no' })).code).toBe(8);
    expect(existsSync(join(dir, 'live-baseline'))).toBe(false);
  });

  test('a CSP that allows inline scripts, or no CSP verdict, alerts', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    expect(checkLive(cleanLines({ csp: 'LIVE csp_ok=no' })).code).toBe(8);
    expect(checkLive(cleanLines({ csp: null })).out).toContain('csp_ok=missing');
  });

  for (const key of ['homeCsp', 'homeHsts', 'homeXcto', 'eventCsp', 'eventHsts', 'eventXcto']) {
    test(`a missing header line (${key}) alerts`, () => {
      deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
      withBaseline();
      const r = checkLive(cleanLines({ [key]: null }));
      expect(r.code).toBe(8);
      expect(r.out).toContain('is missing the');
    });
  }

  test('x-content-type-options other than nosniff, or a page not answering 200, alerts', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    expect(checkLive(cleanLines({ homeXcto: `LIVE header home x-content-type-options=${sha('sniff')}` })).out).toContain('not "nosniff"');
    expect(checkLive(cleanLines({ eventStatus: 'LIVE page event status=404' })).out).toContain('status 404');
  });

  test('only strict lines count: look-alike or indented lines are ignored', () => {
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    withBaseline();
    const r = checkLive(cleanLines({ snippets: ' LIVE snippets=0', csp: 'LIVE csp_ok=yes; rm -rf ~' }));
    expect(r.code).toBe(8);
  });
});

// --------------------------------------------------------------- verify-live
describe('docker/verify-live.sh (stubbed curl)', () => {
  const TOKEN = 'nfp_SECRETTOKENVALUE123';
  const setup = (fixtures: Record<string, string>) => {
    const bin = join(dir, 'bin');
    const fx = join(dir, 'fx');
    mkdirSync(bin);
    mkdirSync(fx);
    for (const [k, v] of Object.entries(fixtures)) writeFileSync(join(fx, k), v);
    // Maps the URL (last argument) to a fixture file; missing fixture = failure.
    writeFileSync(
      join(bin, 'curl'),
      `#!/bin/bash
for a; do url="$a"; done
case "$url" in
  https://api.netlify.com/api/v1/sites/site-1) f=api-site ;;
  https://api.netlify.com/api/v1/sites/site-1/snippets) f=api-snippets ;;
  https://agentathens.com/) f=home ;;
  https://agentathens.com/sitemap-events.xml) f=sitemap ;;
  https://agentathens.com/events/concert-1/) f=event ;;
  *) echo "unexpected url" >&2; exit 6 ;;
esac
[ -f "${fx}/$f" ] || exit 22
cat "${fx}/$f"
`,
    );
    chmodSync(join(bin, 'curl'), 0o755);
    return run(['bash', join(DOCKER, 'verify-live.sh')], {
      PATH: `${bin}:${process.env.PATH}`,
      NETLIFY_AUTH_TOKEN: TOKEN,
      NETLIFY_SITE_ID: 'site-1',
    });
  };
  const CSP = "script-src 'self' 'sha256-abc=' https://www.googletagmanager.com; object-src 'none'";
  const headers = (csp: string | null) =>
    ['HTTP/2 200', 'content-type: text/html', csp === null ? '' : `Content-Security-Policy: ${csp}`,
      'strict-transport-security: max-age=31536000', 'X-Content-Type-Options: nosniff', ''].filter((l, i, a) => l !== '' || i === a.length - 1).join('\r\n') + '\r\n';
  const site = JSON.stringify({
    published_deploy: { id: ID_NEW }, custom_domain: 'agentathens.com', domain_aliases: [], ssl: true, force_ssl: true,
    password: 'hunter2-PASSWORD', build_settings: { env: { SECRET_ENV: 'VALUE-NOT-TO-PRINT' }, cmd: 'echo' },
    processing_settings: { html: { pretty_urls: true } },
  });
  const sitemap = '<?xml version="1.0"?><urlset><url><loc>https://agentathens.com/events/concert-1/</loc></url><url><loc>https://agentathens.com/events/other/</loc></url></urlset>';
  const base = { 'api-site': site, 'api-snippets': '[]', home: headers(CSP), sitemap, event: headers(CSP) };

  test('prints only strict lines; hashes and counts, never tokens or fetched text', () => {
    const r = setup(base);
    expect(r.code).toBe(0);
    const lines = r.out.trim().split('\n');
    for (const l of lines) {
      expect(l).toMatch(/^LIVE (deploy_id=[0-9a-f]{20,40}|settings_hash=[0-9a-f]{64}|snippets=\d+|snippets_hash=[0-9a-f]{64}|page (home|event) status=\d{3}|header (home|event) [a-z-]+=[0-9a-f]{64}|csp_ok=(yes|no))$/);
    }
    expect(lines).toContain(`LIVE deploy_id=${ID_NEW}`);
    expect(lines).toContain('LIVE snippets=0');
    expect(lines).toContain(`LIVE snippets_hash=${sha('[]')}`);
    expect(lines).toContain('LIVE page home status=200');
    expect(lines).toContain('LIVE page event status=200');
    expect(lines).toContain(`LIVE header home content-security-policy=${sha(CSP)}`);
    expect(lines).toContain(`LIVE header event x-content-type-options=${sha('nosniff')}`);
    expect(lines).toContain('LIVE csp_ok=yes');
    for (const secret of [TOKEN, 'hunter2', 'VALUE-NOT-TO-PRINT', 'googletagmanager']) {
      expect(r.out + r.err).not.toContain(secret);
    }
  });

  test('the settings hash moves with a settings change, not with a build env value', () => {
    const h = (json: object) => setup({ ...base, 'api-site': JSON.stringify(json) }).out.match(/settings_hash=(\w+)/)![1];
    const one = h(JSON.parse(site));
    dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
    const rotated = h({ ...JSON.parse(site), build_settings: { env: { SECRET_ENV: 'rotated' }, cmd: 'echo' } });
    dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
    const alias = h({ ...JSON.parse(site), domain_aliases: ['evil.example'] });
    expect(rotated).toBe(one);
    expect(alias).not.toBe(one);
  });

  test("csp_ok=no for 'unsafe-inline', 'unsafe-eval' or a missing CSP", () => {
    expect(setup({ ...base, event: headers("script-src 'self' 'unsafe-inline'") }).out).toContain('LIVE csp_ok=no');
    dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
    expect(setup({ ...base, home: headers("default-src 'self'; script-src 'self' 'unsafe-eval'") }).out).toContain('LIVE csp_ok=no');
    dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
    const r = setup({ ...base, home: headers(null) });
    expect(r.out).toContain('LIVE csp_ok=no');
    expect(r.out).not.toContain('LIVE header home content-security-policy=');
  });

  test('a strict policy alongside a lax one still restricts scripts (both are enforced)', () => {
    const r = setup({ ...base, home: headers(`frame-ancestors 'none', ${CSP}`) });
    expect(r.out).toContain('LIVE csp_ok=yes');
  });

  test('snippets are counted; an unreachable snippets API prints no snippets line', () => {
    expect(setup({ ...base, 'api-snippets': '[{"id":1,"general":"<script>x</script>"}]' }).out).toContain('LIVE snippets=1');
    dir = mkdtempSync(join(tmpdir(), 'aa-live-'));
    const { ['api-snippets']: _, ...noSnippets } = base;
    const r = setup(noSnippets);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('LIVE snippets=');
  });

  test('an event URL outside the site is not fetched', () => {
    const r = setup({ ...base, sitemap: '<urlset><url><loc>https://evil.example/x</loc></url></urlset>' });
    expect(r.out).not.toContain('LIVE page event');
    expect(r.out).toContain('LIVE csp_ok=no');
  });

  test('a malformed deploy id fails instead of printing it', () => {
    const r = setup({ ...base, 'api-site': JSON.stringify({ published_deploy: { id: 'abc\nLIVE snippets=0' } }) });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('LIVE');
  });

  test('check-live accepts what verify-live prints', () => {
    const r = setup(base);
    deploysLog(`2026-09-02T08:00:00Z ${ID_NEW} ${DIST}`);
    const judged = checkLive(r.out);
    expect(judged.out).not.toContain('ALERT');
    expect(judged.code).toBe(0);
  });
});

// ----------------------------------------------------------------- image-age
describe('docker/image-age.sh (stubbed docker)', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3).toISOString();
  const age = (f: { created?: string; labelCreated?: string; labelBase?: string; baseCreated?: string; info?: string }) => {
    const bin = join(dir, 'docker-stub');
    writeFileSync(
      bin,
      `#!/bin/bash
case "$*" in
  *'org.agentathens.base-created'*) printf '%s\\n' "${f.labelCreated ?? ''}" ;;
  *'org.agentathens.base-image'*) printf '%s\\n' "${f.labelBase ?? '<no value>'}" ;;
  "image inspect -f {{.Created}} agent-athens-pipeline:local") [ -n "${f.created ?? ''}" ] || exit 1; printf '%s\\n' "${f.created ?? ''}" ;;
  "image inspect -f {{.Created}} "*) [ -n "${f.baseCreated ?? ''}" ] || exit 1; printf '%s\\n' "${f.baseCreated ?? ''}" ;;
  "run "*) [ -n "${f.info ?? ''}" ] || exit 1; printf '${(f.info ?? '').replace(/\n/g, '\\n')}' ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(bin, 0o755);
    const r = run(['bash', join(DOCKER, 'image-age.sh'), 'agent-athens-pipeline:local'], { AA_DOCKER: bin });
    expect(r.code).toBe(0);
    return Object.fromEntries(r.out.trim().split('\n').map((l) => l.split('=') as [string, string]));
  };
  const near = (v: string, n: number) => expect(Math.abs(Number(v) - n)).toBeLessThanOrEqual(1);

  test('the base date comes from the label when the build was given it', () => {
    const r = age({ created: daysAgo(2), labelCreated: daysAgo(70), info: 'base_created=2020-01-01\nchromium_version=140.0.1\n' });
    near(r.local_days, 2);
    near(r.base_days, 70);
    expect(r.base_source).toBe('label');
  });

  test('then from inspecting the base image named in the label', () => {
    const r = age({ created: daysAgo(1), labelBase: 'mcr.microsoft.com/playwright:v1.63.0-noble@sha256:' + 'a'.repeat(64), baseCreated: daysAgo(45) });
    near(r.base_days, 45);
    expect(r.base_source).toBe('base-inspect');
  });

  test('then from the image-info file, which also names Chromium', () => {
    const d = daysAgo(90).slice(0, 10);
    const r = age({ created: daysAgo(1), info: `base_created=${d}\nchromium_version=140.0.7339.16\n` });
    near(r.base_days, 90);
    expect(r.base_source).toBe('image-info');
    expect(r.chromium).toBe('140.0.7339.16');
  });

  test('a rebuild resets the local age but not the base age', () => {
    const r = age({ created: daysAgo(0), labelCreated: daysAgo(61) });
    near(r.local_days, 0);
    near(r.base_days, 61);
  });

  test('unknown when nothing can be read (aa-run.sh then refuses)', () => {
    const r = age({ labelBase: 'bad ref;rm' });
    expect(r.local_days).toBe('unknown');
    expect(r.base_days).toBe('unknown');
    expect(r.base_source).toBe('none');
  });
});

// ------------------------------------------------------------- doctor checks
describe('docker/doctor-checks.sh', () => {
  const doctor = (envFile: string, env: Record<string, string> = {}) => {
    writeFileSync(join(dir, 'docker.env'), envFile);
    return run(['bash', join(DOCKER, 'doctor-checks.sh'), join(dir, 'docker.env')], env);
  };

  test('a fine-grained GH_TOKEN passes without printing it', () => {
    const r = doctor('# tokens\nGH_TOKEN=github_pat_11ABCDEFG_secretpart\nNETLIFY_AUTH_TOKEN=x\n', { AA_OFFSITE_CMD: '/usr/local/bin/offsite' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('ok    GH_TOKEN is a fine-grained token');
    expect(r.out).not.toContain('secretpart');
    expect(r.out).toContain('ok    AA_OFFSITE_CMD set');
  });

  test('a classic token is refused and not printed', () => {
    const r = doctor('GH_TOKEN=ghp_classicSECRET123\n', { AA_OFFSITE_CMD: 'x' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('FAIL  GH_TOKEN is not a fine-grained token');
    expect(r.out).not.toContain('classicSECRET');
  });

  test('the last GH_TOKEN line wins, as aa-run.sh parses it; a missing token fails', () => {
    expect(doctor('GH_TOKEN=github_pat_old\nGH_TOKEN=ghp_new\n').code).toBe(1);
    expect(doctor('GH_TOKEN="github_pat_quoted"\n').code).toBe(1); // aa-run passes the quotes through: broken token
    expect(doctor('NETLIFY_AUTH_TOKEN=x\n').out).toContain('GH_TOKEN not set');
  });

  test('warns (does not fail) when AA_OFFSITE_CMD is unset', () => {
    const r = doctor('GH_TOKEN=github_pat_x\n');
    expect(r.code).toBe(0);
    expect(r.out).toContain('warn  AA_OFFSITE_CMD not set');
  });

  test('the in-container doctor refuses a non-fine-grained token too', () => {
    const inContainer = readFileSync(join(DOCKER, 'doctor.sh'), 'utf8');
    expect(inContainer).toMatch(/"\$\{GH_TOKEN:-\}" == github_pat_\?\*[\s\S]{0,120}\|\| bad "GH_TOKEN is not a fine-grained token/);
  });
});
