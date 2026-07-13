/**
 * Parameterized port of the frozen baseline capture.ts (visibility-baseline-20260708).
 * Identical capture semantics — raw HTML (no JS) + rendered DOM + text + screenshot —
 * but fetches from a LOCAL server (env LOCAL_BASE) using sample-local.json, and writes
 * under the given output dir (argv[2]: e.g. anchor/ or after-A/).
 * Scoring is not done here; this only captures surfaces.
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

const BASE = dirname(import.meta.dir); // benchmark/phase2-fixloop-20260708
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: capture-local.ts <outSubdir> [onlyId,onlyId...]");
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const LOCAL_BASE = process.env.LOCAL_BASE || "http://localhost:8517";
const sample = JSON.parse(readFileSync(join(BASE, "sample-local.json"), "utf8"));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RAW_UA =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: `/tmp/vb-p2-profile-${Date.now()}`,
  args: ["--no-first-run", "--disable-extensions"],
});

for (const p of sample.pages) {
  if (only && !only.has(p.id)) continue;
  const dir = join(BASE, OUT, "captures", p.id);
  mkdirSync(dir, { recursive: true });
  const url = `${LOCAL_BASE}${p.localPath}`;

  const res = await fetch(url, { headers: { "User-Agent": RAW_UA }, redirect: "follow" });
  const rawBody = await res.text();
  writeFileSync(join(dir, "raw.html"), rawBody);
  writeFileSync(
    join(dir, "headers.json"),
    JSON.stringify({ status: res.status, finalUrl: res.url, canonicalUrl: p.canonicalUrl, headers: Object.fromEntries(res.headers.entries()) }, null, 2),
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));
  writeFileSync(join(dir, "rendered.html"), await page.evaluate(() => document.documentElement.outerHTML));
  writeFileSync(join(dir, "rendered.txt"), await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: join(dir, "screenshot.png"), fullPage: true });
  await page.close();
  console.log(`${p.id}: HTTP ${res.status}, raw ${rawBody.length}b`);
}
await browser.close();
console.log("capture complete →", OUT);
