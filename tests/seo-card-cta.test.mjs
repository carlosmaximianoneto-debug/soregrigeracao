import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';

const categorySource = 'window.catalogueCategory = () => "Brocas";';
const row = (id, extra = {}) => ({ id, title: `Broca ${id}`, price: 50, url: `https://meli.la/x${id}`, image: 'https://http2.mlstatic.com/a.jpg', ...extra });
const snap = { generatedAt: new Date().toISOString(), products: [
  row('1', { price: 89.9, discount: 15 }), row('2', { discount: 0 }), row('3', { price: 0, discount: 30 }),
  row('4', { discount: '20' }), row('5', { discount: 100 }),
] };
const cardOf = (html, id) => html.match(new RegExp(`<article class="product-card">(?:(?!</article>).)*data-product-id="${id}"(?:(?!</article>).)*</article>`, 's'))[0];

test('SEO cards show the recorded price and a valid discount badge', () => {
  const html = createSeoRenderer(snap, {}, categorySource).render('/catalogo/');
  assert.match(cardOf(html, '1'), /<p class="card-price"><strong>R\$\s?89,90<\/strong><span class="card-off">15% OFF<\/span><\/p>/);
  assert.match(cardOf(html, '2'), /<p class="card-price"><strong>R\$\s?50,00<\/strong><\/p>/);
  assert.match(cardOf(html, '3'), /<p class="card-price"><span class="card-consult">Preço no anúncio<\/span><\/p>/);
  for (const id of ['3', '4', '5']) assert.doesNotMatch(cardOf(html, id), /card-off/);
});

test('SEO card CTA is a button-styled link to the product page', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render('/catalogo/');
  assert.match(cardOf(html, '1'), new RegExp(`<a class="detail-link detail-button" href="${r.products.find(p => p.id === '1').route}"[^>]*>Ver detalhes`));
});