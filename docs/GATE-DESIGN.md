# Gate Design — Enrichment Quality Architecture

## 1. Existing Architecture

```
auto-gate-check.ts (CLI)
  → imports → quality-gates.ts (library)
  → imports → description-generator.ts (TAG_TAXONOMY, FILLER_PHRASES)
  → imports → word-counter.ts (countWords)
```

**auto-gate-check.ts** (CLI wrapper):
- Parses CLI args: file path, --tier, --event-id
- Reads description file from disk
- Optionally loads event context from DB
- Runs `validateQualityGates()` from quality-gates.ts
- Adds v4 checks (hashtags-in-prose, metadata-in-prose)
- Outputs formatted report with layer scores
- Exit code: 0 = PASS, 1 = FAIL

**quality-gates.ts** (library, ~900 lines):
- Three-layer validation model:
  - Schema Layer (25 pts): JSON-LD validity, correct types
  - 5-Question Layer (40 pts): Information completeness (What/Why now/Experience/Practical/Differentiation)
  - Resonance Layer (35 pts): Sensory language, "you" presence, filler detection, filter section
- Generic content detection (title/venue reference, lazy adjectives, sensory check)
- Technical validation (word count, required sections, table check, tag validation)
- Pass threshold: score >= 60, 0 errors

## 2. Mechanical vs Subjective Split

| Check | Type | Source | Auto-checkable? |
|-------|------|--------|-----------------|
| Word count (250-450 premium) | Mechanical | quality-gates.ts `validateTechnical` | Yes |
| Banned words (FILLER_PHRASES) | Mechanical | quality-gates.ts `validateResonanceLayer` | Yes |
| Lazy adjectives (LAZY_ADJECTIVES) | Mechanical | quality-gates.ts `detectGenericContent` | Yes |
| "you" presence (second person) | Mechanical | quality-gates.ts `validateResonanceLayer` | Yes |
| Details table presence (pipe chars) | Mechanical | quality-gates.ts `validateTechnical` | Yes |
| Filter section ("if you") | Mechanical | quality-gates.ts `validateResonanceLayer` | Yes |
| Hashtags in prose | Mechanical | auto-gate-check.ts `runV4Checks` | Yes |
| "Last verified" in prose | Mechanical | auto-gate-check.ts `runV4Checks` | Yes |
| Multiple tables (>1 separator) | Mechanical | quality-gates.ts `validateTechnical` | Yes |
| Event/artist name referenced | Semi-mechanical | quality-gates.ts `detectGenericContent` | Yes (keyword match) |
| Venue name referenced | Semi-mechanical | quality-gates.ts `detectGenericContent` | Yes (keyword match) |
| Timeliness markers present | Semi-mechanical | quality-gates.ts `validateFiveQuestionLayer` | Yes (keyword list) |
| Sensory language quality | **Subjective** | Human review | No — keywords can't assess quality |
| Factual accuracy | **Subjective** | Human review | No — requires source verification |
| Tribe section quality | **Subjective** | Human review | No — character vs demographics is nuanced |
| Opening sensory quality | **Subjective** | Human review | No — "no facts in opening" is checked, but quality isn't |
| Citability (2+ standalone sentences) | **Subjective** | Human review | No — requires judgment |

## 3. Calibration-Phase Thresholds (first 3-5 batches — CONSERVATIVE)

During calibration:

- **ALL descriptions** → `temp-descriptions/` for human review
- **No auto-save** during calibration phase
- Gate score recorded in batch review file for tracking
- Human reviews every description, records verdict in `temp-descriptions/calibration-log.md`

Purpose: Build confidence that subagent output matches human quality standards before automating saves.

## 4. Steady-State Thresholds (activate after calibration proves quality)

| Gate Score | Errors | Action |
|-----------|--------|--------|
| >= 80 | 0 | Eligible for auto-save (human enables per batch) |
| 60-79 | 0 | Human review required |
| < 60 | any | Subagent retries (max 2 attempts), then flagged for human |
| any | > 0 | Subagent retries (max 2), then flagged |

Auto-save is not automatic even in steady state — human explicitly triggers `save-batch.ts` after reviewing the batch summary.

## 5. Transition Criteria

Auto-save eligible when ALL of:
- 3+ consecutive batches where >= 80% of descriptions are approved without major rewrite
- No factual accuracy issues found in any batch
- Gate scores correlate with human quality assessment (score >= 80 reliably means "good")

Transition is explicitly announced by human, not automatic.

## 6. Score Interpretation Notes

Current gold-standard exemplars score 84-85/100. The warnings that cause score deductions are mostly about sections rendered by the site template (Schema.org, practical block, tags, last verified) — not narrative quality issues.

For subagent output, focus on:
- **Errors = 0** is non-negotiable
- **Warnings**: TOO_LONG is acceptable up to 600 words; MISSING_SECTION warnings for premium sections are expected
- **Score 80+** with 0 errors = likely good narrative quality
- **Score 60-79** = review needed, may have structural issues
