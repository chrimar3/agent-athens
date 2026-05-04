# S101a Research Notes (Step 1)

## Migration pattern

- **Location:** `src/db/migrations/NNN-description.sql` (kebab-case description, zero-padded NNN)
- **Latest applied:** `009-add-ticket-url-resolved.sql`. Mine: `010-add-editorial-pick-rank.sql`
- **Runner:** `scripts/run-migrations.ts`
  - Wraps each migration in `BEGIN TRANSACTION` / `COMMIT`, rolls back on error
  - Tracks via `_migrations(id, name, applied_at, applied_by)` — runner inserts `name` only; `applied_at` defaults to `datetime('now')`
  - Idempotent at the migration-level: skips already-applied. Within a migration file, use `CREATE INDEX IF NOT EXISTS` (SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running a partially-applied migration would fail — but the runner prevents that)
- **SQL idiom:** see `src/db/migrations/005-add-image-url.sql` and `009-add-ticket-url-resolved.sql`. Header comment block, then `ALTER TABLE events ADD COLUMN ...;` and `CREATE INDEX IF NOT EXISTS ...;`
- **Run command:** `bun run scripts/run-migrations.ts`

## `getFeaturedVignette` signature

Current:
```typescript
export function getFeaturedVignette(eventId: string, locale: Locale): string | null
```

Locale type: `import type { Locale } from '../i18n/strings'` (so `'el' | 'en'`).

Internal data model: `interface Vignette { vignetteEl: string; vignetteEn: string; }` defined inline at `src/utils/editorial-content.ts:22-25`.

For Step 4 extension: add optional `currentDate?: string` parameter. New shape:
```typescript
export function getFeaturedVignette(
  eventId: string,
  locale: Locale,
  currentDate?: string
): string | null
```

`Vignette` interface needs new optional fields:
```typescript
interface Vignette {
  vignetteEl: string;
  vignetteEn: string;
  validFrom?: string;   // ISO date "YYYY-MM-DD"
  validUntil?: string;  // ISO date "YYYY-MM-DD"
  rank?: number;
}
```

Backward-compat behaviour: entry without `validFrom`/`validUntil` returns vignette regardless of `currentDate` (existing placeholder rows continue to work).

## Test file present

`src/utils/__tests__/editorial-content.test.ts` exists — uses `bun:test` (`describe`/`test`/`expect`). Existing assertions test the placeholder data:
- `'PLACEHOLDER_EVENT_001'` returns a string with PLACEHOLDER substring
- Locale selection works (Greek text matches `/[Ͱ-Ͽ]/`, English matches `/night worth remembering/`)
- Unknown event ID returns `null`

**Risk:** Step 4 will extend the JSON with a real future-dated event entry. Existing `'night worth remembering'` regex still passes since the placeholder entry stays. New tests for date-window filtering go into the same file.

## Test infrastructure (Step 2 plan)

- New test file: `tests/db/editorial-pick-rank.test.ts` — opens DB via `import { Database } from 'bun:sqlite'`, asserts column exists via `PRAGMA table_info(events)`. **Note:** the brief specifies `tests/db/` not `src/db/__tests__/`; verify whether `tests/` is the convention or `__tests__/` is — checking next.
- Extension to existing `editorial-content.test.ts` — describe block `'getFeaturedVignette date window'`.
