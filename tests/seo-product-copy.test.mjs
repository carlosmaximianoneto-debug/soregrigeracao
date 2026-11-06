import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer, cleanTitle } from '../seo-runtime.mjs';

const categorySource = 'window.catalogueCategory = () => "Vacuômetros";';
const snap = { generatedAt: new Date().toISOString(), products: [
  { id: '3554', title: '. Medidor De Vácuo Digital Preciso De 1 A 19.000 Mícrons.', price: 383, url: 'https://meli.la/abc', image: 'https://http2.mlstatic.com/a.jpg' },
  { id: '7', title: 'Vacuômetro Digital Com Bateria Recarregável E Conexão 1/4 Para Refrigeração Profissional', price: 199.9, url: 'https://meli.la/def', image: 'https://http2.mlstatic.com/b.jpg' },
] };

test('cleanTitle removes stray leading/trailing punctuation and spaces', () => {
  assert.equal(cleanTitle('. Medidor De Vácuo 19.000 Mícrons.'), 'Medidor De Vácuo 19.000 Mícrons');
  assert.equal(cleanTitle('  Kit 1/4 - 3/8 ;'), 'Kit 1/4 - 3/8');
  assert.equal(cleanTitle('(10 Peças) Broca'), '(10 Peças) Broca');
});

test('product page uses the clean title in title, h1 and alt', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '3554').route);
  assert.match(html, /<title>Medidor De Vácuo Digital Preciso De 1 A 19\.000 Mícrons<\/title>/);
  assert.match(html, /<h1>Medidor De Vácuo Digital Preciso De 1 A 19\.000 Mícrons<\/h1>/);
  assert.match(html, /alt="Medidor De Vácuo Digital Preciso De 1 A 19\.000 Mícrons"/);
  assert.doesNotMatch(html, />\. Medidor/);
});

test('short product titles keep the brand suffix', () => {
  const short = { ...snap, products: [{ id: '8', title: 'Vacuômetro Digital 1/4.', price: 99, url: 'https://meli.la/ghi', image: 'https://http2.mlstatic.com/c.jpg' }] };
  const r = createSeoRenderer(short, {}, categorySource);
  assert.match(r.render(r.products[0].route), /<title>Vacuômetro Digital 1\/4 \| Só Refrigeração<\/title>/);
});

test('long product titles drop the brand suffix instead of overflowing', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '7').route);
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(!title.includes('| Só Refrigeração'));
  assert.ok(title.startsWith('Vacuômetro Digital Com Bateria'));
});

test('meta description is specific, mentions price and the group, max 160 chars', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '3554').route);
  const d = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(d.length <= 160, String(d.length));
  assert.match(d, /R\$\s?383,00/);
  assert.match(d, /WhatsApp/);
  assert.doesNotMatch(d, /^\./);
});
