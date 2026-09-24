// Guards the pipeline container's isolation (docker/). A regression here
// re-exposes the Mac to code that handles scraped pages, emails and AI
// enrichment sessions.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
// `merge: true` resolves the `<<: *pipeline` merge keys the way Compose does.
const compose = parse(read('docker/compose.yaml'), { merge: true });
const svc = compose.services.pipeline;
const mail = compose.services['pipeline-mail'];
const offline = compose.services['pipeline-offline'];
const egress = compose.services.egress;
const PROXY_URL = 'http://egress:3128';
const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];

describe('docker/compose.yaml hardening', () => {
  test('services: three pipeline variants (proxied, mail, offline) and the egress proxy', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['egress', 'pipeline', 'pipeline-mail', 'pipeline-offline']);
  });

  for (const [label, s] of [['pipeline', svc], ['pipeline-mail', mail], ['pipeline-offline', offline]] as const) {
    test(`${label}: non-root, read-only, no capabilities, no privilege escalation`, () => {
      expect(String(s.user)).not.toMatch(/^(0|root)(:|$)/);
      expect(s.read_only).toBe(true);
      expect(s.cap_drop).toContain('ALL');
      expect(s.cap_add).toBeUndefined();
      expect(s.security_opt).toContain('no-new-privileges:true');
      expect(s.privileged).toBeFalsy();
      expect(s.init).toBe(true);
    });

    test(`${label}: publishes no ports`, () => {
      expect(s.ports).toBeUndefined();
      expect(s.expose).toBeUndefined();
    });

    test(`${label}: receives no shared env file (aa-run.sh passes tokens per job)`, () => {
      expect(s.env_file).toBeUndefined();
    });

    test(`${label}: mounts only the image's node_modules and the read-only secrets folder — never the repo root or the backups`, () => {
      const targets = s.volumes.map((v: string | { target: string }) => (typeof v === 'string' ? v : v.target));
      expect(targets.sort()).toEqual([
        '/home/pwuser/.config/agentathens',
        '/workspace/node_modules',
      ]);
      expect(JSON.stringify(s.volumes)).not.toContain('AA_REPO');
      const secrets = s.volumes.find((v: { target?: string }) => v.target === '/home/pwuser/.config/agentathens');
      expect(secrets.read_only).toBe(true);
      for (const v of s.volumes) {
        if (typeof v === 'string') continue;
        expect(v.source).not.toMatch(/^(~|\$\{?HOME\}?|\/)$/);
      }
    });

    test(`${label}: home directory is a fresh tmpfs every run`, () => {
      expect(s.tmpfs.some((t: string) => t.startsWith('/home/pwuser:'))).toBe(true);
    });

    test(`${label}: /workspace is a private, bounded, pwuser-writable tmpfs (entries are mounted onto it by aa-run.sh)`, () => {
      const ws = s.tmpfs.find((t: string) => t.startsWith('/workspace:'));
      expect(ws).toBeDefined();
      const opts = ws.slice('/workspace:'.length).split(',');
      expect(opts.some((o: string) => /^size=\d+[km]$/.test(o))).toBe(true);
      expect(opts).toContain('uid=1001');
      expect(opts).toContain('noexec');
      expect(opts).toContain('nosuid');
      expect(s.working_dir).toBe('/workspace');
    });
  }

  test('pipeline is on the internal network only; the mail service on the normal one; offline has no network', () => {
    expect(svc.network_mode).toBeUndefined();
    expect(svc.networks).toEqual(['sealed']);
    expect(compose.networks.sealed.internal).toBe(true);
    expect(mail.network_mode).toBeUndefined();
    expect(mail.networks).toEqual(['outside']);
    expect(compose.networks.outside?.internal).toBeFalsy();
    expect(offline.network_mode).toBe('none');
    expect(offline.networks).toBeUndefined();
    expect(offline.depends_on).toBeUndefined();
  });

  test('networked pipeline services send HTTP(S) through the egress proxy and start it first', () => {
    for (const s of [svc, mail]) {
      for (const v of PROXY_VARS) expect(s.environment[v]).toBe(PROXY_URL);
      expect(s.environment.NO_PROXY).toBe('');
      expect(s.environment.no_proxy).toBe('');
      expect(s.environment.TZ).toBe('Europe/Athens');
      expect(s.depends_on.egress.condition).toBe('service_healthy');
    }
    for (const v of [...PROXY_VARS, 'NO_PROXY', 'no_proxy']) expect(offline.environment[v]).toBeUndefined();
  });

  test('the offline service is the pipeline service, minus build, network, proxy and egress, plus network_mode none', () => {
    const { build: _build, networks: _n, depends_on: _d, environment: env, ...base } = svc;
    const { network_mode: _net, environment: offEnv, ...rest } = offline;
    expect(rest).toEqual(base);
    expect(offline.build).toBeUndefined();
    const withoutProxy = Object.fromEntries(Object.entries(env).filter(([k]) => !/_proxy$/i.test(k)));
    expect(offEnv).toEqual(withoutProxy);
  });

  test('the mail service is the pipeline service on the normal network', () => {
    const { build: _build, networks: _n, ...base } = svc;
    const { networks: _m, ...rest } = mail;
    expect(rest).toEqual(base);
  });

  test('egress proxy: non-root, read-only, no capabilities, no privilege escalation, no published ports, on both networks', () => {
    expect(String(egress.user)).not.toMatch(/^(0|root)(:|$)/);
    expect(egress.read_only).toBe(true);
    expect(egress.cap_drop).toContain('ALL');
    expect(egress.cap_add).toBeUndefined();
    expect(egress.security_opt).toContain('no-new-privileges:true');
    expect(egress.privileged).toBeFalsy();
    expect(egress.ports).toBeUndefined();
    expect(egress.expose).toBeUndefined();
    expect(egress.network_mode).toBeUndefined();
    expect([...egress.networks].sort()).toEqual(['outside', 'sealed']);
    expect(egress.env_file).toBeUndefined();
    expect(egress.pull_policy).toBe('never');
    expect(egress.build).toEqual({ context: '..', dockerfile: 'docker/Dockerfile', target: 'egress' });
    // aa-run.sh reads agent-athens-* container names as pipeline job runs.
    expect(egress.container_name).not.toMatch(/^agent-athens-/);
    // Only its own read-only configuration; nothing from the repo or home.
    expect(egress.volumes).toEqual([
      { type: 'bind', source: './egress/squid.conf', target: '/etc/squid/aa-egress.conf', read_only: true },
    ]);
    expect(egress.healthcheck.test.join(' ')).toContain('/dev/tcp/127.0.0.1/3128');
  });
});

