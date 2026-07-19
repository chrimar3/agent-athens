# Agent Athens — Fable Audit & Highest-Leverage Wins

**Date:** 2026-07-19 · **Branch audited:** `fable-impact` · **Method:** read-only; four parallel audits, key claims re-verified by the author against live production.

> **Point-in-time warning.** Every count in this document is a hardcoded snapshot and will rot — the exact failure class this audit found ~97 instances of. Treat numbers as "as measured on 2026-07-19", not as truth. Where a number matters operationally, the fix is to compute it, not to update this file.
>
> **A concurrent session was committing to `fable-impact` during this audit** (HEAD moved `ad497aafa` → `da731d5e3` mid-run). Re-check state before acting.

---

## 0. Do these before the next deploy

Two items are live traps, unrelated to any roadmap.

| # | Item | Evidence | Why now |
|---|---|---|---|
| **0.1** | **`dist/search-index.json` is fixture data — 2 events.** | Local: `events: 2` — `Jazz Night at Half Note`, `Contemporary Art at Gagosian`, stamped `2026-07-19T12:53:15Z`. Live: **218 real events**. Last deploy 05:32 predates the clobber. | `src/generators/__tests__/search-index.test.ts:7` points `DIST_DIR` at the **real** `dist/` and writes to it. It imports `rmSync`/`afterAll` and uses neither. **Running the tests corrupts the deploy artifact.** Because `dist/` is gitignored, the deploy gate's git-provenance check cannot see it. Production is safe *only* because nobody has deployed since. |
| **0.2** | **`fable-impact` is 14 commits ahead of `origin/main` and has never been pushed.** | `git rev-list --count origin/main..HEAD` → 14 | Single point of failure. Includes all Phase-3 visibility work. Disk loss takes all of it. |

**Root cause of 0.1 is a test-isolation defect, not a build defect.** The repo already solved this exact class on the data side — `tests/preload/prod-db-guard.preload.ts` makes any test-time open of `data/events.db` throw, and a second test fails the suite if that guard is disarmed. That pattern is excellent and simply was never extended to the artifact side. **The fix is to apply the existing pattern to `dist/`**, not to invent a new one.

---

## 1. What Fable actually built — and where it went

There are **two distinct bodies of Fable work**, and conflating them is the main risk here.

### 1a. `redesign/visual-loop-20260707-2220` — SHIPPED ✅

Merged and live. Its tip is an ancestor of `main`, not merely of `fable-impact`. Six commits (C1–C5 plus a P1 card-tap repair) across the action layer, Satori media tiles, mobile filter mechanics, trust/locale hygiene, and freshness rhythm. This is the work behind the recorded 5.22 → 7.125 composite. **Nothing to do; the worktree is disposable.**

### 1b. `fable-redesign` — FULLY STRANDED ⚠️

Nine commits, ~1,205 lines, parked since 2026-07-06 (13 days). **Not merged anywhere, and not re-implemented by any other route.**

Verified three independent ways:
- `git cherry fable-impact fable-redesign` → `+` on all 9 (no patch-equivalent commits).
- Distinctive markers grepped over `src/` at `fable-impact` HEAD: `--surface-page` 0, `--ink-strong` 0, `--brand-accent` 0, `--state-running` 0, `hub-answer-capsule--collapsible` 0, `edp-state-banner` 0, `locale-toggle` 0.
- The reverse signal: `.event-passed-banner` — the component `fable-redesign` *deleted* — is still alive in 3 files on `fable-impact`, proving HEAD retains the pre-v2 implementation.

> **Correction to the project record.** The stored note "redesign MERGED into fable-impact + DEPLOYED 2026-07-08" is **true of `visual-loop` (1a) and false of `fable-redesign` (1b)**. They are different work on the same files. Anyone trusting the merged status will skip re-landing 1b entirely.

#### Keep / drop verdict per deliverable

