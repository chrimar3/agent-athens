#!/usr/bin/env bun

/**
 * Click Analytics Dashboard
 *
 * Analyzes click data from Netlify Blobs to generate reports.
 *
 * Usage:
 *   - Local with Netlify CLI: `netlify dev --exec "bun run scripts/analyze-clicks.ts"`
 *   - Via API endpoint: Create a Netlify Function that runs this analysis
 *   - With sample data: `bun run scripts/analyze-clicks.ts --sample`
 *
 * Output: Click report showing top events, category breakdown, and trends
 */

interface ClickData {
  eventId: string;
  timestamp: string;
  destinationUrl: string;
  referrer: string | null;
  userAgent: string | null;
}

interface ClickReport {
  period: { start: Date; end: Date };
  totalClicks: number;
  topEvents: Array<{ eventId: string; clicks: number }>;
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
  byReferrer: Record<string, number>;
}

// Sample data for testing without Netlify Blobs
function generateSampleData(): ClickData[] {
  const now = new Date();
  const samples: ClickData[] = [];

  const sampleEvents = [
    { id: 'jazz-gazarte-2026-01-30', category: 'concert', clicks: 47 },
    { id: 'techno-romantso-2026-01-31', category: 'clubs', clicks: 31 },
    { id: 'rebetiko-perivoli-2026-02-01', category: 'concert', clicks: 24 },
    { id: 'theatre-poreia-2026-02-02', category: 'theater', clicks: 18 },
    { id: 'exhibition-benaki-2026-01-15', category: 'exhibition', clicks: 12 },
  ];

  const referrers = [
    'https://www.google.com/',
    'https://perplexity.ai/',
    'https://claude.ai/',
    null,
    'https://www.facebook.com/',
  ];

  for (const event of sampleEvents) {
    for (let i = 0; i < event.clicks; i++) {
      const daysAgo = Math.floor(Math.random() * 7);
      const clickDate = new Date(now);
      clickDate.setDate(clickDate.getDate() - daysAgo);
      clickDate.setHours(Math.floor(Math.random() * 24));

      samples.push({
        eventId: event.id,
        timestamp: clickDate.toISOString(),
        destinationUrl: `https://tickets.example.com/${event.id}`,
        referrer: referrers[Math.floor(Math.random() * referrers.length)],
        userAgent: 'Mozilla/5.0 (Sample)',
      });
    }
  }

  return samples;
}

