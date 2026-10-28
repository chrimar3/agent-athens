/**
 * Scrapers must fail loudly when they cannot reach their own listing
 * (input-pipeline audit B1). From 2026-09-27 every guarded scraper hit
 * `getaddrinfo ESERVFAIL` in the container, caught it, returned [] and was
 * recorded as success=1 with 0 events for 19 days. scrape-all's main() records
 * success=0 + error_message only when the scraper REJECTS — so that is the
 * contract pinned here, under the exact container condition (every DNS lookup
 * fails). No network: DNS is mocked, fetch is a throwing fake. The guard runs
 * outside proxy mode here (AA_CONTAINER cleared), so it still resolves names
 * and meets the mocked ESERVFAIL even when this file runs inside the container.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

mock.module('node:dns/promises', () => ({
  lookup: async (host: string) => {
    const e: any = new Error(`getaddrinfo ESERVFAIL ${host}`);
    e.code = 'ESERVFAIL';
    throw e;
  },
}));

const scrapeAll = await import('../scripts/scrape-all');

const realFetch = globalThis.fetch;
const realSleep = Bun.sleep;
let fetchCalls: string[] = [];
const realContainerFlag = process.env.AA_CONTAINER;
beforeAll(() => {
  delete process.env.AA_CONTAINER;
  globalThis.fetch = (async (input: any) => {
    fetchCalls.push(String(input));
    throw new Error('fake network: unreachable');
  }) as unknown as typeof fetch;
  (Bun as any).sleep = async () => {}; // athinorama backs off 2 s + 4 s between attempts
});
afterAll(() => {
  if (realContainerFlag !== undefined) process.env.AA_CONTAINER = realContainerFlag;
  globalThis.fetch = realFetch;
  (Bun as any).sleep = realSleep;
});

describe('a source that cannot reach its listing rejects (never resolves to [])', () => {
  test('halfnote', async () => {
    await expect(scrapeAll.scrapeHalfNote()).rejects.toThrow(/ESERVFAIL/);
  });

  test('ticketservices', async () => {
    await expect(scrapeAll.scrapeTicketServices()).rejects.toThrow(/ESERVFAIL/);
  });

  test('athinorama', async () => {
    await expect(scrapeAll.scrapeAthinorama()).rejects.toThrow(/athinorama/);
  });

  test('more.com', async () => {
    await expect(scrapeAll.scrapeMore()).rejects.toThrow(/more: all 2 listing page\(s\) failed/);
  });

  test('resident advisor (GraphQL POST)', async () => {
    fetchCalls = [];
    await expect(scrapeAll.scrapeResidentAdvisor()).rejects.toThrow(/unreachable/);
    expect(fetchCalls).toEqual(['https://ra.co/graphql']); // precondition: the fake really was the path taken
  });
});

// Review finding (S235): with the outer catch rethrowing, one malformed RA
// listing (null date or venue — TBA / secret-location events) must cost that
// one event, not the whole source.
describe('a malformed item does not take the source down', () => {
  test('resident advisor: an item with a null venue or date is skipped, the rest are kept', async () => {
    const item = (id: string, over: Record<string, unknown> = {}) => ({
      event: { id, title: `Night ${id}`, date: '2099-01-10T00:00:00.000', startTime: '2099-01-10T23:00:00.000', contentUrl: `/events/${id}`, cost: '', venue: { name: 'Club X' }, ...over },
    });
    globalThis.fetch = (async (input: any) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ data: { eventListings: { totalResults: 3, data: [item('1'), item('2', { venue: null }), item('3', { date: null })] } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const events = await scrapeAll.scrapeResidentAdvisor();
    expect(events.map((e: any) => e.title)).toEqual(['Night 1']);
  });
});