| Deliverable | Verdict | Reasoning |
|---|---|---|
| **A11y: `uniquifySvgIds()`** (`f3e2bcf23`) | **KEEP — cherry-pick first, in isolation** | Self-contained in `event-tile.ts`. Fixes a large body of WCAG 4.1.1/F77 duplicate-id errors (commit claims 4,705 — *not independently re-measured*). Beyond conformance: SVG `mask`/`clipPath` resolution is per-document, so colliding ids can silently resolve against the wrong tile. Correct today, fragile by construction. **No slug risk. Highest value-to-risk ratio on the branch.** |
| **F3 slug cutover** | **KEEP the fix, DO NOT merge as-is — see §2.1** | Right fix; its safety proof has expired. Must re-date before merge. |
| **Design-system v2 token layer** | **KEEP, but rebase-cost is real** | Semantic aliases mapping 1:1 to current values — zero visual change, makes a light theme or per-city accent a token swap. Strategically valuable if the project ever expands beyond Athens. `design-system.css` differs by ~451 lines vs HEAD and both branches rewrote it. |
| **IA: capsule collapse, running lane, locale toggle** | **KEEP — re-derive rather than merge** | Genuinely good: the capsule becomes a native `<details>` with full text retained in SSR DOM (so no citability loss), and long-running events group under "Τρέχει τώρα" instead of a stale date header. But it touches the same files `visual-loop` has since rewritten. Cheaper to re-apply intent than to resolve. |
| **EDP past-state pill + calendar collapse** | **KEEP — low priority** | Cosmetic lifecycle polish. |
| **Venue photo/description slots (F14)** | **DROP for now** | Ships inert — 0 venues populated. Re-land when Editorial has assets; re-writing it later is cheap. |
| **`CLAUDE.fable.md`** | **KEEP the content, DROP the filename** | Claude Code loads `CLAUDE.md` / `.claude/CLAUDE.md` — **never `CLAUDE.fable.md`**. It is invisible to every session. Its substance (exhibition `end_date` rule, `open\|with-ticket\|donation` price vocabulary, Greek time parsing, venue exact-match, Europe/Athens) is genuinely useful. **Fold the good parts into the real `CLAUDE.md` and delete the proposal.** |

#### Also at risk in that worktree
`prototypes/` (38 files, **untracked**) — includes `tokens-v2.css`, three reference pages, and screenshot tooling. Commit messages cite these as *normative* ("markup per `prototypes/redesign-v2/hub-today.html`"). They are one `git clean` from gone and invisible to any git-following backup.

### 1c. `benchmark/visibility-baseline-20260708` — STRANDED, and it's blocking a backlog item

Nine commits, unmerged. Contains `tooling/probe-perplexity.ts`. The Perplexity API key **now exists** (`~/.config/agentathens/perplexity-api-key`, Jul 18) — but the recorded next command points at a path that **exists on no branch**, and the script reads `process.env.PERPLEXITY_API_KEY` rather than the config file. The blocker changed shape from "no key" to "no code on any branch"; the backlog still records the old shape.

---

## 2. Highest-leverage wins, ranked by impact ÷ effort

### Tier 1 — high impact, low effort

#### 2.1 Degenerate URL slugs — the single largest citability leak
**Measured live: 459 of 620 event URLs in the production sitemap carry the double-dash defect**, many with *no lexical content at all* — `/events/9811f812--/`, `/events/5a34e4ee--/`, `/events/1e5dcbc8--/`.

Cause: `slugify` empties Greek text, leaving only the hash prefix. A URL is both a ranking and a citation signal; `/events/79600fb7--barbara-kruger-untitled-pride-and-contempt/` tells a crawler everything, `/events/9811f812--/` tells it nothing. **Roughly three-quarters of the event corpus publishes URLs with zero lexical content — on pages whose JSON-LD is otherwise excellent.** The structured data is doing its job while the URL layer discards the signal.

**⚠️ The fix on `fable-redesign` has become a trap.** It gates transliteration on `created_at >= 2026-07-07` — chosen on 07-06 to guarantee zero URL churn. That date is now in the past, so **merging today would silently rewrite live indexed URLs with no redirects** — the precise churn the gate was written to prevent. Roughly 238 already-published URLs are affected.

