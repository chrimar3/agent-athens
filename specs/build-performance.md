# Build Performance Analysis (S68)

## Diagnosis

The reported "4.4x build time regression" is a **cold-cache artifact**, not a real regression.

### Evidence

| Build type | Time | OG cache |
|------------|------|----------|
| Warm (incremental) | 5-9s | `dist/.og-cache.json` present |
| Cold (`rm -rf dist`) | 34-36s | Cache destroyed, 209 OG images regenerated |
| Mar 6 cold (513 events) | 49-50s | Same pattern, more events |

### Root cause

OG cache lives at `dist/.og-cache.json`. Running `rm -rf dist` before build destroys it, forcing full OG regeneration (~25-28s overhead).

### No action needed

- Normal daily builds (Netlify CI) are incremental: 5-9s
- `rm -rf dist` is only used in local dev for clean builds
- The overflow pages (12 total) add <0.5s — negligible

### Future consideration

If cold builds become a bottleneck, move OG cache to `.og-cache.json` (project root, outside dist/). Low priority — current warm build time is well within tolerance.
