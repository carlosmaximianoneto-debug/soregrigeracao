import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';

const categorySource = 'window.catalogueCategory = () => "Brocas";';
const snap = { generatedAt: new Date().toISOString(), products: Array.from({length: 6}, (_, i) => ({
  id: String(i + 1), title: `Broca ${i + 1}`, price: 10, url: `https://meli.la/x${i}`, image: 'https://http2.mlstatic.com/a.jpg',
})) };

test('product cards are h3 under a section h2, never extra h2', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const cat = r.render('/catalogo/');
  assert.equal((cat.match(/<h3><a /g) || []).length, 6);
  assert.match(cat, /<h2 class="sr-only">Produtos[^<]*<\/h2>/);
  const product = r.render(r.products[0].route);
  assert.equal((product.match(/<h1>/g) || []).length, 1);
  assert.doesNotMatch(product, /<h2><a /);
});