> **Required sequence:** (1) move the cutover constant to a future date; (2) decide the policy for the ~238 already-live defective URLs — leave them (URL stability) or migrate them *with* `_redirects` entries; (3) only then merge. Do **not** trust the commit message's safety claim: it is date-dependent and now false.

#### 2.2 Build directive leaking inside JSON-LD `description`
**Verified on live production.** `<!-- timeliness-expires: 2026-07-06 -->` sits **inside the quoted `description` string value** of the Event JSON-LD, with **zero occurrences anywhere outside** JSON-LD.

That distribution rules out a template bug: the token was baked into the description text **in the database by the enrichment layer**, then faithfully serialized. `description` is the passage an answer engine most often quotes verbatim.

The same field also carries **raw markdown pipe-tables** on ~155 files — violating this project's own documented rule ("No markdown tables in descriptions"), which *is* guarded by `quality-gates.test.ts:166` for new content but was never backfilled.

> **Fix is upstream + backfill**, not a template patch: add a validator rejecting HTML comments and table syntax in `description`, then repair existing rows.

#### 2.3 Reconcile the public counts
Three different numbers describe the corpus: llms.txt "218 events / 33 venues", homepage chrome "Events live 1,493 · Venues 148", sitemaps 620 + 33 + 136.

**Important nuance — these are not simply "stale".** Each is *computed*, from a different denominator (218 matches the live `search-index.json` exactly; 778 matches `dist/en/events/` exactly). The defect is that they are **presented unqualified**, so a model reconciling the site against itself finds contradictions — and self-contradiction directly suppresses citation confidence. **Fix by labelling the denominator, not by forcing one number.**

#### 2.4 Move the "About me" modal out of the DOM lead
Live extraction confirms the owner's CV precedes event content in DOM order on event pages. The `×` shows it is a **modal** — visually hidden for humans, but early in the DOM for crawlers doing lead-passage extraction.

This is **purely a machine-extraction bug**, not a visible-layout bug, which makes it both lower-risk and far cheaper than "rewrite the page lead" — likely just relocating the modal markup to end-of-body.

#### 2.5 Sitemap `lastmod` is uniformly today
All 789 URLs share one `lastmod`. The content-hash mechanism is real (`src/sitemap/content-hasher.ts:67-79`) but its manifest is **gitignored**, so `loadManifest` returns empty on any clean checkout and every URL bootstraps to today. Crawlers learn to ignore `lastmod` entirely — **directly costing the freshness advantage this site's entire pitch rests on.** (Also a timezone split: hasher uses Europe/Athens, fallback uses UTC.)

#### 2.6 A dead scraper has been alerting into a broken pipe for 5 days
`clubber.gr` has been dead since ~07-14; `com.agentathens.deadman` is the only launchd job with non-zero exit status. **The deadman is working correctly — nobody is reading it**, because its only alert channel (email) is rejected by Gmail auth (`specs/deadman-email-spike.md:4`). Fixing the channel is cheap and restores the project's only outage alarm.

### Tier 2 — high impact, medium effort

#### 2.7 The locale story is the biggest structural ceiling
Three findings converge, and they compound:

- **Zero `hreflang` tags site-wide** — deliberately gated (`src/utils/hreflang.ts` `HREFLANG_GATE_OPEN = false`), with the full emitter built and tested behind the gate. No `x-default` anywhere.
- **Greek is the *default, root-served* locale** — yet wherever an `/en/` twin exists, the Greek page is noindexed and dropped from sitemaps. I confirmed this independently: `/en/today` and `/en/concerts` appear in sitemaps; `/today` and `/concerts` return **0 matches**.
- **52% of Greek event pages serve English body copy** behind a "Περιγραφή στα Αγγλικά" notice.

**The site's canonical, root-served locale is the one actively suppressed from search.** Root URLs are what people link and share; those are the ones told not to index. This is the worst of both worlds — two full locale trees published, no declared relationship between them.

