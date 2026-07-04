// Deploy-B capability probe (GEO Ruling 2 sequel, 2026-07-04).
// Sole purpose: answer whether `netlify deploy --prod --no-build --dir=dist`
// ships an edge function or silently skips it (recon gate 0b-2).
//
// QUARANTINE: declared in netlify.toml with path = "/__edge-probe" ONLY, so it
// never runs on /events/*, /en/*, /, or any real route. Returns 200 on the probe
// path; anything else is fail-open (return undefined → context.next()).
export default async (request: Request): Promise<Response | undefined> => {
  const { pathname } = new URL(request.url);
  if (pathname === '/__edge-probe') {
    return new Response('edge-probe-ok', {
      status: 200,
      headers: { 'content-type': 'text/plain', 'x-edge-probe': 'deployed' },
    });
  }
  return undefined; // fail-open — never shadow live traffic
};
