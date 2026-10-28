import { createClickHandler } from './handler.mjs';
import { matchesRelayBearer } from './relay-auth.mjs';

const base = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const handler = createClickHandler({ record: async (event: Record<string, string | number>) => {
  if (!base || !serviceKey) throw new Error('Collector unavailable');
  const result = await fetch(`${base}/rest/v1/rpc/refri_record_site_click`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_type: event.event_type, p_product_id: event.product_id, p_placement: event.placement, p_page_type: event.page_type }),
    signal: AbortSignal.timeout(3000),
  });
  if (!result.ok) throw new Error('Collector unavailable');
  return await result.json();
} });

// verify_jwt=true remains enabled at the platform. Pin the relay's exact active
// public credential, independent of the project's default anon environment key.
Deno.serve(async (req: Request) => {
  if (!await matchesRelayBearer(req.headers.get('authorization'))) {
    return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return handler(req);
});