The gate's precondition (real Greek content) is honest and measurable. **This is the highest-ceiling item on the list**: opening it unlocks ~1,163 suppressed root hubs at once. It is *not* a one-liner — `generate-sitemaps.ts:136-139` does not read the gate, and the `dormant-locale-noindex` validator will **build-fail** if flipped without lifting the sitemap drop. That enforced coordination is good design; budget for it as a project.

#### 2.8 Enrichment "gates" that do not exist
Four of five documented enrichment rules have **no implementation and no test**:

| Rule | Status |
|---|---|
| No markdown tables | **GUARDED** ✅ |
| Citation-anchor first sentence | No test, **no implementation** |
| Opening paragraph ≤50 words | No test, **no implementation** — documented as "**a hard gate**" |
| No metro line colors | No test, **no implementation** |
| Unique closer per description | No test — exists only as a *request to the model* in an LLM prompt |

The citation-anchor rule is precisely the one that drives LLM citability. **Either implement them or stop calling them gates** — a documented-but-unenforced gate is worse than none, because it is trusted.

#### 2.9 Sitemap and artifact hygiene
- **15 duplicate `<loc>` entries**, including the **homepage twice** as `https://agentathens.com` (no trailing slash) while its canonical is `https://agentathens.com/`. Cause: two push sites accumulate into `generatedUrls` with no dedupe.
- **Trailing-slash canonical mismatch on the Greek locale:** `/today/` declares `canonical=https://agentathens.com/today` — without the slash. `/en/today/` correctly self-canonicalizes. The two locales disagree on URL form.
- **~4,353 orphaned `dist/events/` directories** — 5,846 dirs, only 1,493 with `index.html`, but **5,846 `.ics` files**. The build removes `index.html` on expiry but never the `.ics` or the dir, so thousands of dead calendar files are live on production.
- **No 50k-URL / 50MB sitemap enforcement** — latent, not live.

#### 2.10 Structured-data coverage gaps
JSON-LD quality is genuinely strong (see §4), but the two properties answer engines lean on hardest for "who is playing" are nearly empty: **`performer` 1.9%, `organizer` 4.0%** (`offers` 33.7%, `endDate` 79.0%). Also absent site-wide: `license` (0 files) — llms.txt asserts CC BY 4.0 but **no page carries it in markup**, so nothing tells a model the terms under which it may quote. `citation` and `isBasedOn`: 0.

The omissions are *principled* — `offer-builder.ts` omits rather than fabricates, and the build fails on synthesized `endDate`s. **That instinct is right; this is a data-coverage problem, not a schema-logic problem.**

---

## 3. System design and information flow

### 3.1 The good news, stated plainly
Three hazards I expected to find **do not exist**, and this constrains the fix list:

- **There is only one build path.** `src/generate-site.ts` is definitively the sole producer: its line 1501 is the only non-test call site of `writeBuildProvenance`, and `deploy-gate.sh:39` fails closed without that stamp. The validator *reads* emitted HTML rather than re-rendering, so it sits downstream and **cannot structurally disagree** with the renderer.
- **The build gates are genuinely fail-closed** — seven hard stops, all exiting non-zero, with the provenance stamp deliberately written **last** so a failed build cannot leave a deployable artifact.
- **Sitemap/noindex are in verified lockstep** — every sitemap URL resolves and none is noindexed; reverse-checked across noindexed pages. Enforced by a build-failing validator with synthetic-fixture tests. `robots.txt` is well-built: GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot explicitly allowed for citation, `Google-Extended` blocked from training.

### 3.2 The pipeline commits to the wrong branch and reports success
`scripts/daily-automated.sh:574-575` runs `git commit` (→ whatever branch is checked out) then `git push origin main` (→ the **stale local main ref**). Pushing an unchanged ref exits 0, so **it logged success every time**. Three days of pipeline artifacts never reached the remote; local `main` is stranded while the commits sit on `fable-impact`.

**The pipeline has no branch assertion anywhere.** Fix: assert the expected branch before commit, and push the current branch explicitly.

