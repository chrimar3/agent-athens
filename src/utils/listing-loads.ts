/**
 * Tracks the listing pages one source run tried to load. When every attempt
 * failed the run must fail (scrape-all records success=0 with this message),
 * because a source that could not reach its own listing has not had "a quiet
 * day". One page loading is enough: partial failure stays best-effort and is
 * logged by the caller.
 */
export class ListingLoads {
  private attempted = 0;
  readonly failures: string[] = [];

  constructor(private readonly source: string) {}

  ok(): void {
    this.attempted++;
  }

  failed(url: string, error: unknown): void {
    this.attempted++;
    this.failures.push(`${url} — ${error instanceof Error ? error.message : String(error)}`);
  }

  assertAnyLoaded(): void {
    if (this.attempted === 0 || this.failures.length < this.attempted) return;
    throw new Error(
      `${this.source}: all ${this.attempted} listing page(s) failed to load; last: ${this.failures[this.failures.length - 1]}` +
        ' — check outbound DNS/proxy from the container (docker/aa-run.sh doctor), then rerun with --source ' + this.source,
    );
  }
}

/** The part of a Puppeteer Page that loadListing needs. */
export interface ListingPage {
  goto(url: string, opts?: { waitUntil?: 'networkidle2' | 'domcontentloaded' | 'load'; timeout?: number }): Promise<{ status(): number; ok(): boolean } | null>;
}

/**
 * Navigate to one listing page and record the outcome in `loads`. A page that
 * answers non-2xx (a bot-challenge 403, a 503) is a failed load: Puppeteer
 * resolves goto() for those, so "goto did not throw" is not "the listing loaded".
 */
export async function loadListing(
  page: ListingPage,
  url: string,
  loads: ListingLoads,
  opts: { waitUntil?: 'networkidle2' | 'domcontentloaded' | 'load'; timeout?: number } = { waitUntil: 'networkidle2', timeout: 60_000 },
): Promise<boolean> {
  try {
    const res = await page.goto(url, opts);
    if (!res) {
      loads.failed(url, 'no response');
      return false;
    }
    if (!res.ok()) {
      loads.failed(url, `HTTP ${res.status()}`);
      return false;
    }
    loads.ok();
    return true;
  } catch (err) {
    loads.failed(url, err);
    return false;
  }
}
