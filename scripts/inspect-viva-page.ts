#!/usr/bin/env bun
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Try more.com URLs instead
const TEST_URLS = [
  'https://www.more.com/gr-el/tickets/music/ejekt-festival-2026-the-cure/',
  'https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/nick-cave-the-bad-seeds/',
  'https://www.more.com/gr-el/tickets/music/clutch-2026/',
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  for (const url of TEST_URLS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${url}\n`);
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const finalUrl = page.url();
      const title = await page.title();
      console.log(`Final URL: ${finalUrl}`);
      console.log(`Title: ${title}`);
      
      // Check if this is an event page or homepage
      if (finalUrl.endsWith('/gr-el/') || finalUrl.endsWith('/gr-el')) {
        console.log('⚠️ Redirected to homepage');
        await page.close();
        continue;
      }
      
      // Get ALL text that looks like prices
      const priceInfo = await page.evaluate(() => {
        const results: string[] = [];
        const body = document.body.innerText;
        
        // Find price patterns
        const pricePattern = /(?:από\s*)?€?\s*\d+(?:[.,]\d{2})?\s*€?/gi;
        const matches = body.match(pricePattern) || [];
        results.push('Price patterns found: ' + [...new Set(matches)].join(', '));
        
        // Find lines with €
        const lines = body.split('\n')
          .map(l => l.trim())
          .filter(l => l.includes('€') && l.length > 0 && l.length < 150);
        
        return [...results, ...lines.slice(0, 15)];
      });
      
      console.log('\nPrice content:');
      priceInfo.forEach((text, i) => console.log(`  ${i}. ${text}`));
      
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
}

main().catch(console.error);