### 3.3 No minimum-event-count floor — the gate stack is vacuously satisfiable
All seven hard stops fire on the **presence** of bad pages. **All are vacuously satisfied when zero pages are emitted.** The DB health check guards `COUNT(*) > 0` on the raw table, not on publishable rows.

**Failure scenario:** the Athens location filter regresses and marks everything `unverified` (3,338 rows already sit there). Build passes green → stamps provenance → deploy gate passes → `deploy-cadence.log` records success → the drought watchdog sees a fresh deploy — **and production is an empty calendar with every alarm silent.**

This is the one stage that can silently produce a no-op deploy, and **no gate covers it.** A floor assertion is a few lines and closes the largest silent-failure hole in the system.

### 3.4 The scheduling layer has no source of truth
- **12 launchd jobs loaded; 3 plists in repo root + 7 in `config/launchd/`.**
- `enrichment-check`: **repo says `Hour 9`, production runs `Hour 20`.** The repo is actively lying about a live schedule.
- `enrichment-01`, `-22`, and `auto-enrich` are **loaded with no repo copy at all** — and `auto-enrich` is the *sole* setter of `HOME`.
- `config/launchd/com.agentathens.freshness.plist` exists in-repo but is **not installed** — the repo advertises a pipeline that does not run.
- 40 files in `~/Library/LaunchAgents` across four generations of `.s27bak` / `.s99-backup` / `.disabled-*` sidecars.

**The known override bug class is armed across 8 jobs.** `auto-enrich.sh` defines `${BATCH_TIMEOUT:-1200}` etc.; the same variables are set in 8 installed plists. Because `:-` only fills when *unset*, **the plists win** — so editing the script default will be a silent no-op for every scheduled job. Values agree today, which is exactly why it will surprise someone later. This is the S166 failure that hid for three weeks, re-armed.

> `docs/LAUNCHD-SETUP.md:47-52` makes it worse: the documented install command copies the repo plist over the installed one, **silently reverting `BATCH_TIMEOUT`**.

### 3.5 Two cwd-relative database opens bypass every guard
`src/enrichment/venue-context.ts:18` and `src/enrichment/artist-lookup.ts:14` call `new Database('data/events.db')` — **cwd-relative, no `create:false`**. Invoked with cwd ≠ repo root, these silently *create* a fresh empty SQLite file and enrich into the void.

That is the degenerate-DB shape the 2026-06-30 hardening was built to prevent, reintroduced through the one path the guards don't cover. The DB path exists as **10+ independent string literals** with no shared constant.

### 3.6 Post-deploy pings are ungated on deploy success
IndexNow and GSC sitemap submission run **outside** the deploy-success block, and both exit 0 on internal failure. If deploys fail for a week, search engines are pinged daily to re-crawl a stale sitemap while the ping logs stay green — **a false freshness signal in exactly the logs an operator checks during a drought.**

### 3.7 Documented deploy command bypasses the gate
`docs/SYSTEM-REFERENCE.md:245,375` documents `netlify deploy --prod --dir=dist`, **omitting `scripts/deploy-gate.sh`**. Following the doc bypasses the gate built to close the 2026-07-06 production breach. The gate itself is the strongest-guarded component in the repo (18 tests, plus seam guards asserting it precedes `netlify deploy` in both call sites) — the doc simply routes around it.

---

## 4. Documentation honesty — the meta-problem

Of ~195 cheaply-checkable claims, **~97 were FALSE.**

**Root cause isolated:** 7 files *read* doc paths; **zero write them.** Every number in every doc is hand-transcribed, with no generator and no drift detector. That is why the rot is uniform and undetected.

Representative magnitudes: "Total events 213" vs **17,130** · "10,275 pages" vs ~2,345 · "3,800+ sitemap-indexed" vs 789 · "599 tests / 23 files" vs 153 files · venue counts variously 78 / 346 / 409 vs **347**.

