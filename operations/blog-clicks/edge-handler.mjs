import { createBlogClickHandler } from './handler.mjs';
import { matchesRelayBearer } from './relay-auth.mjs';

export function createBlogEdgeHandler({ base, serviceKey, fetchImpl = fetch, expectedRelayFingerprint } = {}) {
  const handler = createBlogClickHandler({ record: async event => {
    if (!base || !serviceKey) throw new Error('Blog collector unavailable');
    const result = await fetchImpl(`${base}/rest/v1/rpc/refri_record_blog_click`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event_type: event.event_type, p_article_slug: event.article_slug, p_placement: event.placement }),
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok || await result.json() !== true) throw new Error('Blog collector unavailable');
  } });
  return async req => {
    // Platform verify_jwt=true is also required. A different valid JWT must fail this gate.
    if (!await matchesRelayBearer(req.headers.get('authorization'), expectedRelayFingerprint)) {
      return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    return handler(req);
  };
}
