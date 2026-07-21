# Rollback runbook — Greek slug migration (2026-07-21)

The migration renamed 1,058 Greek event URLs (`/events/9811f812--/` →
`/events/9811f812-kpisn-…/`) and emits a forced `301!` from each old URL to its
new one. If something goes wrong in production, here are three rollback tiers,
fastest first.

## Tier 1 — instant, no rebuild (emergency)

Redeploy the last known-good deploy (the one before the migration) from Netlify.
The deploy gate deliberately does **not** gate rollback, so this stays fast.

- Netlify dashboard → Deploys → pick the pre-migration deploy → **Publish deploy**, or
- `netlify rollback` (verify against the dashboard first).

Reverts the **entire** deploy, not just the slug change. Use when you need
production restored *now* and will diagnose afterward.

## Tier 2 — controlled, reverts only the migration (tested)

A kill switch on the transliteration, verified at build scale:

```bash
SLUG_TRANSLITERATE=0 bun run src/generate-site.ts   # rebuild with slugs reverted
bash scripts/deploy-gate.sh && netlify deploy --prod --no-build --dir=dist
```

With the flag off, `generateEventSlug` reproduces the pre-migration slug
(`${idPrefix}--`), and the slug-history seam emits **forced reverse 301s**
(new → old). Net effect: old URLs serve again, new URLs 301 back to them — a
clean reversal with no code change. Proven: a flag-off build regenerates
`dist/events/9811f812--` and `/events/9811f812-kpisn-…/* … /events/9811f812--/ 301!`.

To make the reverted state persist across the **automated** 08:00 pipeline, add
`SLUG_TRANSLITERATE=0` to the `EnvironmentVariables` of
`~/Library/LaunchAgents/com.agentathens.daily.plist` (installed copy — see
`docs/LAUNCHD-SETUP.md`), then `launchctl unload/load` it. Remove the var to
re-enable.

Default (flag unset) = transliteration ON, so normal builds keep shipping the
migration.

## Tier 3 — permanent (code revert)

If the approach is abandoned rather than paused:

```bash
git revert f1c6ecb94   # "feat(slugs): transliterate Greek event slugs + force the migration redirects"
```

Then rebuild + redeploy. Leaves the reverse-301 history behind as Tier 2 does.

## Notes

- **Redirects are forced (`301!`)** so a lingering `dist/events/{oldSlug}/` dir
  can't shadow the rule — reversal works the same way in both directions.
- The 8-char id prefix is stable across the flip, so every old↔new pair shares
  its prefix; no URL is orphaned.
- `_redirects` grows by the migration's redirects (~5.4k lines, ~4.6k under
  Netlify's ~10k ceiling); a reverse migration replaces forward rules with
  reverse ones, so the count stays bounded.
