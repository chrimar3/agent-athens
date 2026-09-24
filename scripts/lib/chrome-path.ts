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
 *
 * Inside the container, HTTPS_PROXY (set by docker/compose.yaml) names the
 * egress proxy, the only way out of the container's network. Chromium does not
 * read proxy variables, so it gets the proxy as a flag, and `<-loopback>`
 * removes Chromium's built-in localhost bypass: a page asking for localhost or
 * 127.0.0.1 goes to the proxy too, which refuses it.
 */
export function chromeLaunchArgs(env: Env = process.env): string[] {
  if (env.AA_CONTAINER !== '1') return [];
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (env.HTTPS_PROXY) args.push(`--proxy-server=${env.HTTPS_PROXY}`, '--proxy-bypass-list=<-loopback>');
  return args;
}