// Analyze click data
function analyzeClicks(clicks: ClickData[], days: number = 7): ClickReport {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  // Filter to requested period
  const filteredClicks = clicks.filter(c => new Date(c.timestamp) >= cutoff);

  // Count by event
  const eventCounts: Record<string, number> = {};
  for (const click of filteredClicks) {
    eventCounts[click.eventId] = (eventCounts[click.eventId] || 0) + 1;
  }

  // Top events sorted by clicks
  const topEvents = Object.entries(eventCounts)
    .map(([eventId, clicks]) => ({ eventId, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Count by category (inferred from event ID patterns)
  const byCategory: Record<string, number> = {};
  for (const click of filteredClicks) {
    const id = click.eventId.toLowerCase();
    let category = 'other';
    if (id.includes('concert') || id.includes('jazz') || id.includes('rebetiko')) {
      category = 'concerts';
    } else if (id.includes('club') || id.includes('techno') || id.includes('house')) {
      category = 'clubs';
    } else if (id.includes('theatre') || id.includes('theater')) {
      category = 'theatre';
    } else if (id.includes('exhibition')) {
      category = 'exhibitions';
    }
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  // Count by day of week
  const byDay: Record<string, number> = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const click of filteredClicks) {
    const dayName = dayNames[new Date(click.timestamp).getDay()];
    byDay[dayName] = (byDay[dayName] || 0) + 1;
  }

  // Count by referrer domain
  const byReferrer: Record<string, number> = {};
  for (const click of filteredClicks) {
    let source = 'direct';
    if (click.referrer) {
      try {
        source = new URL(click.referrer).hostname.replace('www.', '');
      } catch {
        source = 'unknown';
      }
    }
    byReferrer[source] = (byReferrer[source] || 0) + 1;
  }

  return {
    period: { start: cutoff, end: now },
    totalClicks: filteredClicks.length,
    topEvents,
    byCategory,
    byDay,
    byReferrer,
  };
}

// Format report for console output
function formatReport(report: ClickReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`   CLICK REPORT (${report.period.start.toLocaleDateString()} - ${report.period.end.toLocaleDateString()})`);
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`📊 Total Clicks: ${report.totalClicks}`);
  lines.push('');

  // Top Events
  lines.push('🔥 Top Events:');
  lines.push('───────────────────────────────────────────────────────────');
  if (report.topEvents.length === 0) {
    lines.push('   No click data yet');
  } else {
    for (let i = 0; i < report.topEvents.length; i++) {
      const event = report.topEvents[i];
      const percentage = ((event.clicks / report.totalClicks) * 100).toFixed(1);
      lines.push(`   ${i + 1}. ${event.eventId.substring(0, 40).padEnd(42)} ${event.clicks.toString().padStart(4)} (${percentage}%)`);
    }
  }
  lines.push('');

  // By Category
  lines.push('📁 By Category:');
  lines.push('───────────────────────────────────────────────────────────');
  const sortedCategories = Object.entries(report.byCategory)
    .sort(([, a], [, b]) => b - a);
  for (const [category, clicks] of sortedCategories) {
    const percentage = ((clicks / report.totalClicks) * 100).toFixed(1);
    const bar = '█'.repeat(Math.ceil(parseFloat(percentage) / 5));
    lines.push(`   ${category.padEnd(15)} ${clicks.toString().padStart(4)} (${percentage.padStart(5)}%) ${bar}`);
  }
  lines.push('');

  // By Day
  lines.push('📅 By Day of Week:');
  lines.push('───────────────────────────────────────────────────────────');
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let peakDay = '';
  let peakClicks = 0;
  for (const day of dayOrder) {
    const clicks = report.byDay[day] || 0;
    if (clicks > peakClicks) {
      peakDay = day;
      peakClicks = clicks;
    }
    const bar = '█'.repeat(Math.ceil(clicks / 3));
    lines.push(`   ${day}: ${clicks.toString().padStart(4)} ${bar}`);
  }
  if (peakDay) {
    lines.push(`   Peak: ${peakDay}`);
  }
  lines.push('');

  // By Referrer
  lines.push('🔗 Traffic Sources:');
  lines.push('───────────────────────────────────────────────────────────');
  const sortedReferrers = Object.entries(report.byReferrer)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  for (const [source, clicks] of sortedReferrers) {
    const percentage = ((clicks / report.totalClicks) * 100).toFixed(1);
    lines.push(`   ${source.padEnd(20)} ${clicks.toString().padStart(4)} (${percentage}%)`);
  }
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const useSample = args.includes('--sample');
  const days = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || '7');

  console.log('📈 Agent Athens Click Analytics');
  console.log('================================\n');

  let clicks: ClickData[] = [];

  if (useSample) {
    console.log('Using sample data for demonstration...\n');
    clicks = generateSampleData();
  } else {
    // Try to read from Netlify Blobs
    try {
      const { getStore } = await import("@netlify/blobs");
      const clickStore = getStore("clicks");

      console.log('Reading clicks from Netlify Blobs...\n');

      // List all click entries
      const list = await clickStore.list();
      for await (const key of list.blobs) {
        const data = await clickStore.get(key.key, { type: 'json' });
        if (data) {
          clicks.push(data as ClickData);
        }
      }

      console.log(`Found ${clicks.length} click records.\n`);
    } catch (error) {
      console.log('⚠️  Could not access Netlify Blobs. This script needs to run either:');
      console.log('    - Within Netlify environment (Functions or CLI)');
      console.log('    - With --sample flag for demo data\n');
      console.log('Run: bun run scripts/analyze-clicks.ts --sample\n');
      process.exit(1);
    }
  }

  // Analyze and report
  const report = analyzeClicks(clicks, days);
  console.log(formatReport(report));
}

// Export for use as module
export { analyzeClicks, formatReport, type ClickReport, type ClickData };

// Run as script
if (import.meta.main) {
  main().catch(console.error);
}
