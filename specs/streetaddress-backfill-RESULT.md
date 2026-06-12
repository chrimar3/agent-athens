# streetAddress backfill — RESULT (S104 / Session 183, 2026-06-09)

## Status: FUNCTIONALLY SOLVED, NOT YET DURABLY COMMITTED

5 venues backfilled in `config/athens-venues.json`; native schema `failCount` **10 → 0**,
verified against emitted `dist/` with the **standalone validator** (`validateAllPages`), NOT
the build's own schema pass (the build halted early on a concurrent session's WIP — see below).

**The config change is UNSTAGED and on disk only — pending concurrent-session resolution.**
This file exists so the result survives a tree reset: the verified addresses below can be
re-applied to `config/athens-venues.json` in ~2 minutes.

## The 5 verified addresses (re-apply target: each venue's `address` field)

| canonical_name | `address` value | two-source basis |
|---|---|---|
| Από Μηχανής Θέατρο | `Akadimou 13, Athens 104 36` | lifo.gr + special-electronics (Ακαδήμου 13) |
| Θέατρο Μικρό Χορν | `Amerikis 10, Athens 106 71` | elculture + theatromania (Αμερικής 10, ΤΚ 10671) |
| Άλσος (= Θέατρο Άλσος, Pedion Areos) | `Evelpidon 4, Athens 114 74` | culturenow + Athens Voice (Ευελπίδων 4); identity reconfirmed |
| Δημοτικό Κηποθέατρο Παπάγου | `Koritsas, Papagos 156 69` | athinorama + culturenow agree on STREET Κορυτσάς (no number — 31/65 conflicted, omitted, not fabricated) |
| Πλατεία Νερού | `Leoforos Syngrou & Leoforos Posidonos, Faliro` | culturenow + festival synthesis (open plaza = intersection IS the address at true granularity) |

Emission: config `address` → schema `streetAddress` via `schema-graph-builders.ts:63`.

## Why it's held (do NOT commit/build/deploy yet)

The working tree is shared with a **concurrent session** actively building the
**dormant-locale-noindex** feature:
- foreign commit `aea82ba9b "docs(S183): location-verification Method-1 refuted"` (16:41);
- uncommitted WIP in `src/generate-site.ts`, `hub-page.ts`, `generate-sitemaps.ts`,
  `content-page.ts`; untracked `src/validators/__tests__/dormant-locale-noindex.test.ts` (16:57).
- My `bun run build` halted on THEIR incomplete dormant-noindex invariant (`dance` hub) — a
  tree that exists on no branch and will never deploy as-is. NOT a streetAddress blocker.

Collateral: my S104 decisions.md entry was swept into `aea82ba9b` (committed, safe, but under
their message). My earlier `git add` of the backfill brief was undone (brief is untracked).

## Sequence once the tree is clean (concurrent session landed/stashed)
1. `git commit config/athens-venues.json specs/streetaddress-backfill-brief.md specs/streetaddress-backfill-RESULT.md` — explicit paths, NO `--no-verify` (tsc hook will pass on a clean tree).
2. Clean `bun run build` → confirm `failCount` 0 and a green exit (no early halt).
3. Deploy decision live again (next cron pickup, or manual if production-freshness urgency).

## Durable lessons (for mistakes.md once the contended file is free)
- On a **shared working tree, "staged" is not durable — only "committed" is**; another session's
  git activity swept a staged artifact and absorbed a staged doc into its own commit.
- The **build compiles the whole working tree**, including another session's uncommitted WIP, so
  a build halt may reflect a tree on no branch. Read results from emitted `dist/` with the
  **standalone validator**, not the build's own pass, when the tree may be contaminated.
- **Two sessions must not share one working tree** — use separate worktrees/clones. Workflow fix.

## Triage cycle 2 (2026-06-12) — new drift accumulated over the 4-day freeze

11 new detail-page location fails → 6 venues. Native `failCount` **17 → 4** after this cycle.

**Backfilled (5, two-source verified at true granularity):**
| canonical_name | `address` | sources |
|---|---|---|
| AN Club | `Solomou 13-15, Athens 106 83` | thisisathens + anclub.gr/listings (Exarchia) |
| EXA | `Ierofanton 13, Athens 118 54` | jazzeventslive + search (Gazi) |
| Skull Bar | `Lambrou Katsoni 13, Athens 114 71` | thisisathens + Greek directory (both "13") |
| Bòtoxe | `Petrou Ralli 38, Egaleo 122 41` | athens24 + search (Aigaleo) |
| Οικία Ιλίτς | `Lampsakou 11, Athens` | cityportal + monopoli + theatromania (Ilisia; site-specific apartment theatre) |

**HELD (1): Smut** — queer warehouse club, street address deliberately unpublished; no
two-source. Left EMPTY (NOT suppressed — real, identifiable venue). Its 2 events stay blocked,
so the build still halts at the location hard-stop (failCount 4, all Smut). Frozen-on-Smut is
the honest state, not a force-past.

Note: the "2 unresolved-name venues" from the first trace were a parser artifact (EN-mirror
`en/...` paths), not unnamed venues — so NO suppression was warranted in this cycle.
