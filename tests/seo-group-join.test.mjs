import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer, validateSeoOptions } from '../seo-runtime.mjs';
import { createSeoHandler } from '../seo-netlify-function.mjs';

const invitationURL = 'https://chat.whatsapp.com/ExampleGroupInvite123';
const categorySource = 'window.catalogueCategory = () => "Brocas";';
const snapshot = { generatedAt: new Date().toISOString(), products: Array.from({length: 25}, (_, index) => ({
  id: String(index + 1), title: `Broca para concreto ${index + 1}`, price: 50,
  url: `https://meli.la/example${index}`, image: 'https://http2.mlstatic.com/example.jpg',
})) };

test('product pages link to the configured group; collections and pagination focus on products', () => {
  const renderer = createSeoRenderer(snapshot, { invitationURL }, categorySource);
  for (const route of renderer.routes) {
    const html = renderer.render(route);
    const links = [...html.matchAll(/<a class="group-join-button" href="([^"]+)"/g)];
    assert.equal(links.length, route.startsWith('/seo/produtos/') ? 1 : 0, route);
    if (!route.startsWith('/seo/produtos/')) continue;
    assert.equal(links[0][1], invitationURL, route);
    assert.match(html, /Entrar no grupo grátis/);
    assert.match(html, /Sem custo para entrar\. Saia quando quiser\./);
    if (route.startsWith('/seo/produtos/')) {
      assert.ok(html.indexOf('Ver oferta no Mercado Livre') < html.indexOf('group-join-button'));
      assert.match(html, /rel="sponsored noopener noreferrer"/);
    }
  }
});

test('missing invitation uses the managed homepage entry; invalid external targets are rejected', () => {
  assert.equal(validateSeoOptions().invitationURL, '/?direto=1');
  for (const invitationURL of ['javascript:alert(1)', 'https://example.com/1234567890',
    'https://chat.whatsapp.com/ExampleGroupInvite123?evil=1',
    'https://user:pass@chat.whatsapp.com/ExampleGroupInvite123']) {
    assert.throws(() => validateSeoOptions({ invitationURL }), /convite/i);
  }
});

test('collections omit invitations and keep buying guidance after the product list', () => {
  const renderer = createSeoRenderer(snapshot, { invitationURL }, categorySource);
  const html = renderer.render('/seo/categorias/brocas/');
  assert.match(html, /class="collection-intro"/);
  assert.ok(html.indexOf('class="collection-advice"') > html.indexOf('class="product-grid"'));
  assert.match(html, /O que conferir antes de comprar/);
  assert.equal((html.match(/class="group-join-button"/g) || []).length, 0);
});

test('the live Netlify handler forwards the group and keeps HEAD / missing product behavior', async () => {
  const handler = createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json',
    invitationURL, categorySource, fetchImpl: async () => new Response(JSON.stringify(snapshot)),
  });
  const productRoute = createSeoRenderer(snapshot, { invitationURL }, categorySource).products[0].route;
  const response = await handler(new Request('https://example.com' + productRoute));
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(`href="${invitationURL}"`));
  const head = await handler(new Request('https://example.com/seo/catalogo/', {method: 'HEAD'}));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await handler(new Request('https://example.com/seo/produtos/missing-999/'))).status, 404);
});