describe('docker/egress/squid.conf', () => {
  const conf = read('docker/egress/squid.conf')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
  const acls = new Map<string, { type: string; values: string[] }>();
  for (const l of conf.filter((x) => x.startsWith('acl '))) {
    const [, name, type, ...values] = l.split(/\s+/);
    const a = acls.get(name) ?? { type, values: [] };
    a.values.push(...values);
    acls.set(name, a);
  }
  const access = conf.filter((l) => l.startsWith('http_access ')).map((l) => l.split(/\s+/).slice(1));
  const firstAllow = access.findIndex(([action]) => action === 'allow');
  const deniedBeforeAllow = (acl: string) =>
    access.slice(0, firstAllow).some(([action, ...names]) => action === 'deny' && names.length === 1 && names[0] === acl);

  test('listens on the port the pipeline services use', () => {
    expect(conf).toContain('http_port 3128');
  });

  test('refuses every private, loopback, link-local (metadata), CGNAT and IPv6 local range by IP after DNS', () => {
    const required = [
      '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16',
      '::1/128', 'fc00::/7', 'fe80::/10',
    ];
    for (const range of required) {
      const hit = [...acls].find(([, a]) => a.type === 'dst' && a.values.includes(range));
      expect(hit, range).toBeDefined();
      expect(deniedBeforeAllow(hit![0]), range).toBe(true);
    }
  });

  test("refuses Docker Desktop's names for the Mac and its gateway", () => {
    for (const host of ['host.docker.internal', 'gateway.docker.internal']) {
      const hit = [...acls].find(([, a]) => a.type === 'dstdomain' && a.values.includes(host));
      expect(hit, host).toBeDefined();
      expect(deniedBeforeAllow(hit![0]), host).toBe(true);
    }
  });

  test('allows ports 80 and 443 only, and CONNECT only to 443', () => {
    const ports = [...acls].filter(([, a]) => a.type === 'port');
    const web = ports.find(([n]) => access.some(([action, x]) => action === 'deny' && x === `!${n}`));
    expect(web?.[1].values.sort()).toEqual(['443', '80']);
    const connect = [...acls].find(([, a]) => a.type === 'method' && a.values.includes('CONNECT'));
    expect(connect).toBeDefined();
    const connectRule = access.find(([action, x]) => action === 'deny' && x === connect![0]);
    expect(connectRule).toBeDefined();
    const tls = acls.get(connectRule![2].replace(/^!/, ''));
    expect(connectRule![2].startsWith('!')).toBe(true);
    expect(tls).toEqual({ type: 'port', values: ['443'] });
    expect(access.indexOf(connectRule!)).toBeLessThan(firstAllow);
  });

  test('one allow, for the pipeline networks only, after every deny; everything else denied', () => {
    expect(access.filter(([action]) => action === 'allow').length).toBe(1);
    const [, clients] = access[firstAllow];
    expect(acls.get(clients)?.type).toBe('src');
    expect(acls.get(clients)?.values).not.toContain('all');
    expect(access.at(-1)).toEqual(['deny', 'all']);
    expect(access.slice(firstAllow + 1)).toEqual([['deny', 'all']]);
    expect(access[0]).toEqual(['deny', 'manager']);
  });
});

