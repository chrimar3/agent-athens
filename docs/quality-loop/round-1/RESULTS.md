# Loop round 1 — results (2026-09-23)

Same rubric, same three-judge protocol; judges did not see round-0 scores.
Evidence: `judge-A.json`, `judge-B.json`, `judge-C.json`.

| Aspect | Round 0 | Round 1 (A, B, C) | Median |
|---|---|---|---|
| Data accuracy | 3 | 5, 4, 4 | **4** ▲ |
| Coverage & freshness | 4 | 4, 4, 3 | **4** |
| Content quality | 4 | 4, 5, 5 | **5** ▲ |
| Discovery & information architecture | 6 | 6, 6, 6 | **6** |
| Event page & action layer | 6 | 7, 6, 6 | **6** |
| Visual design & brand | 6 | 6, 7, 7 | **7** ▲ |
| Mobile experience | 6 | 7, 6, 7 | **7** ▲ |
| Accessibility | 6 | 8, 7, 7 | **7** ▲ |
| Performance | 7 | 7, 7, 6 | **7** |
| Search & AI citability | 5 | 6, 6, 6 | **6** ▲ |
| Internationalisation | 4 | 5, 5, 4 | **5** ▲ |
| Code quality & architecture | 6 | 6, 6, 6 | **6** |
| Testing & verification | 6 | 7, 6, 6 | **6** |
| Operations & reliability | 6 | 5, 5, 5 | **5** ▼ |
| Measurement | 3 | 3, 4, 3 | **3** |
| Documentation & institutional memory | 5 | 6, 6, 5 | **6** ▲ |

Mean of medians 5.19 → 5.62. Eight aspects up, seven level, one down.
Operations fell because judges traced deploy gaps (four of seven days
undeployed; dirty-tree refusals; a silent mid-run stop on 18 Sep) — none
caused by round 1, but round 1's uncommitted source changes will themselves
trip the deploy gate ("source scope clean") until committed.

## What now caps the scores (all three judges)

| Blocker | Aspects | Needs |
|---|---|---|
| megaron.gr rows still carry invented 20:30 (fix prepared, unapplied) | Data, Event page, Search | User approval to run `fix-megaron-default-times.ts --apply` |
| "Άλσος" resolves to Pedion Areos for Nea Smyrni concerts; ~240 events hidden at real but unverified venues; a Livadeia and a Larisa event published as Athens | Data, Coverage | `config/athens-venues.json` is protected |
| A0 enrichment concerns hide 193 whole events instead of just the description | Coverage, Content | Policy decision |
| 231 of 354 pages have no description; Greek pages show English prose | Content, i18n | Enrichment capacity; Greek enrichment is an INTENT non-goal |
| Citation/crawler sensors null; counts disagree across reports | Measurement | Credentials / log drain; `netlify.toml` protected |
| CI skips `src/` tests; pipeline logs success on failed stages; deploys from a dirty working tree | Testing, Operations | `.github/**`, `package.json`, `daily-automated.sh`, `deploy-gate.sh` protected |
| Exhibitions with no end date shown "open" after closing ("Μαζί, Ορατές") | Data | Code (next round) |
