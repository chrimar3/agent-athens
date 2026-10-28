/**
 * Local server: bun run dev
 *   FEED_FILE=test/fixtures/events.en.json  serve a local feed file (both langs)
 *   FEED_ORIGIN=https://agentathens.com      default: the live site
 */
import { readFileSync } from 'fs';
import { httpFeedSource, parseFeed, type FeedSource } from './feed';
import { handleHttp } from './mcp';

const file = process.env.FEED_FILE;
const feed: FeedSource = file
  ? async (lang) => parseFeed(JSON.parse(readFileSync(file.replace(/\.(el|en)\.json$/, `.${lang}.json`), 'utf8')), lang)
  : httpFeedSource(process.env.FEED_ORIGIN ?? 'https://agentathens.com');

const server = Bun.serve({ port: Number(process.env.PORT ?? 8787), fetch: (req) => handleHttp(req, { feed }) });
console.log(`Agent Athens MCP on http://localhost:${server.port}/mcp`);
