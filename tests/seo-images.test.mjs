import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createSeoRenderer } from '../seo-runtime.mjs';

const origin = 'https://sorefrigeracao.com';
const storage = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/imagens/';
const photo = `${storage}produto_26.jpg?v=2&name=A%26B`;
const row = (id, image = photo) => ({ id, title: `Broca para concreto ${id}`, image, url: `https://meli.la/example${id}`, price: 50 });
function render(rows, production = true) {
  return createSeoRenderer({ generatedAt: new Date().toISOString(), products: rows },
    production ? { production: true, base: origin } : {}, 'window.catalogueCategory=()=>"Brocas";');
}
const attributes = html => Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value.replaceAll('&amp;', '&')]));
const imageTags = html => [...html.matchAll(/<img\b[^>]+>/g)].map(([tag]) => attributes(tag));

test('SEO lists deliver responsive thumbnails with stable source URLs and bounded eager images', () => {
  const renderer = render(Array.from({ length: 8 }, (_, i) => row(i + 1)));
  for (const route of ['/catalogo/', '/categorias/brocas/']) {
    const html = renderer.render(route), images = imageTags(html);
    assert.equal(images.length, 8);
    assert.match(html, /<script src="\/catalogue-images\.js" defer><\/script>/);
    images.forEach((img, index) => {
      const url = new URL(img.src, origin);
      assert.equal(url.pathname, '/.netlify/images');
      assert.equal(url.searchParams.get('url'), photo);
      assert.equal(url.searchParams.get('w'), '400');
      assert.equal(url.searchParams.get('q'), '75');
      assert.equal(url.searchParams.get('fm'), 'webp');
      assert.equal(url.searchParams.get('fit'), 'contain');
      assert.equal(url.searchParams.size, 5);
      assert.match(img.srcset, /240w, .*400w, .*640w$/);
      assert.ok(img.sizes.includes('max-width: 640px'));
      assert.equal(img['data-original'], photo);
      assert.equal(img['data-catalogue-fallback'], 'true');
      assert.equal(img.width, '500'); assert.equal(img.height, '500');
      assert.equal(img.loading, index < 4 ? 'eager' : 'lazy');
    });
  }
});

test('product hero loads eagerly with high priority; related images remain lazy and metadata uses original', () => {
  const renderer = render([row(1), row(2), row(3)]), html = renderer.render(renderer.products[0].route);
  const [hero, ...related] = imageTags(html);
  assert.equal(new URL(hero.src, origin).searchParams.get('w'), '800');
  assert.match(hero.srcset, /400w, .*800w, .*1200w$/);
  assert.equal(hero.fetchpriority, 'high'); assert.equal(hero.loading, 'eager');
  assert.equal(hero.width, '800'); assert.equal(hero.height, '800');
  assert.ok(related.every(img => img.loading === 'lazy'));
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(graph['@graph'].find(node => node['@type'] === 'Product').image, photo);
  assert.match(html, /property="og:image" content="https:\/\/xlwiwxaghbkdwbtwagwo\.supabase\.co/);
});

test('previews and sources outside the exact transform contract keep the original image', () => {
  const originals = [
    '/assets/example.jpg', 'https://other.supabase.co/storage/v1/object/public/imagens/photo.jpg',
    `${storage.replace('/imagens/', '/other/')}photo.jpg`, 'https://example.com/photo.jpg',
    'https://http2.mlstatic.com.evil.example/photo.jpg', 'https://http2.mlstatic.com:8443/photo.jpg',
    'https://http2.mlstatic.com/photo.svg', 'https://http2.mlstatic.com/photo%20new.jpg',
    `https://http2.mlstatic.com/photo.jpg?${'x'.repeat(520)}`,
  ];
  for (const image of originals) {
    const renderer = render([row(1, image)]), img = imageTags(renderer.render(renderer.products[0].route))[0];
    assert.equal(img.src, image, image);
    assert.equal(img.srcset, undefined, image);
    assert.equal(img['data-original'], undefined, image);
  }
  const preview = render([row(1)], false), html = preview.render(preview.products[0].route);
  assert.equal(imageTags(html)[0].src, photo);
  assert.ok(!html.includes('src="/catalogue-images.js"'));
});

test('SEO image fallback handles early and later failures once, without interfering with homepage handlers', async () => {
  const code = await fs.readFile(new URL('../catalogue-images.js', import.meta.url), 'utf8');
  const makeImage = (original, complete = false, marker = 'true') => ({
    tagName: 'IMG', dataset: { original, catalogueFallback: marker }, complete, naturalWidth: 0,
    currentSrc: '/.netlify/images?example', srcset: 'example 400w', assignments: [],
    removeAttribute(name) { this[name] = ''; },
    set src(value) { this.currentSrc = value; this.assignments?.push(value); },
    get src() { return this.currentSrc; },
  });
  const early = makeImage(photo, true), later = makeImage('https://http2.mlstatic.com/photo.jpg');
  const homepage = makeImage(photo, true, undefined); delete homepage.dataset.catalogueFallback;
  const unsafe = makeImage('javascript:alert(1)', true);
  const events = {};
  const document = { querySelectorAll: () => [early, later, homepage, unsafe], addEventListener(name, handler, capture) { events[name] = { handler, capture }; } };
  vm.runInNewContext(code, { document, window: { location: { hostname: 'sorefrigeracao.com' } }, URL, URLSearchParams });
  assert.equal(early.currentSrc, photo); assert.equal(early.srcset, '');
  assert.equal(later.currentSrc, '/.netlify/images?example');
  assert.equal(homepage.currentSrc, '/.netlify/images?example');
  assert.equal(unsafe.currentSrc, '/.netlify/images?example');
  assert.equal(events.error.capture, true);
  events.error.handler({ target: later }); events.error.handler({ target: later });
  assert.equal(later.currentSrc, 'https://http2.mlstatic.com/photo.jpg');
  assert.equal(later.assignments.length, 1);
});
