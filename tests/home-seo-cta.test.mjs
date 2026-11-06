import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productionHTML, invitationContract } from '../scripts/build-site.mjs';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Buscadores juntam o texto dos elementos; <br> não vira espaço.
const text = h => h.replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

test('headings keep word boundaries when tags are stripped', () => {
  for (const [, h] of source.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)) {
    assert.doesNotMatch(text(h), /PARAREFRIGERISTA|ASÓ|OFERTASCHEGAM|SIMPLES\.A/, h);
  }
});

test('the static empty state is not a heading', () => {
  assert.doesNotMatch(source, /<h3>Nenhum produto/);
});

test('home links to at least eight core categories without JavaScript', () => {
  const nav = source.match(/<nav class="home-categories"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'home-categories nav');
  const links = [...nav[0].matchAll(/href="(\/categorias\/[a-z0-9-]+\/)"/g)].map(m => m[1]);
  assert.ok(new Set(links).size >= 8, String(links.length));
});

test('steps section ends with a join CTA and the three managed invitations stay intact', () => {
  const how = source.match(/<section class="how"[\s\S]*?<\/section>/)[0];
  assert.match(how, /data-placement="home_steps" data-page-type="home"/);
  assert.match(how, /href="\/\?direto=1"/);
  assert.match(invitationContract(source), /^https:\/\/chat\.whatsapp\.com\//);
});

test('production home exposes the visible FAQ as FAQPage', () => {
  const html = productionHTML(source);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.flatMap(b => b['@graph'] || [b]).find(n => n['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage');
  assert.equal(faq.mainEntity.length, 6);
  assert.match(faq.mainEntity[0].name, /refrigerista/);
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  assert.doesNotMatch(faq.mainEntity[0].acceptedAnswer.text, /<|\+$/);
});
