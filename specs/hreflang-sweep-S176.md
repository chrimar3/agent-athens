# S176 — hreflang Gate Unification + Paired S110 Validator

**Date:** 2026-06-05
**Goal:** Gate hreflang/x-default emission universally to mirror page.ts's S144-closed state; reconcile the llms.txt claim; add a FAIL invariant so four-surface drift can't recur.

## Step 0 — Complete emitter enumeration

| # | Site | State pre-S176 |
|---|---|---|
| 1 | `src/templates/page.ts:102` | S144-closed (comment only, no emission) |
| 2 | `src/generators/event-page.ts:551-557,584` | S144-closed (`const hreflangHtml = ''`) |
| 3 | `src/templates/content-page.ts:47-50,59` | S144-closed (`const hreflangHtml = ''`) |
| 4 | `src/sitemap/generate-sitemaps.ts:69-75,81` | S144-closed (`const hreflangXml = ''`) — XML surface, separate format |
| 5 | **`src/generators/hub-page.ts:450-460`** | **UNGATED** — post-render `</head>` injection, el + en + x-default for bilingual hubs |
| 6 | **`src/generators/venue-page.ts:242`** | **UNGATED** — inline `hreflang="el"` self-alternate on venue detail pages |
| 7 | **`src/generators/venue-page.ts:455`** | **UNGATED** — inline `hreflang="el"` on venues index |
| 8 | `src/generate-site.ts:1425,1430` | llms.txt prose claims "bidirectional hreflang tags" — sides with the ungated emitters against S144 |

Recon (S175) reported 3 emitters; enumeration confirms the set is 3 ungated + 3 closed + 1 comment + 1 doc-claim. No index/cornerstone/today path emits independently (hubs cover those page classes via emitter #5).

## Step 1 — Topology: no shared emitter exists → introduce one (preferred path)

All emission is local (one post-render injection, two inline literals, three independent `''` locals). A shared helper is cheap: **`src/utils/hreflang.ts`** exporting:
- `HREFLANG_GATE_OPEN = false` — single reactivation switch, documented with the S144 predicate (Greek published + indexable + quality-gated; flip requires GEO Strategist ruling)
- `renderHreflangLinks(alternates: {el?, en?, xDefault?})` → `''` while the gate is closed; emits `<link rel="alternate" …>` set when open

All HTML surfaces route through it (call-site change): hub-page injects only when non-empty; venue-page interpolates helper output; event-page/content-page replace their `''` locals with helper calls (same output today, single source when the gate opens). The sitemap XML surface (#4) keeps its closed local — different output format, already gated, covered by the validator at the dist level (sitemap emits no hreflang today; re-add via helper-format extension when Greek launches).

**Reactivation contract preserved:** flipping `HREFLANG_GATE_OPEN` reactivates every surface together (S144 Decision 4); no surface hard-deletes its alternate computation.

## Step 2 — TDD parity: shipped

- New `src/utils/hreflang.ts`: `HREFLANG_GATE_OPEN = false` + `renderHreflangLinks()` ('' gate-closed; full el/en/x-default set gate-open via test-only override, so the emission shape can't rot while dormant). 4 tests.
- Routed: hub-page (inject-only-if-nonempty), venue-page ×2 (interpolated), event-page + content-page ('' locals → helper calls with real alternates — same output today, single source at reactivation).
- 3 pre-existing tests that PINNED the ungated hub emission (hub-page.test.ts:325, english-hub-page.test.ts:180,190) flipped to gate-closed assertions; gate-open per-URL parity (EN slash / EL no-slash / x-default=en) re-pinned in hreflang.test.ts.

## Step 3 — llms.txt reconciliation: shipped

Both claims (`generate-site.ts:1425,1430`) now derive from `HREFLANG_GATE_OPEN` — gate-closed emits no bidirectional-hreflang claim; gate-open restores the sentence. Doc and code can no longer drift on this axis (same single-source discipline as the lifecycle state machine).

## Step 4 — S110 paired validator: shipped

- `checkUngatedHreflang` in schema-completeness.ts (severity FAIL, errors[]), reading gate state from the SAME constant the emitter uses — disarms automatically at reactivation. Wired into all 5 validateAllPages page-class call sites (events, en/events, EL hubs, EN hubs, venues), mirroring checkCrossLocaleCanonical coverage.
- Build halt: new S176 hard-stop block in generate-site.ts after the 2.1′ location halt — ALL page classes, non-zero exit (real since S174 armed the exit code).
- **Regression assert passed live:** first post-patch build EXITED 1 catching 18 pages — all stale venue pages (venues with no current events aren't regenerated; their dist HTML predates the patch). Surgically stripped the ungated line from the 18 artifacts (dist is gitignored); rebuild exit 0. The stale-artifact class is exactly why the validator sweeps dist rather than trusting the generators.

## Step 5 — Verification

- `bun run build; echo $?` → **0**; location hard-stop 0; hreflang hard-stop 0.
- dist sweep: `grep -rl 'hreflang=' dist/en dist/venues dist/events | wc -l` → **0**; llms.txt → 0 hreflang claims.
- Full suite: **2,699 pass / 1 skip / 0 fail** (baseline 2,668 exceeded).

## Correction logged en route (S175 spec)

S175's premise-correction #2 ("4-phase taxonomy doesn't exist in code") was itself wrong — `getLifecyclePhase` at `src/utils/event-lifecycle.ts:107` IS the 4-phase machine (`active | just-passed | cooling | archive`; past-active splits at day 14), coexisting with the 3-phase `classifyEventLifecycle` above it. False negative from a truncated (1-60) file read. The S175 hinge integer (0) is unaffected — an empty absent set partitions identically under either taxonomy. S175 spec corrected this session.
