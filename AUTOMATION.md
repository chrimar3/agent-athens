# Agent Athens - Hybrid Automation Setup

## Overview

Agent Athens uses a **hybrid automation approach** that balances efficiency with quality control:

- **Automated**: Data collection (web scraping + email fetching)
- **Manual**: AI parsing, review, and deployment

This approach provides the best of both worlds:
- 90% hands-off operation
- 10-15 minutes daily human oversight
- Free AI parsing with `tool_agent` (vs $3-15/day API costs)
- Quality control and error prevention

---

## How It Works

### 1. Automated Data Collection (8:00 AM Daily)

The Mac runs `/scripts/daily-update.sh` automatically via launchd:

```bash
# What it does:
1. Fetches emails from Gmail (venue newsletters)
2. Scrapes configured websites (viva.gr, more.com, gazarte.gr, etc.)
3. Cleans up old events (7-day retention)
4. Saves data to:
   - data/emails-to-parse/
   - data/html-to-parse/
5. Sends Mac notification: "Data collection complete!"
```

**No user action required** - this runs while you're having coffee ☕

---

### 2. Manual Review & Processing (10-15 minutes)

When you see the notification, open Claude Code and say:

```
"continue" or "parse today's data"
```

Claude will:
1. Parse emails with AI (using free `tool_agent`)
2. Extract events from HTML
3. Show you a summary
4. Ask if you want to deploy

You review the summary (2 minutes) and say:
- "looks good, deploy" → Claude builds, commits, pushes to Netlify
- "wait, let me check X" → You can review specific events

**Total time: 10-15 minutes**

---

## Setup Instructions

### 1. Verify launchd Configuration

Check if the automation is loaded:
```bash
launchctl list | grep agent-athens
```

Should show: `com.user.agent-athens`

### 2. Manual Test

Run the script manually to verify it works:
```bash
cd /Users/chrism/Project\ with\ Claude/AgentAthens/agent-athens
./scripts/daily-update.sh
```

You should see:
- Email fetching progress
- Website scraping progress
- Files saved to `data/`
- Mac notification appears

### 3. Check Logs

View automation logs:
```bash
tail -f logs/launchd.log
tail -f logs/launchd.error.log
```

### 4. Troubleshooting

**Notification not appearing?**
- Check System Preferences → Notifications → Script Editor
- Enable notifications for Terminal/Script Editor

**Scraping fails?**
- Check internet connection
- Review `logs/launchd.error.log`
- Some sites might be temporarily down (normal)

**No new data?**
- Sites respect crawl frequency (some are weekly/monthly)
- Use `--force` flag to override: `python3 scripts/scrape-all-sites.py --force`

---

## Daily Workflow

### Morning (Automated)
- 8:00 AM - Mac runs `daily-update.sh`
- 8:05 AM - You get notification: "Data collection complete!"

### When Ready (Manual - 10-15 min)
1. Open Claude Code
2. Say "continue" or "parse today's data"
3. Review Claude's summary (2 min)
4. Say "looks good, deploy"
5. Done! Site updates in ~2 minutes

### Optional: Add Pricing
If new events need prices:
```bash
python3 scripts/fetch-prices.py
```
Currently at 95% automated price coverage.

---

## Database Cleanup Strategy

Agent Athens uses a **two-stage cleanup approach**:

### Stage 1: Daily Automation (Gentle)
- **When**: 8:00 AM daily (automated)
- **Retention**: 7 days
- **Purpose**: Keep recent history for reference/debugging
- **What it does**: Deletes events ended more than 7 days ago

### Stage 2: Site Generation (Aggressive)
- **When**: During `bun run build` (manual)
- **Retention**: 1 day
- **Purpose**: Ensure public site only shows current/upcoming events
- **What it does**: Deletes events ended more than 1 day ago

### Why Two Stages?

**Database (7-day retention):**
- Keeps last week's events for your reference
- Allows debugging recent data issues
- Maintains historical context

