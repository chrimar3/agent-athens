# Performer QID online-drift gate — checkpoint (S185, 2026-06-10)

**Status:** Open policy question — checkpointed, NOT built. Routes to GEO Strategist before implementation.

**Scope.** The shipped `src/validators/performer-qid-manifest.ts` is an *offline* cache↔manifest consistency gate: it FAILs the build if any QID in `config/performer-sameAs.json` lacks a resolver-written record in `config/performer-qid-verification.json`. By design (see its docstring, lines 19-21) it cannot see **online drift** — a Wikidata entity that, after a verified snapshot, *merges, is relabeled, redirects, or gains a label-colliding sibling*. A clean offline manifest stays clean while the live referent silently changes owner (the same failure family as a label-derived QID becoming ambiguous when a second entity later shares the label). S185 confirmed all 50 current QIDs are correct as of 2026-06-10 via the live dry-run; the gap is *future* drift, not present corruption. The proposed gate is a **periodic WARN audit** that re-runs the existing online re-resolution (`scripts/audit-performer-qids.ts` dry-run — already the documented label-spot-check, lib lines 14-16) on a schedule, surfacing any `✏ corrected` / new-ambiguity entry for human review rather than auto-rewriting config (binding rule: QIDs enter config only via resolver `--apply`, never silent in-build mutation).

**Open decisions for GEO Strategist (do not pre-empt):**
- **Cadence** — weekly? monthly? piggy-backed on an existing scheduled job vs. standalone launchd entry. (50 rate-limited API calls ≈ 30–60s; cheap.)
- **Severity** — WARN-only (report + route to Editorial/Planner) vs. build-FAIL. A live-API dependency in the *build* path is fragile (network flake → false red); a WARN-only periodic job avoids coupling deploy to Wikimedia uptime. Recommendation leans WARN/periodic, but it's the Strategist's call.
- **Action on drift** — manual `--apply` re-derivation vs. an auto-PR. Must preserve resolver-only provenance.

**Do NOT build this session.** S185 was verify-only (Pattern-B refutation of an already-shipped fix); this file is the handoff.
