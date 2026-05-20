# Known Issues & Patterns — Agent Athens
## Persistent Tracker

---

## How to Use This File

Track recurring problems, known workarounds, and failure patterns here. When the same issue appears twice, it graduates from the session log to this file with a documented workaround or fix plan.

**Severity levels:**
- 🔴 **Blocks work** — Can't proceed until fixed
- 🟡 **Degrades quality** — Work continues but output is worse
- 🟢 **Minor annoyance** — Known quirk, easy workaround

---

## S97a Audit Reconciliation (2026-04-28)

The S97 Phase 1 audit's "Items Confirmed FIXED" list was independently re-verified at the start of S97a per the rule "audit-derived FIXED claims must be re-verified before being marked Fixed in known-issues.md, even when sourced from a recent audit." All 9 items pass independent verification.

- ✅ **G1 — Malformed genres field in DB** (sealed via DB invariant in S97a). Migration `008-genres-check-constraint.sql` added `CHECK(genres IS NULL OR json_valid(genres))` to events table; 11,751 empty-string rows normalized to `'[]'` (valid JSON empty array). Verified: 0 violations + 1 CHECK constraint in schema.
- ✅ **J1 — `--text-muted` on `--bg-raised` Fails AA** (S92). Verified `src/styles/design-system.css:20`: `--text-muted: #7a7a7a;` with documented "Do NOT use on --bg-raised" comment. 4.5:1 contrast on `--bg-primary`.
- ✅ **J3 — Bilingual skip link** (S92). Verified `src/templates/site-chrome.ts:10`: `Skip to content` / `Μετάβαση στο περιεχόμενο`.
- ✅ **J-headings — h1 → h2 → h3 hierarchy in `src/templates/page.ts`**. Verified h1 (line 153), h2 (lines 329 + 373), h3 (line 297). Note: file source order is h1→h3→h2 because the h3 (card title) is in a sub-template invoked from contexts where the h2 sectioning header was already emitted; rendered DOM hierarchy is h1→h2→h3.
- ✅ **F1-distribution — Score health** (post-S69c). Verified via `enrichment_log` query (last 14d): AVG 93.5, MAX 100, MIN 83, n=236 — well above memory's "soft ceiling 88-90".
- ✅ **F3-Greek-pause — Greek paused at code AND schema level**. Verified column is `full_description_gr` (NOT `_el`); 0 new Greek rows in last 14 days; 142 historical Greek rows preserved.
- ✅ **I1-Calendar / Save / Share / SavedPage / IIFE-slug-migration** (S92). Verified in `src/templates/action-bar.ts`: `renderSaveButtonScript` (78), `renderCalendarScript` (136, with `TZID=Europe/Athens` lines 230-231), `renderShareButtonScript` (256), `renderSavedPageScript` (301), S92 IIFE slug-migration comment "Migrate legacy entries" (307).
- ✅ **A4 — Schema validator wired into build**. Verified `src/generate-site.ts:31` imports `validateAllPages`, line 992 invokes it. Build log: "98% completeness, 0 errors" as of 2026-04-28.
- ✅ **Tests-time-sensitive — 3 known time-sensitive failures resolved**. Verified `bun test` returns 0 fails matching `event-lifecycle|pipeline-state|page` test files.

Inline Status updates for the matching entries below have not been edited individually; the reconciliation table above is canonical for these 9 items as of 2026-04-28. The original entries remain in their position for institutional-memory continuity.

---

## S100 KPI Pipeline Foundation (2026-04-28)

KPI infrastructure landed in **Path B (minimum viable checkpoint)**: `data/kpi.db` schema with 7 normalized tables, 5 priority prompts seeded from `config/tracked-prompts.json`, manual logging template for GEO Strategist (`docs/kpi-manual-logging-template.md`), and pre-amplification baseline captured (`specs/s100-kpi-baseline-2026-04-28.md`).

**First re-evaluation:** post-Google-I/O 2026 (~2026-05-26, 1 week post-keynote). Triggers documented in baseline file:
- BWT Total Citations target ≥1 (any non-zero is signal)
- Manual citation log target ≥1 cited observation across 4 engines × 5 prompts × 3 weekly logs = 60 cells
- AI-bot fetches (PerplexityBot or OAI-SearchBot) non-zero in 30 days
- GA4 AI-referral sessions non-zero from any of 5 engines

**Deferred to S100b** (slot week of May 12, post-S101a-d cornerstones): GSC + GA4 + server-log automated importers + `scripts/kpi-report.ts` digest. Pre-S100b operator action: Google Cloud service account setup (~20 min, documented in `docs/kpi-setup.md` § 2-3).

S91's `data/search-visibility-log.csv` (single-number daily aggregates) and S100's `data/kpi.db` (per-row tables) are **complementary, not redundant** — different questions answered. `decisions.md` has an explicit "DO NOT consolidate in future cleanup" entry to prevent the trap.

Cross-references: S100a Class 0 audit (commit `b24937bc2`) confirms cornerstone schema state at baseline. The fourth EN-route absence (`/en/exhibitions.html`) joins the 3 from S100a (`/en/tomorrow`, `/en/this-week`, `/en/next-month`), routed to S101b Step 0 EN-mirror generation audit.

---

## S100a E3 Schema @type Audit (2026-04-28)

GEO Strategist's E3 hypothesis (some pages emit FAQPage as primary @type instead of Event/CollectionPage/etc, masking the corpus to AI engines): **FALSIFIED at high-confidence sample.** S100a sampled 314 URLs from live agentathens.com sitemaps:

- ✅ **events: 0 misclassified** of 200 sampled (2.2% of 9186; 95% CI for true corpus rate is 0–1.5%)
- ✅ **venues: 0 misclassified** of 49 sampled (94% of 52 — corpus-equivalent)
- ✅ **hubs: 0 misclassified** of 51 sampled
- ✅ **cornerstones: 0 misclassified** of 7 EL successfully fetched
- ✅ **home: 0 misclassified** of 2 sampled

FAQPage appears as a secondary block (`@graph[1]`) on 7 pages — this is intentional per the project's hub schema design (CollectionPage primary + FAQPage secondary, documented in `src/validators/schema-completeness.ts:207-269`).

**E3 closes.** S101a-d ship as planned (CollectionPage-on-`/today/` only). No @type-fix work needed in S101.

Findings + raw audit data: `specs/s100a-e3-audit-findings.md`. Reusable audit script: `scripts/audit-schema-types.ts`.

---

## Active Issues

### Bilingual Scaffolding Notice Visible on Greek-Locale Event Pages with English-Fallback Description
**Severity:** 🟡
**First seen:** 2026-05-11 (S132' diagnostic)
**Frequency:** 467 / 5762 built event pages (~8.1%) — the subset where Greek description is unavailable and English description is shown as fallback.
**Symptoms:** Built HTML emits `<p class="edp-lang-notice">Περιγραφή στα Αγγλικά</p>` (line ~285 of affected event pages) above the description body. This is the enrichment-template section label leaking out of the rendering pipeline as a visible scaffolding artifact. NOT a JSON-LD field — the leak is confined to HTML body, confirmed by `tests/build/no-bilingual-label-in-jsonld.test.ts`. Visible to Greek-locale users encountering an English-fallback description.
**Workaround:** None currently — the string is rendered to end users.
**Fix plan:** Three candidate paths, decision deferred to a future session: (a) translate to a softer Greek-native phrasing (e.g., "Διαθέσιμη μόνο στα Αγγλικά"); (b) move behind a hidden expand/collapse so the language switch is opt-in; (c) strip the notice entirely once the broader Greek-coverage backlog is resolved. Root surface is the enrichment-pipeline's English-fallback notice generator (`src/generators/event-page.ts:370` per S132' Explore agent finding); the cleanup also intersects the Greek-description coverage gap tracked elsewhere.
**Status:** 🟡 Open — surfaced during S132' diagnostic reconciliation. Out of scope for the validator-depth fix that S132' shipped; tracked here for a future session.

### Filter-Correctness Gap — `/tomorrow` and `/next-month` Skip Running Exhibitions
**Severity:** ✅ Closed
**First seen:** 2026-05-10 (S127 Phase 1 reconnaissance)
**Frequency (historical):** Affected every render of combinatorial pages using the `tomorrow` or `next-month` time filters from approximately Session 31 (when S31 introduced typed-dispatch for today/this-week/this-weekend/this-month but missed tomorrow/next-month) through S129's fix — roughly 98 sessions of latent silent loss.
**Symptoms (historical):** Running exhibitions whose `start_date` preceded the filter window but whose `end_date` extended into it were silently absent from the rendered card grid. `src/utils/filters.ts:50` (`tomorrow`) and `:91` (`next-month`) compared `event.startDate` only and ignored `event.endDate`. Tier 1 invariant violation per `.claude/CLAUDE.md` ("Exhibitions use end_date, not start_date").
**Resolution:** S128 audit quantified the silent loss (3 exhibitions dropped from `/exhibition-tomorrow`, 1 from `/exhibition-next-month` on 2026-05-10 against n=9 total visible exhibitions). S129 added the typed-dispatch block to both branches mirroring the existing correct shape at lines 43–48 (`today`) and 82–89 (`this-month`), plus 2 regression tests in `src/utils/__tests__/filters.test.ts`. Production verified: `/exhibition-tomorrow` 0 → 4 cards, `/exhibition-next-month` 0 → 1 card post-deploy.
**Status:** ✅ Closed (2026-05-11) — S129 shipped via commit `a009df2bc`. The asymmetric-typed-dispatch failure mode is captured in `.claude/notes/patterns.md` § "Asymmetric typed-dispatch bug = finishing-step gap" with S31→S129 as the canonical evidence chain.

### Tier 2 Fallback Drift (Card-Image Wrapper Per-Type Gradients vs Spec)
**Severity:** 🟢
**First seen:** 2026-05-08 (S124 plan-phase verification)
**Frequency:** Every imageless card-grid render (~36.3% of visible events; 144/397).
**Symptoms:** Production fallback at `src/styles/design-system.css:363-417` renders per-type gradients on `.card-image-wrapper[data-type=*]` (plus `.hero-card-image-wrapper`, `.hero-pick-image` siblings) and a `.card-placeholder-icon` span (TYPE_ICONS as inline content). The Design Navigator brief described Tier 2 as "bg-elevated + 32px icon at 8% opacity" — the actual production state had already drifted toward per-type gradients without the typographic event-name layer that defines Tier 1. Spec premise was outdated when Tier 1 brief was written; surfaced during S124 plan-phase verification.
**Workaround:** N/A — being replaced this session.
**Fix plan:** S124 ships Tier 1 (`.card-image--fallback` + `.card-image__fallback-text`) across 7 render sites, deletes the per-type wrapper gradients at `design-system.css:363-417`, appends Tier 1 CSS block per Design Navigator spec.
**Status:** 🟢 Open — replacement in progress (S124 same session). Status will be flipped to ✅ Closed after deploy completes.

### Content-Hash Snapshots Accumulate ~1.1MB/day in `data/content-hash-snapshots/`
**Severity:** 🟢
**First seen:** 2026-05-02 (S101b — directory created with first snapshot)
**Frequency:** Grows by one ~1.1MB JSON per `--snapshot` run (intended daily by GEO).
**Symptoms:** None operational. Directory is gitignored (added to `.gitignore` in S101b). At 1.1MB/day = ~33MB/month = ~400MB/year uncompressed. Nothing breaks at small scale; concern is unbounded growth on the development machine.
**Workaround:** N/A. Directory is local-only.
**Fix plan:** Add a rotation step (delete snapshots older than 90 days) once two conditions hold: (a) GEO has been logging weekly long enough that 90-day data has flowed through real use cases; (b) directory size warrants attention (~1GB threshold). Likely a small `find data/content-hash-snapshots/ -mtime +90 -delete` line added to `daily-automated.sh` or a separate maintenance script. Alternatively gzip snapshots in place (~1.1MB → ~50KB compressed) before rotation.
**Status:** 🟢 Open — known future-cleanup, not urgent.

