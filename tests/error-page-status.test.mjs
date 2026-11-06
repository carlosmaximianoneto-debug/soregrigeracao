import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoHandler } from '../seo-netlify-function.mjs';

const invitationURL = 'https://chat.whatsapp.com/ExampleGroupInvite123';

test('a temporary outage page never claims the page is a 404', async () => {
  const handler = createSeoHandler({ snapshotURL: 'https://example.com/catalogue.json', invitationURL,
    categorySource: 'window.catalogueCategory = () => "Brocas";', fetchImpl: async () => new Response('down', { status: 500 }) });
  const response = await handler(new Request('https://example.com/catalogo/'));
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.doesNotMatch(html, /404/);
  assert.match(html, /Catálogo em atualização/);
  assert.match((await handler.notFound('GET').text()), /ERRO 404/);
});
