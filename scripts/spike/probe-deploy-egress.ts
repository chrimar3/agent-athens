#!/usr/bin/env bun
// ─────────────────────────────────────────────────────────────────────────
// Phase 1 — toolchain + deploy-egress probe for the cloud-Routine spike.
//
// The deploy-only spike target needs NONE of the 10 scraper domains (filter +
// generate-site make zero external calls). Its real egress risk is the docs'
// Bun-proxy caveat: "Bun is installed but has known proxy compatibility issues
// for package fetching." Both the allowlist AND vault-style secret-injection
// are enforced at the sandbox's network boundary — so a `curl`-green result can
// MASK a Bun-red reality (packages unfetchable, or a domain-scoped secret that
// never attaches on Bun's egress path).
//
// THIS PROBE EXERCISES THE SAME Bun `fetch()` PATH THE REAL DEPLOY CODE USES,
// not curl. It is the cheap, decisive Phase-1 gate. Run it AFTER
// scripts/spike/setup-cloud-env.sh (which proves `bun install` under the proxy
// + `bun:sqlite` opens the seeded DB — the other two Phase-1 checks).
//
// Read-only against the network; touches no DB, no scrape, no deploy. A HEAD
// request only — we are testing reachability of the egress path, not publishing.
// ─────────────────────────────────────────────────────────────────────────

type Group = "deploy" | "site";

interface Target {
  host: string;
  url: string;
  group: Group;
  note: string;
}

// Deploy-only egress surface. NOT the scraper sources (those are deferred to
// Session C with scripts/spike/probe-sources.ts, gated on the Chrome-path rewire).
const TARGETS: Target[] = [
  {
    host: "api.netlify.com",
    url: "https://api.netlify.com/api/v1/",
    group: "deploy",
    note: "Netlify CLI-token fallback path; the MCP deploy path needs NO allowlist (routed through Anthropic)",
  },
  {
    host: "agentathens.com",
    url: "https://agentathens.com/sitemap-events.xml",
    group: "site",
    note: "outcome-scoring read: sitemap <lastmod> is the substrate-agnostic deploy-truth",
  },
];

type Verdict = "reachable" | "blocked" | "timeout" | "unreachable";

interface Result {
  host: string;
  group: Group;
  verdict: Verdict;
  status?: number;
  denyReason?: string;
  detail: string;
  note: string;
}

const TIMEOUT_MS = 15_000;

async function probe(t: Target): Promise<Result> {
  try {
    // Bun's fetch — the same egress path filter/build/deploy code travels.
    const res = await fetch(t.url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const status = res.status;
    // The sandbox proxy denies a non-allowlisted host with 403 + this header.
    const denyReason = res.headers.get("x-deny-reason") ?? undefined;
    if (denyReason === "host_not_allowed" || (status === 403 && denyReason)) {
      return { host: t.host, group: t.group, verdict: "blocked", status, denyReason, detail: `403 x-deny-reason: ${denyReason}`, note: t.note };
    }
    // Any HTTP answer (2xx/3xx/4xx that ISN'T a proxy host-deny) means the
    // egress path reached the host — reachability proven. A 401/404 from the
    // API itself still proves the network boundary let Bun through.
    if (status > 0) {
      return { host: t.host, group: t.group, verdict: "reachable", status, detail: `HTTP ${status} (egress reached host)`, note: t.note };
    }
    return { host: t.host, group: t.group, verdict: "unreachable", status, detail: "no status", note: t.note };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const verdict: Verdict = /timeout|timed out|aborted/i.test(msg) ? "timeout" : "unreachable";
    return { host: t.host, group: t.group, verdict, detail: msg.slice(0, 160), note: t.note };
  }
}

const ICON: Record<Verdict, string> = { reachable: "✅", blocked: "⛔", timeout: "⏱️", unreachable: "❌" };

const results = await Promise.all(TARGETS.map(probe));

console.log("\nDeploy-egress probe (Bun fetch path, Custom allowlist) — Phase 1\n");
console.log("verdict    group   status  host");
console.log("───────────────────────────────────────────────────────────────");
for (const r of results) {
  const status = r.status ? String(r.status).padEnd(6) : "—".padEnd(6);
  console.log(`${ICON[r.verdict]} ${r.verdict.padEnd(8)} ${r.group.padEnd(7)} ${status} ${r.host}  ${r.detail}`);
}

// Gate signal: the deploy fallback host must be reachable on Bun's path (or we
// rely solely on Netlify MCP, which needs no allowlist). agentathens.com is the
// scoring read and should always be reachable.
const blocked = results.filter((r) => r.verdict !== "reachable");
console.log("\nSummary:", JSON.stringify(results.reduce<Record<string, number>>((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {})));
if (blocked.length) {
  console.log(`\n⚠️  ${blocked.length}/${results.length} egress target(s) NOT reachable on Bun's path: ` + blocked.map((r) => `${r.host} (${r.verdict}${r.denyReason ? `:${r.denyReason}` : ""})`).join(", "));
  console.log("→ If api.netlify.com is blocked, the CLI-token deploy path is dead on this allowlist — use Netlify MCP (no allowlist) for deploy. If the block is a Bun-vs-curl egress difference, that is the Phase-1 STOP finding.");
} else {
  console.log("\n✅ Deploy-egress reachable on Bun's fetch path. Toolchain gate (bun install + bun:sqlite from setup-cloud-env.sh) + this = Phase-1 green.");
}

console.log("\n--- JSON (paste into specs/routines-spike.md) ---");
console.log(JSON.stringify(results, null, 2));
