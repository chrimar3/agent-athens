import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dir, '..');

// The Aug 2026 wall-clock-kill streak traced to WebFetch hanging on more.com
// (queue-it wall; 572s heartbeat then timeout — logs/auto-enrich-2026-08-10.log).
// These domains block or confabulate; the brief must forbid fetching them
// (WebSearch instead). Sources: memory notes reference_morecom_queueit_blocks_webfetch,
// reference_snfcc_org_blocks_webfetch; ra.co 403s (session-log S203+).
const BLOCKED = ['more.com', 'snfcc.org', 'ra.co'];

describe('enrichment brief fetch blocklist', () => {
  test('generator source carries the blocklist constant (precondition)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'generate-enrichment-brief.ts'), 'utf8');
    expect(src).toContain('FETCH_BLOCKLIST');
    for (const d of BLOCKED) expect(src).toContain(d);
  });

  test('rendered section includes the instruction and every domain', async () => {
    const mod = await import('../scripts/generate-enrichment-brief');
    expect(typeof mod.renderFetchBlocklistSection).toBe('function');
    const section = mod.renderFetchBlocklistSection();
    expect(section).toContain('Do NOT WebFetch');
    for (const d of BLOCKED) expect(section).toContain(d);
  });

  test('buildBrief output embeds the blocklist section (wiring, not just the helper)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'generate-enrichment-brief.ts'), 'utf8');
    // The section must be pushed inside buildBrief, not merely defined.
    expect(src).toMatch(/lines\.push\(renderFetchBlocklistSection\(\)\)/);
  });
});
