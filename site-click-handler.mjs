import { createClickHandler, CLICK_ORIGIN } from './operations/clicks/handler.mjs';

const ENDPOINT = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/functions/v1/refri-site-click';

export function createSiteClickRelay({ apiKey, enabled = true, fetchImpl = fetch } = {}) {
  const handler = createClickHandler({ record: async event => {
    const result = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: CLICK_ORIGIN, Authorization: `Bearer ${apiKey}`, apikey: apiKey },
      body: JSON.stringify(event),
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (!result.ok) throw new Error('Click collector unavailable');
  } });
  return req => {
    if (!enabled) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (!apiKey) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return handler(req);
  };
}
