# Three-Signal Consistency Verification — 2026-05-02

**Session:** Three-signal consistency check + cornerstone-hash-stats script
**Goal:** verify that the schema `dateModified`, visible "Last Updated", and sitemap `<lastmod>` signals are coherent on cornerstones+hubs after S101a; ship a self-validation script for GEO's weekly log.
**Outcome:** ✅ Local-build alignment verified. Diagnosis: production hadn't redeployed yet at the time of the brief's authoring. Stats script shipped against `data/content-hashes.json`.

---

## Diagnosis: deploy lag, not regression

The brief raised concern that production hub schema/visible signals weren't reflecting S101a's hash gating. Phase 1 verification of the brief's premise revealed it was written before production redeployed:

| Event | Time (Athens) |
|---|---|
| Last "daily pipeline" chore commit before S101a | 2026-05-02 11:08:22 |
| Production /this-weekend HTML build timestamp | 2026-05-02 11:07:48 (08:07:48 UTC) |
| **S101a commit (`52f09d8d0`)** | **2026-05-02 12:41:44** |
| Local `event-set-hashes.json` regenerated | 2026-05-02 12:19:05 |

The currently-deployed production build was rendered ~1.5 hours **before** S101a was committed. No regression — the prod surface simply hadn't redeployed since the gating wiring landed.

### Two manifests, two jobs

The brief used `data/event-set-hashes.json` as if it were the per-URL manifest. It isn't.

| File | Scope | Drives | Persistence |
|---|---|---|---|
| `data/content-hashes.json` | 9,437 URLs (full per-URL HTML hash) | sitemap `<lastmod>` via `resolveLastModified` (`src/sitemap/content-hasher.ts:66-76`) | gitignored, regenerated each build |
| `data/event-set-hashes.json` | 2 URLs (`this-weekend`, `en/this-weekend`) | `metadata.lastUpdate` override for /this-weekend only (`src/generate-site.ts:425-450`) | committed (so prev manifest persists across deploys) |

Both manifests use the same shape (`{hash, lastModified}`) and the same `loadManifest`/`resolveLastModified` helpers, but they answer different questions: "did the rendered HTML change?" vs. "did the actual event set change?"

---

## S101a actual scope

`src/generate-site.ts:425-428` (verbatim):

> *"Pre-compute event-set hash for /this-weekend cornerstone — gates JSON-LD datePublished/dateModified via resolveLastModified so timestamps reflect actual content changes, not build cron (Editorial Pushback 2). Other hubs continue using build time; pattern can extend to them later."*

Only `/this-weekend` and `/en/this-weekend` are gated for schema/visible signals. The brief's "8-URL three-signal alignment" expectation is wider than S101a's actual scope.

The override flow that's wired only for /this-weekend:
1. `generate-site.ts:443` — compute `weekendHash = hashEventSet(weekendEvents)`
2. `generate-site.ts:444` — `weekendDate = resolveEventSetLastMod('this-weekend', weekendHash, eventSetManifest)` — preserves prior date if hash unchanged, else today's Athens date
3. `generate-site.ts:446` — `lastUpdateOverrides['this-weekend'] = weekendDate`
4. `hub-page.ts:282-283` — when `lastUpdateOverride` is provided, `metadata.lastUpdate = lastUpdateOverride` (replacing the per-build ISO timestamp from `urls.ts:109`)
5. `templates/page.ts:154,454-455` — `metadata.lastUpdate` feeds the visible `<span class="last-update">` and the schema `datePublished`/`dateModified`

For all other hubs, `metadata.lastUpdate` retains its `new Date().toISOString()` value from `buildPageMetadata`. Sitemap `<lastmod>` is hash-gated for **every** URL via `content-hashes.json`.

---

## Verification — local-build three-signal table (2026-05-02)

Source: freshly rebuilt `dist/` (build time 2026-05-02 14:57 Athens). Production was still pre-S101a at the time of capture.

| URL | Gated? | schema `dateModified` | visible "Last Updated" | sitemap `<lastmod>` | Aligned? |
|---|---|---|---|---|---|
| `/this-weekend` | ✅ | `2026-05-02` | 2 Μαΐου 2026 στις 03:00 πμ | `2026-05-02` | ✅ all date-only |
| `/en/this-weekend` | ✅ | `2026-05-02` | 2 Μαΐου 2026 στις 03:00 πμ | `2026-05-02` | ✅ all date-only |
| `/today` | ❌ | `2026-05-02T11:57:00.099Z` | 2 Μαΐου 2026 στις 02:57 μμ | `2026-05-02` | ✅ date-component matches |
| `/this-week` | ❌ | `2026-05-02T09:17:21.216Z` | 2 Μαΐου 2026 στις 12:17 μμ | `2026-05-02` | ✅ date-component matches |
| `/open` | ❌ | `2026-05-02T11:57:00.127Z` | 2 Μαΐου 2026 στις 02:57 μμ | `2026-05-02` | ✅ date-component matches |
| `/this-month` | ❌ | `2026-05-02T11:57:00.130Z` | 2 Μαΐου 2026 στις 02:57 μμ | `2026-05-02` | ✅ date-component matches |
| `/concerts` | ❌ | `2026-05-02T11:57:00.108Z` | 2 Μαΐου 2026 στις 02:57 μμ | `2026-05-02` | ✅ date-component matches |
| `/exhibitions` | ❌ | `2026-05-02T11:57:00.125Z` | 2 Μαΐου 2026 στις 02:57 μμ | `2026-05-02` | ✅ date-component matches |

