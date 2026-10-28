import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeoRenderer} from '../seo-runtime.mjs';
const snapshot = {generatedAt: new Date().toISOString(), products: []};
const renderer = createSeoRenderer(snapshot, {}, 'window.catalogueCategory = () => "Brocas";');

test('old mixed cutting category directs visitors to the current catalogue', () => {
  for (const route of ['/categorias/brocas-e-acessorios-de-corte/', '/categorias/brocas-e-acessorios-de-corte/pagina/2/']) {
    assert.equal(renderer.replacementRoute(route), '/catalogo/');
  }
});
test('unknown category routes do not redirect', () => {
  assert.equal(renderer.replacementRoute('/categorias/desconhecida/'), null);
});
