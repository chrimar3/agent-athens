/**
 * Bundles netlify/functions/mcp.mts with esbuild, as Netlify's function
 * bundler does (Node platform, ESM), then loads the bundle and answers one
 * real MCP call through it with fetch stubbed to the SYNTHETIC fixtures.
 * It cannot prove Netlify's build accepts the function; the first deploy log
 * does that. It does prove nothing is left unbundled and the bundle runs.
 *
 *   bun run bundle-check:netlify
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const outdir = join(root, '.netlify-check');

function fail(what: string, next: string): never {
  console.error(`bundle-check:netlify: FAILED — ${what}\n  next: ${next}`);
  process.exit(1);
}

mkdirSync(outdir, { recursive: true });
const result = await build({
  entryPoints: [join(root, 'netlify', 'functions', 'mcp.mts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(outdir, 'mcp.mjs'),
  metafile: true,
  logLevel: 'silent',
}).catch((err) => fail(`esbuild could not bundle the function (${err.message.split('\n')[0]})`, 'fix the import it names; every import must resolve to a file under the repo'));

const inputs = Object.keys(result.metafile.inputs);
const fromNodeModules = inputs.filter((p) => p.includes('node_modules'));
if (fromNodeModules.length) fail(`runtime code from node_modules: ${fromNodeModules.join(', ')}`, 'the server must have no runtime dependencies (spec §2.7)');
const outfile = join(outdir, 'mcp.mjs');
console.log(`bundled ${inputs.length} modules into ${outfile} (${(statSync(outfile).size / 1024).toFixed(2)} KiB):`);
for (const p of inputs) console.log(`  ${p}`);

const fixture = (lang: string) => readFileSync(join(root, 'test', 'fixtures', `events.${lang}.json`), 'utf8');
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith('/api/events.json')) return new Response(fixture('el'));
  if (url.endsWith('/api/en/events.json')) return new Response(fixture('en'));
  return new Response('not found', { status: 404 });
}) as typeof fetch;
const mod = await import(outfile);
const res: Response = await mod.default(new Request('https://mcp.agentathens.com/mcp', {
  method: 'POST',
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://agent-athens/events.html' } }),
}));
const body: any = await res.json().catch(() => null);
const html = body?.result?.contents?.[0]?.text;
if (typeof html !== 'string' || !html.startsWith('<!doctype html>')) fail('the bundled function did not serve the card view', 'check src/ui/events-html.ts exists (bun run build:ui)');
if (JSON.stringify(mod.config?.path) !== '["/","/mcp"]') fail('the bundle lost its exported config', 'keep `export const config` in netlify/functions/mcp.mts');
console.log(`bundle-check:netlify: OK — the bundle answers resources/read (${html.length} characters of HTML) and exports its config`);
