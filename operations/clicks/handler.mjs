export const CLICK_ORIGIN = 'https://sorefrigeracao.com';
const MAX_BYTES = 512;
const KEYS = ['event_type', 'page_type', 'placement', 'product_id'];
const RULES = Object.freeze({
  home_card: ['home', 'affiliate_click'],
  home_card_filtered: ['home', 'affiliate_click'],
  home_carousel: ['home', 'affiliate_click'],
  home_hero: ['home', 'whatsapp_click'],
  home_footer: ['home', 'whatsapp_click'],
  home_floating: ['home', 'whatsapp_click'],
  home_direct: ['home', 'whatsapp_click'],
  product_offer: ['product', 'affiliate_click'],
  product_whatsapp: ['product', 'whatsapp_click'],
  collection_card: [['catalogue', 'category'], 'product_view_click'],
  related_card: ['product', 'product_view_click'],
  page_load: [['home', 'product', 'category', 'catalogue'], 'page_view'],
  search_filter: ['home', 'filter_use'],
  category_filter: ['home', 'filter_use'],
});

export function validateClick(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).sort().join(',') !== KEYS.join(',')) return null;
  const { event_type, product_id, placement, page_type } = input;
  if (typeof placement !== 'string' || !Object.hasOwn(RULES, placement)) return null;
  const [pages, event] = RULES[placement];
  if (!(Array.isArray(pages) ? pages : [pages]).includes(page_type) || event_type !== event) return null;
  if (!Number.isSafeInteger(product_id) || product_id < 0 || product_id > 2_147_483_647) return null;
  const noProduct = event_type === 'page_view'
    ? page_type !== 'product'
    : event_type === 'filter_use' || (placement.startsWith('home_') && event_type === 'whatsapp_click');
  if (noProduct ? product_id !== 0 : product_id === 0) return null;
  return { event_type, product_id, placement, page_type };
}

async function readBoundedBody(req) {
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) return null;
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function createClickHandler({ record, now = Date.now, maxPerMinute = 300 } = {}) {
  let windowStart = now(), requests = 0;
  return async req => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const response = status => new Response(null, { status, headers });
    if (req.headers.get('origin') !== CLICK_ORIGIN) return response(403);
    const site = req.headers.get('sec-fetch-site');
    if (site && !['same-origin', 'same-site', 'none'].includes(site)) return response(403);
    headers['Access-Control-Allow-Origin'] = CLICK_ORIGIN;
    headers.Vary = 'Origin';
    if (req.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, apikey';
      return response(204);
    }
    if (req.method !== 'POST') { headers.Allow = 'POST'; return response(405); }
    const instant = now();
    if (instant - windowStart >= 60_000 || instant < windowStart) { windowStart = instant; requests = 0; }
    if (++requests > maxPerMinute) { headers['Retry-After'] = '60'; return response(429); }
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['application/json', 'text/plain'].includes(type)) return response(415);
    let raw;
    try { raw = await readBoundedBody(req); } catch { return response(400); }
    if (raw === null) return response(413);
    let input;
    try { input = validateClick(JSON.parse(raw)); } catch { return response(400); }
    if (!input) return response(400);
    try { await record(input); return response(204); } catch { return response(503); }
  };
}

