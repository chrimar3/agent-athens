# Mac Automation for Agent Athens Enrichment

## 🍎 What's Automated

Your Mac automatically:
1. **Checks daily at 9 AM** for unenriched events
2. **Creates a report** on your Desktop with event counts and samples
3. **Sends a notification** if ≥5 events need enrichment
4. **Reminds you** to open Claude Code and enrich events

## 🔧 Installation

### One-time setup:

```bash
# Copy plist to LaunchAgents
cp com.agentathens.enrichment-check.plist ~/Library/LaunchAgents/

# Load the job
launchctl load ~/Library/LaunchAgents/com.agentathens.enrichment-check.plist

# Verify it's loaded
launchctl list | grep agentathens
```

You should see:
```
-       0       com.agentathens.enrichment-check
```

## 🔄 The Workflow

### Automated Part (Mac):
- ✅ Daily check at 9:00 AM via launchd
- ✅ Count unenriched events
- ✅ Generate report with event samples
- ✅ Notify you via macOS notification

### Manual Part (You + Claude Code):
- 👤 You see notification/report
- 👤 You open Claude Code in this project
- 👤 You say: **"Enrich 10 events"**
- 🤖 Claude uses the enrichment workflow (see docs/MASTER-ENRICHMENT-TEMPLATE.md)
- 🤖 Generates high-quality 400-600 word descriptions
- ✅ Done in ~5 minutes!

## 📋 Quick Commands

### Check status now:
```bash
./scripts/daily-enrichment-check.sh
```

### View automation logs:
```bash
tail -f logs/enrichment-check.log
```

### Verify launchd is running:
```bash
launchctl list | grep agentathens
```

### Run immediately (for testing):
```bash
launchctl start com.agentathens.enrichment-check
```

### Disable automation:
```bash
launchctl unload ~/Library/LaunchAgents/com.agentathens.enrichment-check.plist
```

### Re-enable automation:
```bash
launchctl load ~/Library/LaunchAgents/com.agentathens.enrichment-check.plist
```

## 🎯 Daily Routine

1. **9 AM**: Your Mac checks for unenriched events
2. **You get notified**: macOS notification + Desktop report
3. **Open Claude Code**: When you have 5 minutes
4. **Say**: "Enrich 10 events"
5. **Wait**: ~5 minutes for high-quality descriptions
6. **Done!**: Events are enriched and ready

### Example Requests to Claude Code:
```
Enrich 10 events
```
```
bun run scripts/run-enrichment-pipeline.ts
```

## 📊 Current Status

Check the Desktop report (`~/Desktop/enrichment-report-YYYYMMDD.txt`) for:
- Total unenriched events
- Sample events needing work
- Estimated batches remaining
- Time estimate (~5 min per batch of 10)

Or run:
```bash
bun run scripts/list-unenriched.ts
```

## 🔧 Files

| File | Purpose |
|------|---------|
| `scripts/daily-enrichment-check.sh` | The check script |
| `com.agentathens.enrichment-check.plist` | launchd config (copy to ~/Library/LaunchAgents/) |
| `logs/enrichment-check.log` | Automation logs |
| `~/Desktop/enrichment-report-*.txt` | Daily reports |

## 💡 Why This Approach?

**Can't automate**: AI enrichment (requires Claude Code session with tool_agent)
**Can automate**: Everything else (checks, reports, notifications)

**Result**: You get reminded daily, then spend 5 minutes with Claude Code to enrich events. This ensures high-quality descriptions without API costs.

## ✅ Benefits

- ✅ **FREE** - No API costs (uses Claude Max subscription)
- ✅ **High Quality** - 400-600 word descriptions with cultural context
- ✅ **Reliable** - No rate limits or API errors
- ✅ **Flexible** - You control the pace
- ✅ **Automated reminders** - Never forget to enrich
- ✅ **SEO/GEO optimized** - Rich descriptions for AI answer engines

## 🔗 Related

- `docs/LAUNCHD-SETUP.md` - Main daily pipeline (8 AM scraping)
- `docs/MASTER-ENRICHMENT-TEMPLATE.md` - Enrichment writing style
- `docs/CLAUDE-SESSION-GUIDE.md` - Claude Code workflow

---

**Schedule:**
- **8 AM**: Automated scraping pipeline runs
- **9 AM**: Enrichment check runs, notifies you
- **When convenient**: You enrich events in Claude Code