describe('docker/Dockerfile', () => {
  const dockerfile = read('docker/Dockerfile');
  test('base image pinned by digest', () => {
    expect(dockerfile).toMatch(/ARG BASE_IMAGE=\S+@sha256:[0-9a-f]{64}/);
  });
  // The pipeline stage (the default target) and the egress proxy stage.
  const pipelineStage = dockerfile.slice(dockerfile.indexOf('FROM ${BASE_IMAGE} AS pipeline'));
  const egressStage = dockerfile.slice(dockerfile.indexOf('FROM ${BASE_IMAGE} AS egress'), dockerfile.indexOf('FROM ${BASE_IMAGE} AS pipeline'));
  test('two stages from the one pinned base: egress first, pipeline last (the default target)', () => {
    const froms = [...dockerfile.matchAll(/^FROM\s+(.+)$/gm)].map((m) => m[1]);
    expect(froms).toEqual(['${BASE_IMAGE} AS egress', '${BASE_IMAGE} AS pipeline']);
    expect(dockerfile.match(/^ARG BASE_IMAGE=/gm)?.length).toBe(1);
    expect(read('docker/compose.yaml')).toMatch(/dockerfile: docker\/Dockerfile\n\s+target: pipeline/);
  });
  test('egress stage: squid from Ubuntu with system packages upgraded, run as the unprivileged proxy user', () => {
    expect(egressStage).toMatch(/apt-get update \\\n && apt-get -y [^\n]*upgrade --no-install-recommends/);
    expect(egressStage).toContain('apt-get install -y --no-install-recommends squid');
    expect(egressStage).toMatch(/^USER proxy$/m);
    expect(egressStage).toContain('"-f", "/etc/squid/aa-egress.conf"');
    expect(egressStage).not.toMatch(/^COPY /m);
  });
  test('system packages are upgraded on every build; the base date and Chromium version are recorded', () => {
    expect(pipelineStage).toMatch(/apt-get update \\\n && apt-get -y [^\n]*upgrade --no-install-recommends/);
    expect(pipelineStage).toContain('rm -rf /var/lib/apt/lists/*');
    expect(pipelineStage).toMatch(/LABEL org\.agentathens\.base-image="\$\{BASE_IMAGE\}"[\s\S]{0,80}org\.agentathens\.base-created=/);
    // Recorded before the upgrade touches the dpkg database it is read from.
    const info = pipelineStage.indexOf('> /usr/local/share/agentathens/image-info');
    expect(info).toBeGreaterThan(0);
    expect(info).toBeLessThan(pipelineStage.indexOf('apt-get update'));
    expect(dockerfile).toMatch(/base_created=%s\\nchromium_version=%s/);
    expect(dockerfile).toContain('/ms-playwright/chromium-*/chrome-linux*/chrome');
  });
  test('final user is not root', () => {
    const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    expect(users.at(-1)).toBeDefined();
    expect(users.at(-1)).not.toMatch(/^(0|root)$/);
  });
  test('build context is an allowlist that never includes .env or data', () => {
    const ignore = read('docker/Dockerfile.dockerignore').split('\n').filter((l) => l && !l.startsWith('#'));
    expect(ignore[0]).toBe('*');
    expect(ignore.some((l) => /^!.*(\.env|data\/|\.git)/.test(l))).toBe(false);
  });
});

