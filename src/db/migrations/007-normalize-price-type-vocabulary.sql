-- Migration 007: Normalize legacy price_type vocabulary to constitution values
-- Required by: Session A (ticket URL resolver), decisions.md D10 + addendum
-- Date: 2026-04-24

-- ============================================================================
-- LEGACY VOCABULARY NORMALIZATION
-- ============================================================================
-- Constitution values (per CLAUDE.md): 'open' | 'with-ticket' | 'tba' | 'donation'
-- Legacy values found in production DB (pre-migration):
--   paid  (10611 rows)  → with-ticket
--   free  (30 rows)     → open
--   door  (127 rows)    → with-ticket + ticket_url_status='door_only'
-- Retained as-is:
--   tba   (989 rows)    → awaits scraper improvements
--
-- Writer-side fixes (src/db/database.ts + scripts/scrape-all.ts) ship in the
-- same session; scrapers that emitted 'door' are corrected to emit
-- ticket_url_status='door_only' at the scraper boundary, not price_type='door'.

UPDATE events SET price_type = 'with-ticket' WHERE price_type = 'paid';
UPDATE events SET price_type = 'open'        WHERE price_type = 'free';

-- Correct data-model bleed: door is a ticket_url_status (CTA concept),
-- not a price_type (pricing concept). Migrate both columns atomically.
UPDATE events
  SET price_type = 'with-ticket',
      ticket_url_status = 'door_only'
  WHERE price_type = 'door';
