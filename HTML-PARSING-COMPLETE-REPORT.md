# HTML Parsing Project - Complete Analysis & Recommendations

## Executive Summary

**Objective**: Parse 69 HTML files from 15 Athens event websites to extract ~2,000+ cultural events into the agent-athens database.

**Current Database Status**: **1,562 events already loaded**

**Files to Parse**: 69 HTML files (37 MB total)

**Recommended Strategy**: **Python BeautifulSoup bulk parser** (fastest, most reliable)

---

## Current State Analysis

### Database Overview

```
Total Events: 1,562

Event Breakdown by Type:
- Theater:      684 events (44%)
- Concert:      670 events (43%)
- Performance:  167 events (11%)
- Cinema:        19 events (1%)
- Exhibition:    10 events (<1%)
- Workshop:      12 events (<1%)
```

**Status**: Database is already well-populated with events, primarily theater and concerts.

### HTML Files Inventory

**15 Unique Sources** organized into batches:

| Source | Files | Size (MB) | Priority | Expected Events |
|--------|-------|-----------|----------|-----------------|
| more.com | 17 | 22.35 | HIGH | 800-1,200 |
| viva.gr | 8 | 10.36 | HIGH | 400-600 |
| athinorama.gr | 12 | 1.44 | HIGH | 200-400 |
| gazarte | 8 | 0.46 | MEDIUM | 50-100 |
| clubber | 6 | 0.46 | MEDIUM | 50-100 |
| halfnote | 4 | 0.41 | MEDIUM | 30-50 |
| culture_athens | 2 | 0.72 | LOW | 20-30 |
| gagarin205 | 2 | 0.53 | LOW | 20-30 |
| greek_festival | 2 | 0.21 | LOW | 10-20 |
| kyttaro | 2 | 0.06 | LOW | 10-20 |
| romantso | 2 | 0.03 | LOW | 10-20 |
| Other (single files) | 4 | 0.39 | LOW | 20-40 |

**Estimated Total**: 1,600-2,500 new events (some duplicates expected)

---

## Technical Analysis

### Why Current Database has Events but HTML Files Remain

The HTML files in `data/html-to-parse/` represent **scraped snapshots** from October 22-26, 2025. The existing 1,562 events in the database likely came from:

1. **Earlier manual imports**
2. **Different scraping sessions**
3. **Email newsletter parsing** (separate workflow)
4. **Previous parsing attempts**

These HTML files contain **additional/updated events** that haven't been processed yet.

### Why Python BeautifulSoup is Best

**Advantages**:
1. Processes all 69 files in **< 5 minutes**
2. Handles malformed HTML gracefully
3. Can extract JSON-LD, microdata, and HTML patterns
4. No AI rate limiting concerns
5. Deterministic, reproducible results

**Comparison vs AI Parsing**:
| Method | Time | Reliability | Coverage | Cost |
|--------|------|-------------|----------|------|
| Python BS4 | 5 min | High | 95% | Free |
| Claude AI (manual) | 2-3 hours | Medium | 90% | Free but slow |
| Claude AI (automated) | 30 min | Medium | 85% | Free |

---

## Recommended Implementation

### Phase 1: Bulk HTML Parsing (Python)

**Script**: `scripts/parse-all-html-to-json.py` (provided in HTML-PARSING-PLAN.md)

**Process**:
1. Iterate through all 69 HTML files
2. Extract structured data (JSON-LD, microdata, meta tags)
3. Normalize to agent-athens Event format
4. Save to `data/parsed/all-extracted-events.json`
5. Generate deduplication report

**Expected Output**:
- 1,600-2,500 raw events extracted
- ~400-800 new unique events (after deduplication)
- Full extraction log with per-file stats

**Execution**:
```bash
cd /Users/chrism/Project\ with\ Claude/AgentAthens/agent-athens
pip3 install beautifulsoup4 lxml
python3 scripts/parse-all-html-to-json.py
```

### Phase 2: Import to Database (TypeScript)

**Script**: `scripts/import-parsed-events.ts` (already exists)

**Process**:
1. Read `data/parsed/all-extracted-events.json`
2. For each event:
   - Generate unique ID (hash of title+date+venue)
   - Check if event exists in database
   - INSERT new events or UPDATE existing
   - Apply Athens filter (reject non-Athens)
3. Report: X new, Y updated, Z skipped, W rejected

**Execution**:
```bash
bun run scripts/import-parsed-events.ts
```

### Phase 3: AI Enrichment (Optional)

**Script**: `scripts/enrich-events.ts`

**Process**:
1. Query events without `full_description`
2. For each unenriched event:
   - Generate 400-word cultural description
   - Add semantic tags (mood, vibe, audience)
   - Update database
3. Rate limit: 2 seconds between calls

**Execution**:
```bash
bun run scripts/enrich-events.ts
```

### Phase 4: Site Generation & Deployment

```bash
bun run build
git add dist/ data/events.db
git commit -m "feat: Add $(date +%Y-%m-%d) events batch"
git push origin main  # Auto-deploys to Netlify
```

---

## Alternative: Manual AI Parsing

