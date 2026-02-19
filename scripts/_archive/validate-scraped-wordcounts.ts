import enData from '../data/phase1-test-scraped-en.json';
import grData from '../data/phase1-test-scraped-gr.json';

interface Description {
  event_id: string;
  title: string;
  type: string;
  language: string;
  full_description: string;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

console.log('📊 SCRAPED EVENTS WORD COUNT VALIDATION\n');

console.log('English Descriptions:');
console.log('='.repeat(80));
(enData as Description[]).forEach(event => {
  const count = countWords(event.full_description);
  const status = count >= 415 && count <= 425 ? '✅ PASS' :
                 count >= 400 && count <= 440 ? '⚠️  CLOSE' :
                 '❌ FAIL';
  const typeStr = event.type.padEnd(12);
  console.log(`${typeStr} | ${count} words | ${status}`);
  console.log(`  "${event.title}"`);
});

console.log('\n\nGreek Descriptions:');
console.log('='.repeat(80));
(grData as Description[]).forEach(event => {
  const count = countWords(event.full_description);
  const status = count >= 410 && count <= 430 ? '✅ PASS' :
                 count >= 395 && count <= 445 ? '⚠️  CLOSE' :
                 '❌ FAIL';
  const typeStr = event.type.padEnd(12);
  console.log(`${typeStr} | ${count} words | ${status}`);
  console.log(`  "${event.title}"`);
});

// Calculate pass rates
const enCounts = (enData as Description[]).map(e => countWords(e.full_description));
const grCounts = (grData as Description[]).map(e => countWords(e.full_description));

const enPass = enCounts.filter(c => c >= 415 && c <= 425).length;
const grPass = grCounts.filter(c => c >= 410 && c <= 430).length;
const totalPass = enPass + grPass;

console.log('\n\n📈 SUMMARY:');
console.log('='.repeat(80));
console.log(`English: ${enPass}/3 pass (${Math.round(enPass/3*100)}%)`);
console.log(`Greek:   ${grPass}/3 pass (${Math.round(grPass/3*100)}%)`);
console.log(`Total:   ${totalPass}/6 pass (${Math.round(totalPass/6*100)}%)`);
console.log('');
console.log(`Target: 4/6 (67%) to proceed`);
console.log(`Result: ${totalPass >= 4 ? '✅ PASS - PROCEED' : '❌ FAIL - ADJUST PROMPTS'}`);
