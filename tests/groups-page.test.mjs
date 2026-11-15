import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createVpsServer, GROUP_INVITE, GROUP_REDIRECT_SECONDS, GROUPS_PAGE_HTML } from '../server/http-server.mjs';

async function start(t) {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'refri-grupos-'));
  const server = createVpsServer({ distDir,
    seoHandler: async () => new Response('seo', { status: 404 }),
    clickHandler: async () => new Response(null, { status: 204 }),
    imageHandler: async () => new Response('image') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('a página /grupos aponta para um convite válido com contagem curta', () => {
  assert.match(GROUP_INVITE, /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{20,24}$/);
  assert.ok(GROUP_REDIRECT_SECONDS >= 3 && GROUP_REDIRECT_SECONDS <= 10);
  assert.ok(GROUPS_PAGE_HTML.includes(`href="${GROUP_INVITE}"`), 'o botão funciona sem JavaScript');
  assert.match(GROUPS_PAGE_HTML, /name="viewport"[^>]*width=device-width/);
  assert.match(GROUPS_PAGE_HTML, /noindex/);
  assert.ok(!/fonts\.googleapis/.test(GROUPS_PAGE_HTML), 'fontes servidas pelo próprio site');
  for (const src of GROUPS_PAGE_HTML.matchAll(/src="([^"]+)"/g)) {
    const url = new URL(src[1].replaceAll('&amp;', '&'), 'https://sorefrigeracao.com');
    assert.equal(url.pathname, '/.netlify/images');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['fit', 'fm', 'q', 'url', 'w']);
    assert.match(url.searchParams.get('url'), /^https:\/\/xlwiwxaghbkdwbtwagwo\.supabase\.co\/storage\/v1\/object\/public\/imagens\/produto_\d+\.jpg$/);
  }
  // O evento usa uma combinação já aceita pelo coletor e pela tabela diária.
  assert.match(GROUPS_PAGE_HTML, /"placement":"home_direct"|placement:'home_direct'/);
});

test('/grupos responde HTML e os apelidos redirecionam preservando UTM', async t => {
  const base = await start(t);
  const page = await fetch(base + '/grupos?utm_source=instagram');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.ok((await page.text()).includes(GROUP_INVITE));
  for (const alias of ['/grupos/', '/grupo', '/grupo/']) {
    const moved = await fetch(base + alias + '?utm_source=ig', { redirect: 'manual' });
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get('location'), '/grupos?utm_source=ig');
  }
  assert.equal((await fetch(base + '/grupos', { method: 'POST' })).status, 405);
  const head = await fetch(base + '/grupos', { method: 'HEAD' });
  assert.equal(head.status, 200);
});
