/**
 * Parameterized port of the frozen baseline validate.ts (visibility-baseline-20260708).
 * SAME deduction rules and checklists, verbatim — two seams changed for local runs:
 *   1. site-level fetches (robots, sitemaps, IndexNow key) go to LOCAL_BASE;
 *   2. identity checks (canonical-self, sitemap membership) assert against the page's
 *      PRODUCTION canonicalUrl from sample-local.json (sitemaps emit absolute prod URLs).
 * Usage: bun validate-local.ts <capturesSubdir>   (e.g. anchor or after-A)
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const BASE = dirname(import.meta.dir);
const SUB = process.argv[2];
if (!SUB) throw new Error("usage: validate-local.ts <subdir>");
const LOCAL_BASE = process.env.LOCAL_BASE || "http://localhost:8517";
const sample = JSON.parse(readFileSync(join(BASE, "sample-local.json"), "utf8"));

async function text(url: string): Promise<{ status: number; body: string }> {
  const r = await fetch(url, { headers: { "User-Agent": "vb-validator/1.0" } });
  return { status: r.status, body: r.status === 200 ? await r.text() : "" };
}
const robots = await text(`${LOCAL_BASE}/robots.txt`);
const sitemapIndex = await text(`${LOCAL_BASE}/sitemap-index.xml`);
const childUrls = [...sitemapIndex.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const sitemaps: Record<string, string> = {};
for (const u of childUrls) {
  const local = u.replace("https://agentathens.com", LOCAL_BASE);
  sitemaps[u] = (await text(local)).body;
}
const indexNowProbe = await text(`${LOCAL_BASE}/a2f6526d99faa4a216d36574c34694a0.txt`);
const indexNowWired = indexNowProbe.status === 200 && /^[0-9a-f]{16,64}\s*$/.test(indexNowProbe.body.trim());

function sitemapEntry(url: string): { inSitemap: boolean; lastmod: string | null } {
  const noSlash = url.replace(/\/$/, "");
  for (const body of Object.values(sitemaps)) {
    for (const m of body.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)) {
      const loc = m[1].replace(/\/$/, "");
      if (loc === noSlash) {
        const lm = m[2].match(/<lastmod>([^<]+)<\/lastmod>/);
        return { inSitemap: true, lastmod: lm ? lm[1] : null };
      }
    }
  }
  return { inSitemap: false, lastmod: null };
}

type Check = { name: string; re: RegExp };
const EVENT_ITEMS: Check[] = [
  { name: "event name in <h1>", re: /<h1[^>]*>[^<]{3,}/ },
  { name: "date present", re: /\b20(26|27)\b|datetime=/ },
  { name: "venue named", re: /venue|Venue|χώρος|SNFCC|ΚΠΙΣΝ|club|Club|theatre|Theatre|θέατρο/i },
  { name: "price info", re: /€|free|δωρεάν|price|τιμή|ticket|εισιτήρι/i },
  { name: "description >200 chars of prose", re: /<p[^>]*>[^<]{200,}/ },
  { name: "JSON-LD present", re: /application\/ld\+json/ },
];
const HUB_ITEMS: Check[] = [
  { name: "hub heading", re: /<h1[^>]*>[^<]{3,}/ },
  { name: "event links", re: /href="[^"]*\/events\// },
  { name: "dates on cards", re: /datetime=|\b20(26|27)\b/ },
  { name: "JSON-LD present", re: /application\/ld\+json/ },
];
const VENUE_ITEMS: Check[] = [
  { name: "venue name in <h1>", re: /<h1[^>]*>[^<]{2,}/ },
  { name: "address", re: /address|Address|διεύθυνση|οδός|street|Street|\d{3}\s?\d{2}/i },
  { name: "upcoming events listed", re: /href="[^"]*\/events\// },
  { name: "JSON-LD present", re: /application\/ld\+json/ },
];
const EXPECTED: Record<string, Check[]> = {
  "homepage": HUB_ITEMS, "genre-time-hub": HUB_ITEMS, "time-hub": HUB_ITEMS, "editorial": HUB_ITEMS,
  "event-detail-el": EVENT_ITEMS, "event-detail-en": EVENT_ITEMS, "venue": VENUE_ITEMS,
};

const EVENT_FIELDS = ["name","startDate","endDate","location.name","location.address","location.geo",
  "offers.price","offers.priceCurrency","offers.url","offers.availability","performer","image",
  "description","eventStatus","eventAttendanceMode"];
const LISTING_FIELDS = ["ItemList","BreadcrumbList","Organization","WebSite"];
const VENUE_FIELDS = ["Place|LocalBusiness|PerformingArtsTheater|MusicVenue","address","geo","BreadcrumbList","ItemList"];

function deepGet(o: any, path: string): any {
  return path.split(".").reduce((a, k) => (a == null ? a : Array.isArray(a) ? a[0]?.[k] : a[k]), o);
}
function extractJsonLd(html: string): { blocks: any[]; parseError: boolean } {
  const blocks: any[] = []; let parseError = false;
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); blocks.push(...(Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j])); }
    catch { parseError = true; }
  }
  return { blocks, parseError };
}
function allTypes(blocks: any[]): string[] {
  return blocks.flatMap((b) => (Array.isArray(b["@type"]) ? b["@type"] : [b["@type"]])).filter(Boolean);
}

const out: any = { site: { robotsStatus: robots.status, sitemapChildren: childUrls, indexNowWired }, pages: {} };

for (const p of sample.pages) {
  const dir = join(BASE, SUB, "captures", p.id);
  let raw: string, rendered: string, headers: any;
  try {
    raw = readFileSync(join(dir, "raw.html"), "utf8");
    rendered = readFileSync(join(dir, "rendered.html"), "utf8");
    headers = JSON.parse(readFileSync(join(dir, "headers.json"), "utf8"));
  } catch { continue; }
  const evidence: string[] = [];

  let ac = 10;
  const xRobots = (headers.headers["x-robots-tag"] || "").toLowerCase();
  const metaRobots = (raw.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i)?.[1] || "").toLowerCase();
  if (headers.status !== 200) { ac = 0; evidence.push(`status ${headers.status}`); }
  else if (metaRobots.includes("noindex") || xRobots.includes("noindex")) { ac = 0; evidence.push("noindex"); }
  else {
    if (metaRobots.includes("nosnippet") || xRobots.includes("nosnippet")) { ac -= 3; evidence.push("nosnippet"); }
    const canonical = raw.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
    if (!canonical) { ac -= 2; evidence.push("canonical missing"); }
    else if (canonical.replace(/\/$/, "") !== p.canonicalUrl.replace(/\/$/, "")) { ac -= 2; evidence.push(`canonical ${canonical} != self`); }
    const hreflangs = [...raw.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1].toLowerCase());
    const hasCounterpart = p.canonicalUrl.includes("/en/") || ["homepage","event-detail-el","time-hub"].includes(p.template);
    if (hasCounterpart && hreflangs.length === 0) { ac -= 2; evidence.push("no hreflang though counterpart exists"); }
    else if (hreflangs.length > 0 && !hreflangs.includes("x-default")) { ac -= 1; evidence.push("hreflang lacks x-default"); }
    const sm = sitemapEntry(p.canonicalUrl);
    if (!sm.inSitemap) { ac -= 3; evidence.push("URL not in any sitemap"); }
    else if (!sm.lastmod || (Date.now() - +new Date(sm.lastmod)) > 7 * 864e5) { ac -= 1; evidence.push(`lastmod stale/missing (${sm.lastmod})`); }
    if (!indexNowWired) { ac -= 1; evidence.push("IndexNow key not reachable"); }
  }

  const items = EXPECTED[p.template];
  const found: string[] = [], missing: string[] = [], jsOnly: string[] = [];
  for (const c of items) {
    if (c.re.test(raw)) found.push(c.name);
    else { missing.push(c.name); if (c.re.test(rendered)) jsOnly.push(c.name); }
  }
  const ri = Math.round((10 * found.length) / items.length * 10) / 10;

  const { blocks, parseError } = extractJsonLd(raw);
  const types = allTypes(blocks);
  let sdHits: string[] = [], sdMisses: string[] = [], sd = 0;
  const isEvent = p.template.startsWith("event-detail");
  const checklist = isEvent ? EVENT_FIELDS : p.template === "venue" ? VENUE_FIELDS : LISTING_FIELDS;
  if (isEvent) {
    const ev = blocks.find((b) => allTypes([b]).some((t) => /Event/.test(t)));
    for (const f of EVENT_FIELDS) {
      const v = ev ? deepGet(ev, f) : undefined;
      if (v !== undefined && v !== null && v !== "") sdHits.push(f); else sdMisses.push(f);
    }
  } else {
    for (const f of checklist) {
      const alts = f.split("|");
      if (f === "address" || f === "geo") {
        const place = blocks.find((b) => allTypes([b]).some((t) => /Place|LocalBusiness|Venue|Theater/i.test(t)));
        if (place && place[f]) sdHits.push(f); else sdMisses.push(f);
      } else if (alts.some((t) => types.includes(t))) sdHits.push(f); else sdMisses.push(f);
    }
  }
  sd = Math.round((10 * sdHits.length) / checklist.length * 10) / 10;
  if (parseError) sd = Math.min(sd, 2);

  out.pages[p.id] = {
    url: p.canonicalUrl, template: p.template, instance: p.instance,
    accessibility_crawl: { score: Math.max(0, ac), evidence },
    render_integrity: { score: ri, found, missing, jsOnly },
    structured_data: { score: sd, parseError, typesFound: [...new Set(types)], hits: sdHits, misses: sdMisses },
  };
  console.log(`${p.id}: ac=${Math.max(0, ac)} ri=${ri} sd=${sd}${evidence.length ? "  [" + evidence.join("; ") + "]" : ""}`);
}

mkdirSync(join(BASE, SUB), { recursive: true });
writeFileSync(join(BASE, SUB, "validators.json"), JSON.stringify(out, null, 2));
console.log("validators complete →", SUB);
