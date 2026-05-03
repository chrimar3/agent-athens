# ARIA Audit — Sprint 2 Component C

Post-build CLI accessibility audit. Measurement infrastructure only — does not block the build, does not remediate findings. Sprint 3 promotes WARN→FAIL after baseline soak.

---

## Tool

**Pa11y 9.1.1** (`node_modules/.bin/pa11y`), invoked per page as a subprocess.

- Standard: WCAG 2 A + AA (default)
- Runner: HTML CodeSniffer (`htmlcs`) — Pa11y default
- Bundled Chromium via Puppeteer; no system-Chrome dependency

`@axe-core/cli` was the original choice (per pre-flight §1) but its bundled ChromeDriver is pinned to a Chrome version that drifts ahead of system Chrome. Pa11y's bundled Chromium eliminates that drift class entirely. JSON output shape differs (flat array vs. `{violations,passes,…}`); the script reshapes accordingly.

## Sampling strategy

Two modes. `bun run scripts/audit-aria.ts` for default; `--full` for exhaustive.

| Mode | Hubs | Events | English mirrors | Total |
|---|---|---|---|---|
| Default | all (~1,170) | 5 stratified per EventType (≤60) | all (~445) | ~1,680 |
| `--full` | all | every event in `dist/events/` | all | ~9,000 |

Stratification mirrors `BUCKET_ORDER` in `src/validators/completeness-reporter.ts:23`: `concert, dj_set, exhibition, cinema, theater, festival, performance, show, workshop, tech, dance, other`. Per-EventType sample lets template-systemic issues surface even if a type has only a handful of events.

Audit runs with `concurrency=4` Pa11y subprocesses. Default mode completes in roughly 8-12 minutes on the current dist; `--full` is a periodic deep-dive (≥30 min).

## Severity mapping (Sprint 2)

Pa11y emits issues with `type` ∈ `{error, warning, notice}`. The script classifies each page:

| Page state | Verdict |
|---|---|
| Zero issues | `pass` |
| Any issue with `type === 'error'` | `fail` |
| Any `warning` or `notice`, no errors | `warn` |
| Pa11y subprocess fails or returns invalid JSON | `audit_error` |

WARN-level scope: the audit measures, never blocks. `process.exit(0)` regardless of findings. `fail` and `audit_error` are surfaced in the per-page artifact and per-template aggregate counts but do not propagate exit codes. Sprint 3 promotes the gate.

## Artifact shapes

Two JSON files, both written via `writeJsonApiIfChangedSync` / `writeFileIfChangedSync` (idempotent — no-op rewrites are suppressed).

### `data/build-aria-report.json` — per-page detail

```jsonc
{
  "meta": { "lastUpdate": "2026-05-03T..." },
  "pages": [
    {
      "url": "dist/today.html",
      "template": "hub_template",
      "verdict": "pass",
      "issueCount": 0,
      "issues": []
    },
    {
      "url": "dist/events/<slug>/index.html",
      "template": "event_template",
      "verdict": "warn",
      "issueCount": 2,
      "issues": [ { "code": "WCAG2AA…", "type": "warning", … } ]
    }
  ]
}
```

Trend-tracked via git (committed alongside `data/build-completeness.json`).

### `data/build-aria-aggregate.json` — per-template aggregate

```jsonc
{
  "hub_template":   { "total": 1170, "pass": 1168, "warn": 2, "fail": 0 },
  "event_template": { "total": 505,  "pass": 503,  "warn": 2, "fail": 0 }
}
```

Consumed by `src/generate-site.ts` and passed to `buildCompletenessReport`. Mirrors the `datafeed` slot's flat shape but split per template — ARIA findings are template-systemic (one CSS/HTML pattern affects thousands of pages), so per-page aggregation would be noisy. Per-template surfaces what the team can act on. Per Strategist Q-C1 lock.

## Build pipeline

The build never depends on the audit having run. Fresh checkouts (no aggregate file yet) fall back to a zero-aggregate; `aria_level` still flips to `"measured"` structurally — the slot is wired, the data is just zero until the first audit completes.

Documented sequence to surface real numbers in `data/build-completeness.json`:

```bash
bun run src/generate-site.ts \
  && bun run scripts/audit-aria.ts \
  && bun run src/generate-site.ts
```

The double-build is awkward but defensible. Alternative (single-step shell wrapper at `scripts/build-and-audit.sh`) is deferred to Sprint 2.5+ if it becomes painful in practice.

## file:// scope reduction

Pa11y is invoked against `file://` URLs (no static server orchestration). Trade-off: CSS and JS do not load via `file://`, so the audit cannot detect:

- **Color contrast** — needs CSS to evaluate computed colors
- **JS-rendered ARIA states** — needs scripts to mutate DOM
- **Focus management dynamics** — needs JS event handlers

Pa11y's HTML CodeSniffer runner still validates static-HTML WCAG2AA: missing `alt`, unlabelled inputs, heading hierarchy, landmark roles, semantic structure. This is the right scope for Sprint 2 measurement infrastructure (template-systemic issues are mostly static-HTML issues).

If Sprint 3 WARN→FAIL promotion needs the served-URL pass for contrast / JS issues, the obvious move is a second audit mode that spins up `bun run serve` and audits via `http://localhost:…` URLs. Out of scope for Component C.

## Sprint 3 promotion path

Two gates need to flip when promoting WARN→FAIL:

1. **`scripts/audit-aria.ts`** stops `process.exit(0)` and propagates non-zero exit when `event_template.fail > 0` or `hub_template.fail > 0`. Likely a `--fail-on-error` flag for opt-in gating, then default-on once the baseline is clean.
2. **CI / build wrapper** decides whether audit failure blocks deploy. Until then, post-build audit findings live in artifacts only.

Coordination: if any pre-existing template-level issues need design work, route to Design Navigator before flipping the gate. Pre-flight §4 indicated the baseline is materially stronger than a "not_measured" layer suggests; sample audit of 8 pages (3 hubs + 5 events) found zero static-HTML violations, supporting that signal.

## Reading the artifacts

Quick triage commands:

```bash
# Aggregate at a glance
cat data/build-aria-aggregate.json | jq

# Pages that failed
cat data/build-aria-report.json | jq '.pages[] | select(.verdict == "fail")'

# Most common issue codes across all findings
cat data/build-aria-report.json \
  | jq '[.pages[].issues[].code] | group_by(.) | map({code: .[0], count: length}) | sort_by(.count) | reverse | .[0:10]'

# Audit_error pages (subprocess failures, separate from accessibility findings)
cat data/build-aria-report.json | jq '.pages[] | select(.verdict == "audit_error") | {url, errorMessage}'
```