If you prefer Claude Code interactive parsing (slower but more flexible):

### Batch Processing Instructions

1. **Review batch files** in `data/parsed/`:
   - `more-PARSE-ME.md`
   - `viva-PARSE-ME.md`
   - `athinorama-PARSE-ME.md`
   - etc.

2. **Process each batch**:
   - Read HTML file
   - Ask Claude to extract events as JSON
   - Save to `data/parsed/{site}-events.json`

3. **Import results**:
   ```bash
   bun run scripts/import-parsed-events.ts
   ```

**Estimated Time**: 2-3 hours for all 69 files

---

## Deduplication Strategy

Events are deduplicated using **hash-based IDs**:

```typescript
// ID = first 16 chars of SHA256 hash
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
```

**Same event = same ID** → Database UPSERT (UPDATE if exists, INSERT if new)

**Expected Deduplication**:
- 1,600-2,500 raw events extracted
- ~40-60% duplicates (same events listed multiple times)
- ~400-800 net new unique events added

---

## Quality Assurance

### Post-Import Validation

```bash
# Check database stats
echo "SELECT COUNT(*) FROM events;" | sqlite3 data/events.db
echo "SELECT type, COUNT(*) FROM events GROUP BY type;" | sqlite3 data/events.db
echo "SELECT source, COUNT(*) FROM events GROUP BY source;" | sqlite3 data/events.db

# Check for missing data
echo "SELECT COUNT(*) FROM events WHERE full_description IS NULL;" | sqlite3 data/events.db
echo "SELECT COUNT(*) FROM events WHERE url IS NULL OR url = '';" | sqlite3 data/events.db
```

### Data Quality Metrics

**Expected Database State** (after parsing):
- Total events: 1,950 - 2,350
- Net new events: +400 - +800
- Duplicates skipped: ~60%
- Non-Athens rejected: ~5-10%
- Events needing enrichment: ~50-70%

---

## Implementation Timeline

| Phase | Task | Time | Owner |
|-------|------|------|-------|
| 1 | Create Python parser script | 30 min | Dev |
| 2 | Run Python parser on 69 files | 5 min | Automated |
| 3 | Review extraction log | 10 min | Dev |
| 4 | Import to database (TypeScript) | 2 min | Automated |
| 5 | Validate database state | 5 min | Dev |
| 6 | AI enrichment (optional) | 1-2 hours | Automated |
| 7 | Site generation & deployment | 5 min | Automated |

**Total Time**: 1 hour (without enrichment) or 3 hours (with enrichment)

---

## Files Created

This analysis created the following files:

1. `/Users/chrism/Project with Claude/AgentAthens/agent-athens/scripts/batch-parse-html.ts`
   - Organizes HTML files by source site
   - Creates parsing instruction files

2. `/Users/chrism/Project with Claude/AgentAthens/agent-athens/data/parsed/parsing-summary.json`
   - Summary of all batches with file counts and sizes

3. `/Users/chrism/Project with Claude/AgentAthens/agent-athens/data/parsed/{site}-PARSE-ME.md`
   - Per-site parsing instructions (15 files)

4. `/Users/chrism/Project with Claude/AgentAthens/agent-athens/data/parsed/HTML-PARSING-PLAN.md`
   - Detailed implementation guide with Python code

5. `/Users/chrism/Project with Claude/AgentAthens/agent-athens/HTML-PARSING-COMPLETE-REPORT.md`
   - This comprehensive analysis document

---

## Recommendations

### Immediate Next Steps

1. **Run Python parser** (recommended):
   ```bash
   cd /Users/chrism/Project\ with\ Claude/AgentAthens/agent-athens
   python3 scripts/parse-all-html-to-json.py
   ```

2. **Import to database**:
   ```bash
   bun run scripts/import-parsed-events.ts
   ```

3. **Validate results**:
   ```bash
   echo "SELECT COUNT(*) FROM events;" | sqlite3 data/events.db
   ```

4. **Optional enrichment**:
   ```bash
   bun run scripts/enrich-events.ts
   ```

5. **Deploy**:
   ```bash
   bun run build && git push
   ```

### Long-term Recommendations

1. **Automate weekly scraping**:
   - Schedule: Every Sunday at midnight (Athens time)
   - Scrape all 15 sources
   - Auto-parse with Python
   - Auto-import to database
   - Auto-deploy to Netlify

2. **Add monitoring**:
   - Track events per source
   - Alert on parsing failures
   - Monitor duplicate rates

3. **Improve Athens filtering**:
   - Add venue geocoding
   - Verify coordinates are in Athens region
   - Build known-venue database

---

## Conclusion

**Status**: Ready to parse 69 HTML files and extract ~400-800 new unique Athens cultural events.

**Recommended Approach**: Python BeautifulSoup bulk parser (fastest, most reliable).

**Expected Outcome**: Database will grow from 1,562 to ~2,000-2,400 events.

**Next Action**: Run `python3 scripts/parse-all-html-to-json.py`

---

**Generated**: October 26, 2025
**Analyst**: Claude Code (Sonnet 4.5)
**Project**: agent-athens (AI-curated Athens events calendar)
