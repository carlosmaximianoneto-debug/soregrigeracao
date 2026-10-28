import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';
import { createSeoHandler } from '../seo-netlify-function.mjs';

const base = 'https://sorefrigeracao.com';
const productURL = 'https://meli.la/ExemploTruerza';
const categorySource = 'window.catalogueCategory = () => "Esmerilhadeiras";';
const product = (overrides = {}) => ({
  id: 77, title: 'Esmerilhadeira Lixadeira Angular Led 12000rpm 4.1/2 Truerza',
  price: 134.34, image: 'https://http2.mlstatic.com/exemplo.jpg', url: productURL, ...overrides,
});
const snapshot = products => ({ generatedAt: new Date().toISOString(), products });
const rendererFor = (products, options = { production: true, base }) => createSeoRenderer(snapshot(products), options, categorySource);
const graphOf = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const typedNodes = (value, type) => {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(child => typedNodes(child, type))].filter(node => node?.['@type'] === type);
};
const visiblePrice = html => html.match(/<div class="price-reference"><span>[^<]*<\/span><strong>([^<]+)<\/strong>/)?.[1];

test('individual Product includes a factual BRL Offer matching its visible price and destination', () => {
  const renderer = rendererFor([product()]);
  const route = '/produtos/esmerilhadeira-lixadeira-angular-led-12000rpm-4-1-2-truerza-77/';
  const html = renderer.render(route);
  const entries = typedNodes(graphOf(html), 'Product');
  assert.equal(entries.length, 1);
  const item = entries[0];
  assert.equal(item.name, 'Esmerilhadeira Lixadeira Angular Led 12000rpm 4.1/2 Truerza');
  assert.equal(item.url, base + route);
  assert.deepEqual(item.offers, { '@type': 'Offer', priceCurrency: 'BRL', price: '134.34', url: productURL });
  assert.equal(visiblePrice(html), 'R$\u00a0134,34');
  assert.ok(html.includes(`href="${item.offers.url}" data-track-event="affiliate_click"`));
  assert.match(html, /data-product-id="77" data-placement="product_offer"/);
  assert.match(html, /data-track-event="whatsapp_click" data-product-id="77"/);
  assert.ok(html.includes(`<link rel="canonical" href="${base}${route}">`));
});

test('Offer uses the same cent rounding as the visible BRL amount', () => {
  for (const [price, amount, visible] of [
    [1.005, '1.01', 'R$\u00a01,01'], [2.675, '2.68', 'R$\u00a02,68'],
    [999.999, '1000.00', 'R$\u00a01.000,00'], [0.005, '0.01', 'R$\u00a00,01'],
    [150, '150.00', 'R$\u00a0150,00'],
  ]) {
    const renderer = rendererFor([product({ price })]);
    const html = renderer.render(renderer.products[0].route);
    const item = typedNodes(graphOf(html), 'Product')[0];
    assert.equal(item?.offers?.price, amount, String(price));
    assert.equal(visiblePrice(html), visible, String(price));
  }
});

test('product purchase area discloses the affiliate relationship alongside existing buying checks', () => {
  const renderer = rendererFor([product()]);
  const html = renderer.render(renderer.products[0].route);
  const notice = html.match(/<p class="destination-note">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(notice?.includes('Link de afiliado: podemos receber comissão pela compra.'));
  assert.ok(notice.includes('Confira a versão selecionada, o vendedor, o frete e a disponibilidade antes de comprar.'));
  assert.ok(html.indexOf('class="destination-note"') < html.indexOf('class="group-join"'));
});

test('schema never invents availability, expiry, seller, ratings, reference price or discount claims', () => {
  const renderer = rendererFor([product({ availability: 'InStock', priceValidUntil: '2099-12-31',
    seller: 'Example', originalPrice: 999, discount: 90, aggregateRating: { ratingValue: 5 }, review: 'great',
  })]);
  const html = renderer.render(renderer.products[0].route);
  const item = typedNodes(graphOf(html), 'Product')[0];
  assert.ok(item.offers, 'a price-backed Offer is required without fabricating review data');
  for (const name of ['availability','priceValidUntil','seller','aggregateRating','review','priceSpecification','originalPrice','discount','shippingDetails','hasMerchantReturnPolicy']) {
    assert.equal(Object.hasOwn(item, name), false, name);
    assert.equal(Object.hasOwn(item.offers, name), false, name);
  }
  assert.equal(item.offers.url, productURL);
});

test('missing or invalid prices retain a WebPage without ineligible Product or Offer nodes', () => {
  for (const price of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '134.34', 'R$134,34', true, {}, [], 0.004]) {
    const renderer = rendererFor([product({ price })]);
    const route = renderer.products[0].route;
    const html = renderer.render(route);
    const graph = graphOf(html);
    assert.equal(typedNodes(graph, 'Product').length, 0, String(price));
    assert.equal(typedNodes(graph, 'Offer').length, 0, String(price));
    const page = typedNodes(graph, 'WebPage')[0];
    assert.equal(page?.name, product().title, String(price));
    assert.equal(page?.url, base + route, String(price));
    assert.equal(page?.inLanguage, 'pt-BR');
    assert.match(html, /Consulte preço e condições no anúncio/);
    assert.equal(visiblePrice(html), undefined);
    assert.equal(typedNodes(graph, 'BreadcrumbList').length, 1);
    assert.match(html, /data-track-event="affiliate_click"/);
  }
});

