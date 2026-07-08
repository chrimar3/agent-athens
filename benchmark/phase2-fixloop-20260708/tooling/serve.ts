/**
 * Minimal static server replicating Netlify's serving semantics for dist/:
 * exact file → path + .html → path + /index.html; /en and /en/ 302 to /en/today/
 * (mirrors dist/_redirects). Used only for local Phase-2 measurement.
 * Usage: bun run serve.ts <distDir> <port>
 */
import { join } from "path";
import { existsSync, statSync } from "fs";

const DIST = process.argv[2];
const PORT = Number(process.argv[3] || 8517);
if (!DIST) throw new Error("usage: bun serve.ts <distDir> <port>");

Bun.serve({
  port: PORT,
  fetch(req) {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === "/en" || p === "/en/") {
      return new Response(null, { status: 302, headers: { location: "/en/today/" } });
    }
    const candidates = [p, `${p}.html`, join(p, "index.html")];
    for (const c of candidates) {
      const fp = join(DIST, c);
      if (existsSync(fp) && statSync(fp).isFile()) {
        return new Response(Bun.file(fp));
      }
    }
    const notFound = join(DIST, "404.html");
    return new Response(existsSync(notFound) ? Bun.file(notFound) : "not found", { status: 404 });
  },
});
console.log(`serving ${DIST} on http://localhost:${PORT}`);
