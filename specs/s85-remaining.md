# S85 — Steps 1 and 2 (shipped)

All three S85 steps are live. This document is retained for two reasons:
1. The **canonical post-deploy spot-check** (bottom of the file) — use it after any deploy that touches page templates or the sweep/static-copy logic.
2. A reference description of the sweep + static-copy design, in case a future session needs to extend or debug them.

The implementation lives in `src/generate-site.ts` (`copyStaticRootFiles()` and `sweepOrphans()`). Design note: the sweep uses **mtime comparison against `buildStartTime`**, not `generatedUrls`-anchored slug reconstruction — every file that should remain is rewritten each build, so `mtime < buildStartTime` is the authoritative orphan test. Robust to flat/directory-form URL layouts and bilingual mirrors.

## Step 1 — Static root files copy into build pipeline

**Goal:** any file placed in a new `static/root-files/` directory is copied verbatim into `dist/` root on every build, so verification files survive clean rebuilds.

**File to modify:** `src/generate-site.ts`

**Changes:**
- Create directory `static/root-files/` at repo root.
- Move `dist/googled03df0efd969df1f.html` → `static/root-files/googled03df0efd969df1f.html` (keep the content, relocate so it's git-tracked and source-of-truth).
- In `src/generate-site.ts`, add a copy step **after all page generation completes** (i.e., after venue pages at line 540, before the orphan sweep of Step 2). Mirror the existing `fs.copyFileSync` pattern used for CSS at lines 105–107.
- Walk `static/root-files/` with `fs.readdirSync`, copy each file to `dist/<name>`, log `📋 Copied N static root files`.
- Add each copied filename to the sweep allowlist (Step 2) so the sweep doesn't delete what Step 1 just placed.

**Explicitly do not:**
- Overwrite `_redirects`, `robots.txt`, `llms.txt`, `sitemap*.xml`, or IndexNow key files — those are generated. If `static/root-files/` accidentally contains one, log a warning and skip.
- Recurse into subdirectories. Flat copy only.

**Verify:**
```bash
cd /Users/chrism/Project\ with\ Claude/AgentAthens/agent-athens
rm dist/googled03df0efd969df1f.html
bun run src/generate-site.ts
ls -la dist/googled03df0efd969df1f.html   # must exist
```

## Step 2 — Orphan sweep (dry-run by default)

**Goal:** remove `.html` and filter-page `.json` files in `dist/` that were not produced by the current build, without risking deletion of static assets or live pages.

**File to modify:** `src/generate-site.ts`

**Design — anchor on `generatedUrls`, not re-derived slugs:**

`src/generate-site.ts:243` already collects every relative URL written during the build (lines 249, 339, 411, 431, 469, 507, 540, 851). This is the authoritative keep-list. Re-deriving slugs from DB + config would be a second implementation that can drift from the first — instead, convert each entry of `generatedUrls` into its filesystem path(s) and diff against a walk of `dist/`.

**Implementation outline:**

1. **Build the expected-paths set** after all generation completes:
   - For each `url` in `generatedUrls`:
     - `''` or `'index'` → `dist/index.html`
     - `'events/<slug>'` → `dist/events/<slug>/index.html`
     - `'en/events/<slug>'` → `dist/en/events/<slug>/index.html`
     - `'venues/<slug>'` → `dist/venues/<slug>/index.html`
     - filter/hub/category URLs (e.g., `'concerts-today'`) → `dist/<url>/index.html` *and* (for filter pages) `dist/api/<url>.json`
   - Union with **static allowlist**:
     - `404.html`, `_redirects`, `robots.txt`, `llms.txt`, `sitemap*.xml`, `sitemap-index.xml`, `a2f6526d99faa4a216d36574c34694a0.txt` (IndexNow key), `.og-cache.json`, `.slug-history.json`
     - Overflow hub `/all/` pages — re-derive from `config/hub-pages.json` (`dist/<hub>/all/index.html`)
     - Files copied from `static/root-files/` (Step 1 passes its list forward)
     - Content pages not in `generatedUrls`: `about`, `editorial`, `corrections` + their `en/` mirrors — re-derive from the same source `renderContentPage()` callers use
   - Union with **protected-directory prefixes** (nothing inside these is ever swept):
     - `dist/images/`, `dist/assets/`, `dist/styles/`, `dist/scripts/`
     - `dist/api/categories/` (category JSON, generated from config)

2. **Walk `dist/` recursively.** For each file:
   - If path is in a protected prefix → keep, no log.
   - If extension is not `.html` and path is not `dist/api/*.json` → keep (don't touch images, fonts, JS).
   - If path is in expected-paths set → keep.
   - Otherwise → **candidate for deletion**.

3. **Dry-run gate (user-chosen safety posture):**
   - Default: log each candidate as `WOULD DELETE: <path>`, print total count, delete nothing.
   - When env var `SWEEP_ORPHANS=1` is set: delete, log each as `🗑️  Swept: <path>`, print total, remove now-empty parent directories (but never `dist/events/`, `dist/venues/`, `dist/en/events/` themselves).
   - Keep it simple: the arming flag is the safety. The user reviews the dry-run output before setting `SWEEP_ORPHANS=1`.

4. **Order in the pipeline:** static copy (Step 1) → sweep (Step 2) → sitemap generation (existing line 921). The sweep must happen **before** sitemap generation so swept URLs aren't written into the sitemap XML.

**Verify:**
```bash
# Dry-run shows candidates, deletes nothing
mkdir -p dist/events/fake-deleted-event-2025/
echo "<html>orphan</html>" > dist/events/fake-deleted-event-2025/index.html
bun run src/generate-site.ts
ls dist/events/fake-deleted-event-2025/index.html   # still exists
# grep the build log for: WOULD DELETE: .../fake-deleted-event-2025/index.html

# Arm for real
SWEEP_ORPHANS=1 bun run src/generate-site.ts
ls dist/events/fake-deleted-event-2025/index.html 2>&1   # "No such file or directory"
```

## Tests to add when shipping

1. Step 1 — after `generate-site`, `dist/googled03df0efd969df1f.html` exists and matches `static/root-files/googled03df0efd969df1f.html` byte-for-byte.
2. Step 2 — with a fabricated orphan at `dist/events/fake-X/index.html`, dry-run logs it but does not delete. With `SWEEP_ORPHANS=1`, it is deleted, and `dist/images/`, `dist/assets/`, `_redirects`, `sitemap-index.xml` are still present.
3. Step 2 — a freshly-generated event page is **not** flagged as orphan (smoke test against `generatedUrls` → path conversion).

## Critical files

- `src/generate-site.ts` — both steps
- `static/root-files/` (new dir) — Step 1
- `config/hub-pages.json` (read-only, for overflow `/all/` derivation in Step 2)

## Post-deploy spot-check (canonical)

Use this snippet after any deploy that touches page templates. It asserts the GA4 tag is firing correctly on every page type and that the GSC verification file is still live.

```bash
# Expect per-page gtag() call count of 1 (not the ID count, which is 2 —
# Google's snippet writes the ID into both the script src and the config call).
curl -s https://agentathens.com/               | grep -c "gtag('config'"   # expect 1
curl -s https://agentathens.com/events/        | grep -c "gtag('config'"   # expect 1

# Sample an actual event page from the live sitemap
SAMPLE=$(curl -s https://agentathens.com/sitemap-events.xml | grep -oE "https://agentathens.com/events/[a-z0-9-]+/" | head -1)
curl -s "$SAMPLE"                              | grep -c "gtag('config'"   # expect 1

curl -s https://agentathens.com/venues/        | grep -c "gtag('config'"   # expect 1
curl -s https://agentathens.com/does-not-exist | grep -c "gtag('config'"   # expect 1  (404 page)

# GSC / Bing verification files still live
curl -sI https://agentathens.com/googled03df0efd969df1f.html | head -1     # expect HTTP/2 200
```

**Why `gtag('config'` and not `G-G7Y6RQ6RF9` or `googletagmanager`:** Google's standard snippet embeds the measurement ID **twice** within a single page (once in the `<script src="...?id=X">` URL and once in the `gtag('config', 'X')` call), so grepping the ID returns 2 per page, not 1. `googletagmanager` appears only on the script-src line, so it returns 1 per page — but that target is fragile if Google ever migrates the tag-loader URL. Grepping `gtag('config'` is stable across Google snippet revisions and gives exactly one match per correctly-injected page.

## Source

Full original plan: `/Users/chrism/.claude/plans/scalable-crunching-raven.md`
