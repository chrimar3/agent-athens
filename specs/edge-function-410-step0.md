# Edge-Function 410 — Step 0 Recon Findings (read-only)

**Date:** 2026-07-04 · **Type:** read-only discovery, HARD STOP after Step 0. No implementation.
**Outcome:** The architecture is sound and 0a is clean. But **0b surfaces two real blockers** that must be resolved before implementation is pinned: (1) the repo has **no Edge Functions today** (only regular Functions), and (2) the current **`--no-build --dir=dist` deploy may not bundle Edge Functions at all** — which would force a Tier-1 deploy-command change. **Recommend: do NOT proceed to implementation until the deploy-mechanics question (0b-2) is answered — it can invalidate the whole approach.**

---

## 0a — Manifest freshness (GEO gate 1): CLEAN

- **Source = the classifier, single-source.** A build-time manifest derives from `classifyEventLifecycle(event) === 'past-expired'` over `locationFiltered` — the SAME source as the shipped band (`generateArchiveGoneRules`, event-page.ts:1047). No parallel date math → no Guard-6 drift. Because it's regenerated every daily build from the live classification, it can **never 410 a live event** (a live event is never `past-expired`).
- **Write point exists.** The build already emits non-HTML artifacts via `writeFileIfChangedSync` / `writeJsonApiIfChangedSync` (generate-site.ts:6) alongside `_redirects` (716–736), `llms.txt` (1625), `robots.txt` (1676). A manifest (`dist/archived-slugs.json`, or bundled — see 0b) slots in the same way, right after the `_redirects` block.
- **Both-locale by construction.** The manifest stores bare slugs; the function strips the locale prefix before lookup, so one entry covers `/events/{slug}` AND `/en/events/{slug}`.
- **Fail-open is a FUNCTION-side contract** (not manifest-side): if the manifest is missing/unreadable at request time the function must `return`/`context.next()` → normal 404, never 410-everything. Confirmed as the required failure mode; it's an implementation invariant to test, not a discovered risk.

**Verdict:** manifest = build-time, classifier-derived, emitted alongside `_redirects`. Clean. ✅

## 0b — Cold-start + latency (GEO gate 2): ARCHITECTURE OK, but TWO BLOCKERS

- **⚠️ BLOCKER 1 — no Edge Functions exist yet.** `netlify.toml` declares only `[functions] directory = "netlify/functions"` (regular Lambda Functions; one exists: `netlify/functions/go.ts`, the click handler). There is **no `[[edge_functions]]` block and no `netlify/edge-functions/` dir.** Edge Functions (Deno runtime, run at the CDN edge before static serving) are the correct tool — regular Functions can't intercept arbitrary paths pre-static. This is a **new capability** for the repo: new dir, Deno runtime, `[[edge_functions]]` config. Not a blocker to feasibility, but real setup + a runtime the repo hasn't used.
- **⚠️ BLOCKER 2 — does `--no-build --dir=dist` even deploy Edge Functions?** The Tier-1 deploy is `netlify deploy --prod --no-build --dir=dist`. Edge Functions are normally bundled during the **build** step (from `netlify/edge-functions/`), which `--no-build` **skips**. If the CLI does not pick up/bundle edge functions under `--no-build`, the function never ships — the entire approach fails silently at deploy. **This must be confirmed (Netlify CLI docs or a throwaway test deploy) BEFORE implementation.** If true, it forces either (a) a deploy-command change (drop `--no-build`, which re-introduces the location hard-stop build the flag was added to skip — a Tier-1 rule collision), or (b) deploying edge functions via a separate mechanism. **This is the highest-risk unknown.**
- **Fire scope (once configured):** declare the edge function with `path`/`excludedPath` config scoped to `/events/*` and `/en/events/*` only — never the homepage/hubs/live-200s outside `/events/`. It WILL still fire on **live** event-page requests (they match `/events/*`); mitigated by a bundled `Set` lookup (O(1), sub-ms) + `context.next()` for non-archived slugs. Adds negligible latency to live event pages; acceptable.
- **Manifest delivery (design choice):** bundled-into-the-function (fastest, Set at module scope, redeploy to refresh) vs. Netlify Blobs (the repo already uses Blobs for clicks — no redeploy to refresh, small read cost) vs. runtime `fetch` of `dist/archived-slugs.json` (cold-start network hop — reject). Recommend **bundled** for latency, but bundling ties into BLOCKER 2 (how the manifest reaches the edge-function deploy).

**Verdict:** latency/scope are solvable; **the deploy-mechanics blocker (0b-2) gates everything.** ⚠️

## 0c — `_redirects` interaction / eval order (GEO gate 3): OK, with one claim to confirm

