import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';

const categorySource = 'window.catalogueCategory = () => "Brocas";';
const row = (id, discount, price = 54) => ({ id: String(id), title: `Broca para concreto ${id}`, price, discount,
  url: `https://meli.la/example${id}`, image: 'https://http2.mlstatic.com/example.jpg' });
const discounts = [14, 0, null, undefined, 100, 150, 12.5, '20'];
const renderer = createSeoRenderer({ generatedAt: new Date().toISOString(),
  products: discounts.map((d, i) => row(i + 1, d)).concat(row(99, 30, 0)) }, {}, categorySource);
const priceBlock = id => {
  const product = renderer.products.find(p => p.id === String(id));
  const html = renderer.render(product.route);
  return html.match(/<div class="price-reference">[\s\S]*?<\/div>/)?.[0] || '';
};

test('product page shows the same recorded discount badge as its card', () => {
  const block = priceBlock(1);
  assert.match(block, /<strong>R\$\s?54,00<\/strong><span class="card-off">14% OFF<\/span>/);
});

test('product page never shows a badge for missing, invalid or out-of-range discounts', () => {
  for (let id = 2; id <= discounts.length; id++) assert.doesNotMatch(priceBlock(id), /OFF/, `id ${id}`);
});
