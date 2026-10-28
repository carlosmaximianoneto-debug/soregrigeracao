import { createClickHandler } from './handler.mjs';

const base = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const relayKey = Deno.env.get('SUPABASE_ANON_KEY');

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

// verify_jwt=true remains enabled at the platform. Restrict this application
// endpoint to the server relay's application credential as an additional check.
Deno.serve((req: Request) => {
  if (!relayKey || req.headers.get('authorization') !== `Bearer ${relayKey}`) {
    return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return handler(req);
});
