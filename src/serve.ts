import { existsSync, realpathSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

/** Serve a selected static build; never fall back to the repository root. */
export function createPreviewHandler(directory: string) {
  const root = realpathSync(directory);
  function confinedFile(path: string): string | null {
    if (!existsSync(path)) return null;
    const actual = realpathSync(path);
    const rel = relative(root, actual);
    if (rel === '..' || rel.startsWith('..' + sep) || !statSync(actual).isFile()) return null;
    return actual;
  }
  return async (request: Request): Promise<Response> => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('Invalid path', { status: 400 }); }
    if (/[\x00-\x1f\\]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
      return new Response('Forbidden', { status: 403 });
    }
    const target = resolve(root, '.' + pathname);
    const candidates = [target, join(target, 'index.html'), target + '.html'];
    const file = candidates.map(confinedFile).find(Boolean);
    const fallback = file ?? confinedFile(join(root, '404.html'));
    const status = file ? 200 : 404;
    if (!fallback) return new Response(request.method === 'HEAD' ? null : 'Not found', { status });
    const body = Bun.file(fallback);
    return new Response(request.method === 'HEAD' ? null : body, {
      status,
      headers: { 'Content-Type': body.type, 'Content-Length': String(body.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  };
}

if (import.meta.main) {
  try {
    let directory = join(import.meta.dir, '../dist');
    let port = 3000;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dir' && args[i + 1]) directory = resolve(args[++i]);
      else if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
      else throw new Error(`Unknown or incomplete option: ${args[i]}. Use --dir PATH --port NUMBER.`);
    }
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
    if (!existsSync(directory)) throw new Error(`Build directory missing: ${directory}. Pass --dir PATH to an existing static build.`);
    const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: createPreviewHandler(directory) });
    console.log(`Preview: ${server.url} (${directory})`);
  } catch (error) {
    console.error(`preview: FAILED — ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