### F1 Quality-Gate Hardcodes LAZY_ADJECTIVES (Diverges from YAML Source of Truth)
**Severity:** 🟡
**First seen:** 2026-04-30 (S100b post-mortem; pre-existing in production)
**Frequency:** Every F1 quality-gate run uses the divergent list
**Symptoms:** `src/enrichment/quality-gates.ts:106-119` hardcoded `LAZY_ADJECTIVES` with 27 entries; `config/banned-phrases.yaml` (single source of truth as of S100b) had a different curation. EW prompts and F1 scoring referenced different banned-phrase lists.
**Workaround:** None required short-term — both surfaces blocked the most egregious terms.
**Fix plan:** S100c — replace the hardcoded array with a `loadBannedPhrases()` call; reconcile the 15-term gap with ED first (avoid silent union dropping ED's prior curation).
**Status:** ✅ Closed (2026-05-02) — S100c shipped. ED v1.1 YAML restored 15 missing terms (now co-canonical), F1 now sources from `loadBannedPhrases()` at both consumption sites (`quality-gates.ts` `detectGenericContent` + `validateEnglishDescription`) plus the surfaced third consumer in `description-generator.ts` `validateDescription`. Behavior change: `legendary` / `iconic` / `immersive` moved from absolute hard-fail to contextual (currently silently allowed by F1's absolute-only check). Tracked separately below as a follow-up.

### Match-Firing Log Pending First Editorial Review
**Severity:** 🟢
**First seen:** 2026-05-02 (created during S100c)
**Frequency:** Append on every absolute banned-phrase match in F1 (production only — `NODE_ENV=test` is gated out)
**Symptoms:** None. This is observability, not a defect. `data/banned-phrase-matches.csv` (gitignored) records `timestamp,event_id,language_of_match,matched_phrase,description_excerpt` for each F1 absolute match. ED reviews fire volumes per phrase to decide which absolutes warrant promotion to contextual, and which contextual entries should be tightened.
**Workaround:** N/A.
**Fix plan:** First ED review at 2-4 weeks of production data (~2026-05-15 to 2026-05-30). Watch list per ED's edge-case flags: `τέλειος` / `εξαιρετικός` / `μαγευτικός` / `great` / `perfect` (terms with edge-case functional uses kept absolute on the over-flag-then-relax principle). If override burden is measurably high for any, promote to contextual via YAML edit only (no code change).
**Status:** 🟢 Open — observability pending data; not a defect.

### F1 Contextual-Match Support Not Yet Implemented
**Severity:** 🟢
**First seen:** 2026-05-02 (S100c side-effect, documented for visibility)
**Frequency:** Every description containing a contextual entry — currently silently passes F1
**Symptoms:** `config/banned-phrases.yaml` has 9 contextual entries (6 EN: `live`, `unique`, `world-class`, `premier`, `iconic`, `legendary`; 3 EL: `ζωντανός`, `κορυφαίος`, `μοναδικός`). F1's `LAZY_ADJECTIVES` issue check now uses `checkAbsoluteMatch()` which only consults absolute entries. Contextual entries require LLM judgment of `banned_when` / `allowed_when` rules — not implemented in F1. Result: `iconic` / `legendary` / `immersive` etc. silently pass F1 even when used as floating praise.
**Workaround:** EW prompts already include both absolute and contextual rules (via `buildBannedPhrasesSection`), so writers are still guided away from these terms during generation. F1's role here is the safety net, not the primary enforcement.
**Fix plan:** Track via match-firing log. If silently-passed-contextual descriptions accumulate at scale, add a contextual-judge pass to F1 (probably one Claude call per description containing a contextual entry — needs design). S100d candidate.
**Status:** 🟢 Open — known gap, deferred pending data.

### FILLER_PHRASES Still Hardcoded in `description-generator.ts`
**Severity:** 🟢
**First seen:** 2026-05-02 (acknowledged S100c scope decision)
**Frequency:** Every F1 quality-gate run on English descriptions
**Symptoms:** `description-generator.ts:115` (post-S100c position) still exports `FILLER_PHRASES` (15 entries) which F1 consumes at 4 sites with substring matching. Distinct from `LAZY_ADJECTIVES` (now YAML-sourced) and from absolute-list overlap.
**Workaround:** N/A — list works correctly; just not in YAML.
**Fix plan:** S100d candidate. Migration needs explicit ED decision on substring-vs-word-boundary semantics (substring catches `'world-classy'` as `'world-class'`, word-boundary doesn't). Preserve the dedicated FILLER_PHRASES test block in `description-generator.test.ts:368-400` during migration.
**Status:** 🟢 Open — explicit S100c scope decision; defer to S100d.

### Venue-Index Page (`/venues/`) Emits No JSON-LD
**Severity:** 🟢
**First seen:** 2026-04-28 (S100a audit surfaced this; pre-existing in production)
**Frequency:** Constant — every `/venues/` page load
**Symptoms:** `https://agentathens.com/venues/` (the venue list/index page) returns 200 OK but contains no `<script type="application/ld+json">` block. All venue *detail* pages (`/venues/<slug>/`) correctly emit `LocalBusiness` schema.
**Workaround:** None needed — venue detail pages have correct schema; only the index has the gap.
**Fix plan:** One-line addition in the venue-index template (locate via `grep "venues/index" src/`): emit `CollectionPage` or `ItemList` schema enumerating venue detail URLs. Suitable for opportunistic fix in S101 or later; not blocking.
**Status:** 🟢 Open — low priority

### EN Cornerstones (`/en/tomorrow`, `/en/this-week`, `/en/next-month`) Return HTTP 404
**Severity:** 🟢
**First seen:** 2026-04-28 (S100a audit surfaced this)
**Frequency:** Constant — every fetch of these EN URLs
**Symptoms:** EL cornerstones at `/tomorrow`, `/this-week`, `/next-month` exist and emit `CollectionPage` correctly. The EN mirrors at `/en/tomorrow`, `/en/this-week`, `/en/next-month` return HTTP 404 despite being listed in `sitemap-editorial.xml`. (The other EN cornerstones `/en/today`, `/en/this-weekend`, `/en/this-month` were not in the audit sample but were absent from S97a's `dist/en/` directory listing — likely the same gap.)
**Workaround:** None — affects EN-language users + AI crawlers parsing EN sitemap entries.
**Fix plan:** Two candidate root causes:
1. Build doesn't generate EN cornerstone pages (template/config gap).
2. Build generates them but sitemap is misaligned, claiming URLs that don't exist.

Recommend a `bun run src/generate-site.ts` then `find dist/en -name 'index.html'` cross-checked against `dist/sitemap-editorial.xml` URL list to localize. Suitable for opportunistic fix; not blocking citation work.
**Status:** 🟢 Open — low priority

---

### Recovery Mechanism Asymmetry on Stream Idle Cascades
**Severity:** 🟡
**First seen:** 2026-04-25 / 2026-04-26 (cascade producing 0 saves both days; reframed from S97 audit's NEW-2 "Stream idle timeout — new failure mode" framing)
**Frequency:** Chronic timeouts (4 / 8 / 7 / 5 / 1 / 3 / 2 / 4 / 6 / 0 lines per day across Apr 16-27); 1 cascade event in 12 days
**Symptoms:** Stream-idle-timeout pattern is chronic background noise. Recovery mechanism absorbed 4-8 timeouts/day on Apr 16, 20, 23, 24, 27 (events still enriched). Failed to absorb 4+6 on Apr 25-26 → 0 saves both days. STALE_ENRICHMENT flag in 2026-04-27 search-visibility CSV row likely correlated.
**Forensic question:** What recovery mechanism exists between batches/cycles in `scripts/auto-enrich.sh`, and why did it work on most days but fail on Apr 25-26? Reframed from "what causes timeouts" — timeouts are chronic, recovery success/failure is the discriminating signal.
**Workaround:** None until mechanism is identified.
**Fix plan:** Dedicated diagnostic session — read auto-enrich.sh between-batch logic (specifically `claude -p` invocation flow at lines 6, 89, 214, 286-294 and the orphan-kill at line 65), reconstruct timeline of Apr 25-26 vs Apr 24/27, identify branching condition. Pattern E (Debugging), output `specs/stream-idle-recovery-diagnostic.md`.
**Status:** 🔴 Open — investigation pending
**S99 update (2026-04-28):** v2.1.105+ server-side stream watchdog (`CLAUDE_STREAM_IDLE_TIMEOUT_MS=300000`) and a local stdout-mtime watchdog wrapper (`STDOUT_IDLE_CAP=120`, T1 KILL_CAUSE tagging) landed in commits `050150ed6` (script) + `bc1a0c049` (8 plists). **This addresses the symptom (stalls) but NOT the recovery-asymmetry question.** The forensic question of why pipeline-level recovery worked on Apr 16/20/23/24/27 but failed Apr 25-26 specifically remains open. Re-evaluate after the watchdog-era observation window (`specs/s99-baseline-floor.md`, 2026-04-29 → 2026-05-12). If watchdog-era still shows zero-event days, recovery mechanism is independent of stream-idle and warrants its own forensic session.

### SWEEP_ORPHANS Sweeper False-Positives on Hash-Preserved Pages
**Severity:** 🟡 (blocks orphan cleanup, but no live-correctness impact today)
**First seen:** 2026-04-28 (S97a Step 6 preview surfaced the bug; S97 audit's NEW-5 "6,382 orphans" was the same bug at an earlier accumulation point — count grew to 14,640 by S97a)
**Frequency:** Every build with content-hash-preserved pages; all builds since hash-preserving writer was introduced
**Symptoms:** `bun run src/generate-site.ts` preview-mode reports tens of thousands of "WOULD DELETE" entries including sitemap-listed pages (`dist/saved/index.html` is the canonical proof: in `dist/sitemap-editorial.xml` as `https://agentathens.com/saved/`, build log shows `✓ /saved/` generated this build, but mtime is Apr 21 — 7 days old). Running `SWEEP_ORPHANS=1` would delete ~10K+ legitimate pages, breaking the live site after the next deploy.
**Root cause:** `sweepOrphans()` at `src/generate-site.ts:1266-1346` classifies a file as orphan if `mtimeMs < buildStartTime`. The build's content-hash-preserving writer (`copyFileIfChangedSync` at line 1260) doesn't bump mtime when content is unchanged. Build log confirms: "10420 pages hashed (10420 unchanged, 0 changed/new)" — with 0 changed, no file in dist had mtime updated, so the sweeper sees nearly the entire dist as "orphan." Also subsumes audit's NEW-4 (5,806 empty-slug dirs) — they're a subset of the sweep population.
**Workaround:** Do NOT arm `SWEEP_ORPHANS=1` in `scripts/daily-automated.sh:440`. Do NOT run a one-shot sweep manually. Tolerate the dist accumulation (cost: deploy upload size, disk space; no live correctness impact since sitemap controls indexing).
**Fix plan:** Three candidate paths documented in `specs/sweep-orphans-deferred.md`:
1. Hash-preserving writer also touches mtime (smallest patch).
2. Build emits manifest of intended outputs; sweeper compares against manifest, not mtime (cleanest architecturally — preferred).
3. Two-phase build with forced regenerate before sweep (heaviest).

Belongs in a dedicated session. Verification command for that session is at the bottom of `specs/sweep-orphans-deferred.md`.
**Status:** 🔴 Open — fix deferred from S97a Step 6

### Zero Indexed Pages Across Search Engines (Citation Baseline) — Partial Recovery
**Severity:** 🟡 (downgraded from 🔴 on 2026-05-08)
**First seen:** Session 90 (baseline discovery, 2026-04-21)
**Frequency:** Was: constant invisibility. Now: Bing recovered, Google low-coverage.
**Symptoms (S90):** GSC 0 indexed, Bing 0 indexed, `site:agentathens.com` returned only GoDaddy parking page. AI citations 0/4 engines × 5 queries.
**Symptoms (S90+17d, 2026-05-08):** GSC 7 indexed (3 not-indexed: 2× canonical-alt, 1× redirect). Bing 390 indexed, 1 impression. Google `site:` shows multiple Greek hubs + events. Bing `site:` shows 31 results. AI citations not yet remeasured.
**Pipeline check-in (S128, 2026-05-10):** Audit B confirmed pipeline still emitting daily — IndexNow latest 2026-05-10T05:27Z (success 6346/6346, single batch, 0 failures), all 6 spot-check URLs HTTP 200, no STALE_ENRICHMENT markers in last 5 days of the visibility log. CSV manual fields `gsc_indexed`, `bing_indexed`, `ai_citations_count` empty for 2026-05-09 and 2026-05-10 — manual-update lag from Christos, not a system failure. Full Audit B section in `specs/s128-dual-audit.md`.
**Root causes (S90 diagnosis):** (1) Netlify deploy failing 6 days → IndexNow cascade-failed, (2) ping-indexnow.ts silently hit 10K API cap without batching, (3) Domain migration (agentathens.netlify.app → agentathens.com, S84) reset indexing state.
**Workaround:** None — partial visibility holds.
**Fix plan:** S90 pipeline fix shipped (Phase A/B/C/D). 17-day delta confirms recovery on Bing channel. Google low-coverage (7/8,475 = 0.08%) is the residual gap, routed to GEO Strategist diagnostic vs patience decision. Full snapshot in `specs/s90-recovery-baseline-2026-05-08.md`.
**Status:** Partial recovery confirmed (2026-05-08), pipeline still healthy at S128 check-in (2026-05-10). Bing channel restored. Google indexing coverage gap tracked separately (see new entry below). Post-S136 (2026-05-17): `bing_*_7d` columns now auto-populate daily via `scripts/fetch-bing-metrics.ts`; `gsc_*_7d` columns ship as `STALE` pending S138 OAuth fallback (see "GSC Service Account Add-User Silent Fail" entry); `ai_citations_count` column dropped from the visibility log per GEO Strategist 2026-05-17 schema lock (moved to a future separate `data/ai-citations.csv`, Sprint 5 scope). May 18 spot-check still needs Christos to read `gsc_indexed` / `bing_indexed` from the respective UIs and backfill those manual indexed-page counters (CSV indices 14, 15) for 2026-05-09 onward — comparison against the 2026-05-08 baseline requires those manual fields populated.

### GSC Service Account Add-User Silent Fail
**Severity:** 🟡 (blocks GSC API automation; manual `gsc_indexed` workflow still functional)
**First seen:** Session 136 (2026-05-17)
**Frequency:** Reproducible — fails on every attempt to add a GCP service account to the property.
**Symptoms:** Adding service-account email (`*@*.iam.gserviceaccount.com`) as a user on Search Console property fails silently. "Add user" dialog appears to accept, briefly shows in-progress state, then no row persists in the user list. No error surfaced in UI or browser console.
**Reproduced on:**
- URL-prefix property `https://agentathens.com/` with Full permission
- Domain property `agentathens.com` with Full permission
- Domain property `agentathens.com` with Restricted permission
**Account state when reproduced:**
- GCP and Search Console both signed in as `cmarag8@gmail.com`
- Property Owner = same account
- Service account `agentathens-kpi-reader@astute-encoder-452909-h6.iam.gserviceaccount.com` created and enabled
- GCP project `astute-encoder-452909-h6` under personal Gmail (no Workspace org)
**Root causes (suspected):** Personal-Gmail-owned Search Console properties appear to silently reject service-account user additions in this account configuration. Not formally documented by Google; reproduced across property types and permission tiers.
**Workaround:** Use OAuth user credentials (authenticated as the property Owner) instead of service-account auth. Deferred to S138.
**Fix plan:** S138 — OAuth fallback session. Service-account JSON at `~/.config/agentathens/gcp-kpi-reader.json` is retained for the eventual S138 attempt (or replacement OAuth client). Bing half of search visibility automation shipped in S136 as compensation; GSC half pending.
**Status:** Open — workaround path identified, not yet implemented. The 4 `gsc_*_7d` columns in `data/search-visibility-log.csv` remain `STALE` indefinitely until S138 lands. Not on Παναθήναια May 29 critical path.

### Google Indexing Low Coverage
**Severity:** 🟡
**First seen:** S90+17d capture (2026-05-08)
**Frequency:** 7 of 8,475 sitemap URLs indexed by Google = 0.08% coverage at 17 days post-fix
**Symptoms:** GSC indexed count grew slowly (0 → 7 over 17 days). Bing comparison: 390 indexed in same window via IndexNow (Microsoft-only protocol). Google ignores IndexNow; relies on crawl scheduling + sitemap discovery. 3 explicit not-indexed reasons in GSC (2× "Alternative page with proper canonical tag", 1× "Page with redirect") — likely trailing-slash redirect interaction, but explains only 3 of 8,468 missing URLs.
**Root causes:** Pending GEO Strategist diagnostic. Hypotheses: (1) slow new-domain crawl scheduling — patience case, (2) sitemap discovery issue, (3) structural canonical/redirect pattern at scale.
**Workaround:** None — Bing-channel signal (BWT AI Performance, Copilot) is the active surface for KPI tracking until Google catches up.
**Fix plan:** GEO Strategist owns next step — patience vs structural diagnostic decision. Re-measure at S90+30d (~2026-05-21) and S90+45d (~2026-06-05) to determine slope.
**Status:** Open, queued for GEO Strategist

### Bilingual Coverage Gap
**Severity:** 🟢 (downgraded from 🟡)
**First seen:** GEO audit (Sprint 4 finding)
**Frequency:** ~74% of events lack enriched English descriptions; only 15 have Greek
**Symptoms:** English event pages and hub pages are live with hreflang + `x-default` → English (Sessions 45-46). Infrastructure complete. Coverage is the remaining gap — 289/1,117 events have English descriptions, 15 have Greek.
**Workaround:** Events without English descriptions still have Greek pages with English fallback for AI crawlers.
**Fix plan:** Continue bilingual enrichment batches to scale coverage. Theater (53% of events, 10% enriched) is the dominant gap.
**Status:** Infrastructure complete (Sessions 42-46). 11 English hubs live. 7-day enrichment coverage: 28.7% (S85, recovering from 6-day drought). 90 events/day target (S87: 6 runs × 3 batches × 5 events).

### Venue-Lock Type Mismatches
**Severity:** 🟢 (was 🟡)
**First seen:** Session 7 (batches 8-10)
**Frequency:** Dropped from 33% (session 7) to near-zero. Session 44 found 3 DB-level misclassifications.
**Symptoms:** Venues that host multiple event types (Kafetheatro, Temple, Baumstrasse) get a single type assigned based on venue default. A concert at Kafetheatro becomes "theater."
**Resolution:** Session 71: 4-pass categorizer (Venue Lock w/ URL override → Keywords → URL Path → Source Hints). URL override on venue lock allows surgical per-event corrections without blanket reclassification. 2 venues moved to mixed_venues, 5 kept venue-locked with URL overrides. 31 theater→concert fixes applied. Subagent safety net preserved as secondary check.
**Status:** Fixed (Session 71)

### megaron.gr Mixed-Venue Misclassification — Talks/Children/Cinema/Festival Labelled as Concert
**Severity:** 🟡
**First seen:** 2026-05-14 — concrete instance flagged from live page: event `15e395128b7b285b` (Pavlopoulos AI/Justice discussion at Megaron Plus) breadcrumbed as Συναυλία on agentathens.com, scheduled 2026-05-29 (Παναθήναια demo date).
**Frequency:** 11–13 of 34 future-dated megaron.gr concert-typed events (32–38%). Breakdown: 3 confirmed talks (`15e39512` Pavlopoulos, `293f2e89` Tasios mythology+technology, `44a392bd` Mundus inversus / Bosch music), 4 children's programs, 3 cinema screenings (2× Unitel Προβολή + Buster Keaton), 1 festival (Bobos Arts), 2 ambiguous-leaning-talk. **Not systemic** across other mixed_venues: Rabbithole 0, Christmas Theater 0, GNO 3 (opera = legitimate music). Megaron-specific.
**Symptoms:** Wrong breadcrumb on live event pages, wrong Schema.org `@type`, wrong filter/hub categorization, downstream credibility cost. Sibling to S71 fix but operates one layer upstream: S71 addressed venue-locked misclassification; this residual is the scraper-side default that S71's mixed_venues bypass correctly defers to keywords/URL/source — none of which fire for megaron.gr (no Greek talk-keywords in config, flat `/event/<slug>/` URL, megaron.gr absent from `source_type_hints`).
**Workaround:** None applied yet. Three options enumerated in `specs/categorizer-audit-2026-05-14.md` Section D.1 (leave / unpublish / DB override). Awaiting user decision.
**Fix plan:** Two-layered root cause documented in audit Sections A.3 + C: (1) `scripts/scrape-megaron.ts:24` declares narrow `ScrapedEvent['type']: 'concert' | 'theater' | 'dance'` with three concert defaults at lines 38/41/107 — actively discards megaron.gr's `category-title` HTML metadata; (2) `EventType` union at `src/types.ts:69–81` has no `talk`/`lecture` member, though validator's `'tech'` keyword list at `src/validators/event-categorizer.ts:73–79` already implicitly recognizes the class (includes `'seminar'` / `'research talk'` / `'lecture series'` / `'συνέδριο'`). Cheapest sequencing: (a) broaden scraper union to full `EventType` + honor megaron.gr category text → unblocks correct `cinema`/`festival`/`workshop` labeling immediately (~30 min, 1 file); (b) add Greek talk-keyword pass to `config/categorization-keywords.json` routing to `'tech'` as stopgap (~15 min); (c) await Editorial Director typology decision + GEO Strategist Schema.org mapping; (d) split `'tech'` into `'tech'` + `'talk'` and retarget keywords — shotgun surgery across 15–19 files per audit Section E. Also: change categorizer literal fallback at `src/categorizer/categorize-event.ts:435–438` from `'concert'` to `'other'` to surface review-needed signal.
**Status:** 🟢 Partially fixed (2026-05-14 — shipped to production). `scripts/scrape-megaron.ts` broadened with full `EventType` union + 9-string `categoryToType()` mapping derived from listing-page spike (`specs/megaron-category-titles-spike.md`). Categorizer literal fallback nudged from `'concert'` to `'other'` (`src/categorizer/categorize-event.ts:435–438`). Six Greek talk-keywords added to `tech.title_keywords` as taxonomy-pending stopgap. **Pavlopoulos `15e395128b7b285b` + Tasios `293f2e89038f6ef8`** both verified on production as breadcrumb `Εκδήλωση` (was Συναυλία). 4 Megaron children's programs retyped to `'workshop'`. Megaron type distribution: concert 34→26, +4 other, +4 workshop. **Open follow-ups for taxonomy session:** (a) Mundus inversus + Vienna Phil Unitel + Bobos festival — megaron.gr labels these `Μουσική` despite audit hand-classification disagreeing, so source-side categorization wins; needs content-classifier pass (audit Section D Option 5) or per-event override; (b) `generateEventId` keys on title — see separate 🟡 entry below "Dedup Keep-Decision Favors Older Row…" for the full audit + recommendation; (c) Editorial Director typology decision still pending; (d) when `'talk'` taxonomy lands, retarget the 6 Greek keywords from `tech.title_keywords` to `talk.title_keywords` (commitment logged in decisions.md).

### Dedup Keep-Decision Favors Older Row Even When Newer Row Has Correct Type from Source
**Severity:** 🟡
**First seen:** 2026-05-14 (S140 anchor case — Pavlopoulos title-edit during megaron.gr re-scrape). Promoted from informal mention in the megaron entry above to a formal entry by `specs/event-id-stability-audit-2026-05-15.md`.
**Frequency:** 1 known occurrence (5 rows recovered manually). Recurrence rate currently unknown — depends on how often source sites edit event titles between our scrapes. Audit recommends 30-day monitoring window post-fix to gauge real frequency.
**Symptoms:** When a source edits an event title between scrapes, `generateEventId(title, startDate)` (or its 3-param sibling) produces a different MD5/sha256 hash → scraper INSERTs a new row instead of UPDATEing the existing one. `scripts/remove-duplicates.ts` Pass 1 catches the URL collision but its keep-decision SQL (`scripts/remove-duplicates.ts:285-303`) tiebreaks via `LENGTH(title) DESC` then `LENGTH(description) DESC` — both favor the older row (which has been in the DB longer, accumulated enrichment, often has a longer original title). Net: re-scrape correctly retypes the event, then dedup undoes the fix by deleting the corrected row. S140 recovered 5 rows manually via direct SQL UPDATE (Pavlopoulos + Tasios + 4 sibling Megaron children's programs).
**Workaround:** Manual SQL UPDATE per affected row (the S140 recovery path). Not scalable.
**Fix plan:** **Vector C (smart-dedup hybrid)** per `specs/event-id-stability-audit-2026-05-15.md` Section H. ~3-4 hours single session. Modifies `scripts/remove-duplicates.ts` Pass 1 + Pass 7 (with tiebreaker harmonization between them — Section D.3 inconsistency note) + sympathy update to `scripts/merge-duplicates.ts`. New rule: when two rows in a Pass-1 URL collision have different `id`s (= title divergence between scrapes), prefer the row with newer `scraped_at` timestamp. Regression test fixture named `tests/fixtures/dedup-s140-title-edit.ts` to anchor institutional memory in the codebase. Vector A (URL+date hash, replaces 10 generateEventId sites) deferred to Phase 2 — escalation trigger: ≥3 title-edit URL collisions in a 30-day window post-Vector-C-ship.
**Status:** 🟡 Open (2026-05-15). Audit complete at `specs/event-id-stability-audit-2026-05-15.md`. Vector C scheduled for after the post-demo taxonomy session lands (Vector C unblocks the taxonomy session's Step 12 migration sweep — re-scrape path becomes safe; without Vector C, migration falls back to manual UPDATE just like S140).

### Thessaloniki Event Location Filter Gap
**Severity:** 🟢
**First seen:** Session 7 (batch 9)
**Frequency:** Rare but recurring — 2 events across 75 descriptions (Session 7: Skiadareses, Session 17: Eightball Club / ΜΩΡΑ ΣΤΗ ΦΩΤΙΑ)
**Symptoms:** Thessaloniki events reach the enrichment queue without being caught by the location filter. Subagents catch them during enrichment and mark as `rejected_non_athens`.
**Workaround:** Subagent acts as second filter — catches leaks during enrichment. Description is saved but event won't appear on site.
**Fix plan:** Add Eightball Club and broader Thessaloniki venue patterns to rejected-locations.json. Consider excluding `rejected_non_athens` events from enrichment queue sync to avoid wasting enrichment slots.
**Status:** Open — low priority, subagent safety net is reliable

### Flaky Network Timeout Test
**Severity:** 🟢
**First seen:** Session 6
**Frequency:** Rare
**Symptoms:** 1 test out of 1054 fails with network timeout — unrelated to code changes
**Workaround:** Re-run tests; it passes on retry
**Fix plan:** Investigate which test has the network dependency, add retry or mock
**Status:** Open

### Gate Score Soft Ceiling
**Severity:** 🟢
**First seen:** Session 3 (batches 2-3)
**Frequency:** Always
**Symptoms:** Gate scores cluster 88-90 regardless of editorial quality or tag taxonomy completeness. Tag expansion (Session 5, 20 new tags) did not move scores. A genuinely excellent description and a merely good one both score ~89. The mechanical gates don't discriminate between "competent" and "outstanding."
**Workaround:** Not blocking — gate scores are a floor check, not a quality ranking. Human spot-checks cover the editorial dimension.
**Fix plan:** Would require subjective scoring (NLP-based sensory density, tribe behavior detection) — not worth the complexity right now.
**Status:** Open — confirmed structural limitation (validated across 120+ descriptions, sessions 1-18)

### Cross-Batch Opening Echoes
**Severity:** 🟢
**First seen:** Session 4 (batches 5-7)
**Frequency:** 1 occurrence in 75 parallel descriptions (Session 11 only). Zero echoes across sessions 13-18 (60 descriptions). `recent-openings.json` dedup safeguard appears effective.
**Symptoms:** Two descriptions across different batches share the same opening structural move. Within-batch rule 15 prevents this inside a single batch, but parallel subagents can't see each other's openings mid-run.
**Workaround:** `recent-openings.json` (implemented Session 10) provides cross-session dedup — rolling window of 30 opening lines included in all generated briefs. Within-session parallel batches still can't deduplicate against each other.
**Fix plan:** Pre-allocate opening strategy types per brief at generation time. Deferred — current rate is near zero.
**Status:** Open — effectively resolved by dedup safeguard, monitoring

### Time-Sensitive and Hardcoded Test Failures
**Severity:** 🟢
**First seen:** Session 33 (identified as pre-existing)
**Frequency:** 3 tests fail depending on date/time of run
**Symptoms:** Three distinct failures: (1) event-lifecycle.test.ts — time-boundary tests fail after midnight when concert "today" gets classified as past-active. (2) pipeline-state.test.ts — hardcoded date expectation (2026-03-02 vs actual date). (3) page.test.ts — HTML format mismatch in event count rendering. (4) ~~save-batch test — pre-existing failure~~ ✅ test.skip() (Session 72). (5) ~~hasNativeGreek TS error in 6 fixtures~~ ✅ Fixed (Session 72).
**Workaround:** Known failures — don't block deployment. Re-running at different time of day changes which ones pass.
**Fix plan:** (1) Use frozen clock/mock in lifecycle tests. (2) Replace hardcoded date with relative date calc. (3) Update HTML expectation to match current rendering.
**Status:** Open — low priority, cleanup session candidate

### Font Smoothing Missing from CSS
**Severity:** 🟢 (was)
**First seen:** Design Session D12 (pattern merge audit)
**Symptoms:** Light text on dark backgrounds appears heavier than intended on macOS due to subpixel antialiasing.
**Resolution:** `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` added to design-system.css body rule. Confirmed present by Session 63.
**Status:** Fixed (pre-Session 63)

### Accessibility Verification Points (4 items)
**Severity:** 🟢
**First seen:** Design Session D12 (pattern merge audit)
**Frequency:** Unknown — need Claude Code to verify current implementation
**Symptoms:** Four patterns identified in pattern merge that may or may not be correctly implemented:
1. ~~Card `<a>` pattern — should use heading-link + `::before` expansion, NOT full-card wrapper~~ ✅ Fixed Session 64
2. Relative date pairing — "Απόψε"/"Tonight" should pair with visually-hidden `<time datetime="">`
3. Sold-out live region — sold-out badge should have `role="status"`
4. ~~`isolation: isolate` — layered components (cards, dropdowns, modals) should prevent z-index leakage~~ ✅ Fixed Session 64
**Workaround:** N/A — need verification first.
**Fix plan:** Claude Code verification session. Fix any gaps found.
**Status:** Open — 2/4 fixed (Session 64), 2 remaining (relative date pairing, sold-out live region)

### WCAG: --text-muted on --bg-raised Fails AA Normal Text
**Severity:** 🟢
**First seen:** Session B (4-level surface system)
**Frequency:** 8 selectors using --bg-raised (interactive hover/active states in filters + search)
**Symptoms:** --text-muted (#777) on --bg-raised (#282828) = 3.4:1 contrast ratio. Fails WCAG AA normal text (requires 4.5:1). Passes AA large text (requires 3:1). Documented in CSS comment.
**Workaround:** None — live on production.
**Fix plan:** Design Navigator decision: if decorative/large text → acceptable. If functional normal text → bump --text-muted to #888 or restrict usage on --bg-raised.
**Status:** Open — awaiting Design Navigator ruling

### Event Type Badge Contrast Failures — LIGHT_TEXT_BADGES Set Premise Inverted
**Severity:** 🟢
**First seen:** 2026-05-14 (`specs/event-type-badge-color-audit-2026-05-14.md`). Live since the CSS color block + `LIGHT_TEXT_BADGES` constant shipped.
**Frequency:** Every rendered card-badge and edp-type-badge for `performance` and `cinema` event types — both card grids (hub pages, today/this-week/next-month, search results) and event-detail pages. `screening` is a third member of `LIGHT_TEXT_BADGES` but doesn't ship on any real event (not an EventType union member).
**Symptoms:** Badge text fails WCAG AA contrast. `performance` (#f5a742 + #f0f0f0 light text) = 1.76:1, `cinema` (#b87ef7 + #f0f0f0) = 2.44:1. AA requires 4.5:1 for 12px (normal text). The root cause is `LIGHT_TEXT_BADGES = Set(['performance', 'cinema', 'screening'])` at `src/templates/page.ts:45` — the set's name asserts "these badges have backgrounds dark enough to need light text," but the actual hex values are mid-luminance oranges/lavenders, not dark. Light text inverts what the colors need.
**Workaround:** None — live on production.
**Fix plan:** Two vectors enumerated in `specs/event-type-badge-color-audit-2026-05-14.md` Section E.5, DN picks:
- **Vector A (RECOMMENDED, cheap):** edit `src/templates/page.ts:45` to set `LIGHT_TEXT_BADGES = new Set<EventType>()` (empty). All three types fall through to default dark text (`--text-on-bright: #0d0d0d`). New contrast: performance 9.94:1, cinema 7.15:1 — both comfortably pass. Single-file 1-line edit. Also removes the `'screening'` ghost reference in the same change.
- **Vector B (NOT RECOMMENDED, expensive):** darken `--color-performance` and `--color-cinema` enough to give light text 4.5:1. Requires ~2.5× darker; breaks the warm-orange / lavender brand intent.
Pair with a `bun:test` assertion verifying every `LIGHT_TEXT_BADGES` member's `--color-<type>` contrasts ≥4.5:1 with `--text-primary` — prevents recurrence.
**Status:** 🟢 Resolved S142 (2026-05-18, commit `9487388a0`) — Fix Vector A landed per DN approval (locked 2026-05-15). `LIGHT_TEXT_BADGES` emptied at `src/templates/page.ts`; production now: performance 9.94:1, cinema 7.15:1 (both clear of 4.5:1 AA floor). Regression guard `src/templates/__tests__/badge-contrast.test.ts` — CI-enforced, FAIL <4.5:1, WARN <5.0:1, iterates EventType union with `satisfies` compile-time drift guard. Theater currently fires WARN at 4.74:1 — deferred to next batch pass per DN (logged in `docs/design-decisions.md`).

### Malformed Genres Field in DB
**Severity:** 🟡
**First seen:** Earlier session — 1 row
**Recurrence:** Session 92 (2026-04-20) — 5 rows
**Symptoms:** `genres` field contains bare string `"visual-arts"` instead of JSON array `["visual-arts"]`. Causes build failure.
**Workaround:** Manual SQL fix: `UPDATE events SET genres = '["visual-arts"]' WHERE <id condition>;`
**Fix plan:** Add CHECK constraint or validator in scraper import / upsert path to ensure `genres` is always a valid JSON array. Low effort, high payoff — prevents build-blocking surprises.
**Status:** Open — recurring, needs import-level fix

### Duplicate `daily.plist` + `freshness.plist` 08:00 Schedule Collision
**Severity:** 🟡
**First seen:** 2026-05-18 (S142 diagnostic — surfaced from Netlify deploy history pattern)
**Frequency:** Every scheduled daily fire. Cumulative ~18 days × 2 plists = ~36 deploys created per `~/Library/LaunchAgents/com.agentathens.*.plist` `runs` counter, but `listSiteDeploys` shows ~2 deploys per launched day (one per plist invocation reaching the deploy phase). The collision-vs-survival ratio depends on the timing gap between the two daily-automated.sh invocations.
**Symptoms:** Both `com.agentathens.daily.plist` and `com.agentathens.freshness.plist` schedule `Hour=8 Minute=0` and both invoke `scripts/daily-automated.sh` (daily without args, freshness with `freshness` arg). They fire near-simultaneously each morning. When the resulting deploys are far enough apart (15–18 min, observed 2026-05-14 and 2026-05-15), both succeed and Netlify last-deploy-wins semantics keep prod healthy. When the deploys arrive tight (0.4 sec apart, observed 2026-05-17 08:33:49.254Z + .613Z), both end `state: error error_message: "Deploy canceled"` and prod stays on the prior deploy — visible as multi-day staleness if no manual unsalt happens. Diagnostic evidence in `specs/session-goal-diagnose-iridescent-ocean.md` and S142 session-log entry (Session 140).
**Workaround:** S142 `c9ae3b53f` ships a verify+retry-once gate in `run_deploy()` that auto-recovers the collision case in practice — the second attempt fires after the other deploy has settled, and the retry-gate's "zero concurrent non-terminal deploys" predicate then passes. Workaround masks the underlying structural double-fire.
**Fix plan:** Routing question to resolve first: are `daily` and `freshness` semantically redundant (kill one), or do they serve different pipeline phases (offset + `flock`)? Looking at `scripts/daily-automated.sh:771-803`, freshness mode skips enrichment phases but otherwise runs the same scrape→dedup→build→deploy chain. If daily and freshness do overlap, the simplest fix is to unload one plist (likely freshness, since daily covers the same work). If they're meant to be sequential (daily runs full pipeline; freshness re-deploys with newer late-day enrichments), the right shape is `daily.plist` at 08:00 + `freshness.plist` at e.g. 20:00 with a `flock` guard on `.pipeline-*.lock`. Either way, the fix touches plist files (`~/Library/LaunchAgents/` + repo's `config/launchd/` mirror) and possibly the script's lock-file logic; out of scope for S142's deploy-fix.
**Status:** 🟡 Open — queued for plist-deconflict session. S142's verify+retry mitigation is durable cover until the structural fix lands.
**Dependency note:** If the plist-deconflict session offsets either plist out of the morning UTC≡Athens window (UTC and Athens calendar dates agree only when build moment is 03:00–23:59 Athens / 00:00–20:59 UTC), the `<meta name="date">` Athens-TZ bug (queued as Session D) becomes a hard prerequisite. The bug surfaces when build moment crosses UTC midnight relative to Athens (~21:00–03:00 Athens / 18:00–00:00 UTC). Today's 08:00 schedule is safely inside the agree-window so the bug is dormant; any non-morning offset re-surfaces it. Document this dependency at plist-deconflict session pickup so future-you doesn't relearn it.


---

## Resolved Issues

### recent-openings.json Duplicate Entries
**Severity:** 🟢 (was)
**First seen:** Session 11 (first parallel run)
**Symptoms:** Re-saves appended duplicate opening lines. Rolling window of 30 filled with duplicates faster than unique openings.
**Resolution:** Session 41: Map-based dedup by event_id in appendRecentOpenings() — latest entry wins.
**Status:** Fixed (Session 41)

### Enrichment Log Double-Count
**Severity:** 🟢 (was)
**First seen:** Session 11
**Symptoms:** Enrichment log recorded duplicate entries when save-batch ran twice per batch, inflating metrics.
**Resolution:** Session 41: Cleaned 40 duplicate rows, added UNIQUE INDEX on (event_id, session_id, batch_number), changed INSERT to INSERT OR REPLACE.
**Status:** Fixed (Session 41)

### `screening` Type Not in Canonical Set
**Severity:** 🟡 (was)
**First seen:** Session 18 (batch 113)
**Symptoms:** Subagent reclassified 1 event from concert to `screening`, which wasn't in the 9 canonical types.
**Resolution:** Session 41: screening removed from EventType. Keywords merged into cinema in both categorizers + config JSON. Filter bar option removed. 0 DB events affected.
**Status:** Fixed (Session 41)

### "ΑΝΟΙΧΤΗ" Badge Uses Wrong Color Token
**Severity:** 🟢 (was)
**First seen:** Session 16 (card grid review)
**Symptoms:** "ΑΝΟΙΧΤΗ" (open/free entry) badge used `var(--color-exhibition)` instead of a status color. Open entry is a status, not an event type.
**Resolution:** Badge tokens migrated to design system in D3. All card badges now use per-type `data-type` attribute with correct color tokens.
**Status:** Fixed (Design System D3)

### Pre-existing TypeScript Errors
**Severity:** 🟢 (was)
**First seen:** Session 15
**Symptoms:** `bunx tsc --noEmit` produced 28 errors across ~20 files, unrelated to recent changes.
**Resolution:** Session 41 cleanup: synced EventType unions, fixed type conversions, changed tsconfig.json rootDir from ./src to . and included tests/. 28 → 0 errors.
**Status:** Fixed (Session 41)

### Transit/Logistics Errors in Existing Descriptions
**Severity:** 🟡 (was)
**First seen:** Session 20 (audit of 20 descriptions)
**Frequency:** ~20% of descriptions had at least 1 error; 60% of errors were transit/logistics
**Symptoms:** Wrong metro lines, wrong addresses, wrong nearest stations in Good to Know sections. "Gazi-Votanikos" was a completely fabricated station appearing in 6 descriptions. Megaron listed as Evangelismos instead of Megaro Moussikis. Line color references were wrong in 82 instances.
**Resolution:** Session 39 retroactive audit: 9 wrong station names fixed across 5 venues, 82 line color references removed (new rule #19 — no line colors, they cause more errors than they help), 3 knowledge base errors corrected in config/enrichment-knowledge.md. DB backup at data/events.db.pre-transit-audit.
**Status:** Fixed (Session 39)

### Atmospheric Fabrication in Openings
**Severity:** 🔴 (was)
**First seen:** Session 1 (batch 0)
**Symptoms:** Subagent invented plausible venue sensory details (kitchen smoke, retsina at Kafetheatro) that scored 90/100 on gates. Mechanical gates cannot detect fabricated atmosphere.
**Resolution:** Brief hardened with rules 13-14 (venue opening verification, credential confidence). Anti-pattern #10 added. Zero fabrication in subsequent 35+ descriptions across 6 batches. Human spot-check of openings retained as safety net.
**Status:** Fixed (Session 2)

### Structural Repetition in Openings/Closers
**Severity:** 🟡 (was)
**First seen:** Session 2 (batch 1)
**Symptoms:** 3/5 openings were sound-first, 2/5 closers used "combination" phrasing. At scale this makes the site feel machine-written.
**Resolution:** Rules 15-16 added to brief (opening diversity, closer diversity). Sound-first openings dropped from 60% to 20%. "Combination" closers eliminated.
**Status:** Fixed (Session 3)

### Gate Word Count Threshold Mismatch
**Severity:** 🟡 (was)
**First seen:** Session 3
**Symptoms:** Gate warned at 450 words but enrichment brief targets 400-600. Every description in the correct range got a false TOO_LONG warning.
**Resolution:** Updated quality-gates.ts premium tier max from 450 to 600.
**Status:** Fixed (Session 3)

### Substring Matching in Categorizer
**Severity:** 🔴 (was)
**First seen:** Session 4 (5/15 type mismatches in batches 5-7)
**Symptoms:** Multiple substring bugs: "Tech" matched "Tech House" (genre matching via bidirectional includes()), "techno" matched "technology," "aria" matched "Maria"/"Zacharias." Resulted in 15+ events miscategorized, primarily tech meetups routed to dj_set.
**Resolution:** Genre matching changed from includes() to exact match. Ambiguous short keywords ("techno", "aria") added to whole_word_only regex list.
**Status:** Fixed (Session 6)

### Mixed Venue Check Ordering
**Severity:** 🔴 (was)
**First seen:** Session 6
**Symptoms:** categorizeByVenue() checked venue_type_map before mixed_venues. Club "IT" (short name) matched inside "rabbithole" via contains-match at HIGH confidence, claiming dj_set before the mixed_venues check could identify Rabbithole as multi-type.
**Resolution:** Moved mixed_venues check before venue_type_map check in categorizeByVenue().
**Status:** Fixed (Session 6)

### Credential Confidence Drift
**Severity:** 🟡 (was)
**First seen:** Session 1 (batch 0)
**Symptoms:** Subagent presented unverified credentials as fact (Margaris Universal debut single was fabricated). Scored 90 on gates.
**Resolution:** Rule 14 added to brief ("If you cannot verify a specific release, album, or credential through web search results, do not include it"). FRS correctly flagged as unverifiable in batch 1. Zero credential issues in subsequent batches.
**Status:** Fixed (Session 2)

### Temp-Descriptions Pile-Up
**Severity:** 🟡 (was)
**First seen:** Session 10 (reported after 12 batches)
**Symptoms:** save-batch.ts scanned ALL .md files in temp-descriptions/. After 12 batches, 361 files accumulated. Every save re-processed everything — batch 34's save did 5 new + 53 re-enrichments.
**Resolution:** Manifest-driven saves (--manifest=path required). save-batch only processes event IDs from the JSON manifest. --clean removes processed files after successful save. Old scan-all mode removed entirely.
**Status:** Fixed (Session 10)

### Sequential Enrichment Bottleneck
**Severity:** 🟡 (was)
**First seen:** Session 10 (reported)
**Symptoms:** Brief generator picked events deterministically. Generating 3 briefs without saving between them produced the same 5 events 3 times. Forced sequential execution: ~30 min for 15 events.
**Resolution:** --batches=N flag selects N×5 non-overlapping events in one pass, writes N separate brief/manifest pairs. 3 parallel subagents cut wall-clock from ~30 min to ~8 min (3x speedup).
**Status:** Fixed (Session 10, validated Session 11)

### Stale Type References After Consolidation
**Severity:** 🔴 (was)
**First seen:** Session 11b
**Symptoms:** Type consolidation (9 canonical types) broke 11 tests referencing old types (dance, comedy, conference, meetup, sports). bun test was broken, blocking all deployments.
**Resolution:** Updated 18 test expectations across 3 files, both categorizers, config JSONs, and CLAUDE.md. Shotgun surgery checklist documented: types.ts → config JSONs → both categorizers → tests → CLAUDE.md.
**Status:** Fixed (Session 12)

### Ticketservices Parnassos Blanket dj_set
**Severity:** 🟡 (was)
**First seen:** Session 11 (reported as scraper issue)
**Symptoms:** Parnassos events (concerts, spoken word, performance) all categorized as dj_set.
**Resolution:** Root cause was stale categorizer config, not the scraper. Scraper already defaulted to concert correctly. Categorizer config updated to handle Parnassos as multi-type venue.
**Status:** Fixed (Session 12)

### Schema Completeness Validator Missing
**Severity:** 🟡 (was)
**First seen:** GEO audit (Sprint 1 — P0)
**Symptoms:** No build-time validation of Schema.org JSON-LD. Partial/incomplete schema carries an 18-point citation penalty vs no schema (31.8% vs 54.2% attribute-rich, DR ≤60). Pages deployed without mandatory fields (eventStatus, eventAttendanceMode, offers/isAccessibleForFree, inLanguage).
**Resolution:** `src/utils/schema-validator.ts` validates 15 mandatory + 5 recommended fields during generation. Wired into `generateEventPages()` with summary logging. Added `inLanguage: 'el'` to event schema. 11 tests.
**Status:** Fixed (Session 26)

### OG Images Are Generic Defaults
**Severity:** 🟡 (was)
**First seen:** GEO audit
**Symptoms:** All event and hub pages used generic/default OG images for social sharing. No branded social cards, no event-specific context in shared links.
**Resolution:** Build-time OG image generation using Satori + resvg. 137 per-event images (imageless events only) + 11 per-hub images. Dark background, type-color stripe, Greek text rendered via Manrope font. Content-hash caching keeps subsequent builds at 5.5s.
**Status:** Fixed (Design System D11)

### No Skip Navigation or ARIA Landmarks
**Severity:** 🟡 (was)
**First seen:** Design system audit
**Symptoms:** Pages lacked skip-nav link, `role="banner"`/`role="contentinfo"` ARIA landmarks, and `tabindex="-1"` on `#main-content`. Screen reader users couldn't skip to content.
**Resolution:** Skip-nav link added as first focusable element. ARIA landmarks on nav/footer. `tabindex="-1"` on `#main-content` across all 4 page types. 10 new accessibility tests.
**Status:** Fixed (Design System D2)

### "Δωρεάν" Used Instead of "Ελεύθερη είσοδος"
**Severity:** 🟡 (was)
**First seen:** Design system audit (Tier 1 rule violation)
**Symptoms:** "Δωρεάν" (forbidden term) appeared in card rendering, filter labels, filter source files, and detail page `formatPriceGreek()`. Tier 1 rule requires "Ελεύθερη είσοδος" everywhere.
**Resolution:** Fixed across 4+ code paths in sessions D3, D4, D5. `grep -ci 'δωρεάν' dist/index.html → 0` confirmed.
**Status:** Fixed (Design System D3/D4/D5)

### GEO Source Order Not Enforced on Detail Pages
**Severity:** 🟡 (was)
**First seen:** Design system audit
**Symptoms:** Event detail page sections were not in optimal order for AI citability. Key facts, descriptions, venue info, and related events not following the prescribed GEO source order.
**Resolution:** Content sections reordered to: key facts → enriched description → CTA → venue information → related events. All data remains in static HTML (SSR verified).
**Status:** Fixed (Design System D5)

### Search Overlay Missing ARIA Combobox Pattern
**Severity:** 🟢 (was)
**First seen:** Design system audit
**Symptoms:** Search overlay lacked proper ARIA combobox/listbox roles. Input missing `role="combobox"`, `aria-expanded`, `aria-activedescendant`. Results missing `role="listbox"`, `role="option"`, `aria-selected`.
**Resolution:** Full ARIA combobox/listbox pattern implemented with JS managing all state transitions. 7 new tests.
**Status:** Fixed (Design System D6)

### Venue Geo Coverage at 57%
**Severity:** 🟢 (was 🟡)
**First seen:** Session 26 (schema completeness audit)
**Symptoms:** Venues missing coordinates in Schema.org. Nominatim/OSM returned 0/65 for niche Greek cultural venues (Session 55).
**Resolution:** Google Geocoding API fallback added as 4th attempt in geocodeVenue(). Session 82: 72 new venues (206 → 278), geo coverage 10.5% → 98.4%. Session 83: 10 more venues (278 → 288), geo coverage → 99.9% (8 irreducible events). Schema completeness: 13% → 100%.
**Status:** Fixed (Sessions 82-83)

### Subagent Manifest Contamination
**Severity:** 🟡 (was)
**First seen:** Session 23 (batches 118-120)
**Symptoms:** Parallel subagents processed the wrong batch manifest — 2 of 3 agents picked up a different batch's brief. Resulted in 4 missing events requiring a re-run.
**Resolution:** Batch-scoped temp directories — each batch writes to `temp-descriptions/batch-N/` subdirectory. Filesystem-level isolation, zero coordination needed. Manifest includes output_dir field. Brief generator adds verification checklist + per-event gate-check commands per batch. Defense-in-depth added in Session 33: CLI warnings in write-description.ts and write-tags.ts when `--batch-dir` omitted with active manifests.
**Status:** Fixed (Session 30, hardened Session 33)

### Gate Checker Sandbox DB Access
**Severity:** 🟡 (was)
**First seen:** Session 23 (observed as root cause)
**Symptoms:** Gate scores artificially depressed to 78-84 in subagent sandbox (should be 85+). Gate checker couldn't access full DB (SQLITE_CANTOPEN). Root cause of "pre-save 84 to post-save 89-90" false positive pattern tracked since Session 7.
**Resolution:** 6 CLI metadata flags (`--event-type`, `--event-venue`, `--event-title`, `--event-date`, `--event-price`, `--event-genre`) added to `scripts/auto-gate-check.ts`. Priority chain: CLI flags → DB → filename fallback. Gate checker works in any environment without DB access.
**Status:** Fixed (Session 30)

### Desktop Filter Bar Hidden on Desktop
**Severity:** 🟡 (was)
**First seen:** Session 23 (user screenshot)
**Symptoms:** Filter bar visible on mobile but hidden on desktop. Users couldn't navigate by type/time/price from homepage.
**Resolution:** Fixed in Session 24 as part of hub page implementation. Filter bars now work on all pages including hub pages.
**Status:** Fixed (Session 24)

### Empty Meta Descriptions on Most Pages
**Severity:** 🟡 (was)
**First seen:** GEO audit (Sprint 1 finding)
**Symptoms:** Most pages had empty meta descriptions. +47% citation impact documented when fixed.
**Resolution:** Programmatic meta description templates implemented. Present on all hub pages. Event and venue page templates updated.
**Status:** Fixed (Session 24)

### No FAQPage Schema on Hub Pages
**Severity:** 🟡 (was)
**First seen:** GEO audit (Sprint 3 finding)
**Symptoms:** Missing FAQPage schema. 3.2x AI Overview appearance rate with FAQ schema.
**Resolution:** 3 hub pages created (/today, /this-weekend, /concerts) with FAQPage JSON-LD schema validated. Config-driven via hub-pages.json. 5-part structure (answer capsule, comparison table, event blocks, FAQ accordion, seasonal narrative).
**Status:** Fixed (Session 24, extended Session 25 + Session 26) — 8/9 Tier 1 + 7 Tier 2 = 15 hubs generating, 1 auto-skipped (/exhibitions)

### Exhibition End-Date Bug in 4 Pipeline Scripts
**Severity:** 🔴 (was)
**First seen:** Session 21 (pipeline audit)
**Symptoms:** 4 daily pipeline scripts used bare `start_date >= date('now')` instead of exhibition-safe COALESCE. Running exhibitions (start_date in past, end_date in future) were silently dropped by filter-athens-only.ts, remove-duplicates.ts, enrich-time.ts, and merge-duplicates.ts on every daily run.
**Resolution:** All 4 scripts fixed with `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)`. remove-duplicates.ts uses UPCOMING_FILTER constant for 20+ queries. Validated: 1 running exhibition (Συλλογή ΜΙΕΤ) was invisible, now correctly included (+1 event in filter output).
**Status:** Fixed (Session 21)

### Flat Word Count Gates (400-600 for All Events)
**Severity:** 🟡 (was)
**First seen:** Session 22 (v2.3 review)
**Symptoms:** Quality gates enforced a flat 400-600 word range for all enrichment tiers. Local DJ sets (target: 80-120 words) and contemporary theater (target: 120-180 words) received premium-length descriptions 2-4x over their matrix target. 29 descriptions produced at premium length regardless of event significance.
**Resolution:** Variable Enrichment Matrix implemented in code (`src/enrichment/enrichment-matrix.ts`). 10 categories with per-tier word ranges. Brief generator includes tier classification + HARD CONSTRAINT per event. Quality gates enforce per-tier ranges with 10% grace margin. Validated: 93.3% compliance (14/15) on first production batch.
**Status:** Fixed (Session 22, validated Session 23)

### Single Sitemap with Inaccurate Freshness
**Severity:** 🟢 (was)
**First seen:** GEO audit (Sprint 2 finding)
**Symptoms:** Single sitemap.xml updated all lastmod dates on every build, even when editorial content hadn't changed. Bing says accurate lastmod is the most important optional sitemap signal; 84% of sitemaps set it incorrectly. Google Dec 2025 update penalizes fake freshness.
**Resolution:** Split sitemaps via `src/sitemap/generate-sitemaps.ts`: sitemap-index.xml → sitemap-events.xml (daily) + sitemap-venues.xml (content-hash) + sitemap-editorial.xml (content-hash). Content-hash architecture with SHA-256 hashing. Manifest persists in `data/content-hashes.json`. Validated: second build shows 0 timestamp changes when nothing editorial changed.
**Status:** Fixed (Session 24 — GEO Sprint 2)

### Missing Schema.org Fields on Events
**Severity:** 🟢 (was)
**First seen:** GEO audit (Sprint 3 finding)
**Symptoms:** Missing `offers` (with `priceCurrency: "EUR"`), `isAccessibleForFree`, `eventAttendanceMode`, `eventStatus` in Schema.org output.
**Resolution:** All fields added in Session 22. Conditional `eventStatus` added in Session 27 — `resolveEventStatus()` returns EventCompleted for past events, respecting exhibition endDate per Tier 1 rule.
**Status:** Fixed (Session 22 + Session 27)

### No containedInPlace Entity Chain
**Severity:** 🟡 (was)
**First seen:** GEO audit (Sprint 3 finding)
**Symptoms:** Missing entity linking from Event → Venue → Neighborhood → Athens → Attica → Greece. AI engines use entity chains to understand geographic context and link to knowledge graphs.
**Resolution:** `src/utils/schema-geo.ts` with buildContainedInPlace() generates nested chain: Neighborhood (Wikidata QID) → Municipality of Athens (Q1524) → Attica (Q178517) → Greece (Q41). Config-driven via `config/neighborhood-geodata.json` (13 neighborhoods) + `config/city-geodata.json` (multi-city ready). Applied to all 709 events, 63 venues, and list-item schema. Handles null neighborhoods gracefully (skips to municipality level).
**Status:** Fixed (Session 27)

### No E-E-A-T Authority Pages
**Severity:** 🟡 (was)
**First seen:** GEO audit (Sprint 3 finding)
**Symptoms:** No About page, editorial methodology page, or corrections policy. Missing Organization schema on root. AI engines use these as trust signals for citation decisions.
**Resolution:** /about (AboutPage schema), /editorial (WebPage schema), /corrections (WebPage schema) created with 300-400 words Greek content each. Organization schema on homepage as second JSON-LD block. Source attribution footer on all event pages via `config/source-attribution.json` (16 sources mapped to Greek display names). Footer links + llms.txt updated.
**Status:** Fixed (Session 28)

### Exhibition End-Date Missing from Hub Time Filters
**Severity:** 🟡 (was)
**First seen:** Session 31 (hub page review)
**Symptoms:** `matchesTimeRange()` in `src/utils/filters.ts` did not include running exhibitions in today, this-weekend, this-week, or this-month filters. Running exhibitions (start_date in past, end_date in future) were excluded from all time-based hub pages.
**Resolution:** Fixed `matchesTimeRange()` to check exhibition end_date across all 4 time ranges. Pattern: if `type === 'exhibition' && endDate`, compare date ranges rather than exact start_date matches. Non-exhibition events unaffected. 7 new tests added.
**Status:** Fixed (Session 31)

### 45-Day Event Lifecycle Not Implemented
**Severity:** 🟡 (was)
**First seen:** Sprint 3 scoping (Session 26)
**Symptoms:** Past events generated identical pages to upcoming events — no banner, no noindex, no listing exclusion, no sitemap priority differentiation. 135 past-active events displaying as if current.
**Resolution:** `src/utils/event-lifecycle.ts` classifies events as upcoming/past-active/past-expired. Past-active pages get "Αυτή η εκδήλωση έχει ολοκληρωθεί" banner, hidden ticket CTA, noindex meta tag, sitemap priority 0.3 (vs 0.7 upcoming). upcomingEvents/pageableEvents split keeps past events out of all listings. DB cleanup removed — events persist for dedup history.
**Status:** Fixed (Session 32)

### Cornerstone Pages Lack Behavioral Differentiation
**Severity:** 🟡 (was)
**First seen:** D9 (cornerstone flag added, no rendering changes)
**Symptoms:** 4 hubs flagged `cornerstone: true` in hub-pages.json (today, this-weekend, open, this-month) but flag had zero effect on output. Cornerstone hubs rendered identically to standard hubs — same FAQ count, same meta description logic, no internal linking advantage.
**Resolution:** Session 60: 5 behavioral differences implemented — (1) event pages link to contextually relevant cornerstone hubs, (2) non-cornerstone hubs cross-link to cornerstone hubs, (3) 8 FAQs per cornerstone (vs 4 standard), (4) entity-dense meta description overrides, (5) seasonal narratives in both languages. 1,410 tests pass.
**Status:** Fixed (Session 60)

### athinorama.gr Scraper Image Extraction Concentration
**Severity:** 🟡 (open)
**First seen:** Session 123 (2026-05-08, imageless events diagnostic)
**Frequency:** 92% of athinorama.gr events imageless (127 of 138); accounts for 88.2% of all 144 imageless events on the visible site.
**Symptoms:** Disproportionate imageless concentration in a single source — pattern matches the >60% extraction-bug rule. Five representative URLs sampled in `specs/imageless-events-diagnostic.md` lines 90–94 await manual classification.
**Workaround:** D11 Satori OG covers Schema.org/`og:image`/`twitter:image`/hero (100% coverage); Tier 1 gradient+typography covers the card grid (Session 126). User-visible impact already mitigated.
**Fix plan:** Christos to manually check the 5 sampled athinorama.gr URLs to classify as scraper-bug vs source-gap. If scraper-bug: one Pipeline session removes ~88% of imageless count (force multiplier). If source-gap: image-coverage problem is genuine and the S126 audit's reframing ("schema validity → image coverage") stands.
**Status:** Open — awaiting Christos manual classification.

### 90-Day Citation-Gap Measurement for Satori-OG Decision
**Severity:** 🟢 (open, scheduled)
**First seen:** Session 123 / `decisions.md` entry "Satori-generated typographic OG = permanent strategy for Schema.org image" (2026-05-08).
**Frequency:** One-time deferred measurement.
**Symptoms:** The Satori-OG decision committed to revisit only if "Bing Webmaster Tools AI Performance shows >15pp citation gap between imageless and image-rich events after 90 days post-launch." No automated forcing function exists; risks silent expiration without a calendar trigger.
**Workaround:** None — the measurement is the action.
**Fix plan:** Trigger date ~2026-08-06 (90 days post Tier-1 ship 2026-05-08). Owner: GEO Strategist. Run Bing Webmaster Tools AI Performance citation comparison between imageless and image-rich events; compare against the >15pp threshold; if exceeded, revisit the Satori-OG-as-permanent decision.
**Status:** Open — scheduled for 2026-08-06.

### Sample-Sufficiency Acknowledgment for Tier-1 Imageless Promotion
**Severity:** 🟢 (open, documentation hygiene)
**First seen:** Session 126 (Tier-1 Image Fallback) cross-referenced with S126 audit (2026-05-08).
**Frequency:** One-time.
**Symptoms:** Tier-1 fallback was promoted from v1.1 to v1 on n=9 future-exhibition sample (88.9% imageless rate). The `decisions.md` entry cites trigger metrics (36.3% imageless, 88.2% athinorama concentration) but doesn't formally acknowledge the sample size or address sample-sufficiency for the exhibition-specific 88.9% rate.
**Workaround:** None — Tier-1 has shipped and is not blocked by this gap.
**Fix plan:** GEO Strategist appends a brief paragraph to `decisions.md` acknowledging the sample basis for the Tier-1 promotion (n=9 exhibitions, directional-signal vs. statistically-sufficient framing).
**Status:** Open — low-stakes documentation hygiene.

### iOS Mobile Horizontal Scroll / Touch Jitter on Hero Picks Carousel
**Severity:** 🟢 Resolved
**First seen:** Christos report 2026-05-13 (iPhone Chrome + Brave).
**Symptoms:** Horizontal sweep on homepage produced document-level drift; carousel rubber-band leaked into body scroll on iOS WebKit. Diagonal swipes registered as "jitter" / "resistance" — WebKit gesture-axis-arbitration ambiguity surfacing because the container didn't declare its intended scroll axis.
**Root cause:** `.hero-picks` (mobile carousel, `src/styles/design-system.css:2081`) had `overflow-x: auto` + `-webkit-overflow-scrolling: touch` with no `overscroll-behavior-x` and no `touch-action`. Compounding: no document-level horizontal-overflow guard on `html`/`body`, so the rubber-band had a parent scroll container to leak into.
**Resolution:**
- **QW-A (2026-05-14):** `overscroll-behavior-x: contain` + `touch-action: pan-x` added to the `.hero-picks` mobile rule. Contains the rubber-band and disambiguates the gesture axis.
- **QW-B (2026-05-14):** `html, body { overflow-x: clip }` added as document-level backstop. `clip` over `hidden` because `clip` preserves `position: sticky` in descendants (see [decisions.md](../.claude/notes/decisions.md) 2026-05-14 entry and [patterns.md](../.claude/notes/patterns.md) "overflow-x: clip vs hidden — choose clip when sticky descendants exist").
- **Tests:** `tests/build/mobile-scroll-overflow.test.ts` (3 assertions, QW-A); `tests/build/document-overflow-guard.test.ts` (2 assertions, QW-B).
- **Verified on device:** 2026-05-15, iPhone Chrome + Brave + Safari at 375 / 414 / 430px portrait. Sticky chain intact across `.site-header`, `.filter-bar`, `.date-group-header`, `.hub-comparison-table th`.
**Sticky-descendants inventory (load-bearing on the `clip`-not-`hidden` choice):**
- `.site-header` (`src/styles/design-system.css:584`) — `top: 0`; sitewide
- `.filter-bar` (`:1363`) — `top: 56px`; hub pages
- `.date-group-header` (`:528`) — `top: 64px`; hub pages with date-grouped lists
- `.hub-comparison-table th` (`:2561`) — `top: 0`; hub comparison tables
**Other horizontal-scrolling regions in the codebase:**
- `.filter-bar-scroll` (`src/styles/design-system.css:1382`) — ✅ patched 2026-05-20 (Session 1.5). Added `overscroll-behavior-x: contain` + `touch-action: pan-x` at `:1389-1390`. Same fix shape extended to `.category-nav` — at 1.5 close it was still an inline rule in `src/templates/category-page.ts:103`; Session 2b (2026-05-20) extracted it to `src/styles/design-system.css` alongside `.filter-pill`, carrying the 1.5 guards across. Tests: `tests/build/scroll-container-overscroll.test.ts` (6 assertions, both rules now read from the same single CSS surface after the 2b migration — was two-surface at 1.5 close, deliberately migrated when the category-nav rule moved from inline-HTML to CSS file).
- `.table-scroll-wrapper` (`src/styles/design-system.css:2547`) — not yet patched, no current symptom; document-level QW-B (`html, body { overflow-x: clip }`) currently backstops it. Queued for a future preventive maintenance batch.
**Status:** Fixed (QW-A: commit on 2026-05-14 deploy; QW-B: commit on 2026-05-14 deploy).

### Hub Page Capsule + Category-Page Nav Body-Level Mis-Placement (Wrong-Anchor Regex)
**Severity:** 🟢 Resolved
**First seen:** 2026-05-13 (Christos device observation of filter-bar below fold); diagnosed in `specs/capsule-drift-audit-2026-05-18.md`.
**Frequency:** Every rendered hub page (5762 events worth of dist/*.html hub outputs) for the capsule + category-nav mis-placement; every non-colliding category-page slug (`/clubs`, `/rebetiko`, `/jazz`, `/performances`, `/screenings`, `/workshops`, `/tech`) for the category-page nav mis-placement.
**Symptoms:** `<section class="hub-answer-capsule">` and `<nav class="category-nav">` rendered at body level (between `<header class="site-header">` and `<div class="page-container">`), ABOVE the page-header H1 and OUTSIDE `<main id="main-content">`. Inflated the chrome above the filter-bar by ~316px on iPhone SE, inverted the intended visual order (capsule appeared above the H1 it was meant to expand upon), and broke landmark hygiene (capsule outside `<main>`). Filter-bar effectively below fold on iPhone SE — required ~1.4–1.7 viewport heights of scrolling to reach.
**Root cause:** Wrong-anchor regex at three sites: `src/generators/hub-page.ts:400-402` (two branches, capsule + nav for hubs) and `src/templates/category-page.ts:82` (nav-only for category pages). All used `html.replace('</header>', \`</header>\n${content}\`)` against rendered HTML that contains TWO `<header>` elements (site-header at body level via `renderSiteNav()` + page-header inside `.page-container` via `renderPage`). `String.prototype.replace` matched the FIRST occurrence (site-header's closing tag) instead of the intended page-header's. Textbook Pattern R violation — anchor on a tag name that appears multiple times in the document. See `.claude/notes/patterns.md` Pattern R for the rule class.
**Resolution:**
- **Session 1 Path D (2026-05-19, deploy `6a0caa34616b99ae4445573c`):** Added `preFilterBarHtml?: string` 7th-parameter slot to `renderPage` (`src/templates/page.ts:68`), emitted between page-header `</header>` and `${filterBarHTML}` at `page.ts:172`. Refactored `src/generators/hub-page.ts` to compose `preFilterBarContent = (categoryNav || '') + capsuleHtml` above the `renderPage` call and pass via the new slot; deleted the buggy `html.replace('</header>', …)` block. Refactored `src/templates/category-page.ts` similarly — moved `renderCategoryNav` above the `renderPage` call, passed via 7th arg, deleted the buggy `replace` at line 82. Eliminates the post-render string-replace pattern entirely at both sites.
- **Regression tests:** `src/generators/__tests__/hub-capsule-placement.test.ts` (6 assertions, hub variants) + `src/templates/__tests__/category-page-placement.test.ts` (3 assertions, category-page). Both anchor on distinguishing class names (`class="hub-answer-capsule"`, `class="page-header"`, `id="main-content"`) per Pattern R discipline. Pre-fix run: 5 of 9 differentiating assertions FAIL (capsule at byte 16409, page-header at 20213 — confirming body-level mis-placement). Post-fix run: 9/9 pass.
- **Production verification (post-deploy curl + position-check):** `/concerts/`, `/today/`, `/rebetiko/` — all four ordering booleans True (capsule/nav inside `.page-container`, after page-header, before filter-bar, before `<main>`).
- **Trade-off documented (visual order over landmark hygiene):** capsule + category-nav land OUTSIDE `<main>` to preserve the visual order page-header → capsule → filter-bar → event listings. Landmark hygiene (capsule inside `<main>` for screen readers / GEO) was NOT achievable simultaneously without restructuring filter-bar position — the filter-bar is itself outside `<main>` (between `</header>` and `<main>`), so placing capsule inside `<main>` would have moved capsule below filter-bar visually, which contradicts the "filter-bar perception problem" motivation. Christos explicitly chose this trade-off at plan-phase via AskUserQuestion; Design Navigator may revisit on their own `decisions.md` 2026-05-18 entry amendment (NOT touched by this session — DN owns it).
- **Same-class follow-up enumerated:** `src/generators/hub-page.ts:664` (overflow back nav, same `html.replace('</header>', …)` shape) — same fix shape applies, not bundled this session per scope discipline.
**Status:** Fixed (Session 1 Path D, 2026-05-19, deploy `6a0caa34616b99ae4445573c`). Pattern R instance count now 3 (QW-A test regex 2026-05-14 + this session's two production fixes); see `patterns.md` Pattern R for refined mitigation guidance.

### Category-Nav Label Overflow / Overlap on Mobile
**Severity:** 🟢 Resolved
**First seen:** Christos screenshot, `/concerts`, 2026-05-20.
**Frequency:** Every hub + category page on narrow viewports (the category-nav renders sitewide at the top of every event-type hub and category page). Greek labels with multi-word strings (`Παραδοσιακή`, `Ρεμπέτικα`) wrapped/spilled first; shorter labels compressed without overflowing.
**Symptoms:** Category-nav pill labels overflowed their pills and overlapped neighbors on narrow viewports. Visually unreadable on iPhone Safari/Chrome/Brave at 375px portrait.
**Root cause:** `.category-nav-item` (then inline in `src/templates/category-page.ts:105`) lacked `flex: 0 0 auto` — pills compressed under flex on narrow viewports — and lacked `white-space: nowrap` on the pill itself (the parent `.category-nav-container` had it, but defense-in-depth on the pill matches the unified pill family). Note: original Design Navigator diagnosis framed this as a "circles → capsules" rewrite, but production source showed pills were already 20px-radius capsules (`padding: 8px 16px; border-radius: 20px`). The real bug was two missing properties — NOT a pill-shape problem. Diagnosis from rendered output without source grounding; corrected at Dev Planner re-ruling.
**Resolution:**
- **Session 2b (2026-05-20, deploy `6a0d7cae68ed65a53443b00b`):** Added `flex: 0 0 auto` + `white-space: nowrap` to `.category-nav-item`. Simultaneously extracted the inline `<style>` block (5 rules: `.category-nav`, `.category-nav-container`, `.category-nav-item`, `:hover`, `.active`) from `src/templates/category-page.ts:102-108` into `src/styles/design-system.css` immediately after the `.filter-pill` family. Session 1.5's `overscroll-behavior-x: contain` + `touch-action: pan-x` guards on `.category-nav` were carried through the extraction.
- **Bundle de-scoping at Dev Planner re-ruling:** Design Navigator's v1 spec bundled the bug fix with a visual restyle (transparent bg + 1px border + `aria-current="page"` migration). After diagnosis was corrected, the restyle was withdrawn (failed Receding Interface Test — category-nav and filter bar are different controls, should read distinct) and the `aria-current` markup migration was decoupled to Session 2a (accessibility win, stands alone, doesn't gate the overflow fix). Shipped only the two-property fix + CSS extraction.
- **Tests:** `tests/build/category-nav-readability.test.ts` (new, 8 assertions). `tests/build/scroll-container-overscroll.test.ts` (migrated Test 2 from inline-HTML to design-system.css now that the rule lives in CSS — single-surface across both tests).
- **Verified on device:** 2026-05-20 (post-deploy curl confirms `flex: 0 0 auto` + `white-space: nowrap` + `border-radius: 20px` on `.category-nav-item` in production CSS; overscroll guards intact on `.category-nav`; zero inline `.category-nav-item` rules in built HTML).
**Cleanup candidate flagged (deferred):** `.filter-pill` uses `var(--radius-full)` (= `999px`, line 120 of design-system.css); `.category-nav-item` uses hardcoded `20px`. Both render visually identical at current pill height (CSS clamps `border-radius` to half the shorter side, so any value ≥ ~17px gives a fully-rounded capsule on a ~33px-tall pill). The token-vs-hardcode inconsistency is real and should be resolved in a future design-system-consistency pass — NOT bundled with this overflow fix.
**Status:** Fixed (Session 2b, 2026-05-20, deploy `6a0d7cae68ed65a53443b00b`). See `patterns.md` Pattern T (instance 4) for the diagnosis-from-rendered-output rule class.

---

## Patterns to Watch

- **Venue-lock may be fading:** Dropped from 33% (session 7) to 0% across sessions 11-18 (75 descriptions). Type consolidation + categorizer config cleanup likely addressed the root cause. Close to resolved — one more monitoring cycle.
- **Subagents are a second type-checking layer:** Confirmed across sessions 13, 14, 18. Subagents independently caught Αλιγάτορες (dj_set→theater), Fintech Talks (dj_set→tech), DEVISER (dj_set→metal concert). This is a valuable safety net — 3 corrections in 75 descriptions.
- **Parallel 3-batch sessions are the new standard:** ~8 min wall-clock for 15 descriptions (3x serial speedup). No quality degradation across 5+ consecutive runs. Review discipline: save sequentially with spot-check between each batch. Batch-scoped directories (temp-descriptions/batch-N/) provide filesystem-level isolation (Session 30).
- **Short keywords in categorizer:** When adding new categorization keywords, check if the keyword is a substring of any common Greek name or music genre. Keywords under 5 characters should default to whole_word_only regex.
- **Venue names as substrings:** Short venue names (IT, An, EXA) can match inside longer venue names via contains(). The mixed_venues-first ordering fix helps, but new short-named venues should be tested.
- **Enrichment quality is consistent at 88-90:** Don't expect gates to differentiate quality tiers. The editorial difference between "good" and "excellent" is in tribe sections, opening specificity, and closer precision — all human-review dimensions. Confirmed across 120+ descriptions.
- **Scraper type data varies by source:** Some scrapers provide explicit types, others don't. The categorizer compensates but can't fix fundamentally ambiguous titles.
- **Soft auto-save works but spot-checks are non-negotiable:** The fabrication blind spot (batch 0) means human review of openings should continue even at scale. Target: 2-3 minutes per batch, not zero.
- **Two independent categorizers exist:** src/validators/event-categorizer.ts (inline rules) and src/categorizer/categorize-event.ts (JSON config). Type changes must update both. Shotgun surgery checklist: types.ts → config JSONs → both categorizers → tests → CLAUDE.md.
- **Manifest-driven saves prevent pile-up:** Always use --manifest flag. Never revert to scan-all mode. --clean only after successful save + spot-check.
- **recent-openings.json is shared state:** Survives --clean, rolling window of 30. Brief generator reads it for cross-session dedup. Has cosmetic duplicate issue from re-saves.
- **Queue sync prunes expired events:** Enriched count can decrease between sessions as past events expire and get removed. Net enrichment rate accounts for event lifecycle. This is healthy self-cleaning, not data loss.
- **Localization pattern:** English in DB/URLs for internal use and routing. Greek translation maps at display layer (neighborhoods, type labels, plurals). Shared utility functions prevent duplication across rendering points.
- **Greek grammar requires pre-composed forms:** Gendered articles (Όλες οι / Όλα τα) + noun declensions make computed Greek grammar impractical. Use lookup maps with article+plural pairs.
- **Infrastructure beats content for GEO:** A single template fix across 2000+ pages (e.g., meta descriptions) has more citation impact than enriching 50 events. Sprints 1-3 now complete — focus shifts to enrichment scaling and Sprint 4 bilingual.
- **Schema.org completeness is a citability signal:** AI engines weight structured data completeness. Config-driven subtype mapping applies to ALL events automatically. containedInPlace chains + Organization schema + conditional eventStatus now all in place (Sessions 22, 27, 28).
- **SSR is non-negotiable for AI citability:** GPTBot, ClaudeBot, PerplexityBot do NOT execute JavaScript. All content must be in HTML source. Verify after any template changes.
- **Content-hash prevents freshness penalties:** Google Dec 2025 update penalizes sites that fake freshness by updating timestamps without editorial changes. Split sitemaps + SHA-256 hashing of editorial content is the correct approach.
- **Multi-city readiness constrains all GEO work:** Every config, every template, every schema mapping must work for agent-barcelona and agent-berlin. No Athens-specific hardcoding. City name from config, not string literals. containedInPlace config is already city-agnostic (neighborhood-geodata.json + city-geodata.json).
- **Transit/logistics claims are the highest-error category:** 60% of factual errors are in Good to Know sections (metro lines, addresses, nearest stations). These are the most actionable claims for readers. Anti-patterns 11-13 address new descriptions; rule #19 (no metro line colors) prevents the most common fabrication class. Knowledge base fixes in config/enrichment-knowledge.md prevent propagation to future descriptions. Retroactive audit complete (Session 39).
- **Metro line colors are the #1 fabrication target:** Session 39 removed 82 wrong line color references. Colors change, get confused between cities, and are easily fabricated. Station names are more stable and verifiable. Rule #19: never include line colors in descriptions.
- **Fact-check as post-save step:** ~12 min overhead for 15 descriptions. Validated across multiple batches. Transit audit (Session 39) confirmed the approach works at scale — 9 station errors + 82 line color errors found and fixed retroactively. Now standard for new descriptions + retroactive audit complete.
- **Variable Enrichment Matrix enforced in code:** 10 categories with per-tier word ranges. classifyEvent() uses venue + price for automatic tier classification. 93.3% compliance on first run. Warnings-first approach allows calibration before promoting to hard errors.
- **Manifest contamination has defense-in-depth:** Filesystem isolation (batch-N/ dirs, S30) + CLI warnings when --batch-dir omitted (S33) + verification checklist in briefs (S33). Three independent layers prevent wrong-batch processing.
- **Gate checker CLI flags eliminate sandbox DB dependency:** --event-type, --event-venue, etc. pass metadata directly. Priority chain: CLI flags → DB → filename fallback. No more SQLITE_CANTOPEN false positives (Session 30).
- **Pipeline-as-assertion pattern:** Every daily pipeline phase should be a full-pass correctness assertion, not incremental. Idempotent phases that re-validate all data catch config changes, manual errors, and scraper regressions automatically.
- **UPCOMING_FILTER constant pattern:** Any script with multiple date queries should share a constant for exhibition-safe date filtering. Prevents shotgun surgery when date logic changes.
- **Gap-fill is the default design session pattern:** The existing codebase was ~80-85% complete before design system work. Every session (D1-D11 except D11) was gap-fill, not greenfield. Start by auditing what exists before writing anything.
- **"Δωρεάν" hides in multiple code paths:** The forbidden price term existed in at least 4 separate locations (card rendering, filter labels, detail page `formatPriceGreek()`, filter source files). Grep the entire dist/ output to confirm elimination — source-level fixes miss runtime generation paths.
- **Accent discipline prevents color fatigue:** Strictly limiting `--accent-primary` to exactly 5 contexts (CTA bg, active filter, card date, card hover title, section label border) and `--accent-secondary` to 1 context (badge bg) maintains visual hierarchy. D9 correctly removed accent-primary from table links.
- **`data-past="true"` CSS-only pattern:** Pushing conditional visual states into HTML attributes + CSS selectors (instead of JS branching) keeps static HTML generation clean and makes states trivially testable.
- **Content-hash caching for expensive build steps:** OG image generation uses `.og-cache.json` with content hashes — first build 20s, subsequent builds 5.5s. Apply this pattern to any future build step that's expensive per-item but rarely changes.
- **`tabindex="-1"` on skip-nav targets can break string matching:** D2 added `tabindex="-1"` to `<main id="main-content">`, which broke hub-page.ts's literal string match. Use regex for HTML element matching when attributes may vary.
- **Venue geo backfill follows event-count priority:** Prioritizing venues by event count maximizes coverage per research effort. Round 2: 64 venues covered 208 events (3.3 events/venue). The remaining 99 venues average 1.2 events/venue — diminishing returns. Automated geocoding (Nominatim/Google API) is the right approach for the long tail.
- **Event lifecycle at generation layer, not DB layer:** Three states: upcoming, past-active (45d window), past-expired. DB retains all events for dedup history. upcomingEvents for listings/hubs/search, pageableEvents for page generation. Split prevents past events from appearing in recommendations while preserving their pages (Session 32).
- **Hub pages are config-driven:** hub-pages.json defines filter, answer capsule, FAQs. Adding a new hub = adding config, no code changes. Auto-skip threshold (5 events) means hubs self-activate when content arrives. Date-based hubs refilter daily (content-hash detects changes). 8/10 Tier 1 hubs live + 7 Tier 2 hubs config-ready (Sessions 24-25, 33).
- **Exhibition Tier 1 in every time filter:** matchesTimeRange() must check exhibition end_date across today, this-weekend, this-week, this-month. Not just individual event queries — every date-based filter needs the pattern (Session 31).
- **noindex on past-active events:** Past events get pages with banners + noindex + hidden CTAs. Better than 404 (loses link equity) or keeping indexed (stale content penalty). Sitemap priority 0.3 vs 0.7 for upcoming (Session 32).
- **Source attribution pattern:** config/source-attribution.json maps source IDs to display names. Greek display names for venue-branded sources. Display names only, no URLs to scraped sources (legal/ethical: transparency, not linking back) (Session 28).
- **Theater is the dominant enrichment gap:** 475 events (53% of visible) but only 10.1% enriched. Concert (44.9%) and dj_set (70.1%) are well-covered. Theater enrichment priority should rise (Session 29 snapshot).
- **containedInPlace chain is multi-city ready:** config/neighborhood-geodata.json + config/city-geodata.json pattern. buildContainedInPlace() handles null neighborhoods gracefully (skips to municipality level). Same function, different configs per city (Session 27).
- **Multiple JSON-LD blocks per page:** Established pattern — homepage has Organization + page-level schema. Event pages can have Event + FAQPage. Each block independent (Session 27).
- **Schema completeness validator catches regressions at build time:** Two-layer validation — inline validator checks mandatory/recommended fields during generation, post-build HTML validator scans output pages. Catches missing inLanguage, offers, containedInPlace etc. before deployment (Session 33).
- **Tier 2 hubs are config-ready, awaiting event volume:** 7 Tier 2 hubs in hub-pages.json (/cinema, /dance, /classical-music, /this-month, /with-ticket, /comedy, /greek-music). Auto-generate when event counts exceed threshold. Zero code changes needed (Session 33).
- **Dual-language pipeline direction matters:** Existing 274 descriptions were English, not Greek as assumed. Session 42 built infrastructure in wrong direction, Session 43 corrected. Always verify actual content language before building translation infrastructure. English is primary, Greek is secondary (~85% of English word count). Session 44 validated: 15/15 bilingual on first production run, Greek gates promoted to errors.
- **SCHEMA_MISSING gate deduction is cosmetic:** The -5 pts deduction for missing schema in gate checks is misleading — schema is handled by the site template at generation time, not by description content. Consider suppressing or lowering threshold. Does not affect actual output quality (Session 44).
- **Greek quality gates are strict-ready from day one:** validateGreekDescription() scored 100/100 across all 15 first-batch descriptions. No calibration period needed — promoted directly from warnings to errors (Session 44).
- **i18n via TypeScript module, not JSON config:** `src/i18n/strings.ts` with Locale type, UIStrings interface, and STRINGS record provides type-safe, IDE-completable string lookup. Parity tests ensure el/en keys stay in sync. Avoids JSON config file pattern that loses type safety (Session 45).
- **Locale parameter threading with backward-compatible default:** All bilingual rendering functions take `locale: Locale = 'el'` — existing Greek call sites unchanged, English pages pass `'en'` explicitly. Same generator, zero code duplication (Session 45).
- **`x-default` → English is correct:** ChatGPT and Perplexity often ignore hreflang and just use x-default. English must be the default for AI citation. hreflang annotations on both Greek and English pages, plus sitemap xhtml:link (Session 45).
- **`answerCapsuleEn` as presence gate for English hubs:** Hubs auto-activate for English when `answerCapsuleEn` is added to config. Zero code changes needed to launch new English hubs — same pattern as event threshold gate (Session 46).
- **Seasonal narratives as config fields:** Quarterly-swappable without code changes. Conditional rendering — section absent when field missing, present when populated (Session 46).
- **performer.sameAs via cached JSON lookup:** `config/performer-sameAs.json` stores Wikidata/Wikipedia/MusicBrainz URIs. Runtime lookup extracts performer from event title with fuzzy matching. Cache-first pattern avoids API calls at build time — new performers added via `scripts/lookup-performer-sameAs.ts` (Session 47).
- **IndexNow must read all sitemaps, not just sitemap.xml:** Original script assumed single sitemap. Split sitemap architecture (events, editorial, media) requires reading all 3. Also must recognize `/en/` prefixed paths in URL filter (Session 47).
- **sessionStorage > JS variables for recent searches on static sites:** Spec assumed SPA behavior where a JS variable would persist. On a multi-page static site, sessionStorage is the correct adaptation — survives page navigation within a session but clears on tab close (Session 48).
- **Null caching prevents redundant API calls:** performer-sameAs.json stores `null` for performers with no Wikidata match. Without this, 336 SPARQL queries would repeat on every run (~12 min wasted). Same pattern applies to any external lookup cache (Session 49).
- **Short/common English words are false positive magnets in Wikidata:** Names like "Ad Hoc", "Avi", "Coma", "Love" match unrelated entities. Always audit Wikidata matches for performers with short or common English names (Session 49).
- **extractArtist() and findPerformer() must stay in sync:** The lookup script's title parser and the consumer's matching logic diverge on edge cases (location suffixes, @venue patterns, festival lineups). When one changes, the other must be updated (Session 49).
- **Null caching prevents redundant SPARQL queries:** performer-sameAs.json stores explicit null for not-found performers. 336 null entries = ~12 min saved on every future run. `findPerformer()` returns null for these, lowercase index skips them (Session 49).
- **Short/common English names are false positive magnets in Wikidata:** "Ad Hoc", "Avi", "Coma", "Love" all matched wrong entities. Audit step after batch lookup is mandatory. Pattern: if performer name is a common English word ≤4 chars, flag for manual review (Session 49).
- **extractArtist() must stay synced with findPerformer():** Title parsing logic (location suffixes, @venue patterns, festival lineups) exists in both the lookup script and the consumer. Divergence causes cache misses. Keep extraction logic in a shared function or test both paths together (Session 49).
- **Venue records and event records may use different formatting paths:** search-index.ts had displayNeighborhood() on event records but not venue records — same data, different code paths. When adding localization to any field, audit all record types that surface that field (Session 50).
- **Compound neighborhoods need split-and-translate:** "Gazi / Keramikos" requires splitting on " / ", translating each part, then rejoining. Simple map lookup misses these (Session 50).
- **endDate = startDate for single-day events:** Non-exhibition events without endDate should set `endDate = startDate` per Schema.org convention. ~1,100 events were missing endDate — this convention eliminated all of them. Exhibition events use their actual multi-day end_date (Session 51).
- **Description fallback chain: enriched → short description → title:** Reduced empty schema descriptions from 232 → 2. The 2 remaining are events with no scraper description, no enrichment, AND very short titles (Session 51).
- **Schema completeness audits must include English pages:** Original validator only scanned Greek pages. 309 English pages were invisible to the audit. Always scan `dist/en/` alongside `dist/` (Session 51).
- **Auto-enrich timeout from uncapped research depth:** ~100+ tool calls and ~110-140K tokens per event = 41 min for 5 events. Unattended runs need either a research depth cap or reduced batch size (3 events max). Deep web research is valuable for quality but incompatible with time-boxed automation (Session 52).
- **Scraper venue inference from page context is unreliable:** Duo Duende listed at Ωδείο Αθηνών in DB but actually at Odeio Filippos Nakas. Scrapers infer venue from page context rather than structured data — systematic issue at venues with affiliated/subsidiary spaces (Session 52).
- **Pages with multiple JSON-LD blocks need extractAllJsonLd():** Hub pages have both CollectionPage and FAQPage blocks. Single-block extraction misses the second schema. extractAllJsonLd() parses all `<script type="application/ld+json">` blocks from a page (Session 54).
- **Cross-filter system pages are not hub generator pages:** exhibitions, cinema, dance, comedy are system-generated filter pages, not editorial hubs. They correctly lack FAQPage schema. Validator flags them as warnings, not errors — expected behavior (Session 54).
- **Nominatim/OSM has zero coverage for niche Greek cultural venues — Google Geocoding does:** 0/65 via Nominatim (Session 55), 72/~80 via Google Geocoding free tier (Session 82). Google as 4th fallback attempt in geocodeVenue() after 3 Nominatim queries. ROOFTOP confidence, Athens bounds check (Session 82).
- **Schema completeness jumped 13% → 95% via Google Geocoding + backfill fix:** Nominatim ceiling was ~90%. Google Geocoding free tier ($200/month credit, ~80 requests) resolved 72 venues OSM missed entirely. Backfill GROUP BY bug was silently preventing coordinate propagation to events — 8,075 events fixed. Always verify end-to-end data flow, not just master file state (Sessions 55→82).
- **Token substitution must cover FAQ text, not just capsules:** Editorial Director used {{MONTH_YEAR}} in FAQ headers. resolveTokens() must apply to all text fields in hub config, not just the primary capsule. The closure pattern (captures locale) handles Greek/English automatically (Session 56).
- **Audit before scale, not after:** 22% of 322 English descriptions fail hardened gates. If scaling had proceeded first, 800+ new descriptions would carry the same issues. Always harden gates before scaling enrichment (Session 57).
- **Greek declension-safe lazy adjective matching:** Greek adjectives decline by case/gender/number. Use stem matching (e.g., "μοναδικ" catches μοναδικός/μοναδική/μοναδικό/μοναδικές). 11 stems cover the most common offenders (Session 57).
- **Speculation detection needs threshold:** Single speculative phrase = warning (could be legitimate hedging). Two or more = error (pattern of fabrication). 11 regex patterns catch "is expected to", "is likely to", "promises to be", etc. (Session 57).
- **Audit before scale prevents multiplying quality debt:** 22% of 322 English descriptions fail hardened gates (speculation, lazy adjectives, entity locking). Running the sweep before scaling to 800+ events avoided embedding these patterns in new descriptions. Always harden gates before scaling enrichment (Session 57).
- **Single generic English words are false positive magnets for entity locking:** "honor" and "celebration" had 100% false positive rate — too common in English to flag. ContextAwareViolation infrastructure added for future single-word terms that need surrounding context to determine if they're violations (Session 58).
- **Fillers and lazy adjectives are different failure modes:** Fillers ("world-class", "state-of-the-art", "don't miss") are always errors — they add zero information. Lazy adjectives ("legendary", "iconic") are tier-based: premium tier = error, standard tier = warning. Separating them reduced false failures by ~13 (Session 58).
- **48 English descriptions rewritten → 0 failures:** Cleared via surgical SQL replacements in ~15 min instead of planned subagent rewrites (~40 min). When failures are specific word/phrase replacements (not structural), SQL is faster and safer. Reserve subagent rewrites for structural changes (Sessions 57→59).
- **Python json.load/dump for non-ASCII JSON config:** sed and heredocs break Greek Unicode + curly quotes in JSON files. Use `python3 -c "import json; ..."` with `ensure_ascii=False` for any config file containing Greek text (Session 60).
- **Config-driven architecture compounds:** 3 of 4 cornerstone features (FAQs, meta overrides, seasonal narratives) were pure config changes — zero generator code. Investment in config-driven hub architecture pays off multiplicatively as features are added (Session 60).
- **View Transitions are pure CSS progressive enhancement:** `@view-transition { navigation: auto; }` + named targets + fade keyframes. Zero JS, zero template changes. Unsupported browsers are completely unaffected. `prefers-reduced-motion` disables the API entirely via `navigation: none` (Session 61).
- **Card-level view-transition-name doesn't scale:** Homepage has 469 cards — 469 unique transition names would stress the compositor. Content-level cross-fade (one transition on `#main-content`) is the practical ceiling for listing-heavy sites. Card morph is only viable on pages with <50 items (Session 61).
- **CLAUDECODE env var leaks into nested claude sessions:** If `auto-enrich.sh` runs inside a Claude Code session, the `CLAUDECODE` env var propagates to child `claude -p` calls, causing unexpected behavior. Always `unset CLAUDECODE` before spawning nested Claude sessions (Session 62).
- **curl -sf conflates 404 with network failure:** `-sf` (silent+fail) returns non-zero for both HTTP errors and connectivity issues. Use `HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}")` to distinguish 404 (expected, no new events) from actual failures (Session 62).
- **Auto-enrich batch timeout needs headroom:** Session 69c: 5 independent failure layers resolved over 3 days — perl alarm + exec broken, auto-save threshold too high, CLI path stale, launchd PATH missing, orphan cleanup too broad. Defense-in-depth stack now complete (Sessions 62→69→69c).
- **Guard 1 applies to implementation state, not just data:** Session 63 planned 2 tasks (neighborhoods, font-smoothing) that were already done. A `grep` Step 0 would have caught both. Extend "verify assumptions" to include "verify this isn't already implemented" (Session 63).
- **Date formatting consolidation prevents drift:** 4 files had independent copies of Greek month/day arrays (24 lines total). Single source of truth (`src/utils/format-date.ts`) prevents future divergence when adding months or fixing transliterations (Session 63).
- **::before pseudo-element for full-card click target:** `<article>` wraps card, `<a class="card-link">` inside heading, `::before` with `position:absolute; inset:0` creates full-card clickable area. No JS, keyboard-accessible, preserves hover states. `isolation:isolate` on card prevents z-index leakage. `:has(:focus-visible)` for focus ring with fallback (Session 64).
- **Audit documents become stale fast:** Session 65 found 60% of 15 audit findings were already fixed (S24-S63). Always verify against live codebase before planning from audit findings — never plan directly from an unreconciled audit doc (Session 65).
- **Reuse existing utilities for schema generation:** formatSchemaDate() from quality-gates.ts works for generating schema dates, not just validating them. Check existing utility functions before writing new ones (Session 65).
- **og:description must use the same fallback chain as meta description:** event.description.substring returned empty for 584 events without short description. Reusing generateEventMetaDescription() for og:description + twitter:description fixed 592 pages in one change (Session 65).
- **Homepage is entry point, not directory:** 472 → 24 events, 1.7MB → 130KB (92% reduction). Truncation is 13x more efficient than pagination (35 pages × ~100KB = 3.5MB total). Hub navigation grid replaces filter bar as primary routing mechanism (Session 66).
- **Zero-code feature removal via undefined passthrough:** Filter bar removed from homepage by passing undefined for allEvents — existing conditional handles it. No code deletion needed. Pattern: design optional features with graceful absence from the start (Session 66).
- **Overflow pages as noindex,follow:** /all/ pages prevent thin-content indexing while preserving link equity flow. Hub schema shows displayed count (30), capsule shows real count (273) — editorial vs structured data serve different purposes (Session 67).
- **Build time 8.2s → 36.2s was cache destruction, not regression:** `rm -rf dist` destroys OG cache at `dist/.og-cache.json`. Cold cache = 34s, warm cache = 5.7s. Never `rm -rf dist` before builds — use incremental builds instead (Sessions 67→68).
- **Perl alarm doesn't survive exec:** `perl -e "alarm..."` + exec replaces the process, so the alarm signal handler is lost. Every "timeout" that appeared to work was the process completing naturally. Bash background watchdog (`sleep N && kill $PID`) is the correct pattern for shell script timeouts (Session 69).
- **Auto-enrich defense-in-depth stack:** Four layers required: (1) lock file with PID-based stale detection + trap EXIT, (2) stale process cleanup on startup (skip Claude.app + current session), (3) working timeout via bash watchdog, (4) timeout value matching real batch duration (30 min, not 15). Missing any one layer caused the 4-day outage (Session 69).
- **set -euo pipefail requires || true guards:** pgrep, wait, kill all legitimately return non-zero. Every such command needs `|| true` or exit code capture to avoid triggering set -e abort (Session 69).
- **Post-mortem verification after emergency fixes is mandatory:** Session 69 applied 4 fixes under pressure. Session 69b confirmed all 4 were necessary AND identified which one was the root cause fix (bash watchdog) vs. supporting fixes (cleanup, lock, timeout). Without verification, you don't know if your fix actually worked or if the problem just didn't recur yet (Session 69b).
- **Test automation via launchctl start, never interactive shell:** launchd runs with minimal PATH (no .zshrc, no shell profile). `command -v claude` returns nothing unless .local/bin is in plist PATH. Interactive shell testing gives false confidence (Session 69c).
- **Orphan cleanup needs 3-gate targeting:** (1) PPID=1 (true orphan, reparented to init), (2) not interactive (skip --dangerously-skip-permissions), (3) matches auto-enrich signature (both -p and --output-format flags). Broad pgrep kills user's active Claude Code terminals (Session 69c).
- **Auto-save threshold must account for false positive gate deductions:** SCHEMA_MISSING (-5pts), NO_EXPERIENCE, MISSING_PRACTICAL:time are common false positives. Threshold 85→80 prevents valid descriptions from being silently discarded (Session 69c).
- **Hardcoded CLI paths go stale on update:** Claude CLI moved from .npm-global/bin to .local/bin after update. Use `command -v claude` with fallback chain, never hardcoded paths (Session 69c).
- **Stacked failures unmask sequentially:** Each auto-enrich fix revealed the next failure mode — 5 independent layers over 3 days. Fix one layer → test production path → fix next. Don't stack fixes without verifying each (Session 69c).
- **Claude CLI warm-up call eliminates cold-start timeout:** Batch 1 was timing out at 1800s due to CLI cold start. A warm-up call before the first batch reduces Batch 1 from timeout to 598s. Add warm-up to any automation that spawns Claude CLI (Session 70).
- **Auto-enrich pipeline saga (S69→S85):** 7 failure modes fixed (S69→S70), lock mtime + watchdog (S74), clamshell diagnosed (S75), caffeinate -s (S76), throughput scaling (S77→S81). Session 85: battery skip REMOVED (caused 6-day drought), geocoding moved to freshness mode + capped. Safety mechanisms that block ALL work are worse than recoverable failures.
- **Guard 1 Step 0 must be explicitly blocking:** "Run these commands AND REPORT before starting Step 1." Otherwise executors skip to implementation and discover pre-existing work mid-session. Session A: sticky date headers already existed, discovered during build not during verification (Session A).
- **Token declaration order = visual hierarchy order:** CSS custom properties should be ordered by visual lightness (primary→elevated→surface→raised). Maintain as convention — makes the 4-level system scannable at a glance (Session B).
- **Skeleton shimmer gradient bounds: container level ± 1 step:** Using --bg-raised for shimmer would create too bright a flash. Gradient needs the adjacent level pair, not the interactive level (Session B).
- **Pull quote injection is fragile to HTML structure changes:** `injectPullQuotes()` splits on `<h2 class="date-group-header">` via regex lookahead. Any change to that heading's class or tag breaks injection silently. Document as dependency whenever modifying hub page HTML structure (Session C).
- **Featured card is variant #6 — at complexity ceiling:** D12 set ceiling at 5 card variants, 6 accepted with justification. Any further card variant requires removing or merging an existing one first (Session C).
- **Post-processing injection pattern tradeoffs:** "Render base → inject sections" minimizes blast radius vs modifying shared rendering functions. But it's fragile to HTML structure changes and invisible in the component tree. Use only when component-level insertion would require modifying high-traffic shared code (Session C).
- **URL override on venue lock > blanket mixed_venues:** Moving a venue to mixed_venues exposes all its events to reclassification (120 collateral changes in dry-run). URL override is surgical — overrides venue lock per-event using high-confidence URL patterns. Config-driven: new sources = JSON edit, zero code (Session 71).
- **Greek compound words create keyword false positives:** "μαγνητοταινία" (videotape) contains "ταινία" (film) — triggered cinema keyword. Keyword matching must account for compound word boundaries in Greek (Session 71).
- **Categorizer pass ordering matters:** URL Path must come after Keywords, not before. Otherwise festivals and dj_sets at /music/ URLs incorrectly become concerts. Order: Venue Lock (w/ URL override) → Keywords → URL Path → Source Hints (Session 71).
- **Dry-run before batch recategorization is mandatory:** Guard 2 saved 120 incorrect reclassifications. First dry-run showed 153 changes (target ~33). Refined approach brought it to 31. Always dry-run categorizer changes (Session 71).
- **test.skip() > delete for dormant feature tests:** save-batch Greek test was for unimplemented feature. Skipping preserves intent and surfaces when the feature returns. Deleting loses the test contract (Session 72).
- **When adding required fields to types, grep all fixtures immediately:** hasNativeGreek added to types.ts but not to 6 fixture files. TS errors accumulated silently across sessions until Session 72 cleaned them up. Shotgun surgery checklist (Guard 6) applies to type changes + fixtures (Session 72).
- **Manual pre-enrichment review catches categorizer blind spots:** Sources with flat URL structure (ticketservices.gr, megaron.gr) provide no type signal for URL-path pass. Venue-locked concerts-in-disguise at these sources need manual review before enrichment. Document excluded sources in url-category-patterns.json (_excluded_sources) (Session 73).
- **Lock mtime guard makes stuck processes recoverable:** If lock file is >2 hours old, force-remove regardless of PID liveness. Prevents a single hung claude -p from blocking all subsequent runs indefinitely (Session 74).
- **caffeinate -s survives AC clamshell (empirically confirmed):** 300s exact. Battery skip REMOVED (Session 85) — it blocked ALL enrichment for 6 days when laptop stayed on battery. Safety mechanisms that prevent ALL work are worse than the recoverable failure they protect against. Net: -144h lost enrichment to prevent a 2h hang (Sessions 74→76→85).
- **claude -p hangs: root cause was Clamshell Sleep — FIXED:** Lid-close suspended entire process tree including watchdog. caffeinate -s (AC) + battery skip = complete defense. Empirically verified: -s survives clamshell on AC (300s exact), battery skips enrichment entirely. ~70% → expected ~95%+ effective rate (Session 75→76).
- **Never prioritize from uncategorized grep output:** "17 failures" was grep noise (non-fatal warnings). "3 failures" was undercount (missed Mode C). Classify failures by mode first, then assess impact. Guard 4 (diagnostic before method) applies to failure counting too (Session 75).
- **pmset -g log is authoritative for macOS sleep/wake forensics:** Shows exact sleep entry/exit times, sleep type (Clamshell vs idle vs maintenance), and wake durations. Essential for diagnosing any automation failure that correlates with time-of-day or user activity patterns (Session 75).
- **Hardware-dependent tests must run bare-metal:** caffeinate behavior, lid-close, power state checks cannot be tested inside Claude Code. Run these tests manually from Terminal with physical hardware actions (Session 76).
- **Batches were serial, now parallel (Session 80). Original serial assumption corrected. 67% speedup: 43 min → 14 min critical path.
- **Pipeline auto-commits during deploy phase:** Sessions touching generated files (dist/, data/) must `git pull` first or risk merge conflicts with pipeline's auto-commit. Pipeline commit happens during deploy, not enrichment (Session 77).
- **Coverage is throughput-bound at 7%:** 9-12 events/day against ~248 14-day events = weeks to reach meaningful coverage. Lever (c) (second daily run) is the highest-impact next step after validating EVENTS_PER_BATCH=4 (Session 77).
- **Guard 1 catches unsafe config before shipping:** 1249s outlier shifted 5-event worst-case projection to 2082s (exceeds 1800s timeout). Conservative choice of 4 events (worst-case 1664s) was correct. Always use worst-case, not mean, for timeout safety (Session 77).
- **Runtime artifacts (DB, caches) must not be git-tracked:** events.db + content-hashes.json in git caused 40-min git push (47K+ lines of binary diff). Untracking 78 files reduced push to <1 min. DB backup via VACUUM INTO + gzip replaces git as safety net (Session 78).
- **375 MiB loose objects in .git/ from historical DB commits:** git filter-repo can clean this but is destructive (rewrites history). Low priority — doesn't affect daily operations, only repo clone size (Session 78).
- **Pipeline split into freshness + enrichment modes:** full|freshness|enrichment mode flags with per-mode locks and phase gating. Freshness (~24 min) handles scraping/import/build/deploy. Enrichment (~50 min) handles AI descriptions only. Can run independently on different schedules (Session 79).
- **Mode C confirmed transient:** Zero API 500s across 4 consecutive observations. No code fix needed — was likely upstream provider issue (Session 79).
- **Batches are now parallel (67% speedup):** Serial 2608s → parallel 854s critical path. busy_timeout = 30000ms in save-batch.ts handles concurrent SQLite writes via WAL mode. Concurrent saves validated — two batches completed in the same second with zero SQLITE_BUSY (Session 80).
- **SQLite busy_timeout must be set for any concurrent write path:** WAL mode enables concurrent reads but writes still need lock. Without busy_timeout, concurrent save-batch calls get SQLITE_BUSY. 30s timeout is generous — real contention resolves in milliseconds (Session 80).
- **90 events/day pipeline target (S87):** From 9 (S74) to 60 (S81) to 90 (S87). Parallel batches, 5/batch, 6 daily runs. Zero code changes for S87 — pure plist addition (Sessions 74-87).
- **Backfill propagation bugs silently rot data coverage:** Coordinates existed in venue master but GROUP BY bug in backfill-venue-geo.ts prevented propagation to events with mixed geo state. 8,075 events had no coordinates despite venue being geocoded. Always verify end-to-end (master → events → schema output), not just master file state (Session 82).
- **Schema completeness 100% achieved (Session 83):** 10,096 pages fully valid, 0 errors, 12 warnings. From 67% (S51) → 82% → 83% → 95% (S82) → 100%. doorTime removed from warnings (optional, no real data). Hub validator fixed to skip non-hub pages. Irreducible residual: 8 events with placeholder venues.
- **Re-query Google Geocoding with venue-type hints:** Plain name queries miss venues that "Θέατρο [name]" or adjusted spacing resolve. Worth a second pass with type-prefixed queries before declaring a venue unresolvable (Session 83).
- **Validator must distinguish page types precisely:** Hub validator was scanning /about, /corrections, /editorial as CollectionPages — producing false errors. Whitelist hub slugs explicitly rather than glob-matching HTML files (Session 83).
- **dist/ orphan files accumulate across builds:** generate-site.ts doesn't sweep deleted events/venues. 112 stale HTML files found during Session 84 migration. Needs a sweep step at build start: diff DB slugs against dist/ contents, delete orphans (Session 84).
- **Single-source BASE_URL via src/config/site-url.ts:** 7 independent `const BASE_URL` declarations → 1 import. Next domain change = 1-line edit. Guard 6 (Shotgun Surgery) correctly identified this anti-pattern (Session 84).
- **Netlify CLI deploys collide with git-push-triggered builds:** Even with `netlify.toml` disabling server builds, Netlify occasionally attempts builds on git push. Cancel queued deploys before CLI deploy. Document as CLI-only deploy pattern (Session 84).
- **GSC verification file not in build pipeline:** googled03df0efd969df1f.html exists in dist/ but not generated by build. Survives CLI deploys but lost on clean rebuild. Add to generate-site.ts static file copy step or maintenance batch (Session 84).
- **GA4 tag now in HTML source via renderAnalytics() helper:** Was injected via Netlify snippet (invisible to GSC/AI crawlers). Session 86: src/config/analytics.ts with GA_MEASUREMENT_ID + renderAnalytics(), injected into 6 `<head>` emitters. 11,309/11,309 pages covered (Session 84→86).
- **Safety mechanisms must not block ALL work:** Battery skip prevented a 2h recoverable hang but caused 6 days of zero throughput (-144h net). Prefer degraded operation over full shutdown. If a precondition fails, skip the affected phase, not the entire pipeline (Session 85).
- **Uncapped geocoding holds enrichment lock indefinitely:** Geocoding ran inside enrichment mode, holding the lock for 12-36h per run. Moved to freshness mode + capped at 20/run. Long-running tasks must not share locks with time-sensitive pipelines (Session 85).
- **Grep for </head> across entire src/, not just templates/:** Inline 404 template in generate-site.ts was missed when enumerating <head> emitters. Guard 6 (Shotgun Surgery) caught it during implementation but plan missed it. Always grep the full pattern, not assumed file paths (Session 86).
- **Phantom penalties suppress legitimate passes:** SCHEMA_MISSING (-5pts build-time concern), MISSING_PRACTICAL (warning for template concept), MISSING_SECTION (literal string matching) were depressing pass rate 28% → 53% when removed. Gates must only measure writer-controllable content (Session 88).
- **Gates that reward overshoot teach the wrong behavior:** Old flat 500-word target gave 89/100 scores to concert_local descriptions 4x the matrix target. Matrix-based enforcement via classifyEvent() + getWordTarget() with 10% grace margins revealed 217 EN_OVER_MATRIX_MAX violations (42% of corpus). Months of reinforced overshoot (Session 88).
- **Classification fixes ≠ rewrite-reduction work:** Moving a 500-word description from concert_local (max 120) to concert_major (max 200) still leaves it 150% over. S88b diagnostic found only 3/217 overshoots would resolve via reclassification (1%). Fix bugs for correctness, not to reduce overshoot count (Session 88b).
- **Existing overshoot descriptions are working artifacts, not problems:** 178 rewrites × 10-15/session = 12-18 sessions not enriching 650 unenriched events. Over-long descriptions are well-written and factually correct. Park rewrites workstream, revisit only if citation data shows over-length hurts performance (Session 88b).
- **Venue normalization: toUpperCase() + NFD diacritic stripping:** Handles all-caps scraper output ("ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ") and accent variations ("Σταυρός του Νότου") in one step. Reusable for any venue matching via venueMatches() helper (Session 88c).
- **dj_set + concert should share classification logic:** dj_set was hardcoded to concert_local, bypassing venue/price checks. Unifying into one branch (check MAJOR_CONCERT_VENUES + price ≥ €25 before defaulting to concert_local) eliminates drift risk. 15 dj_sets at major venues reclassified correctly (Session 88c).
- **Three-layer enforcement architecture (S89):** (1) Code gates = hard stops blocking auto-save, (2) Brief rules = behavioral teaching for first-draft quality, (3) Gate checklist = human audit. Rules 18-23 intentionally NOT code-enforced. A subagent that only follows code-enforced rules finds ways around unenforced ones (Session 89).
- **Cascade failure pattern: pipeline phases must be independently failable:** S90 — Netlify deploy fail → IndexNow never ran → search engines never notified → invisible to AI. One upstream failure silently killed 4 downstream systems for 6 days. Constitution Rule #5 reinforcement: phases must not be coupled to upstream success (Session 90).
- **Silent exit 0 on API errors is a critical bug class:** ping-indexnow.ts hit 10K API limit silently, exited 0, pipeline reported success. Any script calling an external API must exit 1 on failure — never mask errors. Audit all bulk API scripts for this pattern (Session 90).
- **IndexNow first-ping to new domain returns 403:** Async-verification, resolves in ~30s. Not an error. Expected behavior that looks like failure — documented in mistakes.md (Session 90).
- **Batching threshold is dataset-sensitive:** ping-indexnow.ts worked for months at smaller scale, broke silently when dataset crossed 10K URLs. Bulk API scripts need batching from day one even when current scale doesn't require it (Session 90).
- **Diagnostic-Before-Method (Guard 4) prevents wasted refactors:** S90 — two confident hypotheses (domain config, script refactor) refuted before finding real issues (deploy cascade, API limit, 403 async). Always diagnose before prescribing method (Session 90).
- **Observability side-effects must never kill production path:** JSON write in ping-indexnow.ts wrapped in try/catch. IndexNow submission cannot fail because of a filesystem issue on monitoring side. Apply to every observability hook added to a production script (Session 91).
- **Stale detection > silent success for monitoring scripts:** A monitoring script reading unchanged data for 6 days looks healthy. 25h threshold + STALE marker in CSV makes silent cascade failure impossible to miss. Pair every timestamped metric with a staleness check (Session 91).
- **Append-only CSV as observability pattern:** No database, no dashboard. Opens in Numbers/Excel, greppable, diff-able. For <365 rows/year, more reliable than most monitoring stacks. Use for daily-granularity metrics that don't need real-time aggregation (Session 91).
- **Stratified sampling over pure random for asymmetric failures:** 4 events + 3 venues + 3 editorial catches sitemap-specific failures (e.g., only event pages 404). Pure random on a 10K-URL sitemap dominated by events would almost never sample editorial or venues (Session 91).
- **Fisher-Yates shuffle is the correct default for random sampling:** `sort(() => Math.random() - 0.5)` has algorithm-dependent bias. Doesn't matter for N=10 but wrong by default — use Fisher-Yates even for small samples (Session 91).
- **Monitoring scripts must sample from actual sitemaps, not assumed URL structures:** S91 endpoint check hard-coded `/en/events/{slug}` but actual English hubs live at `/en/{slug}/`. False 404s for a full session. Read sample URLs from the sitemap, never construct them from assumed patterns (Sessions 91→92).
- **Raw identifiers in data-* attributes, not paths:** When downstream consumers prepend paths (e.g., /saved/ + slug), emitters must store bare IDs, not full hrefs. prepareCardData was returning href "/events/id/" instead of slug "id" → double-prefixed 404 on /saved/ page (Session 92).
- **Migration IIFEs for localStorage schema changes must be idempotent:** Safe to run on every page load forever. Strips legacy entries, no-ops on clean state. Include in any page that reads localStorage keys with changed formats (Session 92).
- **/en/ redirect (302) > fake English page with Greek content:** Generating an English homepage with Greek event names + lang="en" is worse for hreflang integrity than a 302 to /en/today. Proper English homepage deferred until real translated content exists (Session 92).

---

## 🟡 S140 Bucket C Deferral — 35 Orphan Venues / 60 Events (2026-05-19)

- **Severity:** 🟡 Degrades discovery — 60 events at venues not in `config/athens-venues.json` canonical/variations registry, currently hidden from site emission by `location_status` filter (unverified or problematic). Not GSC-error-affecting (since not emitted), but represents real lost event coverage.
- **First seen:** S140 Phase 1 (2026-05-19)
- **Frequency:** 35 venues / 60 events at scope time. Distribution per `specs/s140-scraper-hygiene-followups.md`: `more.com` (12 venues / 21 events) + `residentadvisor` (11/21) + `ticketservices` (8/12) + `athinorama.gr` (5/5) + `meetup` (1/2) + `clubber.gr` (1/1).
- **Symptoms:** Events scraped into `data/events.db` with `venue_name` values that don't match any `canonical_name` or `variations[]` entry in `config/athens-venues.json`. `auto-verify-venues.ts` flags these as `unverified`; one ("TBA") is `problematic`. Three sub-classes by domain knowledge: (a) genuinely non-Athens — Larisa, Corfu, Heraklion, Tripoli, Farsala, Thessaloniki — ~10 venues / 15 events; (b) likely Athens but unverified — Manko, Ace Hotel, Moxy, Aura, Booze Cooperative, etc. — ~13 venues / 21 events; (c) duplicate canonical pairs/triplets — Vrachon×3, Katrakeio×2, Ioniko×2, TBA×3 — ~12 venues / ~20 events.
- **Workaround:** None at site-emission time — events are hidden per location filter, which is correct behavior for unverified venues. The cost is invisible-to-users event coverage, not malformed JSON-LD.
- **Fix plan:** Separate follow-up session combining (a) `auto-verify-venues.ts` diagnostic pass to surface each venue with current event count + sample titles, (b) Editorial Director REJECT/APPROVE rulings on the 35-venue list, (c) registry additions for verified-Athens entries via the S138-pre pattern, (d) location filter updates for verified-non-Athens entries, (e) duplicate-canonical normalization for sub-class (c). Pairs with scraper-hygiene structural mitigations from `specs/s140-scraper-hygiene-followups.md` (registry-lookup-then-write gate, city-filter gate for `ticketservices`, address-in-name parser fix for `clubber.gr`, TBA-prefix rejection, Greek-cities blacklist extension).
- **Status:** Deferred — S140 Bucket B shipped (`aff3d7141`); Bucket C scheduled post-S141 or post-demo per scope discipline (Editorial-Director-gated work belongs in its own session). Re-evaluate when: (1) GSC inventory next surfaces fresh "Missing field location" errors that trace back to a Bucket-C venue graduating to `verified_athens`; or (2) Editorial bandwidth opens for the 35-venue triage.
- **Cross-references:** `specs/s140-classification.md` (full bucket distribution), `specs/s140-scraper-hygiene-followups.md` (source × venue attribution + structural mitigations), commit `aff3d7141` (Bucket B ship).

---

### Category and Hub Page Slug Collision — Silent Overwrite
**Severity:** 🟡
**First seen:** Session 1 Path D inspection 2026-05-19
**Frequency:** Per-build, for every slug shared between `config/categories.json` and `config/hub-pages.json`
**Symptoms:** `generate-site.ts:508` (`generateCategoryPages`) writes `dist/${slug}.html` for category slugs. `generate-site.ts:535` (`generateHubPages`) writes `dist/${slug}.html` for hub slugs. When slugs collide (e.g., `"concerts"`, `"theatre"`, `"exhibitions"`, `"cinema"`, `"comedy"`), hub output silently overwrites category output. Category content is generated, written to disk, then deleted on the next write — pure wasted work for colliding slugs. Same architectural pattern as session 93's `generatePage`+hub double-write.
**Impact:** Wasted generation cycles; category content only ships for non-colliding slugs (likely `clubs`, `rebetiko`, `jazz`, `performances`, `screenings`, `workshops`, `tech`); intent of having both category and hub generators is obscured.
**Root cause:** No coordination layer between the two generators about URL ownership.
**Workaround:** None.
**Fix plan:** Decide URL ownership. Either (a) `generateCategoryPages` skips slugs that have hub config, or (b) hubs explicitly replace categories at the orchestration layer, or (c) categories migrate to a different URL prefix. Requires reviewing both config files against each other.
**Status:** Open — deferred. Not a demo blocker; flagged for follow-up.

---

### Filter-Bar Clear-Canonical Is Architecturally Dormant
**Severity:** 🟡
**First seen:** S2a-impl (2026-05-20) — hub-identity model ship
**Frequency:** Every production hub-page render
**Symptoms:** The S2a-impl hub-identity model ships Clear-canonical (`<a href="/{hub-slug}" class="filter-clear-all">Καθαρισμός</a>` instead of `href="/"`) on hub pages when `hasActiveFilters && hubIdentity` is true. **In production, that condition never holds.** Reason: every filter-panel option on a hub navigates the user to a non-hub URL (filter-combo page via `buildURL`, or another hub via `301`). Examples on `/concerts`: Date=Today → `/concert-today` (filter URL); Type=Theater → `/theater` → 301 → `/theatre` (different hub); Price=Open → `/open-concert` (filter URL). On `/kids`: every panel option leaves `/kids` because tags aren't in `Filters`. Net: hub pages are always bare in production, and the Clear-canonical branch never fires.
**Impact:** The visible wins from S2a-impl (bare-hub `Καθαρισμός` uniformity across 8 hubs in EL+EN; identity-pill suppression on date/event_type/event_types/price_type hubs) are real and verified. The Clear-canonical change is dormant defensive code — correct and unit-tested, but unreachable until the URL routing or filter generator emits hub-derived pages with hub identity preserved.
**Root cause:** `src/generate-site.ts:1176 generatePage()` is the generator for filter-combo URLs and was outside S2a-impl's boundary. Its `renderPage` call at `:1182` doesn't pass `hubIdentity`. So filter-URL pages like `/open-concert.html` Clear→`/` regardless. And hub pages themselves never reach `hasActiveFilters=true` because the only filter on them is hub identity, which is excluded by design.
**Workaround:** None needed for demo — bare-hub uniformity is the demo-visible win.
**Fix plan:** Teach `generatePage()` to detect a hub-matching filter set (lookup `config.slug` against `buildURL(filters)`, or store hub-membership in metadata at generation time), compute `hubIdentity` with `canonicalUrl = matchedHub.slug` and `excludeDimension = hubFilterToExcludedDimension(matchedHub.filter)`, and pass through. Requires its own recon — note the singular↔plural slug fragility (S132 redirects) when matching `buildURL` output against `config.slug`. Defensive Clear-canonical unit test (`src/templates/__tests__/filter-bar-hub-identity.test.ts`) stays as forward-coverage.
**Status:** Open — defer to a scoped follow-on session. Prioritize ahead of calendar work IF the demo flow exercises user-applied filter narrowing on a hub; otherwise post-demo.
**Cross-references:** `src/utils/hub-identity.ts` (the helper), `src/templates/filter-bar.ts` (the gate + pill + Clear-href), `src/generators/hub-page.ts:336` (the only call site that currently passes `hubIdentity`), `src/generate-site.ts:1176` (the gap).

---

### `hasActiveFilters` Ignores `Filters.genre` (Latent Clear-Blindness)
**Severity:** 🟢
**First seen:** S2a recon (2026-05-20)
**Frequency:** Latent — no production trigger today
**Symptoms:** `src/templates/filter-bar.ts:122` gate reads `{type, price, time}` from `currentFilters`. `Filters.genre` exists in the type (`src/types.ts:124`) and `buildURL` serializes it (`src/utils/urls.ts:10`), but the gate doesn't read it. If a future code path sets `currentFilters.genre` without one of the other three dimensions, `hasActiveFilters` returns `false` and `Καθαρισμός` is hidden even though a user-applied genre filter is active.
**Impact:** Zero today — there's no UI for users to add a genre filter (filter-bar renders no genre pill). Genre is only injected when a hub config or pre-generated combo page sets it server-side, which happens for combo URLs like `/with-ticket-jazz-concert-this-month.html` — those always also have `type` or `price` set, so the gate fires correctly.
**Workaround:** N/A.
**Fix plan:** Add `genre` to the `hasActiveFilters` calculation if/when a genre input is added to the filter UI. Trivial one-liner; doesn't need its own session.
**Status:** Defer-log. Re-evaluate only if genre user input is added.

---

### Slug Singular↔Plural Fragility (Pill-Dismiss Path)
**Severity:** 🟢
**First seen:** S2a recon (2026-05-20)
**Frequency:** Latent — bridged today by 4 hand-written redirects
**Symptoms:** `src/utils/urls.ts:6 buildURL()` emits singular event-type slugs (`/concert`, `/theater`, `/exhibition`, `/performance`). Hub canonical URLs are plural (`/concerts`, `/theatre`, `/exhibitions`, `/performances`). The gap is bridged by 4 hand-written redirects in `netlify.toml:93–122` (S132). Adding a new event_type hub (e.g. a hypothetical "/concerts-classical") without a corresponding singular→plural redirect would silently break filter-pill dismiss paths — the dismiss link would 404 (or route to the wrong place) instead of redirecting back to the hub.
**Impact:** Zero today — all 4 current event_type hubs have their redirects in place. The hub-identity model (S2a-impl) bypasses this entirely for the Clear-canonical path (uses `metadata.url`/`config.slug` directly), but the individual pill-dismiss paths still depend on the redirects.
**Workaround:** N/A.
**Fix plan:** Generate the singular→plural redirects programmatically from `config/hub-pages.json` (any hub with `filter.type === 'event_type'` and a singular form of its value), and emit them into `netlify.toml` or `_redirects` at build time. Removes the hand-maintained list. ~10 LOC in `generate-site.ts` plus a build-output test.
**Status:** Defer-log. Re-evaluate when adding the next event_type hub.