- **Eval order (documented, confirm at deploy):** Netlify runs **Edge Functions BEFORE redirect rules and before static files.** So the edge function fires first on `/events/*`.
- **Do the slug-change 301s still win?** YES — but by *manifest content*, not by ordering. The manifest holds only **current archived** slugs (via `generateEventSlug` on the event's current slug). A renamed **live** event's OLD slug is in `slugHistory` (the 301 source), NOT in the manifest, and its event is live (not past-expired). So the edge function does not match the old slug → `next()` → the `_redirects` 301 fires. (Renamed-then-archived: old slug 301→new, new slug 410 — correct.) **Confirmed safe by construction**, independent of ordering.
- **Supersede vs coexist:** once the edge function covers archive 410s unbounded for both locales, the shipped **6,246 `_redirects` band rules are redundant → REMOVE them** (single source, frees ceiling to near-zero). This is the recommended end state.
- **⚠️ Guard-6 retire-span (Step 3 of implementation):** removing the band means retiring `generateArchiveGoneRules` + `ARCHIVE_410_WINDOW_DAYS` + the band emission block (generate-site.ts:727+) + `archive-gone-rules.test.ts` (delete or re-point at the manifest generator) **together**. KEEP: `410.html` + `generate410Page` (the function targets it), and the `backlink_preserved_urls` seam (the function consults it as a skip-list). The band's `resolveEffectiveEnd` keying migrates into the manifest generator (same classifier).

**Verdict:** coexistence is clean; supersede-and-retire is the right end state; eval-order claim needs a one-line deploy confirmation. ✅ (pending confirm)

---

## Step-0 gate summary

| Gate | Question | Result |
|---|---|---|
| 0a | Manifest classifier-derived, fail-open, write point? | **CLEAN** — build-time, single-source, emitted alongside `_redirects` |
| 0b | Function cost / cold-start / deploy path? | **ARCHITECTURE OK, 2 BLOCKERS** — no edge functions yet; `--no-build` may not deploy them |
| 0c | Eval order, 301s win, supersede-vs-coexist? | **OK** — 301s win by manifest-content; supersede + retire band; confirm edge-first order at deploy |

## Recommendation (HARD STOP — awaiting review)

Not "all green → implement." The architecture is right and 0a/0c are clean, but **0b-2 (does `--no-build --dir=dist` deploy Edge Functions?) is a go/no-go that read-only recon cannot answer.** Resolve it first, one of:
1. **Cheapest:** a throwaway test deploy of a trivial edge function under the current `--no-build --dir=dist` flow → does it fire in prod? (Confirms the whole approach in minutes.)
2. Check current Netlify CLI docs on `--no-build` + edge-function bundling.

If edge functions DON'T deploy under `--no-build`: escalate — the fix needs a deploy-flow decision (drop `--no-build` re-triggers the location hard-stop; Tier-1 collision) before any code. If they DO: the pinned shape is manifest (build-time, classifier-derived, bundled) + edge function (both-locale Set lookup, fail-open, event-paths-scoped, 301s pass through) + retire the `_redirects` band (Guard-6 span above).

**Do not implement until 0b-2 is answered and reviewed.**

---

## DEPLOY B RESULT (2026-07-04) — capability probe ANSWERED: edge functions DEPLOY under `--no-build`

**Question (0b-2):** does `netlify deploy --prod --no-build --dir=dist` ship an edge function or silently skip it?
**Answer: SHIPS. The sequel is VIABLE — no Tier-1 deploy-command collision.**

- Probe: quarantined edge function `netlify/edge-functions/edge-probe.ts` (path-scoped to `/__edge-probe` via `netlify.toml [[edge_functions]]`, fail-open everywhere else). Deployed infra-only (zero content delta — dist byte-identical to the deployed-A artifact; only `netlify.toml` + the edge dir changed).
- Deploy `6a494fe375a30963224ff9b4`, `state=ready`. Deploy took ~16s (dist deduped).
- `curl -sI https://agentathens.com/__edge-probe` → **HTTP 200**, body `edge-probe-ok`, header `x-edge-probe: deployed` (proves it's the edge function, not a static serve).
- **Quarantine verified clean:** homepage 200, live/just-passed event 200, cooling event 200, `/en/today/` 200, and the Deploy-A band 410 still 410. The probe shadowed nothing.

**Implication:** the pinned sequel shape stands — build-time classifier-derived manifest + both-locale Set-lookup edge function (fail-open, event-paths-scoped, 301s pass through) supersedes the 6,246-rule `_redirects` band and closes the cross-locale asymmetry. `--no-build --dir=dist` stays as-is (no need to drop it → no location-hard-stop collision).

**Left in place:** `/__edge-probe` + its config remain deployed (per brief; remove when the real edge function lands). The next session pins and implements the sequel.