test('catalogue, categories and pagination keep simple ItemLists without nested incomplete Products', () => {
  const products = Array.from({ length: 25 }, (_, i) => product({ id: i + 1,
    title: `Esmerilhadeira ${String(i + 1).padStart(2, '0')}`, price: i % 2 ? null : 50,
  }));
  const renderer = rendererFor(products);
  for (const [route, count, firstPosition] of [
    ['/catalogo/', 24, 1], ['/catalogo/pagina/2/', 1, 25],
    ['/categorias/esmerilhadeiras/', 24, 1], ['/categorias/esmerilhadeiras/pagina/2/', 1, 25],
  ]) {
    const graph = graphOf(renderer.render(route));
    assert.equal(typedNodes(graph, 'Product').length, 0, route);
    assert.equal(typedNodes(graph, 'Offer').length, 0, route);
    const collection = typedNodes(graph, 'CollectionPage')[0];
    assert.equal(collection.url, base + route);
    assert.equal(collection.mainEntity['@type'], 'ItemList');
    assert.equal(collection.mainEntity.itemListElement.length, count);
    assert.equal(collection.mainEntity.itemListElement[0].position, firstPosition);
    for (const item of collection.mainEntity.itemListElement) {
      assert.equal(item['@type'], 'ListItem');
      assert.ok(item.name && item.url.startsWith(base + '/produtos/'));
    }
  }
});

test('unsafe product URLs cannot become Offer destinations and script-like titles remain data', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/item', 'https://user:pass@example.com/item']) {
    assert.throws(() => rendererFor([product({ url })]), /Produto inválido/);
  }
  const title = 'Ferramenta </script><script>alert("injection")</script>';
  const renderer = rendererFor([product({ title })]);
  const html = renderer.render(renderer.products[0].route);
  assert.ok(!html.includes('<script>alert("injection")</script>'));
  const item = typedNodes(graphOf(html), 'Product')[0];
  assert.equal(item.name, title);
  assert.equal(item.offers?.url, productURL);
});

test('live handler refresh changes schema price and removes offers when source has no valid price', async () => {
  let now = Date.now();
  let source = { generatedAt: new Date(now).toISOString(), products: [product()] };
  const handler = createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json', categorySource,
    production: true, base, now: () => now, fetchImpl: async () => Response.json(source),
  });
  const route = '/produtos/esmerilhadeira-lixadeira-angular-led-12000rpm-4-1-2-truerza-77/';
  const first = await handler(new Request(base + route));
  assert.equal(first.status, 200);
  assert.equal(typedNodes(graphOf(await first.text()), 'Offer')[0]?.price, '134.34');
  now += 31_000;
  source = { generatedAt: new Date(now).toISOString(), products: [product({ price: 99.9 })] };
  const next = await handler(new Request(base + route));
  const nextHTML = await next.text();
  assert.equal(typedNodes(graphOf(nextHTML), 'Offer')[0]?.price, '99.90');
  assert.equal(visiblePrice(nextHTML), 'R$\u00a099,90');
  now += 31_000;
  source = { generatedAt: new Date(now).toISOString(), products: [product({ price: null })] };
  const missingPrice = await handler(new Request(base + route));
  assert.equal(missingPrice.status, 200);
  const lastGraph = graphOf(await missingPrice.text());
  assert.equal(typedNodes(lastGraph, 'Product').length, 0);
  assert.equal(typedNodes(lastGraph, 'Offer').length, 0);
  assert.equal(typedNodes(lastGraph, 'WebPage').length, 1);
});
