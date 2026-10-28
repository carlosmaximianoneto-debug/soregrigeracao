import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createSeoHandler } from '../seo-netlify-function.mjs';
import { createSiteClickRelay } from '../site-click-handler.mjs';

const runtime = await import('../server/http-server.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
test('VPS exposes a bounded HTTP adapter', () => assert.equal(typeof runtime.createVpsServer, 'function'));
const integration = (name, fn) => test(name, { skip: !runtime.createVpsServer }, fn);
const origin = 'https://sorefrigeracao.com';
const click = { event_type: 'affiliate_click', product_id: 2441, placement: 'home_card', page_type: 'home' };

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'refri-http-'));
  const distDir = path.join(directory, 'dist');
  await fs.mkdir(path.join(distDir, 'privacidade'), { recursive: true });
  await fs.mkdir(path.join(distDir, 'assets'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><h1>Catálogo público</h1>');
  await fs.writeFile(path.join(distDir, 'styles.css'), 'body{color:#10232d}');
  await fs.writeFile(path.join(distDir, 'site-config.js'), 'window.REFRI_CATALOGUE={preview:false};');
  await fs.writeFile(path.join(distDir, 'privacidade/index.html'), '<h1>Privacidade</h1>');
  await fs.writeFile(path.join(distDir, '.env'), 'NEVER_PUBLIC=private');
  await fs.writeFile(path.join(distDir, 'source.mjs'), 'never public source');
  await fs.writeFile(path.join(directory, 'secret.txt'), 'never public sibling');
  const server = runtime.createVpsServer({ distDir,
    seoHandler: async () => new Response('SEO unavailable', { status: 503 }),
    clickHandler: async () => new Response(null, { status: 204 }),
    imageHandler: async () => new Response('image', { headers: { 'Content-Type': 'image/webp' } }),
    ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { server, distDir, directory, port: server.address().port };
}

function request(port, route, { method = 'GET', headers = {}, body, chunks, hold = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers, agent: false }, res => {
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => { resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(data).toString() }); req.destroy(); });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Test request timed out')));
    if (chunks) for (const chunk of chunks) req.write(chunk);
    else if (body !== undefined) req.write(body);
    if (!hold) req.end();
  });
}

integration('serves only explicit public files with MIME and security headers; HEAD has no body', async t => {
  const { port } = await fixture(t);
  const home = await request(port, '/?utm_source=whatsapp');
  assert.equal(home.status, 200);
  assert.match(home.text, /Catálogo público/);
  assert.match(home.headers['content-type'], /^text\/html/);
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal(home.headers['x-frame-options'], 'DENY');
  assert.equal(home.headers['referrer-policy'], 'no-referrer');
  assert.equal(home.headers['cache-control'], 'public, max-age=0, must-revalidate');
  const css = await request(port, '/styles.css', { method: 'HEAD' });
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /^text\/css/);
  assert.equal(css.text, '');
  assert.equal(Number(css.headers['content-length']), Buffer.byteLength('body{color:#10232d}'));
  assert.equal((await request(port, '/site-config.js')).status, 200);
  assert.equal((await request(port, '/privacidade/')).status, 200);
  for (const route of ['/source.mjs', '/.env', '/server/main.mjs', '/package.json', '/operations/clicks/handler.mjs', '/assets/', '/missing.html', '/styles.css.map']) {
    const result = await request(port, route);
    assert.equal(result.status, 404, route);
    assert.doesNotMatch(result.text, /NEVER_PUBLIC|private|never public/);
  }
});

integration('rejects raw traversal, encoded path variants and absolute request targets before URL normalization', async t => {
  let called = 0;
  const { port } = await fixture(t, { seoHandler: async () => { called++; return new Response('bad'); } });
  for (const route of ['/../secret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt', '/%252e%252e/secret.txt', '/assets\\..\\secret.txt', '//evil.test/catalogo/', '/catalogo/./', '/catalogo/%2F', 'https://evil.test/catalogo/']) {
    const result = await request(port, route);
    assert.equal(result.status, 404, route);
  }
  assert.equal(called, 0);
});

