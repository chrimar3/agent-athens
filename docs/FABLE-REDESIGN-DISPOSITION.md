# fable-redesign — disposition (2026-07-21)

Resolves the stranded `fable-redesign` branch (9 commits, parked 2026-07-06, worktree `agent-athens-fable`). It was never merged into `main` and had drifted ~2 weeks against files `redesign/visual-loop-*` rewrote after it. Rather than merge the branch (a rebase against moving files, behind an expired slug-cutover safety proof), each deliverable was assessed independently. Salvaged work was **re-implemented natively on `main`**, not cherry-picked.

## Salvaged (re-implemented on main, verified)

| Deliverable | How it landed |
|---|---|
| **Greek slug transliteration** | Re-implemented in `src/generators/event-page.ts` using the contract-stable `transliterateGreekId` **already on main** (the branch didn't own the primitive — it only wired it behind a `created_at >= 2026-07-07` cutover, now moot). Uses an empty-fallback (`slugify(x) \|\| transliterate(x)`) so Latin URLs stay byte-identical — 1,058 defective Greek URLs fixed, zero good URLs churned. |
| **Redirect effectiveness** | Not on the branch — surfaced during verification: slug-change 301s were non-forced and would be shadowed by lingering old dirs. Fixed to `301!` in `generateRedirects`, matching the existing `410!` pattern. |
| **WCAG duplicate-id a11y fix** | `uniquifySvgIds` re-implemented in `src/generators/event-tile.ts`; Satori tile SVG ids now suffixed per event. Verified in emitted HTML (`satori_bc-id-<eventid>`). |

## Dropped (retired, not re-landed)

Cosmetic/structural, not citability, and heavily drifted against shipped `visual-loop`:

- Design-system v2 semantic token layer
- IA: capsule collapse, running lane, table-in-grid ordering, locale toggle
- EDP past-state pill + calendar collapse
- Venue data-gated photo/description slots (F14) — shipped inert; 0 venues populated
- `CLAUDE.fable.md` proposal — never loaded by any tooling (Claude Code reads `CLAUDE.md` / `.claude/CLAUDE.md`)

These can be re-derived later if the design direction is revived. Nothing here blocks citability or reliability.

## Branch handling

The `fable-redesign` branch and its worktree are now **superseded** — do not merge them; the valuable parts live on `main` (uncommitted at time of writing, pending review of the URL migration). Physical deletion of the branch/worktree is left to the operator (it holds the only copy of the dropped commits and the untracked `prototypes/` reference assets). Recommend deleting once the operator confirms the dropped work is genuinely unwanted.

See `docs/AUDIT-2026-07-19-LEVERAGE.md` for the original per-deliverable assessment.
