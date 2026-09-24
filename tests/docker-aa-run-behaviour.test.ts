// Behaviour of docker/aa-run.sh, driven end to end with a stub `docker` (and a
// stub `osascript` that records alerts) first on PATH. The wrapper runs from a
// throwaway fixture repo, so the real docker/integrity-check.sh checks a real
// (fixture) git repo around every run. Nothing here starts a container: the
// stub only records its argv and prints the result lines the pipeline would.
// What is asserted comes from the recorded argv: which tokens each run gets,
// what it can see and write, which compose service (network) it uses, and the
// order of the runs.
import { beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const GIT_ID = ['GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_NAME'];
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const DEPLOY_ID = '0123456789abcdef01234567';

const DOCKER_STUB = `#!/bin/bash
# Test stub for docker: records argv (one ARG line per argument), answers the
# queries aa-run.sh makes, and prints the result lines the pipeline would.
{ echo "=== CALL"; echo "SECRETS_DIR_ENV \${AA_SECRETS_DIR:-}"; for a in "$@"; do printf 'ARG %s\\n' "$a"; done; } >> "$STUB_DIR/docker.log"
case "$1" in
    image) [ "$3" = "-f" ] && date -u +%Y-%m-%dT%H:%M:%SZ; exit 0 ;;
    kill) touch "$STUB_DIR/killed-$2"; exit 0 ;;
    ps)
        # A container named in $STUB_DIR/busy counts as running for the next
        # $STUB_DIR/busy-polls queries whose name filter matches it.
        filter=""; prev=""
        for a in "$@"; do [ "$prev" = "--filter" ] && filter="\${a#name=}"; prev="$a"; done
        [ -f "$STUB_DIR/busy" ] || exit 0
        b="$(cat "$STUB_DIR/busy")"
        printf '/%s\\n' "$b" | grep -qE "$filter" || exit 0
        n="$(cat "$STUB_DIR/busy-polls" 2>/dev/null || echo 1)"; n=$((n - 1))
        echo "$n" > "$STUB_DIR/busy-polls"
        [ "$n" -gt 0 ] || rm "$STUB_DIR/busy"
        case " $* " in *" -q "*) echo 0123abcd ;; *) echo "$b" ;; esac
        exit 0 ;;
    compose) ;;
    *) exit 0 ;;
esac
name=""; job=""; prev=""; svc_next=0; handoff=""; marker_env=""
for a in "$@"; do
    if [ "$svc_next" = 2 ]; then job="$a"; break; fi
    if [ "$svc_next" = 1 ]; then svc_next=2; continue; fi
    if [ "$prev" = "--name" ]; then name="$a"; svc_next=1; fi
    case "$prev:$a" in -v:*:/handoff:rw) handoff="\${a%:/handoff:rw}" ;; -e:AA_PUBLISH_MARKER=*) marker_env=1 ;; esac
    prev="$a"
done
# The publish marker as the pipeline writes it: into the handoff folder when
# given AA_PUBLISH_MARKER, else at its own /workspace root — a tmpfs the Mac
# never sees (modelled as a file outside the fixture repo).
mark_publish() {
    [ -n "\${STUB_NO_MARKER:-}" ] && return 0
    if [ -n "$marker_env" ] && [ -n "$handoff" ]; then touch "$handoff/publish-ready"; else touch "$STUB_DIR/container-root-marker"; fi
}
if [ -n "$name" ] && [ -n "\${STUB_HANG:-}" ]; then
    i=0
    while [ "$i" -lt 100 ]; do [ -f "$STUB_DIR/killed-$name" ] && exit 137; sleep 0.1; i=$((i + 1)); done
    exit 0
fi
case "$job" in
    build) mark_publish; [ -n "\${STUB_PLANT:-}" ] && echo planted > "$AA_REPO/CLAUDE.md"; echo "BUILD-RESULT dist_hash=\${STUB_BUILD_HASH}" ;;
    freshness) [ -n "\${STUB_SCRAPE_BUILDS:-}" ] && mark_publish ;;
    publish) echo "PUBLISH-RESULT deploy_id=\${STUB_DEPLOY_ID} dist_hash=\${STUB_PUBLISH_HASH} state=ready" ;;
    verify-live) printf '%s\\n' "LIVE deploy_id=\${STUB_DEPLOY_ID}" "LIVE settings_hash=3333333333333333333333333333333333333333333333333333333333333333" "LIVE snippets=0" \
        "LIVE snippets_hash=4444444444444444444444444444444444444444444444444444444444444444" "LIVE page home status=200" "LIVE page event status=200" \
        "LIVE header home content-security-policy=1111111111111111111111111111111111111111111111111111111111111111" "LIVE header event content-security-policy=1111111111111111111111111111111111111111111111111111111111111111" \
        "LIVE header home strict-transport-security=2222222222222222222222222222222222222222222222222222222222222222" "LIVE header event strict-transport-security=2222222222222222222222222222222222222222222222222222222222222222" \
        "LIVE header home x-content-type-options=\${STUB_NOSNIFF}" "LIVE header event x-content-type-options=\${STUB_NOSNIFF}" "LIVE csp_ok=yes" ;;
esac
exit 0
`;

const OSASCRIPT_STUB = `#!/bin/bash
# Test stub: records the notification text (the last argument).
for a in "$@"; do last="$a"; done
printf '%s\\n' "$last" >> "$STUB_DIR/notify.log"
`;

let fx: string; // fixture root
let repo: string;
let home: string;
let state: string;
let stub: string;
let secrets: string;

const git = (...args: string[]) => {
  const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    env: { PATH: process.env.PATH ?? '', HOME: home },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
};

function writePipeline(flags: string) {
  writeFileSync(join(repo, 'scripts/daily-automated.sh'), `#!/bin/bash\n# fixture: ${flags}\nexit 0\n`);
}

beforeEach(() => {
  fx = mkdtempSync(join(tmpdir(), 'aa-run-fx-'));
  repo = join(fx, 'repo');
  home = join(fx, 'home');
  state = join(fx, 'state');
  stub = join(fx, 'stub');
  secrets = join(home, '.config/agentathens');
  for (const d of [repo, home, state, stub, secrets, join(fx, 'tmp'), join(repo, 'docker'), join(repo, 'scripts'), join(repo, 'data'), join(repo, 'dist')]) {
    mkdirSync(d, { recursive: true });
  }
  // Every script the wrapper calls (image-age, check-live, doctor-checks …).
  for (const f of readdirSync(join(ROOT, 'docker'))) {
    if (/\.(sh|ya?ml)$/.test(f)) copyFileSync(join(ROOT, 'docker', f), join(repo, 'docker', f));
  }
  writePipeline('AA_DEFER_PUBLISH AA_SKIP_INGEST AA_SKIP_BUILD AA_PUBLISH_MARKER');
  writeFileSync(join(repo, 'data/events.db'), 'fixture bytes, not a database\n');
  writeFileSync(join(repo, 'dist/index.html'), '<p>fixture</p>\n');
  writeFileSync(join(repo, '.env'), 'EMAIL_PASSWORD=dotenv-secret-value\n');
  writeFileSync(join(repo, '.env.example'), 'EMAIL_PASSWORD=\n');
  Bun.spawnSync(['git', 'init', '-q'], { cwd: repo, env: { PATH: process.env.PATH ?? '', HOME: home } });
  git('add', 'docker', 'scripts', 'data');
  git('commit', '-qm', 'fixture');

  writeFileSync(join(stub, 'docker'), DOCKER_STUB);
  writeFileSync(join(stub, 'osascript'), OSASCRIPT_STUB);
  chmodSync(join(stub, 'docker'), 0o755);
  chmodSync(join(stub, 'osascript'), 0o755);

  writeFileSync(
    join(state, 'docker.env'),
    [
      'GH_TOKEN=gh-fixture',
      'NETLIFY_AUTH_TOKEN=nf-fixture',
      'NETLIFY_SITE_ID=site-fixture',
      'CLAUDE_CODE_OAUTH_TOKEN=claude-fixture',
      'GIT_AUTHOR_NAME=fixture',
      'GIT_AUTHOR_EMAIL=f@example.invalid',
      'GIT_COMMITTER_NAME=fixture',
      'GIT_COMMITTER_EMAIL=f@example.invalid',
      'EMAIL_USER=mailbox@example.invalid',
      'EMAIL_PASSWORD=mailbox-fixture',
      'IMAP_HOST=imap.example.invalid',
      'IMAP_PORT=',
      '',
    ].join('\n'),
  );
  chmodSync(join(state, 'docker.env'), 0o600);
  writeFileSync(join(secrets, 'gcp-kpi-reader.json'), '{}\n');
  chmodSync(join(secrets, 'gcp-kpi-reader.json'), 0o600);
});

function run(args: string[], extra: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', join(repo, 'docker/aa-run.sh'), ...args], {
    cwd: repo,
    env: {
      PATH: `${stub}:${process.env.PATH ?? ''}`,
      HOME: home,
      TMPDIR: join(fx, 'tmp'),
      AA_STATE_DIR: state,
      AA_CAFFEINATED: '1',
      AGENTATHENS_NTFY_TOPIC: '',
      STUB_DIR: stub,
      STUB_BUILD_HASH: HASH_A,
      STUB_PUBLISH_HASH: HASH_A,
      STUB_DEPLOY_ID: DEPLOY_ID,
      STUB_NOSNIFF: createHash('sha256').update('nosniff').digest('hex'),
      ...extra,
    },
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

type Call = { args: string[]; secretsEnv: string };
function calls(): Call[] {
  const log = join(stub, 'docker.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8')
    .split('=== CALL\n')
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').filter(Boolean);
      return {
        secretsEnv: (lines.find((l) => l.startsWith('SECRETS_DIR_ENV ')) ?? '').slice('SECRETS_DIR_ENV '.length),
        args: lines.filter((l) => l.startsWith('ARG ')).map((l) => l.slice(4)),
      };
    });
}
const after = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
type Run = { name: string; service: string; job: string; jobArgs: string[]; tokens: string[]; gitConfig: string[]; aaFlags: string[]; mounts: string[]; secretsEnv: string };
function runs(): Run[] {
  return calls()
    .filter((c) => c.args[0] === 'compose' && c.args.includes('run'))
    .map((c) => {
      const i = c.args.indexOf('--name');
      const envs = after(c.args, '-e');
      return {
        name: c.args[i + 1],
        service: c.args[i + 2],
        job: c.args[i + 3],
        jobArgs: c.args.slice(i + 4),
        tokens: envs.filter((e) => !e.startsWith('AA_') && !e.startsWith('GIT_CONFIG_')).sort(),
        gitConfig: envs.filter((e) => e.startsWith('GIT_CONFIG_')),
        aaFlags: envs.filter((e) => e.startsWith('AA_')).sort(),
        mounts: after(c.args, '-v'),
        secretsEnv: c.secretsEnv,
      };
    });
}
const notifications = () => (existsSync(join(stub, 'notify.log')) ? readFileSync(join(stub, 'notify.log'), 'utf8') : '');
const deploysLog = () => (existsSync(join(state, 'deploys.log')) ? readFileSync(join(state, 'deploys.log'), 'utf8') : '');

