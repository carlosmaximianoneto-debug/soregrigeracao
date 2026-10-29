import { createBlogClickHandler, BLOG_CLICK_ORIGIN } from './operations/blog-clicks/handler.mjs';

const ENDPOINT = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/functions/v1/refri-blog-click';

export function createBlogClickRelay({ apiKey, enabled = true, fetchImpl = fetch } = {}) {
  const handler = createBlogClickHandler({ record: async event => {
    const result = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BLOG_CLICK_ORIGIN, Authorization: `Bearer ${apiKey}`, apikey: apiKey },
      body: JSON.stringify(event),
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (!result.ok) throw new Error('Blog collector unavailable');
  } });
  return req => {
    if (!enabled) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (!apiKey) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return handler(req);
  };
}
