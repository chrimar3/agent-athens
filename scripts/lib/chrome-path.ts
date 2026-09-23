/** Chrome on the Mac — the only path the scrapers used before the container. */
export const MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

type Env = Record<string, string | undefined>;

/**
 * Chrome binary for puppeteer-core scrapers. PUPPETEER_EXECUTABLE_PATH (set by
 * docker/Dockerfile to the container's Chromium) wins; macOS Chrome otherwise.
 */
export function chromePath(env: Env = process.env): string {
  return env.PUPPETEER_EXECUTABLE_PATH || MAC_CHROME_PATH;
}

/**
 * Launch args for every scraper browser. Scraped pages are untrusted, so the
 * Chrome sandbox stays ON on the Mac. It is switched off only inside the
 * pipeline container (AA_CONTAINER=1, set by docker/Dockerfile), where
 * Docker's default seccomp profile blocks the namespaces the sandbox needs and
 * the container itself is the isolation boundary.
 */
export function chromeLaunchArgs(env: Env = process.env): string[] {
  return env.AA_CONTAINER === '1' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
}
