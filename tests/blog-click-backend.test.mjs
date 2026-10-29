import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const backend = await import('../operations/blog-clicks/handler.mjs').catch(() => ({}));
const relayModule = await import('../blog-click-handler.mjs').catch(() => ({}));
const edgeModule = await import('../operations/blog-clicks/edge-handler.mjs').catch(() => ({}));
const origin = 'https://sorefrigeracao.com';
const event = { event_type: 'whatsapp_click', article_slug: 'ferramentas-para-refrigerista-kit-iniciante', placement: 'article_mid' };
const view = { ...event, event_type: 'page_view', placement: 'page_load' };
const request = (body = event, headers = {}, method = 'POST') => new Request(`${origin}/api/blog-click`, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
  ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});

test('blog validator accepts the 20 approved articles and coherent event placements only', () => {
  assert.equal(typeof backend.validateBlogClick, 'function', 'isolated blog validator is required');
  for (const article_slug of [
    'ferramentas-para-refrigerista-kit-iniciante', 'bomba-de-vacuo-3-cfm-ou-6-cfm',
    'bomba-de-vacuo-simples-ou-duplo-estagio', 'vacuometro-digital-como-escolher',
    'manifold-analogico-ou-digital', 'manifold-r32-r410a-compatibilidade',
    'mangueiras-para-manifold-como-escolher', 'bomba-de-limpeza-ar-condicionado',
    'bolsa-coletora-limpeza-split', 'flangeador-excentrico-como-escolher',
    'cortador-de-tubo-de-cobre', 'curvador-de-tubo-de-cobre',
    'torquimetro-para-refrigeracao', 'serra-copo-para-ar-condicionado',
    'furadeira-ou-martelete-ar-condicionado', 'alicate-amperimetro-para-refrigeracao',
    'termometro-infravermelho-ou-contato', 'detector-de-vazamento-refrigerante',
    'balanca-digital-para-refrigeracao', 'bomba-de-dreno-ar-condicionado',
  ]) {
    for (const sample of [view, event, { ...event, placement: 'article_end' }]) {
      assert.deepEqual(backend.validateBlogClick({ ...sample, article_slug }), { ...sample, article_slug });
    }
  }
  for (const change of [
    { article_slug: 'unknown' }, { article_slug: event.article_slug.toUpperCase() },
    { article_slug: `${event.article_slug}?email=a@b.test` }, { article_slug: null },
    { placement: 'page_load' }, { placement: 'home_hero' }, { event_type: 'affiliate_click' },
    { event_type: 'page_view' }, { product_id: 42 }, { email: 'private@example.com' },
    { ip: '1.2.3.4' }, { session_id: 'private' }, { user_id: 'private' }, { search_text: 'private' },
  ]) assert.equal(backend.validateBlogClick({ ...event, ...change }), null);
  for (const bad of [null, [], 'anything', {}, { ...view, placement: 'article_end' }]) {
    assert.equal(backend.validateBlogClick(bad), null);
  }
});

test('collector records only the exact three validated aggregate dimensions', async () => {
  assert.equal(typeof backend.createBlogClickHandler, 'function', 'isolated blog collector is required');
  const records = [];
  const handler = backend.createBlogClickHandler({ record: async value => records.push(value) });
  const response = await handler(request(event));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await handler(request(view))).status, 204);
  assert.deepEqual(records, [event, view]);
});

test('collector rejects foreign origins, same-site subdomains and unsupported methods', async () => {
  const records = [];
  const handler = backend.createBlogClickHandler({ record: async value => records.push(value) });
  for (const headers of [{ Origin: '' }, { Origin: 'https://evil.example' }, { Origin: `${origin}:444` },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'none' }]) {
    assert.equal((await handler(request(event, headers))).status, 403);
  }
  assert.equal((await handler(request(event, {}, 'GET'))).status, 405);
  const preflight = await handler(request(event, {}, 'OPTIONS'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.deepEqual(records, []);
});

test('collector honors DNT/GPC without storing or forwarding the event', async () => {
  const records = [];
  const handler = backend.createBlogClickHandler({ record: async value => records.push(value) });
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }]) {
    assert.equal((await handler(request(event, headers))).status, 204);
  }
  assert.deepEqual(records, []);
});

test('collector rejects malformed bodies, PII fields, invalid media and bodies over 512 bytes', async () => {
  const records = [];
  const handler = backend.createBlogClickHandler({ record: async value => records.push(value) });
  for (const [body, headers, status] of [
    ['x'.repeat(513), {}, 413], ['{', {}, 400], [{ ...event, visitor_id: 'private' }, {}, 400],
    [event, { 'Content-Type': 'text/plain' }, 415], [event, { 'Content-Length': '513' }, 413],
    [event, { 'Content-Length': '-1' }, 413],
  ]) assert.equal((await handler(request(body, headers))).status, status);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(300)); controller.enqueue(new Uint8Array(300)); controller.close(); } });
  assert.equal((await handler(new Request(`${origin}/api/blog-click`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: stream, duplex: 'half' }))).status, 413);
  assert.deepEqual(records, []);
});