// Per-run views of the mounts.
const target = (m: string) => m.split(':')[1];
const dotenvAbsent = (r: Run) => !r.mounts.some((m) => target(m) === '/workspace/.env');
const dotenvVisible = (r: Run) => r.mounts.includes(`${repo}/.env:/workspace/.env:ro`);
const gitReadOnly = (r: Run) => r.mounts.includes(`${repo}/.git:/workspace/.git:ro`);
const gitWritable = (r: Run) =>
  !gitReadOnly(r) &&
  r.mounts.includes(`${repo}/.git:/workspace/.git:rw`) &&
  r.mounts.includes(`${repo}/.git/config:/workspace/.git/config:ro`) &&
  r.mounts.includes(`${repo}/.git/hooks:/workspace/.git/hooks:ro`);
const distReadOnly = (r: Run) => r.mounts.includes(`${repo}/dist:/workspace/dist:ro`);
const distWritable = (r: Run) => r.mounts.includes(`${repo}/dist:/workspace/dist:rw`);
const handoffMounted = (r: Run) => r.mounts.includes(`${state}/handoff:/handoff:rw`);
const MARKER_FLAG = 'AA_PUBLISH_MARKER=/handoff/publish-ready';
const egressStops = () => calls().filter((c) => c.args[0] === 'compose' && c.args.includes('rm') && c.args.at(-1) === 'egress').length;
const busy = (name: string, polls: number) => {
  writeFileSync(join(stub, 'busy'), `${name}\n`);
  writeFileSync(join(stub, 'busy-polls'), `${polls}\n`);
};
const gscMounted = (r: Run) => r.mounts.some((m) => m.includes('gcp-kpi-reader.json'));
const secretsFolderMounted = (r: Run) => r.secretsEnv === secrets;

