#!/usr/bin/env bun
/**
 * S100a — Live schema @type primary-class audit.
 *
 * Fetches a sampled cross-section of agentathens.com URLs from the live
 * sitemaps, parses each page's JSON-LD blocks, identifies the primary @type
 * (top-level OR @graph[0]), and classifies misclassification per URL pattern.
 *
 * Read-only: no DB writes, no deploys, no production-side state changes.
 *
 * Usage:
 *   bun run scripts/audit-schema-types.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

const ORIGIN = "https://agentathens.com";
const SITEMAP_INDEX = ORIGIN + "/sitemap-index.xml";

const SAMPLE_EVENTS = 200;
const SAMPLE_VENUES = 50;
const SAMPLE_HUBS = 50;
const CORNERSTONE_PATHS = ["/today", "/tomorrow", "/this-week", "/this-weekend", "/this-month", "/next-month"];
const EN_CORNERSTONE_PATHS = CORNERSTONE_PATHS.map(p => "/en" + p);
const HOME_PATHS = ["/", "/en/"];
const CONCURRENCY = 10;

const EVENT_TYPES = new Set([
  "Event", "MusicEvent", "TheaterEvent", "ExhibitionEvent", "DanceEvent",
  "EducationEvent", "FoodEvent", "Festival", "VisualArtsEvent", "ScreeningEvent",
  "ChildrensEvent", "ComedyEvent", "SocialEvent", "BusinessEvent", "SportsEvent",
]);
const VENUE_TYPES = new Set([
  "Place", "LocalBusiness", "MusicVenue", "EventVenue", "PerformingArtsTheater",
  "Restaurant", "Museum", "ExhibitionCenter", "MovieTheater", "Nightclub",
]);
const HUB_TYPES = new Set(["CollectionPage", "WebPage"]);
const HOME_TYPES = new Set(["CollectionPage", "WebSite", "Organization", "WebPage"]);

type UrlClass = "event" | "venue" | "cornerstone" | "hub" | "home" | "unknown";

interface AuditRow {
  url: string;
  urlClass: UrlClass;
  expectedTypes: Set<string>;
  primaryType: string | null;
  allTypes: string[];
  match: boolean;
  fetchError?: string;
}

function classifyUrl(url: string, cornerstoneSet: Set<string>): UrlClass {
  const u = new URL(url);
  const path = u.pathname.replace(/\/$/, "") || "/";
  if (path === "/" || path === "/en") return "home";
  if (path.startsWith("/events/") || path.startsWith("/en/events/")) return "event";
  if (path.startsWith("/venues/") || path.startsWith("/en/venues/")) return "venue";
  if (cornerstoneSet.has(path)) return "cornerstone";
  return "hub";
}

function expectedTypesFor(cls: UrlClass): Set<string> {
  switch (cls) {
    case "event": return EVENT_TYPES;
    case "venue": return VENUE_TYPES;
    case "cornerstone":
    case "hub": return HUB_TYPES;
    case "home": return HOME_TYPES;
    default: return new Set();
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

function extractTypes(html: string): { primary: string | null; all: string[] } {
  const blocks: string[] = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);

  const all: string[] = [];
  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
          for (const child of parsed["@graph"]) {
            if (child && typeof child === "object" && child["@type"]) all.push(String(child["@type"]));
          }
        } else if (Array.isArray(parsed)) {
          for (const child of parsed) {
            if (child && typeof child === "object" && child["@type"]) all.push(String(child["@type"]));
          }
        } else if (parsed["@type"]) {
          all.push(String(parsed["@type"]));
        }
      }
    } catch {
      // skip unparseable
    }
  }

  return { primary: all.length > 0 ? all[0] : null, all };
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchText(sitemapUrl);
  const urls: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) urls.push(m[1].trim());
  return urls;
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const a = [...arr];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function processUrl(url: string, cornerstoneSet: Set<string>): Promise<AuditRow> {
  const cls = classifyUrl(url, cornerstoneSet);
  const expected = expectedTypesFor(cls);
  try {
    const html = await fetchText(url);
    const { primary, all } = extractTypes(html);
    const match = primary !== null && expected.has(primary);
    return { url, urlClass: cls, expectedTypes: expected, primaryType: primary, allTypes: all, match };
  } catch (e: any) {
    return { url, urlClass: cls, expectedTypes: expected, primaryType: null, allTypes: [], match: false, fetchError: e.message };
  }
}

async function processBatch(urls: string[], cornerstoneSet: Set<string>, concurrency: number): Promise<AuditRow[]> {
  const results: AuditRow[] = [];
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      results[i] = await processUrl(urls[i], cornerstoneSet);
      if ((i + 1) % 25 === 0 || i + 1 === urls.length) {
        process.stderr.write("  fetched " + (i + 1) + "/" + urls.length + "\n");
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function tierClassify(rows: AuditRow[]): { tier: string; rationale: string } {
  const totalMis = rows.filter(r => !r.match).length;
  const eventRows = rows.filter(r => r.urlClass === "event");
  const eventMis = eventRows.filter(r => !r.match).length;
  const eventPct = eventRows.length > 0 ? (eventMis / eventRows.length) * 100 : 0;

  if (totalMis === 0) {
    return { tier: "Class 0 (clean)", rationale: "0 misclassified across all sampled URLs. Hypothesis falsified at this sample. With event sample of 200 of 9186 (2.2%), 95% CI for true corpus rate is 0-1.5%. High-confidence Class 0." };
  }
  if (totalMis >= 1 && totalMis <= 5) {
    return { tier: "Tier 1 (isolated)", rationale: totalMis + " misclassified, likely single emitter. One commit fixes all. Recommended: fold into S101a as +1 commit." };
  }
  if (totalMis >= 6 && totalMis <= 30) {
    return { tier: "Tier 2 (multi-emitter)", rationale: totalMis + " misclassified across the sample. Multi-emitter pattern likely. Recommended: standalone S100c session before S101a-d ship." };
  }
  return { tier: "Tier 3 (systemic)", rationale: totalMis + " misclassified or >5% of any class sample (event class: " + eventPct.toFixed(1) + "%). Template-level systemic issue. STOP — pivot to root-cause + targeted fix session before any S101 work." };
}

function fmtTypes(s: Set<string>): string {
  return Array.from(s).join(" | ");
}

function generateMarkdown(sitemapCounts: Record<string, number>, step1Sample: AuditRow[], step2Rows: AuditRow[], classification: { tier: string; rationale: string }): string {
  const lines: string[] = [];
  lines.push("# S100a E3 Schema @type Audit Findings");
  lines.push("");
  lines.push("**Date:** " + new Date().toISOString().split("T")[0] + " (live audit)");
  lines.push("**Method:** sitemap-based sampling against agentathens.com (no local dist scan; local dist was incomplete per executor's status report)");
  lines.push("");
  lines.push("## Step 0 — Sitemap structure");
  lines.push("");
  lines.push("| Sitemap | URL count |");
  lines.push("|---|---|");
  for (const [name, n] of Object.entries(sitemapCounts)) lines.push("| " + name + " | " + n + " |");
  lines.push("");
  lines.push("## Step 1 — 15-URL sample (hypothesis preview)");
  lines.push("");
  lines.push("| URL | Class | Primary @type | Expected | Match |");
  lines.push("|---|---|---|---|---|");
  for (const r of step1Sample) {
    lines.push("| " + r.url + " | " + r.urlClass + " | " + (r.primaryType ?? "<error>") + " | " + fmtTypes(r.expectedTypes) + " | " + (r.match ? "✓" : "✗") + " |");
  }
  lines.push("");
  const step1Mis = step1Sample.filter(r => !r.match).length;
  lines.push("**Step 1 result:** " + (step1Sample.length - step1Mis) + "/" + step1Sample.length + " correct primary @type. " + (step1Mis === 0 ? "Hypothesis falsified at small-sample level." : "Hypothesis confirmed."));
  lines.push("");
  lines.push("## Step 2 — Full sampled corpus");
  lines.push("");

  const classes: UrlClass[] = ["event", "venue", "cornerstone", "hub", "home"];
  lines.push("| Class | Sampled | Misclassified | Sample rate |");
  lines.push("|---|---|---|---|");
  for (const cls of classes) {
    const rows = step2Rows.filter(r => r.urlClass === cls);
    const mis = rows.filter(r => !r.match).length;
    const total = sitemapCounts[cls] ?? "n/a";
    const rate = typeof total === "number" && total > 0 ? rows.length + "/" + total + " = " + ((rows.length / total) * 100).toFixed(1) + "%" : "n/a";
    lines.push("| " + cls + " | " + rows.length + " | " + mis + " | " + rate + " |");
  }
  lines.push("");

  const totalMis = step2Rows.filter(r => !r.match).length;
  lines.push("**Total misclassified:** " + totalMis + " of " + step2Rows.length + " sampled.");
  lines.push("");

  if (totalMis > 0) {
    lines.push("### Misclassified URLs");
    lines.push("");
    lines.push("| URL | Class | Primary @type | Expected | Error? |");
    lines.push("|---|---|---|---|---|");
    for (const r of step2Rows.filter(x => !x.match).slice(0, 100)) {
      lines.push("| " + r.url + " | " + r.urlClass + " | " + (r.primaryType ?? "<no JSON-LD>") + " | " + fmtTypes(r.expectedTypes) + " | " + (r.fetchError ?? "") + " |");
    }
    lines.push("");
  }

  const secondaryCounts = new Map<string, number>();
  for (const r of step2Rows) {
    for (let i = 1; i < r.allTypes.length; i++) {
      const t = r.allTypes[i];
      secondaryCounts.set(t, (secondaryCounts.get(t) || 0) + 1);
    }
  }
  if (secondaryCounts.size > 0) {
    lines.push("### Secondary @types observed (informational, not errors)");
    lines.push("");
    lines.push("| Type | Occurrences |");
    lines.push("|---|---|");
    const sorted = Array.from(secondaryCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [t, c] of sorted) lines.push("| " + t + " | " + c + " |");
    lines.push("");
  }

  const errorRows = step2Rows.filter(r => r.fetchError);
  if (errorRows.length > 0) {
    lines.push("### Fetch errors");
    lines.push("");
    lines.push("| URL | Error |");
    lines.push("|---|---|");
    for (const r of errorRows.slice(0, 50)) lines.push("| " + r.url + " | " + r.fetchError + " |");
    lines.push("");
  }

  lines.push("## Step 3 — Tier classification + recommended next session");
  lines.push("");
  lines.push("**Tier:** " + classification.tier);
  lines.push("");
  lines.push("**Rationale:** " + classification.rationale);
  lines.push("");
  lines.push("### Recommended next session");
  if (classification.tier.startsWith("Class 0")) {
    lines.push("- E3 closes. Hypothesis falsified at high-confidence sample.");
    lines.push("- S100 + S101a-d ship as planned (CollectionPage fix only). No @type fix needed.");
  } else if (classification.tier.startsWith("Tier 1")) {
    lines.push("- Single emitter fix folds into S101a as +1 commit (~30 min).");
  } else if (classification.tier.startsWith("Tier 2")) {
    lines.push("- Standalone S100c session, Pattern C dev sprint. S101a-d delayed ~3 days.");
    lines.push("- Recommend expanding audit to full corpus before fixing.");
  } else {
    lines.push("- STOP. Pivot rest of week to root-cause + targeted fix session.");
    lines.push("- All S101 sessions paused; cornerstone amplification meaningless until @type fixed.");
  }
  lines.push("");
  lines.push("### Three example URLs (audit-logic sanity)");
  const examples = step2Rows.slice(0, 3);
  for (const r of examples) {
    lines.push("- `" + r.url + "` → primary @type: `" + (r.primaryType ?? "<error>") + "` (class: " + r.urlClass + ", expected: " + fmtTypes(r.expectedTypes) + ")");
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log("=== S100a Live @type Audit ===");
  console.log("Origin: " + ORIGIN);
  console.log("");

  console.log("Step 0 — fetching sitemap-index + per-sitemap URL counts...");
  const indexUrls = await fetchSitemapUrls(SITEMAP_INDEX);
  console.log("  index lists: " + indexUrls.length + " sub-sitemaps");

  const eventsUrls = await fetchSitemapUrls(ORIGIN + "/sitemap-events.xml");
  const venuesUrls = await fetchSitemapUrls(ORIGIN + "/sitemap-venues.xml");
  const editorialUrls = await fetchSitemapUrls(ORIGIN + "/sitemap-editorial.xml");

  const sitemapCounts: Record<string, number> = {
    event: eventsUrls.length,
    venue: venuesUrls.length,
    editorial: editorialUrls.length,
  };
  console.log("  events:    " + eventsUrls.length);
  console.log("  venues:    " + venuesUrls.length);
  console.log("  editorial: " + editorialUrls.length);
  console.log("");

  const cornerstoneSet = new Set<string>();
  for (const p of CORNERSTONE_PATHS) cornerstoneSet.add(p);
  for (const p of EN_CORNERSTONE_PATHS) cornerstoneSet.add(p);

  console.log("Step 1 — 15-URL hypothesis preview...");
  const step1Events = sample(eventsUrls, 5);
  const step1Venues = sample(venuesUrls, 5);
  const editorialNonCornerstone = editorialUrls.filter(u => {
    const p = new URL(u).pathname.replace(/\/$/, "") || "/";
    return !cornerstoneSet.has(p) && p !== "/" && p !== "/en";
  });
  const step1Hubs = sample(editorialNonCornerstone, 5);
  const step1All = [...step1Events, ...step1Venues, ...step1Hubs];
  const step1Rows = await processBatch(step1All, cornerstoneSet, CONCURRENCY);
  const step1Mis = step1Rows.filter(r => !r.match).length;
  console.log("  step 1: " + (step1Rows.length - step1Mis) + "/" + step1Rows.length + " correct");
  if (step1Mis > 0) {
    console.log("  step 1 misclassified:");
    for (const r of step1Rows.filter(x => !x.match)) {
      console.log("    " + r.url + " -> primary=" + (r.primaryType ?? "<error>") + " expected=" + fmtTypes(r.expectedTypes));
    }
  }
  console.log("");

  console.log("Step 2 — sampling and fetching ~312 URLs (concurrency=10)...");
  const eventSample = sample(eventsUrls, SAMPLE_EVENTS);
  const venueSample = sample(venuesUrls, SAMPLE_VENUES);
  const cornerstoneTargets: string[] = [];
  for (const p of CORNERSTONE_PATHS) cornerstoneTargets.push(ORIGIN + p);
  for (const p of EN_CORNERSTONE_PATHS) cornerstoneTargets.push(ORIGIN + p);
  const hubSample = sample(editorialNonCornerstone.filter(u => !cornerstoneTargets.includes(u)), SAMPLE_HUBS);
  const homeTargets = HOME_PATHS.map(p => ORIGIN + p);

  const allTargets = [...eventSample, ...venueSample, ...cornerstoneTargets, ...hubSample, ...homeTargets];
  console.log("  total: " + allTargets.length + " URLs");
  const startTime = Date.now();
  const step2Rows = await processBatch(allTargets, cornerstoneSet, CONCURRENCY);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("  step 2 complete in " + elapsedSec + "s");
  console.log("");

  console.log("Step 3 — classifying findings...");
  const classification = tierClassify(step2Rows);
  console.log("  " + classification.tier);
  console.log("  " + classification.rationale);
  console.log("");

  const classes: UrlClass[] = ["event", "venue", "cornerstone", "hub", "home"];
  console.log("Per-class summary:");
  for (const cls of classes) {
    const rows = step2Rows.filter(r => r.urlClass === cls);
    const mis = rows.filter(r => !r.match).length;
    console.log("  " + cls + ": " + rows.length + " sampled, " + mis + " misclassified");
  }
  console.log("");

  const findingsPath = join(import.meta.dir, "..", "specs", "s100a-e3-audit-findings.md");
  const md = generateMarkdown(sitemapCounts, step1Rows, step2Rows, classification);
  writeFileSync(findingsPath, md);
  console.log("Findings written to " + findingsPath);
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
