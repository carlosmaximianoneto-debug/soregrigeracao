import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createSeoHandler } from '../seo-netlify-function.mjs';
import { createVpsServer } from '../server/http-server.mjs';

const invitationURL = 'https://chat.whatsapp.com/ExampleGroupInvite123';
const categorySource = 'window.catalogueCategory = () => "Brocas";';
const snapshot = { generatedAt: new Date().toISOString(), products: [{ id: '1', title: 'Broca para concreto', price: 50,
  url: 'https://meli.la/example1', image: 'https://http2.mlstatic.com/example.jpg' }] };
const seo = () => createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json', invitationURL, categorySource,
  fetchImpl: async () => new Response(JSON.stringify(snapshot)) });

function assertBranded(html) {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /class="site-header"/);
  assert.match(html, /class="brand" href="\/"/);
  assert.match(html, /href="\/catalogo\/"/);
  assert.match(html, new RegExp(`class="group-join-button" href="${invitationURL}"`));
  // Broken-link visits are not catalogue traffic: no click script, no tracked placement.
  assert.doesNotMatch(html, /site-clicks\.js|data-placement=/);
  assert.match(html, /rel="preload" href="[^"]+\.woff2" as="font"/);
}

test('missing SEO pages render the branded not-found page with catalogue and group links', async () => {
  const response = await seo()(new Request('https://example.com/produtos/missing-999/'));
  assert.equal(response.status, 404);
  assertBranded(await response.text());
});

test('the SEO handler exposes a branded not-found response for the static server', async () => {
  const handler = seo();
  assert.equal(typeof handler.notFound, 'function');
  const response = handler.notFound('GET');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assertBranded(await response.text());
  assert.equal(await handler.notFound('HEAD').text(), '');
});

test('unknown page routes get the branded 404; unknown assets stay empty', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'refri-404-'));
  await fs.mkdir(path.join(directory, 'dist'));
  await fs.writeFile(path.join(directory, 'dist', 'index.html'), '<h1>home</h1>');
  const server = createVpsServer({ distDir: path.join(directory, 'dist'), seoHandler: seo(),
    clickHandler: async () => new Response(null, { status: 204 }), imageHandler: async () => new Response('x') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(directory, { recursive: true, force: true }); });
  const get = route => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: server.address().port, path: route, agent: false }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', text: Buffer.concat(chunks).toString() }));
  }).on('error', reject));
  for (const route of ['/nao-existe-xyz/', '/404.html', '/BLOG/', '/pagina?x=1']) {
    const result = await get(route);
    assert.equal(result.status, 404, route);
    assert.match(result.type, /^text\/html/, route);
    assert.match(result.text, /Entrar no grupo grátis/, route);
  }
  for (const route of ['/missing.css', '/x.js', '/server/main.mjs', '/assets/', '/assets/nope.png', '/.env', '/styles.css.map']) {
    const result = await get(route);
    assert.equal(result.status, 404, route);
    assert.equal(result.text, '', route);
  }
});
