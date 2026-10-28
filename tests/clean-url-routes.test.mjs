import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';
import { createSeoHandler, config } from '../seo-netlify-function.mjs';

const base = 'https://sorefrigeracao.com';
const initialTime = Date.parse('2026-10-28T12:00:00Z');
const categorySource = 'window.catalogueCategory = () => "Brocas";';
const products = Array.from({ length: 25 }, (_, index) => ({
  id: String(index + 1), title: `Broca de concreto ${index + 1}`, price: 50,
  url: `https://meli.la/example${index + 1}`, image: 'https://http2.mlstatic.com/example.jpg',
}));
const snapshot = (items = products, time = initialTime) => ({ generatedAt: new Date(time).toISOString(), products: items });
const options = { production: true, base };
function fixture({ production = true } = {}) {
  let clock = initialTime;
  let responseSnapshot = snapshot();
  let unavailable = false;
  const handler = createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json', categorySource,
    production, base: production ? base : '', now: () => clock,
    fetchImpl: async () => unavailable ? new Response('', { status: 503 }) : Response.json(responseSnapshot),
  });
  return { handler,
    request: (route, method = 'GET') => handler(new Request(base + route, { method })),
    setFeed: value => { responseSnapshot = value; },
    setTime: value => { clock = value; },
    failFeed: () => { unavailable = true; },
  };
}

