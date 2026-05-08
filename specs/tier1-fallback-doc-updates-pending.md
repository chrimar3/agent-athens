# Pending Doc Updates — Tier 1 Image Fallback

**Status:** Implementation shipped 2026-05-08 (S124). Doc updates blocked on path resolution.

**Issue:** Design Navigator's spec referenced `design-system.md` §1, §5, §7, `design-decisions.md`, `dev-planner-design-index.md`. Verified repo state during S124 plan-phase verification:

- `docs/DESIGN-SYSTEM-AUDIT.md` exists with §1–§6 (no §7)
- `docs/design-decisions.md` does not exist
- `docs/dev-planner-design-index.md` does not exist

**Next step:** Christos to send Design Navigator the actual repo doc structure and request:
(a) corrected paths/sections for each of the 5 queued updates, OR
(b) creation/restructuring of doc files to match the spec's referenced names.

## Queued updates (verbatim from Design Navigator brief)

1. `design-system.md` §1 — broaden Event Type Colors usage rule to include "Tier 1 fallback gradient tints (15% opacity)"
2. `design-system.md` §7 — replace Tier 2 paragraph with Tier 1 spec
3. `design-system.md` §5 — point card grid "Missing image" line to §7
4. `design-decisions.md` — new entry: "Tier 1 Image Fallback Promoted from v1.1 to v1" with empirical trigger numbers (36.3% imageless / 88.2% single-source / permanent baseline per S123 diagnostic)
5. `dev-planner-design-index.md` — remove from §3 v1.1 Candidates

## Visible title redundancy on imageless cards

The Tier 1 spec produces visible duplication on imageless cards: the decorative typographic title in the image slot (aria-hidden span) appears in close vertical proximity to the semantic H3 in the card body. Both render the event title verbatim. Per Design Navigator review during S124 visual verification, this was approved with the framing "No duplication of indexable content" — the aria-hidden span is invisible to assistive tech and crawlers, only the H3 is indexable. However, the visible-to-sighted-user redundancy may be ergonomically poor: a sighted user sees the same title text twice in a small card. This is a separate Design Navigator brief: should the imageless-card layout (a) keep both visible (current — typographic decoration + H3), (b) hide the H3 visually for imageless cards via a visually-hidden helper while retaining semantics, or (c) something else? S124 ships current behavior unchanged; deferred for next Design Navigator decision.

## Hero variant aspect-ratio question

Per S124 plan resolution, sites #4 (`renderHeroSection` featured card) and #5 (`renderHeroSection` pick cards) use `.card-image--fallback` directly without a hero-prefixed variant — single-class consistency over visual perfection on a single surface. The hero featured wrapper `.hero-card-image-wrapper` and pick wrapper `.hero-pick-image` had different aspect ratios than 3:4; when the fallback fires for an imageless hero card, the imageless variant is now 3:4 regardless of surrounding hero layout intent. Flag for next Design Navigator brief: do hero-imageless cards need their own aspect-ratio modifier (e.g., `.card-image--hero` analogous to `.card-image--list`), or is the 3:4 default acceptable across all hero contexts? S124 ships 3:4 default; deferred.
