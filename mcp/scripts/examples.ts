/**
 * The directory kit's example prompts, run against the live feed: for each
 * prompt, the tool call an assistant would make, sent through the real HTTP
 * handler, and a short print of what came back.
 *
 *   bun run scripts/examples.ts
 */
import { httpFeedSource } from '../src/feed';
import { handleHttp } from '../src/mcp';
import { athensToday } from '../src/tools';

const feed = httpFeedSource(process.env.FEED_ORIGIN ?? 'https://agentathens.com');

export const EXAMPLES: { prompt: string; tool: string; args: Record<string, unknown> }[] = [
  { prompt: 'What concerts are on in Athens this weekend?', tool: 'search_events', args: { when: 'this_weekend', category: 'music', limit: 5 } },
  { prompt: 'Any exhibitions with free entry in Athens over the next month?', tool: 'search_events', args: { category: 'exhibition', open_only: true, when: 'next_30_days', limit: 5 } },
  { prompt: 'Τι θέατρο παίζεται απόψε στην Αθήνα;', tool: 'search_events', args: { when: 'today', category: 'theatre', lang: 'el', limit: 5 } },
  { prompt: "What's coming up at Onassis Stegi?", tool: 'search_events', args: { venue: 'Onassis Stegi', when: 'next_30_days', limit: 5 } },
  { prompt: "I'm a big fan of The Cure. Is there anything for me in Athens?", tool: 'match_artists', args: { artists: ['The Cure'] } },
];

let id = 0;
async function call(tool: string, args: object): Promise<any> {
  const res = await handleHttp(new Request('http://examples.local/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: tool, arguments: args } }),
  }), { feed });
  const body: any = await res.json().catch(() => null);
  if (!body || body.error || body.result?.isError) {
    console.error(`examples: FAILED — ${tool} ${JSON.stringify(args)} → ${JSON.stringify(body?.error ?? body?.result?.content ?? `HTTP ${res.status}, no JSON body`)}\n  next: check the feed loads (bun run scripts/smoke.ts)`);
    process.exit(1);
  }
  return body.result.structuredContent;
}

if (import.meta.main) {
  console.log(`today (Athens) ${athensToday()}`);
  for (const [i, ex] of EXAMPLES.entries()) {
    const out = await call(ex.tool, ex.args);
    console.log(`\n${i + 1}. "${ex.prompt}"\n   ${ex.tool} ${JSON.stringify(ex.args)}`);
    console.log(`   window ${out.window.from}..${out.window.to}, feed_updated ${out.feed_updated ?? '(not in match_artists)'}`);
    if (ex.tool === 'search_events') {
      console.log(`   total ${out.total}, returned ${out.returned}`);
      for (const e of out.events) {
        const price = e.price.access === 'open' ? 'open entry' : e.price.amount != null ? `${e.price.amount} ${e.price.currency}` : 'ticket, price not listed';
        console.log(`   - ${e.start} | ${e.name} | ${e.venue.name} | ${price} | ${e.url}`);
      }
    } else {
      console.log(`   matches ${out.matches.length}, unmatched ${JSON.stringify(out.unmatched)}`);
      for (const m of out.matches) console.log(`   - [${m.confidence}] ${m.event.start} | ${m.event.name} | ${m.event.venue.name} | ${m.event.url}`);
    }
  }
  console.log('\nexamples: OK');
}
