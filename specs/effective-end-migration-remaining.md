# effectiveEndSql migration — remaining sites (checkpoint, 2026-07-07)

Campaign Phase 6 landed the root-cause infrastructure; this spec checkpoints
the incremental site migrations that remain. **The guard is the permanent
fix; the migrations are incremental** — `tests/effective-end-guard.test.ts`
fails the build on any NEW raw `start_date >= date('now')` predicate, and its
allowlist below only shrinks.

## Landed this session (commit refs in session log)

- `src/db/effective-end-sql.ts` — `effectiveEndSql(prefix)` / `isCurrentSql(prefix)`
  / `athensTodaySql()`, generated from `config/lifecycle-presumption.json` via
  `getRunImplyingTypes()` — provably lockstep with `resolveEffectiveEnd()`
  (parity test over 9 event shapes).
- `tests/effective-end-guard.test.ts` — parity + seam guard + self-pruning
  allowlist (remove a file from the allowlist when you migrate it; the test
  fails if an allowlisted file no longer contains the pattern).
- `src/enrichment/priority-queue-manager.ts` — 3 sites migrated (the
  daily-running bugs). **Transition diff:** totalVisible 399 → 687; +288
  running rows previously invisible to coverage-gap bonus and velocity metrics
  (162 theater, 62 exhibition, 19 other, 16 concert, 15 show, 12 festival,
  2 workshop). Runtime-verified against production DB
  (calculateVelocityMetrics → totalVisible 687).

## Remaining: raw-predicate sites (guard-allowlisted, migrate + prune)

Each migration MUST ship with a before/after transition diff (S188 method:
run both predicates over the real DB, review every membership change) —
semantics per site differ; do NOT blanket-replace.

| File | Sites | Note |
|------|-------|------|
| `scripts/enrich-venues.ts` | 5 | venue-knowledge enrichment windows |
| `scripts/venue-ticket-mapping.ts` | 2 | ticket-mapping candidate windows |
| `scripts/search-ticket-urls.ts` | 2 | |
| `scripts/import-ab-test-descriptions.ts` | 2 | |
| `scripts/crossref-ticket-urls.ts` | 2 | cross-ref window — check exhibitions WANTED? |
| `scripts/search-more-tickets.ts` | 1 | |
| `scripts/extract-ticket-urls.ts` | 1 | |
| `scripts/daily-manual.ts` | 1 | |
| `scripts/backfill-ticket-urls.ts` | 1 | |

## Remaining: hand-copied COALESCE sites (semantic review per site)

These 10 sites carry the OLD exhibition-only special case — correct pre-S189,
now stale vs the canonical resolver for ~175 running non-exhibition rows
(theater/festival with end_date or presumption windows). They are NOT matched
by the guard (they're not raw start_date predicates); migrate deliberately:

`filter-athens-only.ts`, `remove-duplicates.ts`, `merge-duplicates.ts`,
`mark-duplicates.ts` (line ~147), `enrich-time.ts`,
`generate-enrichment-brief.ts` (+ its local `effectiveDate` at ~253),
`backfill-ticket-urls.ts`, `upgrade-athinorama-images.ts`.

⚠️ Dedup-script windows (`mark/merge/remove-duplicates`) change which rows the
dedup passes touch — ship each with a dry-run transition diff and operator
review; a wider window can surface new duplicate groups.

## Timezone note

Migrated sites bind `$today` = `getAthensTodayStr()` (Athens-local). Raw
`date('now')` is UTC — wrong for up to 3h around midnight. When migrating,
also remove any site-local "today" derivations (e.g.
`generate-enrichment-brief.ts:253`).
