/**
 * Child process for outbound-url.test.ts § "inside the container". It runs
 * the REAL guard (no injected resolver) under the sealed network's DNS
 * condition: every node:dns lookup fails with ESERVFAIL, as on the
 * `internal: true` network (docker/compose.yaml). The parent passes the
 * environment explicitly, so the verdicts are the same on the Mac and inside
 * the container, and nothing here can reach the network: DNS always fails,
 * fetch and curl are fakes.
 *
 *   bun run guard-under-container-dns.ts '<JSON array of cases>'
 *
 * Prints one JSON line: { lookups, results: [...] } in case order.
 */
export {};

// Patched before the guard is imported, so its `lookup` binding is this one.
const dns = require('node:dns/promises');
let lookups = 0;
dns.lookup = async (host: string) => {
  lookups++;
  const e: any = new Error(`getaddrinfo ESERVFAIL ${host}`);
  e.code = 'ESERVFAIL';
  throw e;
};

const guard = await import('../../outbound-url');

type Case =
  | { kind: 'assert'; input: string }
  | { kind: 'hostCheck'; input: string }
  | { kind: 'curl'; input: string }
  | { kind: 'fetch'; input: string; routes: Record<string, { status: number; location?: string }> };

async function run(c: Case): Promise<Record<string, unknown>> {
  try {
    if (c.kind === 'assert') {
      const { url, addresses } = await guard.assertPublicUrl(c.input);
      return { ok: true, href: url.href, addresses };
    }
    if (c.kind === 'hostCheck') {
      return { ok: true, reason: await guard.createHostChecker()(c.input) };
    }
    if (c.kind === 'curl') {
      let args: string[] = [];
      const spawn = (a: string[]) => {
        args = a;
        return { stdout: new Response('ok').body!, exited: Promise.resolve(0), kill() {} };
      };
      const text = await guard.safeCurlText(c.input, { spawn });
      return { ok: true, text, args };
    }
    const visited: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      visited.push(url);
      const r = c.routes[url];
      if (!r) throw new Error(`fake network: no route for ${url}`);
      return new Response('', { status: r.status, headers: r.location ? { location: r.location } : {} });
    }) as typeof fetch;
    try {
      const res = await guard.safeFetch(c.input, { fetchImpl });
      return { ok: true, status: res.status, visited };
    } catch (e) {
      return { ok: false, code: (e as any).code, message: (e as Error).message, visited };
    }
  } catch (e) {
    return { ok: false, code: (e as any).code, message: (e as Error).message };
  }
}

const cases: Case[] = JSON.parse(process.argv[2] ?? '[]');
const results = [];
for (const c of cases) results.push(await run(c));
console.log(JSON.stringify({ lookups, results }));
