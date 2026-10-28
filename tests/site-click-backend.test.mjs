import test from 'node:test';
import assert from 'node:assert/strict';
import { createClickHandler, validateClick } from '../operations/clicks/handler.mjs';
import { createSiteClickRelay } from '../site-click-handler.mjs';

const origin = 'https://sorefrigeracao.com';
const event = { event_type: 'affiliate_click', product_id: 42, placement: 'home_card', page_type: 'home' };
const request = (body = event, headers = {}, method = 'POST') => new Request(`${origin}/api/site-click`, { method, headers: { Origin: origin, 'Content-Type': 'text/plain;charset=UTF-8', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });

test('only bounded known event fields and coherent product placements are accepted', () => {
  assert.deepEqual(validateClick(event), event);
  assert.equal(validateClick({ ...event, visitor_id: 'private' }), null);
  assert.equal(validateClick({ ...event, product_id: '42' }), null);
  assert.equal(validateClick({ ...event, product_id: 0 }), null);
  assert.equal(validateClick({ ...event, event_type: 'whatsapp_click' }), null);
  assert.equal(validateClick({ ...event, page_type: 'category' }), null);
  assert.deepEqual(validateClick({ event_type: 'whatsapp_click', product_id: 0, placement: 'home_hero', page_type: 'home' }), { event_type: 'whatsapp_click', product_id: 0, placement: 'home_hero', page_type: 'home' });
});

test('collector counts a validated click once and returns no visitor information', async () => {
  const records = [];
  const handler = createClickHandler({ record: async value => { records.push(value); return true; } });
  const response = await handler(request());
  assert.equal(response.status, 204);
  assert.deepEqual(records, [event]);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('collector rejects foreign/missing origin, unsafe fetch metadata and methods before writes', async () => {
  let writes = 0;
  const handler = createClickHandler({ record: async () => { writes++; return true; } });
  assert.equal((await handler(request(event, { Origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(request(event, { Origin: '' }))).status, 403);
  assert.equal((await handler(request(event, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await handler(request(event, {}, 'GET'))).status, 405);
  assert.equal(writes, 0);
});

test('collector rejects oversize, malformed, extra fields and wrong media type', async () => {
  let writes = 0;
  const handler = createClickHandler({ record: async () => { writes++; return true; } });
  assert.equal((await handler(request('x'.repeat(513)))).status, 413);
  assert.equal((await handler(request('{'))).status, 400);
  assert.equal((await handler(request({ ...event, email: 'private@example.com' }))).status, 400);
  assert.equal((await handler(request(event, { 'Content-Type': 'application/xml' }))).status, 415);
  assert.equal(writes, 0);
});

test('collector rejects a stream over limit even without a Content-Length header', async () => {
  let writes = 0;
  const handler = createClickHandler({ record: async () => { writes++; return true; } });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(300)); controller.enqueue(new Uint8Array(300)); controller.close(); } });
  const req = new Request(`${origin}/api/site-click`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: stream, duplex: 'half' });
  assert.equal((await handler(req)).status, 413);
  assert.equal(writes, 0);
});

test('collector limits global request bursts without tracking IPs or clients', async () => {
  let now = 0;
  const handler = createClickHandler({ record: async () => true, now: () => now, maxPerMinute: 2 });
  assert.equal((await handler(request())).status, 204);
  assert.equal((await handler(request())).status, 204);
  assert.equal((await handler(request())).status, 429);
  now = 60_001;
  assert.equal((await handler(request())).status, 204);
});

test('collector rejects missing products silently and contains storage failures', async () => {
  assert.equal((await createClickHandler({ record: async () => false })(request())).status, 204);
  const response = await createClickHandler({ record: async () => { throw new Error('secret database detail'); } })(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
});

test('relay forwards only sanitized event and server credential, not visitor headers', async () => {
  const calls = [];
  const relay = createSiteClickRelay({ apiKey: 'test-anon-jwt', fetchImpl: async (...args) => { calls.push(args); return new Response(null, { status: 204 }); } });
  const result = await relay(request(event, { Cookie: 'secret=visitor', Referer: 'https://example.com/private', 'X-Forwarded-For': '1.2.3.4', Authorization: 'Bearer visitor' }));
  assert.equal(result.status, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://xlwiwxaghbkdwbtwagwo.supabase.co/functions/v1/refri-site-click');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer test-anon-jwt');
  assert.equal(calls[0][1].headers.Origin, origin);
  assert.deepEqual(Object.keys(calls[0][1].headers).sort(), ['Authorization', 'Content-Type', 'Origin', 'apikey']);
  assert.deepEqual(JSON.parse(calls[0][1].body), event);
});

test('relay is disabled in previews, without credentials and on upstream failure', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error('upstream private'); };
  assert.equal((await createSiteClickRelay({ apiKey: '', fetchImpl })(request())).status, 503);
  assert.equal((await createSiteClickRelay({ apiKey: 'key', enabled: false, fetchImpl })(request())).status, 404);
  assert.equal(requests, 0);
  assert.equal((await createSiteClickRelay({ apiKey: 'key', fetchImpl })(request())).status, 503);
  assert.equal(requests, 1);
});
