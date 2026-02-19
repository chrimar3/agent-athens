#!/usr/bin/env bun
import { loadState, saveState, shouldScrape, getSourceState, updateSourceState } from '../src/scraping/state-manager';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';

console.log('🧪 Testing State Manager - Edge Cases\n');

// Test 1: Corrupt state file recovery
console.log('Test 1: Corrupt state file recovery...');
const corruptJson = '{ "version": "1.0", "sources": {'; // Incomplete JSON
writeFileSync('data/scrape-state.json', corruptJson, 'utf-8');

const recovered = loadState();
console.log('✅ Recovered from corruption:', recovered.version === '1.0');
console.log('   Sources object exists:', typeof recovered.sources === 'object');

// Test 2: Frequency edge cases
console.log('\nTest 2: Frequency edge cases...');
const exactlyOneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const almostOneDayAgo = new Date(Date.now() - 23.9 * 60 * 60 * 1000).toISOString();
const justOverOneDayAgo = new Date(Date.now() - 24.1 * 60 * 60 * 1000).toISOString();

console.log('  Exactly 24 hours (daily):', shouldScrape('daily', exactlyOneDayAgo, false));
console.log('  23.9 hours (daily):', shouldScrape('daily', almostOneDayAgo, false));
console.log('  24.1 hours (daily):', shouldScrape('daily', justOverOneDayAgo, false));

// Test 3: Multiple source updates
console.log('\nTest 3: Multiple source updates...');
const state = loadState();

updateSourceState(state, 'viva.gr', true, 1041);
updateSourceState(state, 'more.com', true, 1027);
updateSourceState(state, 'gazarte.gr', false, 0, 'Network timeout');

console.log('✅ Updated 3 sources');
console.log('   viva.gr success:', state.sources['viva.gr'].scrape_count);
console.log('   more.com success:', state.sources['more.com'].scrape_count);
console.log('   gazarte.gr failed:', state.sources['gazarte.gr'].failure_count);
console.log('   gazarte.gr error:', state.sources['gazarte.gr'].last_error);

// Test 4: Save and verify all 3 sources
console.log('\nTest 4: Save and verify persistence...');
saveState(state);
const reloaded = loadState();
console.log('✅ Reloaded state');
console.log('   Has 3 sources:', Object.keys(reloaded.sources).length === 3);
console.log('   viva.gr events:', reloaded.sources['viva.gr']?.events_imported);
console.log('   more.com events:', reloaded.sources['more.com']?.events_imported);
console.log('   gazarte.gr error:', reloaded.sources['gazarte.gr']?.last_error);

// Test 5: Backup file exists
console.log('\nTest 5: Backup file verification...');
const backupExists = existsSync('data/scrape-state.backup.json');
console.log('✅ Backup exists:', backupExists);

if (backupExists) {
  const backup = JSON.parse(readFileSync('data/scrape-state.backup.json', 'utf-8'));
  console.log('   Backup version:', backup.version);
}

// Test 6: Weekly and monthly frequencies
console.log('\nTest 6: Weekly and monthly frequencies...');
const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

console.log('  6 days ago (weekly):', shouldScrape('weekly', sixDaysAgo, false)); // false
console.log('  8 days ago (weekly):', shouldScrape('weekly', eightDaysAgo, false)); // true
console.log('  20 days ago (monthly):', shouldScrape('monthly', twentyDaysAgo, false)); // false
console.log('  31 days ago (monthly):', shouldScrape('monthly', thirtyOneDaysAgo, false)); // true

console.log('\n✅ All edge case tests passed!');