describe.skipIf(process.platform === 'win32')('docker/aa-run.sh behaviour (stub docker)', () => {
  test('sealed freshness: ingest → scrape → offline build → publish, each with only its own access', () => {
    const r = run(['freshness']);
    expect(r.code).toBe(0);
    const rs = runs();
    expect(rs.map((x) => [x.name, x.service, x.job])).toEqual([
      ['agent-athens-freshness-ingest', 'pipeline-mail', 'ingest'],
      ['agent-athens-freshness', 'pipeline', 'freshness'],
      ['agent-athens-freshness-build', 'pipeline-offline', 'build'],
      ['agent-athens-freshness-publish', 'pipeline', 'publish'],
    ]);
    const [ingest, scrape, build, publish] = rs;

    // The mailbox settings come from docker.env (an empty IMAP_PORT= passes nothing).
    expect(ingest.tokens).toEqual(['EMAIL_PASSWORD', 'EMAIL_USER', 'IMAP_HOST']);
    expect(scrape.tokens).toEqual([]);
    expect(build.tokens).toEqual(GIT_ID);
    expect(publish.tokens).toEqual(['GH_TOKEN', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID', ...GIT_ID].sort());
    expect(scrape.aaFlags).toEqual(['AA_DEFER_PUBLISH', 'AA_SKIP_BUILD', 'AA_SKIP_INGEST']);
    expect(ingest.aaFlags).toEqual([]);
    for (const x of [build, publish]) expect(x.aaFlags).toEqual([MARKER_FLAG]);

    // The publish marker: only build and publish see the handoff folder.
    expect(handoffMounted(build)).toBe(true);
    expect(handoffMounted(publish)).toBe(true);
    for (const x of [ingest, scrape]) expect(handoffMounted(x)).toBe(false);
    expect(existsSync(join(state, 'handoff/publish-ready'))).toBe(true); // the stub's publish run leaves it
    expect(existsSync(join(repo, '.pipeline-publish-ready'))).toBe(false);

    expect(dotenvVisible(ingest)).toBe(true);
    for (const x of [scrape, build, publish]) {
      expect(dotenvAbsent(x)).toBe(true);
      expect(dotenvVisible(x)).toBe(false);
    }
    expect(gitReadOnly(ingest)).toBe(true);
    expect(gitReadOnly(scrape)).toBe(true);
    expect(gitWritable(build)).toBe(true);
    expect(gitWritable(publish)).toBe(true);

    expect(distReadOnly(scrape)).toBe(true);
    expect(distReadOnly(publish)).toBe(true);
    expect(distWritable(build)).toBe(true);
    for (const x of rs) expect(x.mounts.filter((m) => target(m) === '/workspace/dist').length).toBe(1);

    for (const x of rs) {
      expect(secretsFolderMounted(x)).toBe(false);
      expect(x.secretsEnv).toStartWith(join(fx, 'tmp', 'aa-empty.'));
    }
    expect(gscMounted(publish)).toBe(true);
    for (const x of [ingest, scrape, build]) expect(gscMounted(x)).toBe(false);

    expect(deploysLog()).toContain(` ${DEPLOY_ID} ${HASH_A}`);
    expect(existsSync(join(state, 'build-hash'))).toBe(false); // used once
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(false);
    expect(calls().some((c) => c.args[0] === 'kill')).toBe(false);
  });

  test('publish hash different from the build hash: not recorded, alert, non-zero exit', () => {
    const r = run(['freshness'], { STUB_PUBLISH_HASH: HASH_B });
    expect(r.code).toBe(10);
    expect(r.out).toContain('NOT recorded');
    expect(deploysLog()).toBe('');
    expect(notifications()).toContain(`not the hash the build run reported (${HASH_A})`);
    expect(existsSync(join(state, 'build-hash'))).toBe(false);
  });

  test('a build run that reports no dist hash is not published', () => {
    const r = run(['freshness'], { STUB_BUILD_HASH: 'not-a-hash' });
    expect(r.code).toBe(10);
    expect(runs().map((x) => x.job)).toEqual(['ingest', 'freshness', 'build']);
    expect(notifications()).toContain('dist hash');
  });

  test('older pipeline without AA_SKIP_BUILD keeps the scrape+build run and records as before', () => {
    writePipeline('AA_DEFER_PUBLISH AA_SKIP_INGEST AA_PUBLISH_MARKER');
    const r = run(['freshness'], { STUB_SCRAPE_BUILDS: '1', STUB_PUBLISH_HASH: HASH_B });
    expect(r.code).toBe(0);
    const rs = runs();
    expect(rs.map((x) => [x.job, x.service])).toEqual([
      ['ingest', 'pipeline-mail'],
      ['freshness', 'pipeline'],
      ['publish', 'pipeline'],
    ]);
    expect(rs[1].tokens).toEqual(GIT_ID);
    expect(rs[1].aaFlags).toEqual(['AA_DEFER_PUBLISH', MARKER_FLAG, 'AA_SKIP_INGEST']);
    expect(handoffMounted(rs[1])).toBe(true); // this scrape run is also the build run
    expect(gitWritable(rs[1])).toBe(true);
    expect(distWritable(rs[1])).toBe(true);
    expect(deploysLog()).toContain(` ${DEPLOY_ID} ${HASH_B}`);
    expect(run(['build']).code).toBe(2); // no separate build step to run
  });

  test('manual build then publish; a second publish without a new build is refused', () => {
    expect(run(['build']).code).toBe(0);
    expect(readFileSync(join(state, 'build-hash'), 'utf8').trim()).toBe(HASH_A);
    expect(run(['publish']).code).toBe(0);
    const rs = runs();
    expect(rs.map((x) => [x.name, x.service, x.job])).toEqual([
      ['agent-athens-build', 'pipeline-offline', 'build'],
      ['agent-athens-publish', 'pipeline', 'publish'],
    ]);
    expect(rs[0].tokens).toEqual(GIT_ID);
    expect(dotenvAbsent(rs[0])).toBe(true);
    expect(distReadOnly(rs[1])).toBe(true);
    expect(handoffMounted(rs[0]) && handoffMounted(rs[1])).toBe(true);
    expect(deploysLog()).toContain(DEPLOY_ID);

    const again = run(['publish']);
    expect(again.code).toBe(10);
    expect(again.out).toContain('no dist hash recorded');
    expect(runs().length).toBe(2); // no third container run
  });

  test('enrichment: Claude token only, .env hidden, .git read-only, no API keys; off-machine reminder at most weekly', () => {
    expect(run(['enrichment']).code).toBe(0);
    const [e] = runs();
    expect([e.name, e.service, e.job]).toEqual(['agent-athens-enrichment', 'pipeline', 'enrichment']);
    expect(e.tokens).toEqual(['CLAUDE_CODE_OAUTH_TOKEN']);
    expect(e.aaFlags).toEqual([]);
    expect(dotenvAbsent(e)).toBe(true);
    expect(handoffMounted(e)).toBe(false);
    expect(gitReadOnly(e)).toBe(true);
    expect(secretsFolderMounted(e)).toBe(false);
    expect(gscMounted(e)).toBe(false);
    expect(notifications().match(/AA_OFFSITE_CMD/g)?.length).toBe(1);

    const second = run(['enrichment']);
    expect(second.code).toBe(0);
    expect(second.out).toContain('AA_OFFSITE_CMD is not set'); // logged every time
    expect(notifications().match(/AA_OFFSITE_CMD/g)?.length).toBe(1); // alerted once
  });

  test('visibility is the run that gets the whole API-key folder', () => {
    expect(run(['visibility']).code).toBe(0);
    const [v] = runs();
    expect(v.tokens).toEqual([]);
    expect(secretsFolderMounted(v)).toBe(true);
  });

  test('verify-live and restore get only the Netlify token and site id', () => {
    writeFileSync(join(state, 'deploys.log'), `2026-01-01T00:00:00Z ${DEPLOY_ID} ${HASH_A}\n`);
    expect(run(['verify-live']).code).toBe(0);
    expect(run(['restore', DEPLOY_ID]).code).toBe(0);
    const [v, rs] = runs();
    expect([v.job, rs.job, ...rs.jobArgs]).toEqual(['verify-live', 'restore', DEPLOY_ID]);
    for (const x of [v, rs]) {
      expect(x.service).toBe('pipeline');
      expect(x.tokens).toEqual(['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID']);
      expect(dotenvAbsent(x)).toBe(true);
      expect(gitReadOnly(x)).toBe(true);
      expect(secretsFolderMounted(x)).toBe(false);
    }
    expect(run(['restore', 'f'.repeat(24)]).code).toBe(2); // not recorded
  });

  test('every run disables git gc/maintenance; restore records itself; doctor runs the host checks', () => {
    writeFileSync(join(state, 'deploys.log'), `2026-01-01T00:00:00Z ${DEPLOY_ID} ${HASH_A}\n`);
    expect(run(['restore', DEPLOY_ID]).code).toBe(0);
    expect(run(['enrichment']).code).toBe(0);
    for (const x of runs()) {
      expect(x.gitConfig).toEqual([
        'GIT_CONFIG_COUNT=2', 'GIT_CONFIG_KEY_0=gc.auto', 'GIT_CONFIG_VALUE_0=0',
        'GIT_CONFIG_KEY_1=maintenance.auto', 'GIT_CONFIG_VALUE_1=false',
      ]);
    }
    // The restored (older) deploy becomes the one verify-live expects.
    expect(deploysLog().trim().split('\n').at(-1)).toMatch(new RegExp(`^\\S+ ${DEPLOY_ID} restore$`));
    // doctor: the host-side check refuses a classic (non fine-grained) token.
    const d = run(['doctor']);
    expect(d.code).not.toBe(0);
    expect(d.out).toContain('github_pat_');
    expect(d.out).not.toContain('gh-fixture');
    // …and warns while the repo .env still holds secrets, naming keys, never values.
    expect(d.out).toContain("the repo's .env still holds secret-looking keys — .env: EMAIL_PASSWORD");
    expect(d.out).not.toContain('dotenv-secret-value');
    expect(d.out).not.toContain('mailbox-fixture');
  });

  test('a leftover snapshot is verified before a new one is taken', () => {
    const pre = join(state, 'state/agent-athens-enrichment.pre');
    const snap = Bun.spawnSync(['bash', join(repo, 'docker/integrity-check.sh'), 'snapshot', pre], {
      cwd: repo,
      env: { PATH: process.env.PATH ?? '', HOME: home, AA_STATE_DIR: state },
    });
    expect(snap.exitCode).toBe(0);
    // The unfinished run left a planted file behind. A fresh snapshot would
    // take it as the baseline; checking the old snapshot catches it.
    writeFileSync(join(repo, 'CLAUDE.md'), 'planted\n');
    const r = run(['enrichment']);
    expect(r.code).toBe(6);
    expect(r.out).toContain('never reached its integrity check');
    expect(runs()).toEqual([]);
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(true);
    expect(existsSync(join(repo, 'CLAUDE.md'))).toBe(false);
  });

  test('a clean leftover snapshot is checked, removed, and the run goes ahead', () => {
    const pre = join(state, 'state/agent-athens-enrichment.pre');
    Bun.spawnSync(['bash', join(repo, 'docker/integrity-check.sh'), 'snapshot', pre], {
      cwd: repo,
      env: { PATH: process.env.PATH ?? '', HOME: home, AA_STATE_DIR: state },
    });
    const r = run(['enrichment']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('never reached its integrity check');
    expect(r.out.match(/integrity-check: PASS/g)?.length).toBe(2);
    expect(runs().length).toBe(1);
    expect(existsSync(pre)).toBe(false);
  });

  test('a group-readable file in the secrets folder is refused', () => {
    chmodSync(join(secrets, 'gcp-kpi-reader.json'), 0o640);
    const r = run(['enrichment']);
    expect(r.code).toBe(4);
    expect(r.out).toContain(join(secrets, 'gcp-kpi-reader.json'));
    expect(r.out).toContain(`chmod 600 '${join(secrets, 'gcp-kpi-reader.json')}'`);
    expect(runs()).toEqual([]);
  });

  test('the secrets folder is made private (700)', () => {
    chmodSync(secrets, 0o755);
    expect(run(['visibility']).code).toBe(0);
    expect(Bun.spawnSync(['bash', '-c', `ls -ld '${secrets}'`]).stdout.toString()).toStartWith('drwx------');
  });

  test('a run past its time limit is killed, counted as failed, alerted, and still integrity-checked', () => {
    const r = run(['enrichment'], { STUB_HANG: '1', AA_JOB_TIMEOUT_SEC: '1' });
    expect(r.code).toBe(124);
    expect(calls().some((c) => c.args[0] === 'kill' && c.args[1] === 'agent-athens-enrichment')).toBe(true);
    expect(notifications()).toContain('ran past its 90-minute limit');
    expect(r.out).toContain('integrity-check: PASS');
    expect(existsSync(join(state, 'state/agent-athens-enrichment.pre'))).toBe(false);
  });

  test('no repo-root mount: every top-level entry is mounted by name with its own mode; symlinks and .env skipped', () => {
    mkdirSync(join(repo, 'config'));
    mkdirSync(join(repo, '.netlify'));
    writeFileSync(join(repo, 'README.md'), 'fixture\n');
    writeFileSync(join(repo, '.env.local'), 'SECRET_TOKEN=x\n');
    writeFileSync(join(repo, '.pipeline-freshness.lock'), '999999\n'); // a host run's leftover
    symlinkSync(home, join(repo, 'linked'));
    const r = run(['enrichment']);
    expect(r.code).toBe(0);
    expect(r.out).toContain("not mounting 'linked'");
    const [e] = runs();

    for (const m of e.mounts) {
      expect(m.startsWith(`${repo}:`)).toBe(false); // never the repo root
      expect(target(m)).not.toBe('/workspace');
    }
    // The data folders exist on the host now and are writable; node_modules
    // is never the host's.
    for (const d of ['temp', 'tmp', 'temp-descriptions', 'temp-briefs', 'temp-research', 'logs', 'data', 'dist']) {
      expect(existsSync(join(repo, d))).toBe(true);
      expect(e.mounts).toContain(`${repo}/${d}:/workspace/${d}:rw`);
    }
    expect(existsSync(join(repo, 'node_modules'))).toBe(false);
    expect(e.mounts.some((m) => target(m) === '/workspace/node_modules')).toBe(false);
    // Everything else read-only, each exactly once.
    for (const x of ['config', '.netlify', 'README.md', 'docker', 'scripts', '.env.example']) {
      expect(e.mounts.filter((m) => target(m) === `/workspace/${x}`)).toEqual([`${repo}/${x}:/workspace/${x}:ro`]);
    }
    expect(gitReadOnly(e)).toBe(true);
    // Not mounted at all: .env files (no DOTENV), the symlink, a host run's lock.
    for (const x of ['.env', '.env.local', 'linked', '.pipeline-freshness.lock']) {
      expect(e.mounts.some((m) => target(m) === `/workspace/${x}`)).toBe(false);
    }
    // Every host entry is accounted for: mounted once, or deliberately skipped.
    const skipped = new Set(['.git', '.env', '.env.local', 'linked', '.pipeline-freshness.lock']);
    for (const entry of readdirSync(repo)) {
      if (skipped.has(entry)) continue;
      expect(e.mounts.filter((m) => target(m) === `/workspace/${entry}`).length).toBe(1);
    }
  });

  test('.env files are read-only in runs that fetch mail, absent everywhere else', () => {
    writeFileSync(join(repo, '.env.local'), 'SECRET_TOKEN=x\n');
    expect(run(['freshness']).code).toBe(0);
    const [ingest, ...rest] = runs();
    expect(ingest.mounts).toContain(`${repo}/.env:/workspace/.env:ro`);
    expect(ingest.mounts).toContain(`${repo}/.env.local:/workspace/.env.local:ro`);
    for (const x of rest) expect(x.mounts.some((m) => ['/workspace/.env', '/workspace/.env.local'].includes(target(m)))).toBe(false);
    for (const x of runs()) expect(x.mounts.some((m) => m.startsWith('/dev/null:'))).toBe(false);
  });

  test('without AA_PUBLISH_MARKER support: no handoff, nothing published, and the operator is told', () => {
    writePipeline('AA_DEFER_PUBLISH AA_SKIP_INGEST AA_SKIP_BUILD');
    const r = run(['freshness']);
    expect(r.code).toBe(0);
    expect(runs().map((x) => x.job)).toEqual(['ingest', 'freshness', 'build']);
    for (const x of runs()) {
      expect(handoffMounted(x)).toBe(false);
      expect(x.aaFlags).not.toContain(MARKER_FLAG);
    }
    expect(existsSync(join(stub, 'container-root-marker'))).toBe(true); // written, but inside the container
    expect(r.out).toContain('nothing to publish');
    expect(notifications()).toContain('AA_PUBLISH_MARKER');
    expect(existsSync(join(state, 'handoff'))).toBe(false);
  });

  test('a stale publish marker is cleared before a new build', () => {
    mkdirSync(join(state, 'handoff'), { recursive: true });
    writeFileSync(join(state, 'handoff/publish-ready'), '');
    expect(run(['build'], { STUB_NO_MARKER: '1' }).code).toBe(0);
    expect(existsSync(join(state, 'handoff/publish-ready'))).toBe(false);
    expect(Bun.spawnSync(['bash', '-c', `ls -ld '${join(state, 'handoff')}'`]).stdout.toString()).toStartWith('drwx------');
  });

  test('a build that fails the integrity check leaves no publish marker and no build hash', () => {
    const r = run(['build'], { STUB_PLANT: '1' });
    expect(r.code).toBe(6);
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(true);
    expect(existsSync(join(state, 'handoff/publish-ready'))).toBe(false);
    expect(existsSync(join(state, 'build-hash'))).toBe(false);
  });

  test('a database-writing run waits while another one runs, then goes ahead', () => {
    busy('agent-athens-enrichment', 3);
    const r = run(['build'], { AA_DB_WAIT_POLL_SEC: '1' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('waiting for agent-athens-enrichment to finish');
    expect(r.out).toContain('going ahead');
    expect(runs().map((x) => x.job)).toEqual(['build']);
  });

  test('a database-writing run gives up after the wait limit with an alert (exit 11)', () => {
    busy('agent-athens-freshness', 999);
    const r = run(['enrichment'], { AA_DB_WAIT_POLL_SEC: '1', AA_DB_WAIT_MAX_SEC: '2' });
    expect(r.code).toBe(11);
    expect(r.out).toContain('agent-athens-freshness, another run that writes data/events.db, was still running');
    expect(notifications()).toContain('Job enrichment did not run');
    expect(runs()).toEqual([]);
  });

  test('runs that do not write the database do not wait; the same job already running is skipped', () => {
    busy('agent-athens-enrichment', 999);
    expect(run(['visibility'], { AA_DB_WAIT_MAX_SEC: '0' }).code).toBe(0);
    expect(runs().map((x) => x.job)).toEqual(['visibility']);
    // Another pipeline container still runs: the egress proxy is left up.
    expect(egressStops()).toBe(0);
    const same = run(['enrichment']);
    expect(same.code).toBe(0);
    expect(same.out).toContain('already running');
    expect(runs().length).toBe(1);
  });

  test('the egress proxy is stopped after a networked job, and not started for the offline build', () => {
    expect(run(['enrichment']).code).toBe(0);
    expect(egressStops()).toBe(1);
    expect(run(['build']).code).toBe(0);
    expect(egressStops()).toBe(1);
  });

  test('a bad AA_JOB_TIMEOUT_MIN is refused before anything runs', () => {
    for (const v of ['0', '00', 'abc', '5m']) {
      expect(run(['enrichment'], { AA_JOB_TIMEOUT_MIN: v }).code).toBe(2);
    }
    expect(runs()).toEqual([]);
  });
});
