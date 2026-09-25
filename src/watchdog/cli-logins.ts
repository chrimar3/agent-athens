/** Weekly check that the Mac no longer holds account-wide CLI logins
 *  (security loop round 9).
 *
 *  The container setup gives each container job its own scoped Netlify and
 *  GitHub tokens, and assumes the owner's Mac no longer holds the account-wide
 *  `netlify login` / `gh auth login` credentials: anything that runs as the
 *  owner on the Mac (a planted test, a hijacked host job) could otherwise use
 *  them. Nothing checked that assumption. The deadman (daily on the Mac) now
 *  calls weeklyCliLoginCheck(): once the container setup is installed
 *  (docker/aa-run.sh in the project AND hostStateDir()/docker.env), at most
 *  once every 7 days it looks for
 *    - an auth token in the Netlify CLI config (~/Library/Preferences/netlify/
 *      config.json on macOS, $XDG_CONFIG_HOME/netlify/config.json or
 *      ~/.config/netlify/config.json, and the legacy ~/.netlify/config.json) —
 *      presence only, the value is never read out, logged or sent;
 *    - `gh auth status --hostname github.com` succeeding (15 s timeout, output
 *      discarded unread: it can print a token).
 *  When either is there it returns a warning for the deadman to deliver
 *  through its notification and email paths. The time of the last check is
 *  kept in hostStateDir()/cli-login-check.json (no-follow write). */
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { hostStateDir } from './responders';
import { writeFileNoFollow } from './host-files';
import { readTailBounded } from './signal-sources';

export const CLI_LOGIN_CHECK_INTERVAL_MS = 7 * 24 * 3_600_000;
const GH_TIMEOUT_MS = 15_000;
const CONFIG_MAX_BYTES = 1024 * 1024;

export interface CliLoginDeps {
  /** Home folder (default os.homedir()). */
  home?: string;
  /** Environment (default process.env): XDG_CONFIG_HOME, PATH. */
  env?: Record<string, string | undefined>;
  /** The gh binary; default: found on PATH, /opt/homebrew/bin or /usr/local/bin. */
  ghBin?: string | null;
  ghTimeoutMs?: number;
}

export interface CliLoginFindings {
  /** Netlify CLI config files that hold an auth token (paths only). */
  netlifyTokenIn: string[];
  /** true: `gh auth status` succeeded for github.com; null: gh not found or timed out. */
  ghLoggedIn: boolean | null;
}

/** The container setup is installed: the wrapper in the project and its env file in the host state dir. */
export function containerSetupInstalled(projectDir: string): boolean {
  return existsSync(join(projectDir, 'docker', 'aa-run.sh')) && existsSync(join(hostStateDir(), 'docker.env'));
}

export function netlifyConfigPaths(deps: CliLoginDeps = {}): string[] {
  const home = deps.home ?? homedir();
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.startsWith('/') ? env.XDG_CONFIG_HOME : join(home, '.config');
  return [...new Set([
    join(home, 'Library', 'Preferences', 'netlify', 'config.json'),
    join(xdg, 'netlify', 'config.json'),
    join(home, '.config', 'netlify', 'config.json'),
    join(home, '.netlify', 'config.json'),
  ])];
}

/** true when a Netlify CLI config holds a non-empty auth token (users.<id>.auth.token). */
export function netlifyConfigHasToken(text: string): boolean {
  let cfg: unknown;
  try { cfg = JSON.parse(text); } catch { return false; }
  const users = (cfg as { users?: unknown } | null)?.users;
  if (!users || typeof users !== 'object') return false;
  return Object.values(users as Record<string, unknown>).some((u) => {
    const token = (u as { auth?: { token?: unknown } } | null)?.auth?.token;
    return typeof token === 'string' && token.trim() !== '';
  });
}

function findGh(env: Record<string, string | undefined>): string | null {
  const path = [env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':');
  return Bun.which('gh', { PATH: path }) ?? null;
}

export function findCliLogins(deps: CliLoginDeps = {}): CliLoginFindings {
  const env = deps.env ?? process.env;
  const netlifyTokenIn = netlifyConfigPaths(deps).filter((p) => {
    const text = readTailBounded(p, CONFIG_MAX_BYTES);
    return text !== null && netlifyConfigHasToken(text);
  });
  const gh = deps.ghBin === undefined ? findGh(env) : deps.ghBin;
  let ghLoggedIn: boolean | null = null;
  if (gh) {
    try {
      const r = Bun.spawnSync([gh, 'auth', 'status', '--hostname', 'github.com'], {
        stdin: 'ignore', stdout: 'ignore', stderr: 'ignore',
        env: { ...env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } as Record<string, string>,
        timeout: deps.ghTimeoutMs ?? GH_TIMEOUT_MS, killSignal: 'SIGKILL',
      });
      ghLoggedIn = r.signalCode ? null : r.exitCode === 0;
    } catch { /* not executable: unknown */ }
  }
  return { netlifyTokenIn, ghLoggedIn };
}

/** The warning text for findings, or null when there is nothing to warn about. */
export function cliLoginWarning(f: CliLoginFindings): { subject: string; body: string; short: string } | null {
  const found: string[] = [];
  for (const p of f.netlifyTokenIn) found.push(`the Netlify CLI config ${p} holds an auth token (value not read out)`);
  if (f.ghLoggedIn === true) found.push('`gh auth status` succeeds for github.com (the GitHub CLI is logged in)');
  if (found.length === 0) return null;
  const fix = 'The container setup holds its own scoped tokens, so log out on this Mac: run `netlify logout` and `gh auth logout`.';
  return {
    subject: '[Agent Athens] Mac still holds account-wide CLI logins',
    short: `Account-wide CLI login on this Mac — run \`netlify logout\` and \`gh auth logout\``,
    body:
      'The weekly deadman check found account-wide CLI logins on this Mac although the container setup is installed:\n\n' +
      found.map((x) => `  • ${x}`).join('\n') +
      `\n\n${fix}\nAnything that runs as you on this Mac can use these logins; the container jobs do not need them.\n` +
      'This check runs at most once a week (state: cli-login-check.json in the host state folder).\n',
  };
}

const statePath = () => join(hostStateDir(), 'cli-login-check.json');

/** At most once every 7 days, when the container setup is installed: the
 *  findings and a warning (null when clean). `null` result = not due / not
 *  installed. Records the check time before returning. */
export function weeklyCliLoginCheck(projectDir: string, nowMs: number, deps: CliLoginDeps = {}):
  { findings: CliLoginFindings; warning: ReturnType<typeof cliLoginWarning> } | null {
  if (!containerSetupInstalled(projectDir)) return null;
  const prev = readTailBounded(statePath(), 4096);
  let lastMs = 0;
  try { lastMs = Number((JSON.parse(prev ?? '{}') as { last_check_ms?: unknown }).last_check_ms) || 0; } catch { /* corrupt: due */ }
  if (lastMs <= nowMs && nowMs - lastMs < CLI_LOGIN_CHECK_INTERVAL_MS) return null;
  const findings = findCliLogins(deps);
  const warning = cliLoginWarning(findings);
  writeFileNoFollow(statePath(), JSON.stringify({
    last_check_ms: nowMs,
    last_check: new Date(nowMs).toISOString(),
    netlify_token_files: findings.netlifyTokenIn.length,
    gh_logged_in: findings.ghLoggedIn,
  }) + '\n');
  return { findings, warning };
}
