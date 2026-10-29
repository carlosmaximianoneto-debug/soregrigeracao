export const BLOG_CLICK_ORIGIN = 'https://sorefrigeracao.com';
const MAX_BYTES = 512;
const KEYS = ['article_slug', 'event_type', 'placement'];
const ARTICLES = new Set([
  'ferramentas-para-refrigerista-kit-iniciante',
  'bomba-de-vacuo-3-cfm-ou-6-cfm',
  'bomba-de-vacuo-simples-ou-duplo-estagio',
  'vacuometro-digital-como-escolher',
  'manifold-analogico-ou-digital',
  'manifold-r32-r410a-compatibilidade',
  'mangueiras-para-manifold-como-escolher',
  'bomba-de-limpeza-ar-condicionado',
  'bolsa-coletora-limpeza-split',
  'flangeador-excentrico-como-escolher',
  'cortador-de-tubo-de-cobre',
  'curvador-de-tubo-de-cobre',
  'torquimetro-para-refrigeracao',
  'serra-copo-para-ar-condicionado',
  'furadeira-ou-martelete-ar-condicionado',
  'alicate-amperimetro-para-refrigeracao',
  'termometro-infravermelho-ou-contato',
  'detector-de-vazamento-refrigerante',
  'balanca-digital-para-refrigeracao',
  'bomba-de-dreno-ar-condicionado',
]);

export function validateBlogClick(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).sort().join(',') !== KEYS.join(',')) return null;
  const { event_type, article_slug, placement } = input;
  if (!ARTICLES.has(article_slug)) return null;
  if (!(event_type === 'page_view' && placement === 'page_load') &&
      !(event_type === 'whatsapp_click' && ['article_mid', 'article_end'].includes(placement))) return null;
  return { event_type, article_slug, placement };
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

export function createBlogClickHandler({ record, now = Date.now, maxPerMinute = 300 } = {}) {
  let windowStart = now(), requests = 0;
  return async req => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const response = status => new Response(null, { status, headers });
    if (req.headers.get('origin') !== BLOG_CLICK_ORIGIN) return response(403);
    const site = req.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return response(403);
    headers['Access-Control-Allow-Origin'] = BLOG_CLICK_ORIGIN;
    headers.Vary = 'Origin';
    if (req.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, apikey';
      return response(204);
    }
    if (req.method !== 'POST') { headers.Allow = 'POST'; return response(405); }
    if (req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') return response(204);
    const instant = now();
    if (instant - windowStart >= 60_000 || instant < windowStart) { windowStart = instant; requests = 0; }
    if (++requests > maxPerMinute) { headers['Retry-After'] = '60'; return response(429); }
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return response(415);
    let raw;
    try { raw = await readBoundedBody(req); } catch { return response(400); }
    if (raw === null) return response(413);
    let input;
    try { input = validateBlogClick(JSON.parse(raw)); } catch { return response(400); }
    if (!input) return response(400);
    try { await record(input); return response(204); } catch { return response(503); }
  };
}
