# Routines Spike — one pipeline phase as a Claude Code cloud Routine

> ## ⚠️ THROWAWAY-BRANCH CLEANUP (do this the moment the spike ends — or if it strands)
> The spike seeds `spike/cloud-routine-eval` with a force-added **66M `data/events.db` blob**. That blob sits on `origin` until explicitly deleted. Cleanup-on-success is exactly the path that fails silently, so the command lives **here, first**, not only in the closeout checklist:
> ```
> git push origin --delete spike/cloud-routine-eval && git branch -D spike/cloud-routine-eval
> ```
> Tracked as a strand-guard in `docs/known-issues.md` (added at seed time, not closeout).

---

**Type:** Evaluation spike (research-preview feature; behavior may change — document beta-header dependencies).
**Stream:** Major — Automation reliability.
**Goal:** Prove *or disprove* that one phase (**build → deploy**, deploy-only) can run reliably as a scheduled cloud Routine, with domain-scoped secrets, parallel to the launchd job, scored by the Session-A deadman's **outcome** signals.
**Guards:** spike one phase only (no scrape, no pipeline); no cutover; no launchd edits. Two-phase gate with a hard STOP — Guard-2 applies to web-UI time, not just code.
**Status:** 🟡 Scaffold reconciled to current reality (Session B, 2026-06-29). Repo artifacts ready; cloud-run sections PENDING execution in claude.ai/code.
**Started:** 2026-06-28 · **Reconciled:** 2026-06-29 (deadman now live; retargeted deploy-only; two-phase gate).

---

## Why (the value)

The daily pipeline runs on macOS launchd. Two of four recurring deploy-drought causes are the **launchd-hang class** and the **Mac-offline edge** — both properties of running on one physical machine. A cloud Routine works against `origin` and doesn't need the Mac awake, so it could eliminate both *by construction*, on subscription/Max billing.

## Root-cause framing (the real deliverable)

The current pipeline is **machine-local by construction**: the DB lives only on the Mac, deploy auth sits in the Mac keychain, the cadence log is resolved relative to the on-disk repo. The spike's true subject is **substrate portability**. Post-migration, local artifacts stop being produced — so the deploy model and any freshness check must treat the **DB as a build input** and the **live site (sitemap + Netlify published-deploy) as deploy-truth**, never a local artifact.

## Premise corrections (verified against repo, 2026-06-28 / re-verified 2026-06-29)

