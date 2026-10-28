/** Cloudflare Workers entry (mcp.agentathens.com). */
import { httpFeedSource } from './feed';
import { handleHttp } from './mcp';

interface Env { FEED_ORIGIN?: string }

let feed: ReturnType<typeof httpFeedSource> | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    feed ??= httpFeedSource(env.FEED_ORIGIN ?? 'https://agentathens.com');
    return handleHttp(req, { feed });
  },
};
