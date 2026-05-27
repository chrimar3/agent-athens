# GSC + Bing Schema/Metadata Remediation — Phase 0 Diagnostic

**Date:** 2026-05-25 · **Build:** `bun run build` exit **0**, 2928 `dist/events/` + 582 `dist/en/events/` pages · **Validator artifact:** `data/build-completeness.json` (lastUpdate 2026-05-25T05:13Z)

> **Headline:** The brief's premise is inverted by the evidence. **`location` is NOT a current defect** — the live build has zero location failures. **The real, large, current issue is meta descriptions** (an HTML-escaping bug + truncation + markdown leakage), which is the genuine Bing signal. Fix priority should shift accordingly. Phase 2's build-halt is still worth installing as a guardrail, but it will pass clean on today's build.

---

## 0.2 — Location gap classification

- **Event pages missing `"location"`: 0** (`grep -rL '"location"' dist/events dist/en/events` → 0).
- **`build-completeness.json`: `fail: 0` across ALL layers** (690/690, 2209/2209, 19/19, 28/28, 14/14, 16/16 all 100%; one layer 490 total = 454 pass / **36 warn** / 0 fail — consistent with the `location.sameAs` INFO/WARN ratchet, not a location error). The validator *does* classify `location`/`location.name`/`location.address` as hard errors — and finds none.
- **Broken publishable venues: exactly 1** (Class C). Class **A = 0**, Class **B-none = 0**, Class **B-parse = 0** among publishable.

| Class | Count | Detail |
|---|---|---|
| A (resolves, not in config) | 0 | — |
| B-none (no venue data) | 0 | — |
| B-parse (raw venue, unparsed) | 0 | — |
| **C (pipe multi-venue)** | **1** | id `639a2481cf2a931f` — *UP THE HAMMERS XXI 2027*, `venue_name="ΚΥΤΤΑΡΟ LIVE\|ΠΟΛΛΑΠΛΟΙ ΧΩΡΟΙ"`, `pass_through`. Real venue = **ΚΥΤΤΑΡΟ LIVE** (a known Athens venue; `venue_address="Αχαρνών, Ipeirou και, Athina 104 39"`). Scraper (ticketservices) concatenated the venue with the pass-through "Multiple Venues" string via a pipe, so it matched pass-through. Its dist page ships `"name": "ΚΥΤΤΑΡΟ LIVE\|ΠΟΛΛΑΠΛΟΙ ΧΩΡΟΙ"` with a garbled `@id` `/venues/live/`. **Recoverable by split-on-pipe → resolves to config Kyttaro.** |

**Conclusion:** GSC's "128 missing location" + "88 missing address" are **historical / crawl-lag** (a pre-fix build), not present in the current output. Address sub-check: 28 publishable events have empty `venue_address` *in the DB* (mostly config venues: Μέγαρο, Gazarte, Bios, Bolivar, Astron, 2ten…), but **0 dist pages emit `"streetAddress": ""`** — the address is resolved from `config/athens-venues.json` at render time. Current address-completeness gap in dist ≈ **0**.

## 0.2c — Event-node emission sites + S110 manifest writer

Event nodes with rich-result intent are emitted at **4 contexts** (3 beyond the detail page):
- `src/generators/event-page.ts:167` — detail page (primary).
- `src/generators/venue-page.ts:183` — venue-page event schema; `:424–425` — venue-index `ListItem`.
- `src/utils/schema-graph-builders.ts:53, 98, 137, 188, 192` — hub/CollectionPage per-event `ListItem` (S139 coupling).

