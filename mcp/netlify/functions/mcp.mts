/**
 * Netlify Functions entry (mcp.agentathens.com), deployed as its own Netlify
 * site with base directory mcp/. The main site stays function-free
 * (tests/security/no-click-redirect.test.ts).
 */
import { httpFeedSource } from '../../src/feed';
import { handleHttp } from '../../src/mcp';

const feed = httpFeedSource(process.env.FEED_ORIGIN ?? 'https://agentathens.com');

export default (req: Request): Promise<Response> => handleHttp(req, { feed });

export const config = {
  path: ['/', '/mcp'],
  // Assistants call remote connectors from their own servers, so one IP can
  // carry many users: the limit stops scripts, not conversations. Netlify
  // answers over-limit requests with 429; windowSize is at most 180 seconds.
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
