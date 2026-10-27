/**
 * megaron.gr listing fetch: retry on transient failures, and a loud failure
 * instead of an empty success (input-pipeline audit A6).
 *
 * On 2026-10-05 21:45Z one HTTP 503 (no retry) was recorded as success=1 with
 * 0 events — megaron was then 21% of the shown set.
 */

import { describe, test, expect } from 'bun:test';
import { fetchMegaronListing, scrapeMegaron } from '../scripts/scrape-megaron';

const noSleep = async () => {};

/** A fetch stub that answers with the given statuses (or throws for 'error'), in order. */
function scripted(answers: Array<number | 'error'>, body = '<html></html>') {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a === 'error') throw new Error('socket hang up');
    return new Response(a === 200 ? body : 'unavailable', { status: a });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const CARD = (date: string, slug: string, title: string) => `
  <div class="tease tease--event-calendar" data-date="${date},">
    <div class="category-title">Μουσική</div>
    <div class="col-1"><a href="/el/event/${slug}/"><h2>${title}</h2></a></div>
  </div>`;

describe('fetchMegaronListing — retry/backoff', () => {
  test('a 503 followed by a 200 returns the page after one retry', async () => {
    const s = scripted([503, 200], '<p>ok</p>');
    const html = await fetchMegaronListing({ fetchImpl: s.impl, sleep: noSleep });
    expect(html).toBe('<p>ok</p>');
    expect(s.calls.length).toBe(2);
  });

  test('a network error followed by a 200 returns the page', async () => {
    const s = scripted(['error', 200], '<p>ok</p>');
    expect(await fetchMegaronListing({ fetchImpl: s.impl, sleep: noSleep })).toBe('<p>ok</p>');
    expect(s.calls.length).toBe(2);
  });

  test('a persistent 503 throws after the last attempt, naming the status', async () => {
    const s = scripted([503]);
    await expect(fetchMegaronListing({ fetchImpl: s.impl, sleep: noSleep, delaysMs: [1, 1] }))
      .rejects.toThrow(/503/);
    expect(s.calls.length).toBe(3);
  });

  test('a 404 is not retried', async () => {
    const s = scripted([404]);
    await expect(fetchMegaronListing({ fetchImpl: s.impl, sleep: noSleep })).rejects.toThrow(/404/);
    expect(s.calls.length).toBe(1);
  });

  test('waits the configured backoff between attempts', async () => {
    const waited: number[] = [];
    const s = scripted([503, 503, 200]);
    await fetchMegaronListing({ fetchImpl: s.impl, sleep: async (ms) => { waited.push(ms); }, delaysMs: [10, 20] });
    expect(waited).toEqual([10, 20]);
  });
});

describe('scrapeMegaron — failure is an error, not an empty success', () => {
  test('a persistent 503 rejects instead of resolving to []', async () => {
    const s = scripted([503]);
    await expect(scrapeMegaron({ fetchImpl: s.impl, sleep: noSleep })).rejects.toThrow(/503/);
  });

  test('a page with zero event cards rejects (structure changed)', async () => {
    const s = scripted([200], '<html><body>maintenance</body></html>');
    await expect(scrapeMegaron({ fetchImpl: s.impl, sleep: noSleep })).rejects.toThrow(/0 event cards/);
  });

  test('a page whose cards are all past-dated resolves to [] (a quiet listing is not an error)', async () => {
    const html = CARD('01 01 2001', 'old', 'Old concert');
    const s = scripted([200], html);
    expect(await scrapeMegaron({ fetchImpl: s.impl, sleep: noSleep })).toEqual([]);
  });

  test('a page with a future card returns it', async () => {
    const html = CARD('19 02 2099', 'future', 'Future concert');
    const s = scripted([200], html);
    const events = await scrapeMegaron({ fetchImpl: s.impl, sleep: noSleep });
    // Precondition: the fixture really exercises the parser (fails loudly if the card markup drifts).
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Future concert');
  });
});
