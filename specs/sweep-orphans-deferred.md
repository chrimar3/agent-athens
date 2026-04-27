# SWEEP_ORPHANS deferred — sweeper has false-positive bug

**Created:** 2026-04-28 (S97a session, Step 6)
**Status:** Step 6 (one-shot sweep + arming in daily-automated.sh) **NOT executed**

## What was supposed to happen

S97a Step 6:
- 6a — Preview-mode dry-run of `bun run src/generate-site.ts` to count orphans (audit baseline ~6,382).
- 6b — Run `SWEEP_ORPHANS=1 bun run src/generate-site.ts` to clean accumulated dist orphans.
- 6c — Edit `scripts/daily-automated.sh:440` to prepend `SWEEP_ORPHANS=1` to the daily build invocation, arming the sweep on every future daily build.

The plan included an explicit STOP condition: "Step 6a preview count > 10,000 → STOP. If protected paths appear in preview, sweeper logic is broken — do not arm."

## What actually happened

Step 6a preview reported **14,640 orphans** (vs audit's 6,382). **Both STOP conditions hit:** count > 10K AND a protected path (`dist/saved/index.html`, listed in `dist/sitemap-editorial.xml` as `https://agentathens.com/saved/`) appears in the WOULD-DELETE list.

Investigation in `src/generate-site.ts:1266-1346`:

```ts
function sweepOrphans(buildStartTime: number): void {
  ...
  for (const path of walk(DIST_DIR)) {
    const isHtml = path.endsWith('.html');
    const isApiJson = path.endsWith('.json') && ...;
    if (!isHtml && !isApiJson) continue;
    if (statSync(path).mtimeMs >= buildStartTime) continue;   // ← false-positive source
    orphans.push(path);
  }
```

The sweeper classifies a file as orphan if its mtime is **older than** `buildStartTime`. This is correct only if every file generated this build has had its mtime updated.

The build's hash-preserving writer (`copyFileIfChangedSync` at line 1260, content hashing at line 1259) **does not update mtime** when content is unchanged. The build log confirms: `🔐 Computing content hashes... ✓ 10420 pages hashed (10420 unchanged, 0 changed/new)`. With 0 changed pages, no file in dist had its mtime updated this build, so the sweeper sees nearly all 14,640 HTML/JSON files as "older than build start" → orphans.

`dist/saved/index.html` is the canonical proof:
- `stat` mtime: `Apr 21 11:21:52 2026` (7 days old)
- Build log: `✓ /saved/` (generated this build)
- Sitemap: `<loc>https://agentathens.com/saved/</loc>` — public, indexed
- Sweeper preview: `⚠️  WOULD DELETE: /Users/chrism/Project with Claude/AgentAthens/agent-athens/dist/saved/index.html`

If `SWEEP_ORPHANS=1 bun run src/generate-site.ts` had run, it would have deleted /saved/ and ~14,640 other pages, breaking the live site after the next deploy.

The audit's NEW-5 finding (6,382 orphans) was likely the same bug at an earlier point. The count grew because more build cycles accumulated more "unchanged" pages with stale mtimes.

## Why this is bigger than S97a

This is not a documentation/comment issue or a one-line config change. The sweeper's mtime-based heuristic is fundamentally incompatible with the build's content-hash-preserving write strategy. Three plausible fixes, in increasing scope:

1. **Hash-preserving writer touches mtime.** Cheapest. Add `utimes(path, now, now)` after every `copyFileIfChangedSync` call (or wherever the build commits "this path is current"). Sweeper logic stays as-is. Risk: cache-mtime check elsewhere may rely on the old mtime; needs a sweep of consumers.

2. **Sweeper uses a generated-paths manifest.** Build records the set of paths it intended to write (regardless of whether content changed). Sweeper compares dist contents against the manifest, not against mtime. Cleanest separation; adds a small artifact to dist or a temp file.

3. **Two-phase build for sweeping.** Run a forced-regenerate build (every file gets fresh mtime) immediately before arming the sweep. Heavy: pays full build cost on every armed run.

Option 2 is the clean architectural fix. Option 1 is the smallest patch. Either belongs in a dedicated session, not in the S97a maintenance batch.

## What's safe to do today

- **Leave the dist accumulation as-is.** 14,640 stale files cost disk space and inflate Netlify deploy uploads, but don't affect live correctness — the sitemap controls what's indexed, and the daily build re-renders the canonical set. No urgency.
- **Do NOT arm `SWEEP_ORPHANS=1` in `scripts/daily-automated.sh`.** Doing so under the current sweeper logic deletes ~10K+ legitimate pages on the next no-content-change build. Catastrophic.
- **Do NOT run a one-shot sweep manually.** Same hazard.

## Forensic questions for the future session

If/when fixing the sweeper:
- Does the build emit a manifest of intended outputs? (`grep -nE 'manifest|generated.*paths' src/generate-site.ts`) If yes, switch sweeper to manifest-based.
- Are there other consumers of dist mtime besides the sweeper? (`grep -rnE 'statSync.*mtimeMs|fs.stat.*mtime' src/`) Affects whether option 1 is safe.
- Is `dist/_redirects` swept-eligible? It's in dist/ root; if it has a stale mtime and isn't in the sweeper's protected list, an "armed" sweep would also delete the redirect file. (Worth a separate check.)

## What S97a accomplishes instead of Step 6

- The plan's NEW-5 ("6,382 orphan files") and NEW-4 ("5,806 empty-slug dirs") findings remain open in known-issues.md, not closed in this session.
- Step 7's `known-issues.md` reconciliation will mark these as Open (not Fixed) with this checkpoint as the explanation. The audit's "Items Confirmed FIXED" list does not include NEW-4/NEW-5; only NEW-5 was implicit in the SWEEP_ORPHANS arming plan, which is now deferred.

## Done when (this checkpoint resolves)

- A separate session selects one of the three fix paths (preference: option 2 — manifest-based sweeper) and implements it.
- Sweeper preview count drops to a believable orphan count (likely <100 — true orphans from old builds and renamed pages, not 14,640).
- `dist/saved/index.html` and other sitemap-listed paths NEVER appear in the preview list.
- Then `SWEEP_ORPHANS=1` becomes safe to run as a one-shot, and `scripts/daily-automated.sh:440` gets the prefix.
- This file archived to `specs/archive/` once resolved.

## Verification command for the next session

To re-confirm the bug still exists (or check if it's been fixed by an unrelated change):

```bash
cd "$PROJECT"
bun run src/generate-site.ts 2>&1 | grep -E "(orphan|WOULD DELETE: .*/saved/index.html)" | head -20
# If "WOULD DELETE: .../saved/index.html" appears, bug still present.
# If only true orphans appear (paths not in any sitemap and not in protected list), bug fixed.
```