**Public Site (1-day retention):**
- Only shows truly current/upcoming events
- Signals freshness to AI engines
- Prevents displaying "just ended" events

**In Practice:**
```
Oct 19-26: Events kept in database (for your reference)
Oct 25-26: Events kept in database but filtered from public site
Oct 27+:   Upcoming events shown on both database and site
```

This gives you the **best of both worlds**: historical data for analysis, but a fresh public-facing site.

---

## What's Automated vs Manual

### ✅ Automated (Zero User Time)
- Fetching emails from Gmail
- Scraping websites (respects frequency)
- Cleaning up old events (7-day retention)
- Saving raw data to filesystem
- Sending notification when ready

### 👤 Manual (Quality Control)
- AI parsing with `tool_agent` (requires Claude Code interaction)
- Reviewing extracted events
- Deciding when to deploy
- Handling edge cases

---

## Why This Approach?

### Why Not Fully Automated?

We considered full automation but chose hybrid for these reasons:

1. **Cost**: `tool_agent` is FREE, Anthropic API costs $3-15/day
2. **Quality**: Human verification prevents wrong dates, prices, venues
3. **Flexibility**: You can skip a day without issues
4. **Error handling**: Scraping failures don't auto-publish bad data
5. **Control**: Emergency stop capability if something's wrong

### Benefits of Hybrid

- **90% automated** - Data collection happens while you sleep
- **10 minutes daily** - Quick review and deploy
- **Zero API costs** - Uses free `tool_agent`
- **High quality** - Human oversight on AI parsing
- **Flexible** - Deploy when you're ready, not on a rigid schedule

---

## Files Involved

```
scripts/
  daily-update.sh           # Main automation script (runs at 8 AM)
  scrape-all-sites.py       # Web scraping
  fetch-prices.py           # Price extraction (optional, run manually)
  cleanup-old-events.ts     # Database cleanup (7-day retention)

src/ingest/
  email-ingestion.ts        # Gmail IMAP fetching

~/Library/LaunchAgents/
  com.user.agent-athens.plist  # Mac automation config

data/
  emails-to-parse/          # Fetched emails (waiting for Claude)
  html-to-parse/            # Scraped HTML (waiting for Claude)
  crawl-tracker.json        # Tracks last crawl times
  events.db                 # SQLite database
```

---

## Configuration

### Email Settings (.env)
```bash
EMAIL_USER=yourname.athens.events@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

### Scraping Config (config/scrape-list.json)
- 16 venues configured
- 3,600 expected events/month
- Respects crawl frequency (daily/weekly/monthly)

### Schedule (launchd plist)
- Runs daily at 8:00 AM
- Logs to: `logs/launchd.log`
- Can be changed in plist file

---

## Stats

- **Events in database**: 1,972 total, 1,474 upcoming
- **Price coverage**: 95% automated (1,412/1,474 events)
- **Static pages**: 336 generated
- **Sources**: viva.gr (711), more.com (744), gazarte.gr (19)
- **Deployment**: Auto-deploy on git push via Netlify

---

## Next Steps

### Optional Enhancements

1. **Database deduplication** (Priority 2 from CLAUDE.md)
   - Implement hash-based event IDs
   - Upsert logic (INSERT new, UPDATE existing)

2. **AI enrichment**
   - Generate 400-word descriptions for events
   - Already has script: `scripts/enrich-events.ts`

3. **Monitoring**
   - Track scraping success rates
   - Alert on unusual patterns

---

## Support

**Issues?**
- Check `logs/launchd.error.log`
- Review `data/crawl-tracker.json`
- Run script manually for debugging

**Changes needed?**
- Edit `scripts/daily-update.sh` for workflow changes
- Edit `com.user.agent-athens.plist` for schedule changes
- Reload launchd: `launchctl unload ~/Library/LaunchAgents/com.user.agent-athens.plist && launchctl load ~/Library/LaunchAgents/com.user.agent-athens.plist`

---

**Last Updated**: October 26, 2025
**Status**: Production - Running daily at 8:00 AM
