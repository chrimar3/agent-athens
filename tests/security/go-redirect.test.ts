/**
 * /go/<event-id>?url=… click redirector. It must not work as an open
 * redirect (no hosts that themselves redirect anywhere, https only), must
 * reject malformed event ids, and must bound what it writes to storage.
 */
import { describe, expect, test } from 'bun:test';
const mod = await import('../../netlify/functions/' + 'go.ts');
const redirect = mod.default as (r: Request, c: any) => Promise<Response>;
const { buildClickRecord } = mod as { buildClickRecord: (id: string, dest: URL, h: Headers) => Record<string, unknown> };

const go = (id: string, dest: string) =>
  redirect(new Request(`https://agentathens.com/go/${id}?url=${encodeURIComponent(dest)}`), {});

describe('/go/ redirector', () => {
  for (const dest of [
    'https://www.google.com/url?q=https://evil.example/',
    'https://google.com/url?q=https://evil.example/',
    'https://l.facebook.com/l.php?u=https://evil.example/',
    'https://www.facebook.com/flx/warn/?u=https://evil.example/',
    'http://www.viva.gr/tickets/x/',
    'javascript:alert(1)',
  ]) {
    test(`refuses ${dest}`, async () => {
      const res = await go('3f2a9c0e1b4d5a6c', dest);
      expect(res.status).toBe(403);
      expect(res.headers.get('location')).toBeNull();
    });
  }

  for (const id of ['UPPER', 'a%2Fb', 'x'.repeat(121), 'a_b', 'a.b', '%3Cscript%3E']) {
    test(`rejects event id ${id.slice(0, 20)}`, async () => {
      const res = await go(id, 'https://www.viva.gr/tickets/x/');
      expect(res.status).toBe(400);
      expect(res.headers.get('location')).toBeNull();
    });
  }

  test('overlong destination is refused', async () => {
    expect((await go('abc', 'https://www.viva.gr/' + 'a'.repeat(3000))).status).toBe(400);
  });

  test('a normal ticket link still redirects', async () => {
    const res = await go('3f2a9c0e1b4d5a6c', 'https://www.viva.gr/tickets/music/x/?a=1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.viva.gr/tickets/music/x/?a=1');
  });

  test('stored click record is bounded', () => {
    const headers = new Headers({ 'user-agent': 'U'.repeat(5000), referer: 'https://ref.example/' + 'r'.repeat(5000) });
    const rec = buildClickRecord('abc', new URL('https://www.viva.gr/tickets/x/?q=' + 'z'.repeat(1500)), headers);
    expect(JSON.stringify(rec).length).toBeLessThan(2048);
    expect(String(rec.userAgent).length).toBeLessThanOrEqual(256);
    expect(String(rec.referrer).length).toBeLessThanOrEqual(256);
  });
});
