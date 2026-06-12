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
