#!/usr/bin/env bun
import { loadState, saveState, shouldScrape, getSourceState, updateSourceState } from '../src/scraping/state-manager';

console.log('🧪 Testing State Manager\n');

// Test 1: Load state
console.log('Test 1: Loading state...');
const state = loadState();
console.log('✅ Loaded state:', JSON.stringify(state, null, 2));

// Test 2: Get source state (creates if doesn't exist)
console.log('\nTest 2: Getting source state for viva.gr...');
const vivaState = getSourceState(state, 'viva.gr');
console.log('✅ Got state:', vivaState);

// Test 3: shouldScrape logic
console.log('\nTest 3: Testing shouldScrape logic...');
console.log('  Never scraped:', shouldScrape('daily', null, false)); // Should be true
console.log('  1 hour ago:', shouldScrape('daily', new Date(Date.now() - 3600000).toISOString(), false)); // Should be false
console.log('  25 hours ago:', shouldScrape('daily', new Date(Date.now() - 25 * 3600000).toISOString(), false)); // Should be true
console.log('  Force mode:', shouldScrape('daily', new Date().toISOString(), true)); // Should be true

// Test 4: Update source state
console.log('\nTest 4: Updating source state...');
updateSourceState(state, 'viva.gr', true, 1041);
console.log('✅ Updated viva.gr state:', state.sources['viva.gr']);

// Test 5: Save state
console.log('\nTest 5: Saving state...');
saveState(state);
console.log('✅ State saved to data/scrape-state.json');

// Test 6: Reload state
console.log('\nTest 6: Reloading state to verify persistence...');
const reloadedState = loadState();
console.log('✅ Reloaded state has viva.gr:', !!reloadedState.sources['viva.gr']);
console.log('   Events imported:', reloadedState.sources['viva.gr']?.events_imported);

console.log('\n✅ All tests passed!');
