/**
 * Test script for iCal and HTML parsers
 *
 * Tests event extraction from:
 * 1. Fuzz Club iCal feed
 * 2. This is Athens HTML (if API key available)
 * 3. Lifo HTML (if API key available)
 */

import { fetchAndParseICalFeed } from './parsers/ical-parser.js';
import { fetchAndParseHTML } from './parsers/html-parser.js';
import type { RawEvent } from '../src/types.js';

// Test configuration
const TESTS = [
  {
    name: 'Fuzz Club (iCal)',
    type: 'ical',
    url: 'https://www.fuzzclub.gr/events/?ical=1',
    source: 'fuzz-club',
    language: 'el'
  },
  {
    name: 'This is Athens (HTML)',
    type: 'html',
    url: 'https://www.thisisathens.org/events',
    source: 'this-is-athens',
    language: 'en'
  },
  {
    name: 'Lifo (HTML)',
    type: 'html',
    url: 'https://www.lifo.gr/guide',
    source: 'lifo',
    language: 'el'
  }
];

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧪 Testing Event Parsers\n');
  console.log('=' .repeat(60));

  const results: { name: string; success: boolean; events: RawEvent[]; error?: string }[] = [];

  for (const test of TESTS) {
    console.log(`\n📋 Testing: ${test.name}`);
    console.log(`   URL: ${test.url}`);
    console.log(`   Type: ${test.type}`);

    try {
      let events: RawEvent[] = [];

      if (test.type === 'ical') {
        // Test iCal parser
        events = await fetchAndParseICalFeed(test.url, {
          source: test.source,
          language: test.language
        });
      } else if (test.type === 'html') {
        // HTML parser requires Claude Code tool_agent (interactive)
        console.log('   ⚠️  SKIPPED: HTML parsing requires Claude Code tool_agent');
        console.log('   💡 Use Claude Code interactively to parse HTML sources');
        results.push({
          name: test.name,
          success: false,
          events: [],
          error: 'HTML parsing requires manual Claude Code interaction (see html-parser.ts for instructions)'
        });
        continue;
      }

      console.log(`   ✅ SUCCESS: Extracted ${events.length} events`);

      // Display sample events
      if (events.length > 0) {
        console.log(`\n   📅 Sample events:`);
        events.slice(0, 3).forEach((event, i) => {
          console.log(`   ${i + 1}. ${event.title}`);
          console.log(`      Date: ${event.date} ${event.time || ''}`);
          console.log(`      Venue: ${event.venue}`);
          console.log(`      Type: ${event.type} | Genre: ${event.genre}`);
          console.log(`      Price: ${event.price}`);
          if (event.url) console.log(`      URL: ${event.url}`);
        });

        if (events.length > 3) {
          console.log(`   ... and ${events.length - 3} more events`);
        }
      }

      results.push({
        name: test.name,
        success: true,
        events
      });
    } catch (error) {
      console.log(`   ❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.push({
        name: test.name,
        success: false,
        events: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');

  const totalTests = results.length;
  const successTests = results.filter(r => r.success).length;
  const totalEvents = results.reduce((sum, r) => sum + r.events.length, 0);

  console.log(`Tests run: ${totalTests}`);
  console.log(`Passed: ${successTests}`);
  console.log(`Failed: ${totalTests - successTests}`);
  console.log(`Total events extracted: ${totalEvents}`);

  console.log('\n📝 Detailed Results:\n');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.events.length} events`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // Validation check
  console.log('\n🔍 Validation Check\n');
  let validationErrors = 0;

  results.forEach(result => {
    if (!result.success) return;

    result.events.forEach((event, i) => {
      const errors: string[] = [];

      if (!event.title || event.title.length < 3) {
        errors.push('Title too short or missing');
      }

      if (!event.date || !event.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        errors.push('Invalid date format (expected YYYY-MM-DD)');
      }

      if (!event.venue || event.venue.length < 2) {
        errors.push('Venue too short or missing');
      }

      if (errors.length > 0) {
        console.log(`❌ ${result.name} - Event ${i + 1}: ${event.title}`);
        errors.forEach(err => console.log(`   - ${err}`));
        validationErrors++;
      }
    });
  });

  if (validationErrors === 0) {
    console.log('✅ All events passed validation!');
  } else {
    console.log(`❌ ${validationErrors} validation errors found`);
  }

  console.log('\n' + '='.repeat(60));

  // Save results to file for inspection
  const timestamp = new Date().toISOString().split('T')[0];
  const outputFile = `test-results-${timestamp}.json`;

  try {
    await Bun.write(
      outputFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          summary: {
            totalTests,
            successTests,
            totalEvents,
            validationErrors
          },
          results
        },
        null,
        2
      )
    );
    console.log(`\n💾 Results saved to: ${outputFile}`);
  } catch (error) {
    console.error('Failed to save results:', error);
  }

  // Exit with appropriate code
  process.exit(validationErrors > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