Worse, **`npm test` cannot run at all** — it points at `scripts/test-pipeline.ts`, which does not exist. **12 of 20 `package.json` scripts reference files that were never committed.** The only working aggregate (`test:all`) reaches **43 of 153 test files (28%)**; the real full run is bare `bun test`, which no script invokes.

The recurrence ledger — a ledger *about* not trusting unverified claims — carries **~6 mutually contradictory live values** across three files.

> **This is the highest-leverage systemic fix in the document.** Not because stale docs are dangerous in themselves, but because two of them (§3.4, §3.7) actively instruct an operator to break production, and one memory note (§1b) would cause 9 commits of work to be abandoned. **Rule to apply: write a status or count only where it is COMPUTED.** The repo already proves this works — `ACTIVE_SOURCE_COUNT` replaced a hardcoded "15+ sources" and now greps to zero stale copies, and llms.txt derives its hub list from config rather than a literal.

### Tests that assert nothing
The DB layer is **clean and well-designed** (the `prod-db-guard` preload is the strongest pattern in the repo). The `dist/` layer is not:

- **11 files in `tests/build/` run under `describe.skipIf(!distAvailable)`** — an unbuilt `dist/` makes the entire guard silently vanish with a green suite. Ten of the eleven warn about nothing.
- **Already vacuous, verified:** two JSON-LD tests share a `SAMPLE_SLUGS` array of **live production events**; **one of three slugs is already gone**, and the guard lost a third of its coverage silently. Every remaining slug is an event; all will expire.
- A JSON-LD test passes if a page emits **zero** JSON-LD blocks — the loop never executes. A page that lost its structured data entirely passes the structured-data guard.
- `editorial-content.test.ts` hardcodes a production event ID, and **its own comment documents its vacuity**.

This is precisely the "fixtures must not go vacuous" failure the project's own method file warns about. **Fix: synthetic fixtures plus an asserted precondition** so the test fails loudly if it stops exercising the rule.

---

## 5. Suggested sequence

**Before anything else:** rebuild `dist/` (or restore `search-index.json`) and push `fable-impact`.

1. **Stop the bleeding** — §0.1 test isolation for `dist/`, §0.2 push, §3.2 branch assertion, §3.3 event-count floor, §2.6 deadman email. *Small, mechanical, closes the silent-failure holes.*
2. **Cheap citability wins** — §2.2 JSON-LD contamination, §2.4 modal relocation, §2.3 count labelling, §2.9 sitemap dedupe + trailing slash. *Days, not weeks; directly affects what models quote.*
3. **Cherry-pick the a11y fix** from `fable-redesign` (§1b) — isolated, no slug risk. Then decide the rest of that branch before rebase cost compounds further.
4. **Slug repair** (§2.1) — re-date the cutover, decide the ~238-URL policy, add redirects, then merge.
5. **`lastmod` manifest** (§2.5) and **enrichment gates** (§2.8).
6. **Docs-to-computed** (§4) — start with the two that instruct operators to break production.
7. **The locale project** (§2.7) — the ceiling-raiser. Scope it properly; it is coordinated by design.

---

## 6. Confidence and limits

**Verified by the author directly against live production:** the 459/620 defective sitemap URLs; the `timeliness-expires` leak *inside* the JSON-LD description string (and its absence everywhere else); zero `hreflang` site-wide; Greek hubs absent from all sitemaps; the `/today/` canonical slash mismatch; the search-index clobber (local 2 events vs live 218); the bio modal in DOM lead order.

**Reported by audit, not independently re-measured:** the 4,705 WCAG duplicate-id count (quoted from a commit message); the ~97/195 false-claim ratio; per-property JSON-LD coverage percentages; `launchctl` load state.

**Not examined:** the 180KB Netlify `_redirects` file for canonical-conflicting chains; the `/api/*.json` surface beyond confirming it exists; whether `fable-redesign` still compiles after 13 days of drift.

**Method note.** An early measurement of `hreflang` using `grep -oc` returned "1" and was wrong — `-c` overrides `-o` and counts matching *lines*, not occurrences. The true count is zero. Recorded because the same mistake would silently inflate any occurrence count in this document.