test('collector rate limit uses one aggregate minute window without client identifiers', async () => {
  let now = 0;
  const handler = backend.createBlogClickHandler({ record: async () => true, now: () => now, maxPerMinute: 2 });
  assert.equal((await handler(request())).status, 204);
  assert.equal((await handler(request())).status, 204);
  const limited = await handler(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  now = 60_000;
  assert.equal((await handler(request())).status, 204);
  now = -1;
  assert.equal((await handler(request())).status, 204);
});

test('relay strips all visitor headers and sends only a sanitized blog event', async () => {
  assert.equal(typeof relayModule.createBlogClickRelay, 'function', 'isolated blog relay is required');
  const calls = [];
  const relay = relayModule.createBlogClickRelay({ apiKey: 'server-anon-jwt', fetchImpl: async (...args) => { calls.push(args); return new Response(null, { status: 204 }); } });
  const response = await relay(request(event, { Cookie: 'visitor=private', Authorization: 'Bearer visitor', Referer: 'https://private.example', 'X-Forwarded-For': '1.2.3.4', 'User-Agent': 'visitor' }));
  assert.equal(response.status, 204);
  assert.equal(calls[0][0], 'https://xlwiwxaghbkdwbtwagwo.supabase.co/functions/v1/refri-blog-click');
  assert.deepEqual(calls[0][1].headers, { 'Content-Type': 'application/json', Origin: origin, Authorization: 'Bearer server-anon-jwt', apikey: 'server-anon-jwt' });
  assert.deepEqual(JSON.parse(calls[0][1].body), event);
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
});

test('relay skips previews and missing credentials and contains upstream errors', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error('private backend'); };
  assert.equal((await relayModule.createBlogClickRelay({ apiKey: '', fetchImpl })(request())).status, 503);
  assert.equal((await relayModule.createBlogClickRelay({ apiKey: 'key', enabled: false, fetchImpl })(request())).status, 404);
  assert.equal(requests, 0);
  const failure = await relayModule.createBlogClickRelay({ apiKey: 'key', fetchImpl })(request());
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), '');
  assert.equal((await relayModule.createBlogClickRelay({ apiKey: 'key', fetchImpl: async () => new Response(null, { status: 500 }) })(request())).status, 503);
});

test('relay aborts a stalled upstream request within its four-second deadline', { timeout: 6000 }, async () => {
  const relay = relayModule.createBlogClickRelay({ apiKey: 'key', fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  // AbortSignal.timeout is unref'ed in Node; keep the process alive for this external-I/O simulation.
  const timer = setTimeout(() => {}, 5000);
  try { assert.equal((await relay(request())).status, 503); } finally { clearTimeout(timer); }
});

const relayKey = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.example_signature';
const fingerprint = createHash('sha256').update(relayKey).digest('hex');
test('Edge gate rejects absent or wrong credentials before storage and maps only blog RPC fields', async () => {
  assert.equal(typeof edgeModule.createBlogEdgeHandler, 'function', 'authenticated blog Edge collector is required');
  const calls = [];
  const handler = edgeModule.createBlogEdgeHandler({ base: 'https://db.example', serviceKey: 'server-only', expectedRelayFingerprint: fingerprint, fetchImpl: async (...args) => { calls.push(args); return new Response('true'); } });
  for (const Authorization of ['', 'Bearer other.jwt.token', `bearer ${relayKey}`]) {
    assert.equal((await handler(request(event, { Authorization }))).status, 401);
  }
  assert.equal(calls.length, 0);
  assert.equal((await handler(request(event, { Authorization: `Bearer ${relayKey}` }))).status, 204);
  assert.equal(calls[0][0], 'https://db.example/rest/v1/rpc/refri_record_blog_click');
  assert.deepEqual(JSON.parse(calls[0][1].body), { p_event_type: 'whatsapp_click', p_article_slug: 'ferramentas-para-refrigerista-kit-iniciante', p_placement: 'article_mid' });
  assert.deepEqual(calls[0][1].headers, { apikey: 'server-only', Authorization: 'Bearer server-only', 'Content-Type': 'application/json' });
  assert.equal(calls[0][1].redirect, 'error');
});

test('Edge contains storage failure and missing service configuration', async () => {
  const headers = { Authorization: `Bearer ${relayKey}` };
  const config = { expectedRelayFingerprint: fingerprint, base: 'https://db.example', serviceKey: 'server-only' };
  for (const override of [{ serviceKey: '' }, { base: '' }, { fetchImpl: async () => new Response('secret failure', { status: 500 }) }]) {
    const response = await edgeModule.createBlogEdgeHandler({ ...config, ...override })(request(event, headers));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '');
  }
});

test('Edge does not acknowledge a write rejected by the persistent daily cap', async () => {
  const handler = edgeModule.createBlogEdgeHandler({ expectedRelayFingerprint: fingerprint, base: 'https://db.example', serviceKey: 'server-only', fetchImpl: async () => new Response('false') });
  const response = await handler(request(event, { Authorization: `Bearer ${relayKey}` }));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
});
