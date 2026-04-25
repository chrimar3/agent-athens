-- Migration 006: Ticket URL resolver audit columns
-- Required by: src/ticketing/resolver.ts + scripts/backfill-ticket-urls.ts
-- Date: 2026-04-24

-- ============================================================================
-- TICKET URL AUDIT COLUMNS
-- ============================================================================
-- ticket_url_resolved_at : ISO8601 timestamp of last successful resolution.
--                          Used by backfill for idempotency (skip if fresh).
-- ticket_url_source      : Which tier produced the URL (debug / observability).
--                          Values: 'scraper' | 'detail_page' | 'venue_registry'
--                                | 'platform_search' | 'crossref' | 'ai_discovered'
--                                | 'venue_fallback'
--
-- ticket_url_status values (already exists from migration 001, formalized per D11):
--   'direct'                 — Tier 1:    scraper-captured URL on allowlisted host
--   'detail_page'            — Tier 1b:   HTTP-extracted outbound ticket link
--   'venue_registry_direct'  — Tier 2:    venue_registry.ticketing.url
--   'venue_registry_search'  — Tier 2:    venue_registry.ticketing.search_pattern
--   'crossref'               — Tier 3b:   Jaccard match vs RA/more.com/ticketservices
--   'platform_search'        — Tier 3:    constructed search URL via ticketing-mapping.json
--   'ai_discovered'          — Tier 4:    found during enrichment, validated
--   'venue_fallback'         — Tier 5:    no purchase URL, showing venue website
--   'door_only'              — guard:     legitimately no online purchase (pre-sale door only)
--   'expired'                — revalidator: URL was valid but returns 4xx/5xx now
--   'unresolved'             — cascade terminal: no URL found
--   'open_entry'             — guard:     price=open or price=donation (no CTA)
--
-- Pre-existing (legacy, to be migrated out by backfill):
--   'generated'              — produced by scripts/validate-ticket-urls.ts
--                              generateMissingUrls() — speculative, often wrong

ALTER TABLE events ADD COLUMN ticket_url_resolved_at TEXT;
ALTER TABLE events ADD COLUMN ticket_url_source TEXT;

CREATE INDEX IF NOT EXISTS idx_ticket_url_resolved_at ON events(ticket_url_resolved_at);
