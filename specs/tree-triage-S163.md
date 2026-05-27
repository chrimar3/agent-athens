# Working-Tree Triage — S163

**Filed:** 2026-05-27 (Session 163)
**Status:** Test loop closed + tree classified. **NO files discarded** — awaiting per-item go-ahead.

---

## Step 1 — Test loop (verified the negative)

The lone full-suite failure is `tests/build/en-cornerstone-presence.test.ts > dist/en/exhibitions/index.html exists`.

- Procedure: `git stash push -m loop-check` (stashed the 2 tracked data-file changes) → `bun test tests/build/en-cornerstone-presence.test.ts` on the clean base → `git stash pop` (clean, no conflict; stack restored to the original 2 stashes).
- Result on clean base: **3 pass (tomorrow, this-week, next-month) / 1 FAIL (exhibitions)** → **genuinely pre-existing.**
- Why it cannot be from S162: the test is a pure `existsSync("dist/en/exhibitions/index.html")` check (build-output presence); S162 changed only `src/validators/scope-filter.ts` (ingestion). Already documented in known-issues since S158.
- Logged: one-line confirmation appended to the existing "🟡 EN cornerstone hubs missing from build" entry in `docs/known-issues.md`.

## Step 2 — Inventory (read-only)

- **Tracked, modified (2):** `data/event-set-hashes.json`, `data/venues-master.json`.
- **Staged:** none.
- **Untracked (19):** `data/search-visibility-log.csv.pre-s136-backup`; `static/root-files/cv.pdf`; `tests/build/category-nav-readability.test.ts`; 16 `specs/*.md` (listed below).
- **Stashes (2, pre-existing — DO NOT touch):** `stash@{0}` session-wip-pre-schema-deploy-2026-05-25-batch2; `stash@{1}` session-wip-pre-schema-deploy-2026-05-25.
- **Gitignored (not in scope):** `data/events.db`.

## Step 3 — Classification (KEEP / DISCARD / UNCLEAR / LEAVE)

### KEEP (search-bar / filter-chip / colophon) — **NONE in the tree**
No uncommitted search-bar/filter-chip/colophon source changes exist. That work was recovered from stash and **committed in S160 (`bb96a3808`)** — it is safely in history, not at risk here. Nothing to preserve.

### DISCARD candidates (confirm per-item before acting)
| Path | What it is | Note |
|------|-----------|------|
| `data/event-set-hashes.json` | Auto-generated build cache; diff is **only a `generatedAt` timestamp** (08:25→10:17). | Safe to discard — regenerated on next build. Zero semantic content. |
| `data/venues-master.json` | One auto-geocoded venue added: **"Architecture"** (empty name_en/neighborhood, addr "Alopekis 11", Google geocode 2026-05-27, high conf). | Un-vetted (flagged across S116/S161). The bare name "Architecture" may itself be a scraper-chrome artifact. Discarding loses a real geocode — your call. |

### LEAVE UNTOUCHED (collaborators' — not ours)
`specs/clubber-fix-spec-2026-05-27.md`, `specs/cometogether-source-survey-2026-05-27.md`, `specs/calendar-disclosure-recon.md`, `specs/calendar-emission-recon.md`, `specs/calendar-smoothness-recon.md`.

### UNCLEAR (do NOT act — your decision)
- `static/root-files/cv.pdf` — possibly intentional colophon/"About" asset; **lean keep**, do not discard.
- `tests/build/category-nav-readability.test.ts` — a real-looking test (referenced in S160); likely should be **committed**, not discarded.
- `data/search-visibility-log.csv.pre-s136-backup` — a pre-S136 backup file.
- 11 diagnostic specs from prior sessions (provenance unconfirmed — could be yours or collaborators'): `component-b-diagnostic.md`, `exhibition-save-gap-2026-05-27.md`, `gsc-bing-checkpoint.md`, `gsc-bing-diagnostic.md`, `gsc-defects-post-s141-status.md`, `location-diagnostic.md`, `missing-location-diagnostic.md`, `mobile-scroll-diagnosis-2026-05-14.md`, `save-drop-flood-schema-checkpoint.md`, `scraping-audit-2026-05-26.md`, `silent-drop-trace-2026-05-14.md`, `silent-drop-trace-branches.md`. Several look like institutional record that should be committed rather than discarded.

## Awaiting go-ahead
Confirm per item (or per bucket). Discards will be by **explicit path** (`git checkout -- <path>` for the 2 tracked data files; `rm <path>` for any untracked you choose to drop). No `git checkout -- .`, no `git clean`, no blanket stash drop. The 2 pre-existing stashes stay untouched.
