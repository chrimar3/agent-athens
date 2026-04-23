# Session C — Email Ingestion Schema Unification

**Status:** Deferred. Tracked from Session A (date-format normalization).

## The problem

`src/ingest/email-ingestion.ts:322` defines a local `upsertEvent()` that writes to columns that do not exist on the current `events` schema: `date`, `time`, `venue`, `type`, `genre`, `price`, `address`, `url`, `short_description`, `full_description`. Events table has `start_date` / `end_date` / `venue_name` / etc. (see `src/db/schema.sql` + ALTER migrations).

The `INSERT` branch of that function was replaced with a `throw` in Session A (April 2026) because it was broken dead code. See the throw at `src/ingest/email-ingestion.ts:~360`. The `UPDATE` branch (lines 329-357) remains as-is and would error the same way if ever reached.

`scripts/ingest-emails.ts:13` imports `fetchEmails` from this module; the import chain is live but no newsletter-tagged rows exist in the DB (`SELECT COUNT(*) FROM events WHERE source IN ('this-is-athens','lifo-guide','newsletter')` → `0`), suggesting either the caller is dormant or it fails upstream of the INSERT.

## What Session C must decide

1. **Canonical column model for newsletter-ingested events.** Either (a) migrate this module to write the same `start_date` / `end_date` / `venue_name` schema the rest of the pipeline uses, or (b) introduce a distinct shape only if there is a real reason.
2. **Live-ness of the call site.** Is `scripts/ingest-emails.ts` actually being run, and if so, where does it currently fail? Gmail OAuth? IMAP fetch? Parser? Knowing where rules out "fix the INSERT" as a sufficient repair.
3. **Interaction with `src/ingest/newsletter-formats/*`.** The newsletter parsers produce `ParsedEvent` shapes. Confirm those shapes match (or will match) whatever column model Session C picks.

## Session C boundaries (inherited)

- Do **not** add `email-ingestion.ts` to `tests/no-bypass.test.ts` ALLOWED_BYPASSES. Dead code that throws does not belong on the seam allowlist — the allowlist represents **accepted** design-by-bypass, not broken code. Once Session C ships a working writer, add a properly-scoped entry *then*.