⚠️ **Watch-point triggered:** 3 sites beyond the detail emitter > the "~2" threshold → **Phase 2.1's ListItem extension widens past a comfortable single-session budget.** Plan accordingly (detail-page halt + address assertion = demo-critical core; ListItem extension is splittable, lean on the >60% checkpoint).
- **Venue-page note:** `dist/venues/fuzz-club/` emits 2 `MusicEvent` nodes with **0 `"location"`** (the page's `Place`/`LocalBusiness` carries the address). 39 venue pages match `grep -rL '"location"'` for this reason. The venues validator layer reports `fail: 0`, i.e. treated as by-design. **Phase 2 must consciously decide** whether the halt applies to venue-embedded events or accepts the Place-adjacent pattern — do NOT blindly halt here.

**S110 coverage-manifest writer (for 2.3):** `src/validators/completeness-reporter.ts` — `buildCompletenessReport()` (175), `writeCompletenessReport()` (335) → `data/build-completeness.json`. Confirmed.

## 0.2a — Build gate (confirmed: warning-only)

`src/generate-site.ts:1224` `validateAllPages()` → `:1225` `printSchemaSummary` → `:1246` `buildCompletenessReport`. **`schemaResults` is never inspected for `.errors.length` to set exit code** — build exits 0 with errors present (empirically: exit 0 this build). Hard-stop **precedent to copy**: `:196` `throw new Error(...)` (price-type vocab) + `printHardStopSummary()` `:1254`. (`process.exit(1)` at `:1201` is an unrelated pre-generation fatal.) → **Phase 2.1 = add a post-1224 location-error check that throws/exits, + a halt-count in `printHardStopSummary`.**

## 0.2b — Address-completeness assertion (confirmed: presence-only)

Validators assert `location.name` presence, not `streetAddress` non-empty. `event-page.ts:191` emits `'streetAddress': event.venue.address || ''`, but config resolution means 0 empty in dist today. → **2.2 still worth adding as a forward guard**, but there is no current backlog to clear.

## 0.3 — endDate (type-conditional)

DB nulls among publishable, **per-occurrence** (recurrences dedupe to far fewer pages; 11,664 publishable rows → 2928 pages):

| Multi-day (genuine gap) | total | no end_date | | Single-occurrence (by-design fine) |
|---|---|---|---|---|
| exhibition | 16 | **9** | | concert 1477, theater 9434, dj_set 560, show 98, performance 30, workshop 12, cinema 5, other 5, dance 1, tech 1 |
| festival | 17 | **16** | | |

- **1.3 (restore from real span) is N/A:** every missing `end_date` is *genuinely null in the DB* — there is no span to restore from.
- Several "festivals" are single-night mislabels (*EJEKT 2026 \| THE CURE*, *Vocal Jazz Festival*, *Sapphire Blues Festival*) → absence is fine. A few are genuinely multi-day (*Release Athens 2026*, *3ο Greek Beer Festival*, *39ο Διεθνές Φεστιβάλ Κιθάρας*) and currently emit the **`endDate=startDate` proxy (`event-page.ts:202–211`) — factually wrong for a multi-day span**.
- → **1.3b (type-conditional WARN) is the relevant fix** (surface unrestorable multi-day for manual backfill). Single-occurrence stays silent. **Flag:** the existing proxy mislabels genuine multi-day festivals as 1-day — decide whether multi-day should suppress the proxy (leave absent + WARN) rather than emit a wrong endDate.

## 0.4 — eventStatus

**0 pages missing `"eventStatus"`.** No regression → **no fix** (1.4 skipped).

## 0.5 — Meta descriptions (THE genuine, large, current issue) — **THREE root causes**

3240 / 4675 pages measured < 120 chars; 284 measured len 0. Decomposed:

1. **🔴 Unescaped double-quotes in the HTML `content` attribute** — **≥51 default event pages; `og:description` affected too.** Example raw HTML:
   `<meta name="description" content="Sarah Kane's "Cleansed" returns to…">` → attribute terminates at the `"` before *Cleansed*; Bing/Google read just `Sarah Kane's `. When the description *starts* with a quote (`"Apoichoi tou Romantismou"…`) the attribute becomes `content=""` → **truly empty** (this is the bulk of the len0 pages). **HTML-correctness bug, crawler-visible.**
2. **🟡 Abbreviation-blind sentence truncation** — ~2424 pages. Composer splits on `". "` and treats abbreviations as sentence ends: `Mr. Updated daily.` (18), `Theodosis P. Updated daily.` (27), `REVOLT! Updated daily.` (22). Produces tiny fragments + the `Updated daily.` suffix.
3. **🟡 Markdown leakage** — `**Postponed. Updated daily.`, `**What is it? Updated daily.` — `**` bold markers not stripped before composing.

- **Sub-cause (c):** hub/category pages (`exhibitions.html` 96, `jazz.html` 97, `dance.html` 98) sit at a consistent 95–98 chars via `generateHubMetaDescription` — borderline, **out of scope per plan, logged**.
- **All three event-page causes live in/around `src/utils/meta-descriptions.ts:generateEventMetaDescription()` (composer) + the emission site `src/generators/event-page.ts:22` (escaping).**

**⚠️ Revises Phase 1.5:** the fix is NOT "enforce a ≥120-char floor." It is: **(1) HTML-escape the meta value at emission** (`"`→`&quot;`, `&`/`<`/`>`; audit `og:description` and sibling attrs — carefully, mind the shotgun guard); **(2) abbreviation-aware truncation / compose to a real sentence**; **(3) strip markdown before composing.** A floor may still help as a backstop after these, but it is not the root fix.

## 0.6 — IndexNow

`logs/indexnow-latest.json`: `2026-05-25T05:21:15Z`, submitted **2971**, success **2971**, batches 1, failures **0**. **Fresh, healthy — no flag.** Batch mode unchanged (correct).

---

## Revised fix targets (finalized from results — supersede the brief's assumptions)

| Plan step | Original assumption | Diagnostic verdict |
|---|---|---|
| 1.1 backfill Class A | many venues | **0 Class A** — nothing to backfill (keep config addresses complete; that path already works). |
| 1.2 recover/quarantine B/C | several | **1 Class C** — split `639a2481` on the pipe → resolves to Kyttaro. No B to handle. |
| 1.3 restore endDate | regression | **N/A** — no span in DB to restore. |
| 1.3b type-conditional WARN | conditional | **DO IT** — 9 exhibitions + 16 festivals null; surface multi-day as WARN; decide proxy-suppression for genuine multi-day. |
| 1.4 eventStatus | conditional | **Skip** — 0 missing. |
| **1.5 meta descriptions** | "compose fallback / 120 floor" | **REFRAMED → 3 bugs:** escaping (🔴, +og:description), abbreviation truncation, markdown leakage. The actual demo-critical Bing fix. |
| 2.1 build-halt | clear ~128 backlog | **Install as guardrail** — passes clean today (good); covers 4 emission sites (watch-point: widens session). |
| 2.2 address completeness | clear 88 backlog | **Forward guard** — 0 current backlog. |
| 2.3 S110 registration | — | writer confirmed: `completeness-reporter.ts`. |
| 3 / hardcodes / quarantine-lane | deferred | unchanged — deferred. |

**Recommended re-prioritization for the May 29 demo:** the unlock/compounding-risk framing pointed at location, but location is clean. **The meta-description escaping bug (0.5 #1) is the real, crawler-visible, current defect** and the highest-value fix. Suggest: **1.5 first** (escaping → truncation → markdown), then the 1-event Class C split (1.2), then 1.3b WARN, then Phase 2 guardrails (gated, splittable per the watch-point).

⚠️ **GATE: STOP — classifications above are reported for confirmation before any fix is finalized.**
