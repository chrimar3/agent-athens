-- Migration 009: Add ticket_url_resolved column
-- Closes 2026-04-29 forward-looking spec (decisions.md): Sprint 2 adds nightly
-- resolver populating ticket_url_resolved. Migration 006 added the audit
-- columns (_at and _source) but the URL value column itself was never added;
-- the Sprint 2 diagnostic surfaced the gap during pre-flight.
--
-- Populated by Sprint 2.5 nightly resolver job (TBD). Until then, all rows
-- have NULL — emitter falls back to ticket_url (src/generators/event-page.ts).
--
-- Schema-level relationship: ticket_url_resolved is the ground-truth URL
-- after dereferencing aggregator/intermediate links. ticket_url (col 49) is
-- the as-scraped URL, which may be a listing aggregator (athinorama.gr) that
-- gets dereferenced by the resolver into a known_merchant URL (viva.gr).
-- The emitter's classifySource() runs on the resolved URL when available.

ALTER TABLE events ADD COLUMN ticket_url_resolved TEXT DEFAULT NULL;