integration('never follows a symlink or junction inside the static allowlist', async t => {
  const { port, distDir, directory } = await fixture(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'favicon.svg'), 'private symlink target');
  await fs.rmdir(path.join(distDir, 'assets'));
  await fs.symlink(outside, path.join(distDir, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await request(port, '/assets/favicon.svg');
  assert.equal(result.status, 404);
  assert.doesNotMatch(result.text, /private symlink target/);
});

integration('health is local, bodyless HEAD works and unsupported methods never execute handlers', async t => {
  let called = 0;
  const { port } = await fixture(t, { seoHandler: async () => { called++; return new Response('bad'); } });
  const health = await request(port, '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.text), { ok: true });
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal((await request(port, '/healthz', { method: 'HEAD' })).text, '');
  for (const route of ['/', '/styles.css', '/catalogo/', '/healthz', '/.netlify/images?url=https%3A%2F%2Fexample.com']) {
    const result = await request(port, route, { method: 'POST', body: 'unexpected' });
    assert.equal(result.status, 405, route);
  }
  assert.equal(called, 0);
});

integration('health identifies the deployed revision without exposing environment values', async t => {
  const revision = 'a'.repeat(40);
  const { port } = await fixture(t, { revision });
  const health = await request(port, '/healthz');
  assert.deepEqual(JSON.parse(health.text), { ok: true, revision });
  assert.throws(() => runtime.createVpsServer({ distDir: '.', revision: 'not-a-revision',
    seoHandler: () => {}, clickHandler: () => {}, imageHandler: () => {} }), /revision/i);
});

integration('real SEO adapter preserves canonical metadata, legacy redirects, missing products and stale failures', async t => {
  let clock = Date.parse('2026-10-28T12:00:00Z');
  const originalTime = clock;
  const seoHandler = createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json', production: true, base: origin,
    categorySource: 'window.catalogueCategory=()=>"Brocas";', now: () => clock,
    fetchImpl: async () => Response.json({ generatedAt: new Date(originalTime).toISOString(), products: [
      { id: '2441', title: 'Broca teste', price: 79.9, url: 'https://meli.la/example', image: 'https://http2.mlstatic.com/example.jpg' },
    ] }),
  });
  const { port } = await fixture(t, { seoHandler });
  const legacy = await request(port, '/seo/produtos/antigo-2441/index.html?utm_source=whatsapp', { method: 'HEAD' });
  assert.equal(legacy.status, 301);
  assert.equal(legacy.headers.location, '/produtos/broca-teste-2441/');
  assert.equal(legacy.text, '');
  const product = await request(port, '/produtos/broca-teste-2441/?utm_source=whatsapp', { headers: { Host: 'attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid' } });
  assert.equal(product.status, 200);
  assert.match(product.text, /<link rel="canonical" href="https:\/\/sorefrigeracao.com\/produtos\/broca-teste-2441\/">/);
  assert.match(product.text, /"@type":"Offer","priceCurrency":"BRL","price":"79.90"/);
  assert.doesNotMatch(product.text, /attacker.invalid/);
  assert.equal((await request(port, '/produtos/morto-99999/')).status, 404);
  assert.match((await request(port, '/sitemap.xml')).text, /https:\/\/sorefrigeracao.com\/produtos\/broca-teste-2441\//);
  assert.equal((await request(port, '/robots.txt')).status, 200);
  clock += 16 * 60_000;
  assert.equal((await request(port, '/produtos/broca-teste-2441/')).status, 503);
});

integration('forwards only validated aggregate clicks; private inbound headers never reach the Edge', async t => {
  const upstream = [];
  const clickHandler = createSiteClickRelay({ apiKey: 'server-only-anon', fetchImpl: async (url, options) => {
    upstream.push({ url, options }); return new Response(null, { status: 204 });
  } });
  const { port } = await fixture(t, { clickHandler });
  const result = await request(port, '/api/site-click', { method: 'POST', body: JSON.stringify(click), headers: {
    Origin: origin, 'Content-Type': 'application/json', Cookie: 'private-user', Authorization: 'private-user', 'X-Forwarded-For': '192.0.2.123',
  } });
  assert.equal(result.status, 204);
  assert.equal(upstream.length, 1);
  assert.deepEqual(JSON.parse(upstream[0].options.body), click);
  assert.equal(upstream[0].options.headers.Authorization, 'Bearer server-only-anon');
  assert.doesNotMatch(JSON.stringify(upstream), /private-user|192\.0\.2\.123/);
  const denied = await request(port, '/api/site-click', { method: 'POST', body: JSON.stringify(click), headers: { Origin: 'https://other.test', 'Content-Type': 'application/json' } });
  assert.equal(denied.status, 403);
  const invalid = await request(port, '/api/site-click', { method: 'POST', body: JSON.stringify({ ...click, term: 'personal query' }), headers: { Origin: origin, 'Content-Type': 'application/json' } });
  assert.equal(invalid.status, 400);
  assert.equal(upstream.length, 1);
  assert.equal((await request(port, '/api/site-click', { headers: { Origin: origin } })).status, 405);
  assert.equal((await request(port, '/api/site-click', { method: 'OPTIONS', headers: { Origin: origin } })).status, 204);
});

integration('rejects declared and chunked oversized clicks before invoking their handler', async t => {
  let calls = 0;
  const { port } = await fixture(t, { clickHandler: async () => { calls++; return new Response(null, { status: 204 }); } });
  const declared = await request(port, '/api/site-click', { method: 'POST', headers: { 'Content-Length': '513' }, body: 'x'.repeat(513) });
  assert.equal(declared.status, 413);
  const chunked = await request(port, '/api/site-click', { method: 'POST', chunks: ['x'.repeat(300), 'x'.repeat(300)] });
  assert.equal(chunked.status, 413);
  assert.equal(calls, 0);
});

integration('times out a partial click body and a stalled handler with bounded responses', async t => {
  let calls = 0;
  const { port } = await fixture(t, { bodyTimeoutMs: 35, handlerTimeoutMs: 50,
    clickHandler: async () => { calls++; return new Response(null, { status: 204 }); },
    seoHandler: async () => new Promise(() => {}),
  });
  const slow = await request(port, '/api/site-click', { method: 'POST', headers: { 'Content-Length': '100' }, body: '{', hold: true });
  assert.equal(slow.status, 408);
  assert.equal(calls, 0);
  const stalled = await request(port, '/catalogo/');
  assert.equal(stalled.status, 504);
  assert.equal(stalled.headers['cache-control'], 'no-store');
});

integration('image queries reach only the image handler; HEAD suppresses body and errors disclose no internals', async t => {
  const images = [];
  const { port } = await fixture(t, { imageHandler: async req => {
    images.push({ url: req.url, method: req.method, cookie: req.headers.get('cookie') });
    return new Response('webp-bytes', { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' } });
  }, seoHandler: async () => { throw new Error('secret-path-and-key'); } });
  const route = '/.netlify/images?url=https%3A%2F%2Fhttp2.mlstatic.com%2Fphoto.jpg&w=320&q=75&fm=webp&fit=contain';
  const image = await request(port, route, { method: 'HEAD', headers: { Cookie: 'private' } });
  assert.equal(image.status, 200);
  assert.equal(image.text, '');
  assert.equal(images.length, 1);
  assert.equal(images[0].url, origin + route);
  assert.equal(images[0].method, 'GET');
  assert.equal(images[0].cookie, null);
  const error = await request(port, '/catalogo/');
  assert.equal(error.status, 500);
  assert.doesNotMatch(error.text, /secret-path-and-key|Error:|stack/);
  assert.equal(error.headers['cache-control'], 'no-store');
});
