#!/usr/bin/env bun
// ─────────────────────────────────────────────────────────────────────────
// Step 0 — Source-reachability probe for the cloud-Routine spike.
//
// Run this INSIDE a Claude Code Custom environment (network access = Custom)
// with the scraper source domains allowlisted. It answers the highest-risk
// migration question: can a cloud routine even REACH our sources, or does a
// Custom allowlist still hit 403s / CDN challenges / anti-bot walls?
//
// IMPORTANT — what this proves and what it does NOT:
//   • A 200 here is necessary but NOT sufficient for the scrape phase.
//     5 scrapers (ticketservices/benaki/onassis/snfcc/megaron) drive headless
//     Chrome via Puppeteer with a hardcoded macOS path. A Linux sandbox has no
//     /Applications/Google Chrome.app — reachability says nothing about that.
//   • Some sites return 200 with a JS/Cloudflare challenge body (no real HTML).
//     We sniff for the common challenge markers and classify those as 'blocked'
//     rather than letting a 200 masquerade as success.
//
// This script does NOT touch the database, does NOT scrape, and is read-only
// against the network. Forward-looking diagnostic only — the build+deploy
// routine (Step 2) does not depend on this passing.
// ─────────────────────────────────────────────────────────────────────────

type Group = "source" | "image" | "geo" | "deploy";

interface Target {
  host: string;
  group: Group;
  note?: string;
}

// Enumerated from src/config/active-source-ids.ts + scripts/scrape-*.ts.
const TARGETS: Target[] = [
  // Primary scraper sources (the 10 active sources)
  { host: "www.more.com", group: "source", note: "ticketing; curl-fallback in scraper" },
  { host: "www.athinorama.gr", group: "source" },
  { host: "www.clubber.gr", group: "source", note: "iCal feed" },
  { host: "www.ticketservices.gr", group: "source", note: "needs Puppeteer" },
  { host: "www.halfnote.gr", group: "source", note: "iCal feed" },
  { host: "ra.co", group: "source", note: "GraphQL API (POST in scraper)" },
  { host: "www.megaron.gr", group: "source", note: "needs Puppeteer" },
  { host: "www.onassis.org", group: "source", note: "needs Puppeteer" },
  { host: "www.benaki.org", group: "source", note: "needs Puppeteer" },
  { host: "www.snfcc.org", group: "source", note: "needs Puppeteer" },
  // Image / CDN hosts hit during detail fetch
  { host: "athinorama.gr", group: "image", note: "event images" },
  { host: "cdn.snfcc.org", group: "image" },
  // Optional geocoding APIs (venue coords)
  { host: "nominatim.openstreetmap.org", group: "geo", note: "primary geocoder" },
  { host: "maps.googleapis.com", group: "geo", note: "fallback, needs key" },
  // Deploy fallback path (only relevant if Netlify MCP can't push a dir and we
  // fall back to `netlify` CLI + NETLIFY_AUTH_TOKEN)
  { host: "api.netlify.com", group: "deploy", note: "CLI-token fallback only" },
];

type Verdict = "reachable" | "redirect" | "blocked" | "timeout" | "unreachable";

interface Result {
  host: string;
  group: Group;
  verdict: Verdict;
  status?: number;
  detail: string;
  note?: string;
}

// Markers that mean "200 but it's a challenge page, not real content".
const CHALLENGE_MARKERS = [
  "just a moment",
  "attention required",
  "cf-browser-verification",
  "enable javascript and cookies",
  "checking your browser",
  "_cf_chl_opt",
];

const TIMEOUT_MS = 15_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(t: Target): Promise<Result> {
  const url = `https://${t.host}/`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual", // surface redirects rather than silently following
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const status = res.status;

    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location") ?? "(no location header)";
      return { host: t.host, group: t.group, verdict: "redirect", status, detail: `→ ${loc}`, note: t.note };
    }

    if (status === 403 || status === 503 || status === 429) {
      return { host: t.host, group: t.group, verdict: "blocked", status, detail: `HTTP ${status}`, note: t.note };
    }

    if (status >= 200 && status < 300) {
      // Sniff a slice of the body for challenge markers — a 200 challenge page
      // is a block in disguise.
      let body = "";
      try {
        body = (await res.text()).slice(0, 4000).toLowerCase();
      } catch {
        /* body read can fail on odd content types; treat as reachable */
      }
      const hit = CHALLENGE_MARKERS.find((m) => body.includes(m));
      if (hit) {
        return { host: t.host, group: t.group, verdict: "blocked", status, detail: `200 but challenge: "${hit}"`, note: t.note };
      }
      return { host: t.host, group: t.group, verdict: "reachable", status, detail: `HTTP ${status}`, note: t.note };
    }

    // Any other status (4xx/5xx that isn't a recognised block) — report it raw.
    return { host: t.host, group: t.group, verdict: "blocked", status, detail: `HTTP ${status}`, note: t.note };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const verdict: Verdict = /timeout|timed out|aborted/i.test(msg) ? "timeout" : "unreachable";
    return { host: t.host, group: t.group, verdict, detail: msg.slice(0, 120), note: t.note };
  }
}

const ICON: Record<Verdict, string> = {
  reachable: "✅",
  redirect: "↪️ ",
  blocked: "⛔",
  timeout: "⏱️ ",
  unreachable: "❌",
};

// Probe all targets concurrently — independent network calls.
const results = await Promise.all(TARGETS.map(probe));

console.log("\nSource-reachability probe (Custom allowlist) — Step 0\n");
console.log("verdict   group   status  host");
console.log("───────────────────────────────────────────────────────────────");
for (const r of results) {
  const status = r.status ? String(r.status).padEnd(6) : "—".padEnd(6);
  console.log(
    `${ICON[r.verdict]} ${r.verdict.padEnd(7)} ${r.group.padEnd(7)} ${status} ${r.host}  ${r.detail}${r.note ? `  (${r.note})` : ""}`,
  );
}

const summary = results.reduce<Record<Verdict, number>>(
  (acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc),
  {} as Record<Verdict, number>,
);
console.log("\nSummary:", JSON.stringify(summary));

// Gate signal for the spec write-up: are the PRIMARY SOURCES reachable?
const sourcesBlocked = results.filter((r) => r.group === "source" && r.verdict !== "reachable");
if (sourcesBlocked.length > 0) {
  console.log(
    `\n⚠️  ${sourcesBlocked.length}/10 primary sources NOT cleanly reachable: ` +
      sourcesBlocked.map((r) => `${r.host} (${r.verdict})`).join(", "),
  );
  console.log("→ Scrape phase viability is in question. Record per-domain, consider deploy-only scope.");
} else {
  console.log("\n✅ All 10 primary sources reachable under the allowlist (curl-level only — Chrome-in-sandbox still unproven).");
}

// Machine-readable block for pasting into specs/routines-spike.md.
console.log("\n--- JSON (paste into spec) ---");
console.log(JSON.stringify(results, null, 2));