test('renderer emits clean routes, canonical metadata, schemas and internal anchors', () => {
  const renderer = createSeoRenderer(snapshot(), options, categorySource);
  assert.ok(renderer.routes.includes('/catalogo/'));
  assert.ok(renderer.routes.includes('/catalogo/pagina/2/'));
  assert.ok(renderer.routes.includes('/categorias/brocas/pagina/2/'));
  assert.ok(renderer.routes.includes('/produtos/broca-de-concreto-1-1/'));
  for (const route of renderer.routes) {
    assert.ok(!route.startsWith('/seo/'), route);
    const html = renderer.render(route);
    assert.ok(html.includes(`<link rel="canonical" href="${base}${route}">`));
    assert.ok(html.includes(`<meta property="og:url" content="${base}${route}">`));
    assert.doesNotMatch(html, /(?:href="|"url":\s*"|"item":\s*")(?:https:\/\/sorefrigeracao\.com)?\/seo\//);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(structured['@graph'].some(entity => entity.url === base + route));
    assert.match(html, /data-track-event="product_view_click"/);
  }
  const product = renderer.render('/produtos/broca-de-concreto-1-1/');
  assert.match(product, /data-track-event="affiliate_click" data-product-id="1" data-placement="product_offer"/);
  assert.match(product, /data-track-event="whatsapp_click" data-product-id="1" data-placement="product_whatsapp"/);
});

test('clean canonical routes render live HTML and HEAD without redirects', async () => {
  const { request } = fixture();
  for (const route of ['/catalogo/', '/catalogo/pagina/2/', '/categorias/brocas/', '/categorias/brocas/pagina/2/', '/produtos/broca-de-concreto-1-1/']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('location'), null, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
    assert.match(await response.text(), /Broca/);
    const head = await request(route, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
});

test('legacy, renamed and noncanonical page URLs resolve in one 301 to the final clean route', async () => {
  const { request } = fixture();
  const cases = [
    ['/seo/catalogo/', '/catalogo/'],
    ['/seo/catalogo', '/catalogo/'],
    ['/seo/catalogo/index.html?utm_source=old', '/catalogo/'],
    ['/seo/catalogo/pagina/2/index.html?x=1', '/catalogo/pagina/2/'],
    ['/seo/categorias/brocas/pagina/2', '/categorias/brocas/pagina/2/'],
    ['/seo/produtos/broca-de-concreto-1-1/', '/produtos/broca-de-concreto-1-1/'],
    ['/seo/produtos/nome-antigo-1/index.html?utm_source=old', '/produtos/broca-de-concreto-1-1/'],
    ['/produtos/nome-antigo-1?x=1', '/produtos/broca-de-concreto-1-1/'],
    ['/produtos/broca-de-concreto-1-1/index.html?x=1', '/produtos/broca-de-concreto-1-1/'],
    ['/catalogo', '/catalogo/'],
    ['/catalogo/pagina/1/', '/catalogo/'],
    ['/seo/categorias/brocas/pagina/01/index.html', '/categorias/brocas/'],
    ['/catalogo/pagina/02/?x=1', '/catalogo/pagina/2/'],
    ['/seo/categorias/brocas-e-acessorios-de-corte/pagina/2/', '/catalogo/'],
  ];
  for (const [from, target] of cases) {
    const response = await request(from);
    assert.equal(response.status, 301, from);
    assert.equal(response.headers.get('location'), target, from);
    assert.equal((await request(target)).status, 200, `redirect chain from ${from}`);
  }
});

test('unknown, removed and malformed routes never redirect to an unrelated page or external origin', async () => {
  const { request } = fixture();
  for (const route of [
    '/seo/', '/seo', '/produtos', '/categorias/', '/seo/unknown/',
    '/seo/produtos/removed-999/', '/produtos/removed-999/',
    '/seo/catalogo/pagina/3/', '/catalogo/pagina/0/', '/categorias/missing/',
    '/seo//evil.example/', '/seo/produtos/nested/old-1/', '/produtos/nested/old-1/',
    '/seo/produtos/%2Fexample-1/', '/seo/produtos/old-1/extra/',
  ]) {
    const response = await request(route);
    assert.equal(response.status, 404, route);
    assert.equal(response.headers.get('location'), null, route);
    assert.match(await response.text(), /noindex,nofollow/);
  }
});

test('fresh feed removal invalidates clean pages and legacy redirects after the cache expires', async () => {
  const f = fixture();
  assert.equal((await f.request('/produtos/broca-de-concreto-1-1/')).status, 200);
  f.setTime(initialTime + 31_000);
  f.setFeed(snapshot(products.filter(p => p.id !== '1'), initialTime + 31_000));
  for (const route of ['/produtos/broca-de-concreto-1-1/', '/seo/produtos/nome-antigo-1/']) {
    const response = await f.request(route);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
    assert.doesNotMatch(await response.text(), /example1"/);
  }
  const sitemap = await (await f.request('/sitemap.xml')).text();
  assert.ok(!sitemap.includes('/produtos/broca-de-concreto-1-1/'));
});

test('expired or unavailable feed returns 503 instead of stale pages, sitemap or legacy redirects', async () => {
  for (const unavailable of [false, true]) {
    const f = fixture();
    assert.equal((await f.request('/catalogo/')).status, 200);
    f.setTime(initialTime + 16 * 60_000);
    if (unavailable) f.failFeed();
    for (const route of ['/produtos/broca-de-concreto-1-1/', '/seo/produtos/nome-antigo-1/', '/sitemap.xml', '/seo/sitemap.xml']) {
      const response = await f.request(route);
      assert.equal(response.status, 503, route);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('retry-after'), '60');
      assert.doesNotMatch(await response.text(), /example1"/);
    }
  }
});

test('sitemap and robots advertise only clean canonical URLs and old endpoints redirect once', async () => {
  const { request } = fixture();
  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  const xml = await sitemap.text();
  assert.ok(xml.includes('<loc>https://sorefrigeracao.com/catalogo/</loc>'));
  assert.ok(xml.includes('<loc>https://sorefrigeracao.com/produtos/broca-de-concreto-1-1/</loc>'));
  assert.ok(!xml.includes('/seo/'));
  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.equal(await robots.text(), 'User-agent: *\nAllow: /\nSitemap: https://sorefrigeracao.com/sitemap.xml\n');
  for (const [old, target] of [
    ['/seo/sitemap.xml', '/sitemap.xml'], ['/seo/sitemap.xml?x=1', '/sitemap.xml'],
    ['/seo/robots.txt', '/robots.txt'], ['/seo/robots.txt?x=1', '/robots.txt'],
    ['/sitemap.xml?x=1', '/sitemap.xml'], ['/robots.txt?x=1', '/robots.txt'],
  ]) {
    const response = await request(old);
    assert.equal(response.status, 301, old);
    assert.equal(response.headers.get('location'), target);
  }
});

test('preview indexing and HTTP method safeguards remain intact on new and old routes', async () => {
  const { request } = fixture({ production: false });
  const response = await request('/catalogo/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.doesNotMatch(await response.text(), /rel="canonical"/);
  assert.equal(await (await request('/robots.txt')).text(), 'User-agent: *\nDisallow: /\n');
  assert.equal((await request('/sitemap.xml')).status, 404);
  assert.equal((await request('/seo/sitemap.xml')).status, 404);
  for (const route of ['/catalogo/', '/seo/catalogo/', '/sitemap.xml']) {
    const post = await request(route, 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  }
});

test('function routing covers bare collection prefixes, clean families and legacy URLs without shadowing unrelated paths', () => {
  assert.equal(config.preferStatic, false);
  for (const route of ['/produtos', '/produtos/*', '/categorias', '/categorias/*', '/catalogo', '/catalogo/*', '/seo', '/seo/*', '/sitemap.xml', '/robots.txt']) {
    assert.ok(config.path.includes(route), route);
  }
  assert.ok(!config.path.includes('/*'));
});