describe('docker/aa-run.sh least privilege', () => {
  const wrapper = read('docker/aa-run.sh');
  const policy = (name: string) => wrapper.split('\n').find((l) => l.trim().startsWith(`${name})`)) ?? '';

  test('enrichment gets only the Claude token, no secrets folder, no .env, read-only .git', () => {
    const line = policy('enrichment');
    expect(line).toContain('TOKENS="CLAUDE_CODE_OAUTH_TOKEN"');
    expect(line).toContain('SECRETS=no');
    expect(line).toContain('DOTENV=no');
    expect(line).toContain('GITRW=no');
  });

  test('the scrape run holds no publishing token or API keys; the publish run gets only the Search Console key', () => {
    expect(policy('scrape')).not.toMatch(/GH_TOKEN|NETLIFY_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN/);
    expect(policy('scrape-build')).not.toMatch(/GH_TOKEN|NETLIFY_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN/);
    for (const name of ['enrichment', 'visibility', 'site', 'test|shell']) {
      expect(policy(name)).not.toMatch(/GH_TOKEN|NETLIFY_AUTH_TOKEN/);
    }
    expect(policy('scrape')).toContain('SECRETS=no');
    expect(policy('publish')).toContain('SECRETS=gsc');
    expect(policy('publish')).toContain('DOTENV=no');
    expect(wrapper).toContain('gcp-kpi-reader.json:/home/pwuser/.config/agentathens/gcp-kpi-reader.json:ro');
  });

  test('email ingest runs on its own with the mailbox keys; the Chrome scrape run sees no .env by default', () => {
    expect(policy('scrape')).toContain('DOTENV=${SCRAPE_DOTENV:-no}');
    expect(policy('ingest')).toContain('TOKENS="$MAIL_KEYS"; SECRETS=no; DOTENV=yes; GITRW=no; NET=mail;');
    expect(wrapper).toContain('MAIL_KEYS="EMAIL_USER EMAIL_PASSWORD IMAP_HOST IMAP_PORT"');
    // The exact names src/ingest/email-ingestion.ts reads.
    const ingest = read('src/ingest/email-ingestion.ts');
    for (const k of ['EMAIL_USER', 'EMAIL_PASSWORD', 'IMAP_HOST', 'IMAP_PORT']) expect(ingest).toContain(`env.${k}`);
    expect(wrapper).toMatch(/run_container ingest[\s\S]*export AA_SKIP_INGEST=1[\s\S]*run_container scrape/);
  });

  test('restore only accepts a deploy id the pipeline recorded', () => {
    expect(wrapper).toMatch(/restore\)[\s\S]{0,400}grep -qxF "\$id"[\s\S]{0,200}only deploys the pipeline recorded/);
    expect(policy('restore')).toMatch(/TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no/);
    const r = Bun.spawnSync(['bash', join(ROOT, 'docker/restore-deploy.sh'), 'not-hex'], { env: { PATH: process.env.PATH ?? '', NETLIFY_AUTH_TOKEN: 'x', NETLIFY_SITE_ID: 'y' } });
    expect(r.exitCode).toBe(2);
  });

  test('scheduled runs that refuse to start send an alert', () => {
    expect(wrapper).toMatch(/fail\(\) \{[\s\S]{0,300}! -t 1[\s\S]{0,200}integrity-check\.sh" notify/);
  });

  test('freshness defers publishing to a separate run when the pipeline supports it', () => {
    expect(wrapper).toMatch(/export AA_DEFER_PUBLISH=1[\s\S]*run_container scrape[\s\S]*run_container publish/);
  });

  test('sealed build: scrape writes neither .git nor dist/; build is offline with git identity only; publish cannot write dist/', () => {
    expect(policy('scrape')).toMatch(/TOKENS=""; SECRETS=no; DOTENV=\$\{SCRAPE_DOTENV:-no\}; GITRW=no; DIST=ro;/);
    expect(policy('build')).toMatch(/TOKENS="\$GIT_ID"; SECRETS=no; DOTENV=no; GITRW=yes; NET=no;/);
    expect(policy('publish')).toContain('DIST=ro');
    expect(wrapper).toContain('[ "$entry" = "dist" ] && [ "$DIST" = "ro" ] && mode=ro');
    expect(wrapper).toContain('[ "$NET" = "no" ] && service=pipeline-offline');
    expect(wrapper).toContain('[ "$NET" = "mail" ] && service=pipeline-mail');
    expect(wrapper).toMatch(/export AA_SKIP_BUILD=1[\s\S]*run_container scrape [\s\S]*run_container build [\s\S]*run_container publish /);
  });

  test('a deploy is recorded only when its dist hash is the one the build run reported', () => {
    expect(wrapper).toContain("'^BUILD-RESULT dist_hash=[0-9a-f]{64}$'");
    expect(wrapper).toMatch(/record_deploy\(\) \{[\s\S]*"\$hash" != "\$BUILD_HASH"[\s\S]*notify[\s\S]*exit 10/);
  });

  test('every policy has a time limit', () => {
    const lines = wrapper.split('\n').filter((l) => /^\s+[a-z|-]+\)\s+TOKENS=/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(14);
    for (const l of lines) expect(l).toMatch(/LIMIT=[1-9][0-9]*/);
    expect(wrapper).toContain('docker kill "$name"');
  });

  test('the token file lives outside every folder a container mounts', () => {
    expect(wrapper).toContain('ENV_FILE="${AA_ENV_FILE:-$STATE_DIR/docker.env}"');
    expect(wrapper).toContain('STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"');
    expect(wrapper).toContain('inside "$ENV_FILE" "$REPO" || inside "$ENV_FILE" "$SECRETS_DIR"');
  });

  test('the repo root is never mounted; every top-level entry is, by name, read-only except the data folders', () => {
    const rw = ((wrapper.match(/RW_TOP="([^"]*)"/) ?? ['', ''])[1]).split(/\s+/).sort();
    expect(rw).toEqual(['data', 'dist', 'logs', 'node_modules', 'temp', 'temp-briefs', 'temp-descriptions', 'temp-research', 'tmp']);
    expect(wrapper).not.toMatch(/"\$REPO:\/workspace/);
    expect(wrapper).toContain('done < <(ls -A1 "$REPO")');
    expect(wrapper).toContain('mounts+=(-v "$REPO/$entry:/workspace/$entry:$mode")');
    expect(wrapper).toMatch(/mode=ro\n\s+case " \$RW_TOP " in \*" \$entry "\*\) mode=rw ;; esac/);
    expect(wrapper).toContain('.git/config:/workspace/.git/config:ro');
    expect(wrapper).toContain('.git/hooks:/workspace/.git/hooks:ro');
    expect(wrapper).toContain('$REPO/.git:/workspace/.git:ro');
    // Symlinks at the top level are never followed into a container.
    expect(wrapper).toMatch(/if \[ -L "\$REPO\/\$entry" \]; then\n\s+log "not mounting[^\n]*\n\s+continue/);
  });

  test('.netlify is writable only by the publish run', () => {
    expect(wrapper).toContain('[ "$entry" = ".netlify" ] && [ "$policy" = "publish" ] && mode=rw');
  });

  test('runs that write the database wait for each other (2 h at most, then alert)', () => {
    expect(wrapper).toContain("DB_WRITERS_RE='^/agent-athens-(freshness|freshness-ingest|freshness-build|build|enrichment|daily|site)$'");
    expect(wrapper).toContain('max="${AA_DB_WAIT_MAX_SEC:-7200}"');
    expect(wrapper).toContain('poll="${AA_DB_WAIT_POLL_SEC:-30}"');
    expect(wrapper).toMatch(/if writes_db "\$policy"; then wait_for_db_writers; fi\n\s+docker rm -f "\$name"/);
  });

  test('the publish marker crosses only through the handoff folder, only for build and publish runs', () => {
    expect(wrapper).toContain('HANDOFF_DIR="$STATE_DIR/handoff"');
    expect(wrapper).toMatch(/build\|scrape-build\|publish\)\n\s+mounts\+=\(-v "\$HANDOFF_DIR:\/handoff:rw"\)\n\s+env_flags\+=\(-e "AA_PUBLISH_MARKER=\/handoff\/publish-ready"\)/);
    expect(wrapper).toContain('inside "$ENV_FILE" "$HANDOFF_DIR"');
  });

  test('the egress proxy image is built with the pipeline image and stopped after the job', () => {
    expect(wrapper).toContain('"${COMPOSE[@]}" build "$@" pipeline egress');
    expect(wrapper).toContain('"${COMPOSE[@]}" build --no-cache --pull pipeline egress');
    expect(wrapper).toContain('"${COMPOSE[@]}" rm -s -f egress');
  });

  test('deploys are recorded on the Mac from a strict result line', () => {
    expect(wrapper).toContain('DEPLOYS_LOG="$STATE_DIR/deploys.log"');
    expect(wrapper).toContain("'^PUBLISH-RESULT deploy_id=[0-9a-f]{20,40} dist_hash=[0-9a-f]{64} state=ready$'");
    expect(wrapper).toMatch(/verify-live\)\s+TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no/);
    // check_live hands the strict LIVE lines to docker/check-live.sh (tested in
    // tests/docker-verify-live.test.ts) and alerts + exits 8 on any finding.
    expect(wrapper).toMatch(/check_live\(\) \{[\s\S]{0,200}check-live\.sh" "\$1" "\$DEPLOYS_LOG" "\$STATE_DIR\/live-baseline"[\s\S]{0,400}integrity-check\.sh" notify[\s\S]{0,120}exit 8/);
    expect(read('docker/check-live.sh')).toContain('is not one the pipeline recorded');
  });

  test('stale images are refused except for checks and restores', () => {
    expect(wrapper).toContain('case "$JOB" in doctor|shell|verify-live|restore) stale_ok=yes');
    // Both clocks are checked only for the runs that load outside content.
    const block = wrapper.slice(wrapper.indexOf('stale_ok=yes'), wrapper.indexOf('caffeinate'));
    expect(block).toMatch(/if \[ "\$stale_ok" = "no" \] && \[ -z "\$\{AA_ALLOW_STALE_IMAGE:-\}" \]; then/);
    // The local build: 30 days, image-refresh fixes it.
    expect(block).toMatch(/"\$\{age_days:-999\}" -gt 30 \][\s\S]{0,300}image-refresh[\s\S]{0,120}\s7\n/);
    // The Playwright base (Chromium): 60 days by default, measured from the
    // base's own date, so a rebuild does not reset it; unknown counts as old.
    expect(block).toContain('max_base_days="${AA_MAX_BASE_AGE_DAYS:-60}"');
    expect(block).toContain('bash "$HERE/image-age.sh" agent-athens-pipeline:local');
    expect(block).toMatch(/"\$\{base_days:-999\}" -gt "\$max_base_days" \][\s\S]{0,500}Dependabot[\s\S]{0,200}docker\/aa-run\.sh image'[\s\S]{0,200}\s7\n/);
  });

  test('backups wait for other runs, are checksummed and pruned in tiers', () => {
    expect(wrapper).toContain("docker ps -q --filter 'name=^/agent-athens-'");
    expect(wrapper).toContain('>> SHA256SUMS');
    expect(wrapper).toMatch(/prune_backups\(\)[\s\S]*-le 20[\s\S]*-le 14[\s\S]*-le 8[\s\S]*-le 6/);
  });

  test('every .env* file is absent (not even an empty file) for runs without DOTENV, read-only otherwise', () => {
    expect(wrapper).toContain('is_dotenv() { case "$1" in .env.example) return 1 ;; .env|.env.*) return 0 ;; esac; return 1; }');
    expect(wrapper).toContain('[ "$DOTENV" = "yes" ] && mounts+=(-v "$REPO/$entry:/workspace/$entry:ro")');
    expect(wrapper).not.toContain('/dev/null:/workspace');
  });

  test('env file is parsed, never sourced', () => {
    expect(wrapper).not.toMatch(/^\s*(source|\.)\s+"?\$\{?ENV_FILE/m);
  });

  test('help succeeds and unknown jobs are refused', () => {
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/aa-run.sh'), 'help']).exitCode).toBe(0);
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/aa-run.sh'), 'bogus-job']).exitCode).toBe(2);
  });
});

describe('docker/install-launchd.sh', () => {
  const installer = read('docker/install-launchd.sh');
  test('wrapper logs go to the host-only state folder, not the repo', () => {
    expect(installer).toContain('LOGDIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs"');
    expect(installer).not.toContain('$REPO/logs/docker-');
  });
  test('carries AA_OFFSITE_CMD into the generated plists when set', () => {
    expect(installer).toContain('<key>AA_OFFSITE_CMD</key><string>$(xml "$AA_OFFSITE_CMD")</string>');
  });
  test('the watchdog checks every scheduled container job (once config/monitoring.json lists them)', () => {
    const names = [...(installer.match(/JOBS="([^"]*)"/) ?? ['', ''])[1].matchAll(/^([a-z0-9-]+)\|/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(9);
    const labels: string[] = JSON.parse(read('config/monitoring.json')).pipeline_health_labels;
    // Before the protected-paths PR merges, monitoring.json has no docker labels yet.
    if (!labels.some((l) => l.startsWith('com.agentathens.docker.'))) return;
    for (const n of names) expect(labels).toContain(`com.agentathens.docker.${n}`);
  });
  test('schedules the live-site check and the weekly image rebuild', () => {
    expect(installer).toContain('verify-live|verify-live|12|15|');
    expect(installer).toContain('image-refresh|image-refresh|5|30|0');
  });
});

describe('docker/stat-bsd-compat.sh', () => {
  test.skipIf(process.platform !== 'linux')('translates BSD stat forms to GNU', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-stat-'));
    const file = join(dir, 'f');
    writeFileSync(file, 'hello');
    const run = (...args: string[]) =>
      new TextDecoder().decode(Bun.spawnSync(['bash', join(ROOT, 'docker/stat-bsd-compat.sh'), ...args]).stdout).trim();
    const gnu = (fmt: string) => new TextDecoder().decode(Bun.spawnSync(['/usr/bin/stat', '-c', fmt, file]).stdout).trim();
    expect(run('-f', '%m', file)).toBe(gnu('%Y'));
    expect(run('-f%z', file)).toBe('5');
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/stat-bsd-compat.sh'), '-f', '%Sm', file]).exitCode).toBe(1);
  });
});