**Reading the table:**
- **Gated rows** (`/this-weekend`, `/en/this-weekend`): all three signals are date-only `2026-05-02` and align cleanly. Schema/visible match the manifest's `lastModified` exactly.
- **Ungated rows**: schema is a full ISO timestamp (per-build), visible is the same instant rendered to Athens local time, sitemap is the date-only manifest value. By S101a's documented design — not a divergence.
- `/this-week` schema timestamp `09:17:21.216Z` (vs. others' `11:57:00.xxxZ`) is evidence that `writeHtmlIfChangedSync` is preserving older builds when content hasn't changed: this hub's HTML was rendered earlier today and didn't need rewriting at 11:57. The strip-volatile content hasher is doing its job — only changed content gets a new build timestamp.

### Visible-date 3am artifact (gated rows only)

`metadata.lastUpdate = "2026-05-02"` (date-only string from S101a override) → `new Date("2026-05-02").toLocaleDateString('el-GR', { hour, minute })` → `"2 Μαΐου 2026 στις 03:00 πμ ώρα Αθήνας"`. The 3am Athens time is a JavaScript artifact: `new Date("YYYY-MM-DD")` parses as midnight UTC, which is 03:00 Athens during DST. Date is correct; time component is decorative. No urgency to fix; flag for future UX polish session — could format the visible label as date-only for gated URLs, or always render hour/minute from build-time.

---

## Cornerstone-hash-stats script

`scripts/cornerstone-hash-stats.ts` ships against `data/content-hashes.json` (the 9,437-entry per-URL manifest).

**URL bucket** (verified against actual manifest keys, no leading slash, optional `en/` prefix):
- 5 cornerstones: `today`, `this-week`, `this-weekend`, `open`, `this-month`
- 12 type hubs: `concerts`, `theater`, `exhibitions`, `cinema`, `dance`, `classical-music`, `nightlife`, `festivals`, `comedy`, `greek-music`, `kids`, `with-ticket`
- Each with optional English mirror (matched via `^en/` prefix strip)

**Bucket size in current manifest:** 21 URLs (12 GR + 9 EN — not all hubs have English mirrors generated yet; `cinema`, `dance`, `classical-music`, `comedy`, `greek-music`, `kids`, `exhibitions` have no `en/` entry currently).

**CLI:**
```bash
bun run scripts/cornerstone-hash-stats.ts --snapshot     # save today's manifest
bun run scripts/cornerstone-hash-stats.ts <days>         # default 7 days
```

**Output (JSON + summary line):**
```json
{
  "totalCornerstonesAndHubs": 21,
  "bumped": 0,
  "held": 21,
  "bumpRate": 0,
  "bumpedKeys": []
}

0.0% of 21 cornerstones+hubs bumped over last N day(s).
(Healthy: low daily bump rate + clean bumps on substantive updates + quarterly refresh.
 Calibration band TBD post-May 22 from observed baseline.)
```

**Snapshot strategy:**
- Snapshots stored at `data/content-hash-snapshots/<YYYY-MM-DD>.json` (gitignored — added to `.gitignore` this session)
- Each snapshot ~1.1MB; ~33MB/month uncompressed
- Rotate older than 90 days — added to `docs/known-issues.md` as future cleanup
- First snapshot saved this session: `data/content-hash-snapshots/2026-05-02.json`

**No threshold this session.** Per GEO's May 1 reply, the calibration band gets set from 2-3 weeks of observed baseline data (post-May 22), not guessed numbers.

---

## Recommendations + open items

1. **Post-prod-deploy re-verify** — once the next daily-automated.sh run deploys S101a (expected 2026-05-03 ~08:00 Athens via the launchd schedule), re-run:
   ```bash
   curl -sL https://agentathens.com/this-weekend | grep -oE '"dateModified":"[^"]*"'
   ```
   Expected: `"dateModified":"2026-05-02"` (or whatever date the manifest has) — date-only, no `T`.

2. **GEO weekly log starts Friday May 8.** Workflow:
   - Daily at end of pipeline: `bun run scripts/cornerstone-hash-stats.ts --snapshot`
   - Friday: `bun run scripts/cornerstone-hash-stats.ts 7` → log the bump rate
   - Calibration band set after 2026-05-22 (3 weeks of baseline)

3. **Should S101a's gating extend to other cornerstones?** (`/today`, `/this-week`, `/open`, `/this-month`, type hubs, neighborhood hubs.) Round 4 architecture target says all cornerstones+hubs should agree on three signals; currently 6 of 8 sample URLs use build-time schema/visible. Routing this question to the next planning cycle — not a fix, an architectural decision. Snapshot data over the next 3 weeks will help quantify the cost of NOT extending: how often do ungated hubs' schema dateModified actually need to bump?

4. **3am visible-date artifact on gated rows** — flagged for future UX session. Low priority (date is correct).

---

## Files touched

- New: `scripts/cornerstone-hash-stats.ts`
- New: `specs/three-signal-consistency-2026-05-02.md` (this file)
- New: `data/content-hash-snapshots/2026-05-02.json` (gitignored)
- Modified: `.gitignore` (added `data/content-hash-snapshots/`)

## Verification commands run

- `bun run src/generate-site.ts` — completed in 16.1s, 9478 pages
- `bunx tsc --noEmit` — exit 0
- `bun test` — 1773 pass / 1 skip / 0 fail (matches baseline)
- `bun run scripts/cornerstone-hash-stats.ts --snapshot` — created `data/content-hash-snapshots/2026-05-02.json`
- `bun run scripts/cornerstone-hash-stats.ts 1` — correctly errored "no snapshot for 2026-05-01"