1. **`data/events.db` is gitignored (66M, untracked).** The brief's "deploy commits events.db to main / works against origin by construction" does **not** hold. → Spike seeds a snapshot on a throwaway branch; the production answer is Blocker 1 (below).
2. **The substrate-agnostic Session-A deadman is now LIVE** *(corrected 2026-06-29 — was the spike's open dependency)*. `scripts/deadman-watchdog.ts` + `src/watchdog/classifier.ts` shipped (`7b87013cb`/`33678893a`). Its **deploy-freshness arm reads `https://agentathens.com/sitemap-events.xml` `<lastmod>`** — substrate-agnostic, so it registers a cloud deploy identically to a launchd deploy. **Attribution caveat (see Step 3):** the deadman reads the *local* `logs/deploy-cadence.log` (which launchd writes) as its PRIMARY deploy signal and only falls back to the sitemap when that log is absent — so the local deadman, as-built, scores *launchd's* deploys. Attributing a deploy to the **routine** needs the routine's own fingerprint, not the deadman alone.
3. **Python not needed** (brief premise wrong): active scrapers are 100% Bun/TS; `.py` only in `scripts/_archive/`. Toolchain = Bun only.

---

## ⛳ Two CO-HEADLINE migration blockers (decide whether full migration is viable)

### Blocker 1 — Data portability (blocks the BUILD half)
The spike proves "cloud can build+deploy from a DB that is *present*." It does **not** answer how the daily-fresh 66M DB *reaches* a cloud routine in production. The DB is a build **input**, not a deploy artifact (Netlify only needs `dist/`), so it need not be in git. Candidate mechanisms for **Session C**: (1) routine pulls the DB at runtime from an object store / Netlify release asset / published JSON API via an allowlisted domain; (2) enrichment writes to a cloud-reachable store; (3) build consumes the published API instead of raw DB.

### Blocker 2 — Hardcoded Chrome absolute path (blocks the SCRAPE half)
5 scrapers (ticketservices / benaki / onassis / snfcc / megaron) drive headless Chrome via Puppeteer with a hardcoded macOS path `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (`scripts/scrape-all.ts:51`, `scripts/scrape-onassis.ts:29`). A Linux cloud routine must install Chromium and rewire the launch path, or those sources don't scrape. **This is why the spike is deploy-only** — curl/Bun reachability says nothing about Chrome-in-sandbox.

**Together:** Blocker 1 gates the build half, Blocker 2 gates the scrape half. This spike resolves neither (by design) — it surfaces that they exist and are load-bearing.

---

## Routines-docs findings folded in (code.claude.com/docs, 2026-06-29)

- **Bun proxy caveat (load-bearing):** *"Bun is installed but has known proxy compatibility issues for package fetching."* This is the real Phase-1 risk — and why the egress probe uses **Bun's `fetch()`**, not curl (allowlist + secret-injection are enforced at the sandbox boundary; a curl-green can mask a Bun-red).
- **Daily run cap is UNDOCUMENTED.** The docs confirm a per-account daily cap exists but **do not state the number** (the "15/day" below is unconfirmed). → The runbook **observes empirically** (count runs at claude.ai/code/routines; watch for rejection), never asserts a figure. **One-off "Run now" runs do NOT count against the cap** → Phase-1 probe + Phase-2 first run are free.
- **MCP routes through Anthropic's servers, NO host allowlist** → deploy prefers **Netlify MCP** over a CLI token through the proxy.
- **Beta header `experimental-cc-routine-2026-04-01`** gates only the API `/fire` trigger — **not needed** for a UI-scheduled routine. Noted, not depended on.
- Network deny = `403 x-deny-reason: host_not_allowed`, surfaces in the **transcript** (not status). Min schedule interval **1h**. Unrestricted branch push defaults OFF (`claude/`-prefix only).

---

## Done-conditions

| # | Condition | Status |
|---|-----------|--------|
| 1 | ~~Source reachability under Custom allowlist~~ → **DEFERRED to Session C** (gated on Blocker-2 Chrome rewire; instrument = `scripts/spike/probe-sources.ts`, unchanged). Replaced for this spike by **toolchain + deploy-egress** (Phase 1). | ⏳ PENDING (Phase 1) |
| 2 | Toolchain runs in-sandbox — `bun install` **under the proxy** + `bun:sqlite` on seeded DB + **Bun-fetch** reaches `api.netlify.com` (yes/no, per check) | ⏳ PENDING (`setup-cloud-env.sh` + `probe-deploy-egress.ts`) |
| 3 | One real deploy verified by **two agreeing outcome signals** (NOT green status) — see the gate below | ⏳ PENDING |
| 4 | Secret-handling shape — which secret lives where, domain scope, MCP-vs-token outcome | ⏳ PENDING (shape below) |
| 5 | Go/no-go split: **mechanism proven** (this session) vs **durability deferred** (≥1–2wk parallel-run) + empirical cap observation | ⏳ PENDING |

---

## Phase 1 — toolchain + deploy-egress probe (cheap, decisive, HARD STOP)

Configured in claude.ai/code. Create a **Custom environment**, network access = **Custom**, **Allowed domains** = default package-manager list **+ `bun.sh`** (Bun install) **+ `api.netlify.com`** (CLI-token fallback path) **+ `agentathens.com`** (sitemap scoring read). Setup script = `scripts/spike/setup-cloud-env.sh`. Target branch = `spike/cloud-routine-eval`. **Run now** a probe-only routine; prompt: run the setup script, then `bun run scripts/spike/probe-deploy-egress.ts`, and report verbatim.

**The three rulings (paste the transcript; planner rules each pass/blocked):**
1. Did **`bun install` complete under the proxy**? (the Bun caveat materializing = STOP)
2. Did **`bun:sqlite` open the seeded `data/events.db`** and count rows?
3. Did **Bun-`fetch` reach `api.netlify.com`** (any HTTP status that isn't `403 host_not_allowed`)?

**Gate:** all three green → Phase 2. Any red → record it; if `bun install` is the failure, the workaround is a SessionStart hook / pre-baked snapshot, and the go/no-go reflects that friction. **Do NOT proceed to Phase 2 until the toolchain stands up.**

**Results (paste probe output + the 3 rulings):**
```
⏳ PENDING — table + JSON from setup-cloud-env.sh and probe-deploy-egress.ts
```

## Phase 2 — one nightly build+deploy routine (parallel to launchd; only on Phase-1 green)

- **Secrets:** add the **Netlify MCP** connector to the routine (preferred — no allowlist, no token in env). `NETLIFY_AUTH_TOKEN` as a Custom-env variable only as CLI fallback.
- **Permissions:** enable **Allow unrestricted branch pushes** for the repo (default is `claude/`-prefix only) so the routine pushes `dist/` + the cadence line to `spike/cloud-routine-eval`.
- **Schedule:** ~22:00 Europe/Athens (clear of all launchd slots: 07:30 visibility · 08:00 freshness+deploy · 10/13/16:30/19:00 enrichment · 11:00 cadence-check). **Run now** once first; launchd remains source-of-truth.

### Secret-handling shape (vault discipline — never in the prompt)

| Secret | Lives where | Domain scope | Notes |
|--------|-------------|--------------|-------|
| Netlify deploy | **Netlify MCP** (preferred) — `mcp__claude_ai_Netlify__*` | None (routed through Anthropic's servers; no host allowlist) | Resolve in-sandbox whether MCP can push a `dist/` directory |
| `NETLIFY_AUTH_TOKEN` | Custom-env **environment variable** (fallback) | requires allowlisting `api.netlify.com` | Only if MCP can't deploy a dir |

**MCP-vs-token outcome:** ⏳ PENDING.

### Routine prompt (self-contained — paste into the scheduled routine)

```
You are running an autonomous nightly build+deploy for the Agent Athens site.
The repo is already checked out in this environment. Do NOT scrape — build from
the committed DB only.

SUCCESS CRITERIA (all must hold — a clean exit is NOT success):
  1. The build completes without error and dist/ is regenerated.
  2. A production deploy to Netlify reaches state "ready".
  3. https://agentathens.com/sitemap-events.xml <lastmod> advances to today.

STEPS:
  1. git checkout spike/cloud-routine-eval && git pull --ff-only
  2. Recompute location_status, THEN build (do NOT run bare `bun run build` —
     it would publish stale location_status). In this order:
       bun run scripts/filter-athens-only.ts
       bun run build
  3. Deploy dist/ to production. PREFER the Netlify MCP tools. Set the deploy
     title/message to carry this routine fingerprint EXACTLY:
       routine spike/cloud-routine-eval <this run's id> <UTC timestamp>
     If the MCP cannot publish a directory, fall back to:
       netlify deploy --prod --no-build --dir=dist \
         --message "routine spike/cloud-routine-eval <run-id> $(date -u +%FT%TZ)"
     (NETLIFY_AUTH_TOKEN is set for the fallback path.)
  4. ONLY if the deploy reached "ready", APPEND ONE fingerprinted line to
     logs/deploy-cadence.log using append (>>), never overwrite:
       echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy-success [routine spike/cloud-routine-eval <run-id>]" >> logs/deploy-cadence.log
  5. Commit dist/ and logs/deploy-cadence.log to spike/cloud-routine-eval and push.

REPORT: state explicitly whether EACH success criterion was met, and quote the
Netlify deploy id + state and the exact cadence line you wrote. If ANY network
request was blocked (403 host_not_allowed) or any step failed, say so — do not
report success on a partial run.
```

> **Why the fingerprint (the cross-check would otherwise be circular):** the live sitemap doesn't know which job refreshed it. If launchd's 08:00 deploy already advanced `<lastmod>` that day, the deadman reads OK at 22:05 **regardless of whether the routine did anything**. So the routine's deploy must leave a distinct, attributable mark — the **Netlify deploy message** + the **`[routine …]` cadence line** — and scoring reads *those*, not bare sitemap freshness. A green-but-empty routine then cannot score green.
>
> **Cadence-log discipline:** the fingerprinted line (`deploy-success [routine …]`) intentionally does **not** match the reader's exact regex `/^…Z\s+deploy-success$/` (`check-deploy-cadence.ts:42`), so it never corrupts launchd's source-of-truth attribution. It lives only on the spike branch; the planner reads it via `git show origin/spike/cloud-routine-eval:logs/deploy-cadence.log`.

**Run record:** ⏳ PENDING (routine run id, timestamp, transcript notes).

## Phase 3 — Score by outcome (planner-only; the gate that makes green≠success structural)

**The two-signal-agreement gate — go/no-go CANNOT read "go" on green status or one signal alone.** A "mechanism proven" claim requires **both** of these independent, routine-attributable signals to agree:

1. **Sitemap `<lastmod>` in the routine's ~22:00 window** — `curl -s https://agentathens.com/sitemap-events.xml | grep -m1 lastmod` shows a `22:xx` (routine) timestamp, distinct from launchd's `08:xx`.
2. **Netlify published-deploy carrying the routine fingerprint** at `22:xx` — read via Netlify MCP (or the spike-branch cadence line `git show …:logs/deploy-cadence.log`). The deploy message contains `routine spike/cloud-routine-eval <run-id>`.

One signal can lie (a cached sitemap; a deadman misattribution to launchd's 08:00). Their **agreement** is the bar. The deadman remains the generic freshness-machinery health check (proves the watcher *sees* a deploy); **attribution to the routine** comes from these two fingerprinted signals. Plus: read the **transcript** for blocked requests / silent task failure — green ≠ success.

**Score:** ⏳ PENDING.

---

## Daily-run-cap math (+ the reframe that turns it into an argument FOR the substrate)

Current launchd slot shape → ~8 routine slots/day (1 scrape + 4 enrichment windows + 1 freshness/deploy + 1 monitor-visibility + 1 cadence-check). **The cap number is undocumented — observe empirically, do not assert "15."** If the real cap is ≥8 we fit. **Reframe:** enrichment was fragmented into 4 windows partly to dodge launchd hang/timeout limits **that don't exist in the cloud** — a cloud routine with no timeout pressure could *consolidate* enrichment into fewer runs, *widening* the margin. The Session-C question is "does consolidation change the count," and cloud execution likely **improves** it. *(Confirm whether a multi-step routine counts as one run or many — research-preview.)*

## Go/no-go recommendation

⏳ PENDING — **split into two claims, never conflated:**
- **Mechanism (this session):** does one routine complete a real deploy, verified by the two-signal-agreement gate (not green status)? gated on done-conditions 2–3.
- **Durability (deferred):** is the routine *as fresh as launchd*? Only answerable after **≥1–2 weeks** of the deadman accumulating parallel-run data. Do not over-claim this session.

---

## Closeout checklist (when the spike ends)

- [ ] Phase-1 rulings + probe results pasted (done-conditions 1–2).
- [ ] Real deploy scored by the **two-signal-agreement** gate (done-condition 3).
- [ ] Secret outcome + go/no-go (mechanism vs durability) written (done-conditions 4–5).
- [ ] **Delete the spike branch — local AND remote** (command at the top of this file). The 66M-blob bloat trap.
- [ ] **Remove the `docs/known-issues.md` strand-guard entry** once the branch is deleted.
- [ ] `.claude/notes/decisions.md` — Routines-vs-CMA row (subscription vs Platform billing; secret-scoping model).
- [ ] `.claude/notes/patterns.md` — "green ≠ success applies to Routines too; score the live site + published-deploy via a routine fingerprint, never a local artifact."
- [ ] `docs/session-log.md` — append Session 193 entry.
