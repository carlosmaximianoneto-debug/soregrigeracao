import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../catalogue.js', import.meta.url), 'utf8');
const categories = await fs.readFile(new URL('../categories.js', import.meta.url), 'utf8');

// Only browser boundaries are replaced. The real script fetches a local fixture,
// responds to UI events, filters, renders and publishes catalogue updates in a VM.
class Element {
  constructor(tag = 'div') {
    Object.assign(this, { tagName: tag.toUpperCase(), value: '', hidden: false,
      textContent: '', innerHTML: '', events: {}, attributes: {}, dataset: {}, children: [] });
    this.classList = { add() {}, toggle() {} };
  }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  dispatch(type, event = {}) {
    for (const callback of this.events[type] || []) callback({ target: this, preventDefault() {}, ...event });
  }
  dispatchEvent(event) { this.dispatch(event.type, event); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  querySelectorAll() { return []; }
  after(element) { this.nextElement = element; }
  focus() { this.focused = true; }
}

const item = (id, title, category = 'Outras ferramentas e acessórios', changes = {}) => ({
  id, title, category, price: 99.90,
  image: `https://http2.mlstatic.com/${id}.jpg`, url: `https://meli.la/${id}`, ...changes,
});

async function setup(rows, { preview = false, generatedAt } = {}) {
  let now = Date.parse('2026-10-25T12:00:00Z');
  const snapshot = products => ({ generatedAt: new Date(now).toISOString(), products });
  let data = { ...snapshot(rows), ...(generatedAt ? { generatedAt } : {}) };
  let fail = false;
  const selectors = ['#search', '#category', '.filters', '#products', '#result-count', '#empty',
    '.catalogue-note', '.results-meta>span', '#catalogue-search', '#reset-search', '.mobile-join'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, new Element()]));
  const document = new Element('document');
  document.querySelector = selector => nodes[selector] || null;
  document.createElement = tag => new Element(tag);
  document.hidden = false;
  const timeouts = new Map(), intervals = new Map(), updates = [];
  let timerId = 0;
  document.addEventListener('catalogue:updated', event => updates.push(Array.from(event.detail.products)));
  class Clock extends Date { static now() { return now; } }
  const context = {
    document, window: { REFRI_CATALOGUE: { catalogueUrl: './fixture.json', preview, maxAgeMs: 900000, refreshMs: 300000 } },
    URL, Intl, Date: Clock,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    AbortSignal: { timeout: () => undefined },
    fetch: async () => { if (fail) throw new Error('Fixture unavailable'); return { ok: true, json: async () => data }; },
    setTimeout: callback => { timeouts.set(++timerId, callback); return timerId; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (callback, delay) => { intervals.set(delay, callback); return ++timerId; },
  };
  vm.runInNewContext(categories, context);
  vm.runInNewContext(source, context);
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  await settle();
  return {
    nodes, document, updates, intervals, window: context.window,
    ids: () => [...nodes['#products'].innerHTML.matchAll(/class="product-photo" href="https:\/\/meli\.la\/([^"]+)"/g)].map(match => match[1]),
    search: query => {
      nodes['#search'].value = query; nodes['#search'].dispatch('input');
      for (const callback of timeouts.values()) callback(); timeouts.clear();
    },
    choose: category => { nodes['#category'].value = category; nodes['#category'].dispatch('change'); },
    refresh: async products => { data = snapshot(products); document.dispatch('visibilitychange'); await settle(); },
    failRefresh: async () => { fail = true; document.dispatch('visibilitychange'); await settle(); },
    advance: milliseconds => { now += milliseconds; },
  };
}

const fixtures = [
  item('grinder', 'Esmerilhadeira angular 4 polegadas', 'Brocas e acessórios de corte'),
  item('blade', 'Disco de corte diamantado', 'Brocas e acessórios de corte'),
  item('bit', 'Broca para concreto 6 mm', 'Brocas e acessórios de corte'),
  item('bits', 'Jogo de brocas para metal', 'Brocas e acessórios de corte'),
  item('hole-saw', 'Serra-copo diamantada 65 mm', 'Serras-copo'),
  item('hole-saws', 'Kit serras copo para concreto', 'Serras-copo'),
  item('pump-oil', 'Óleo para bomba de vácuo', 'Gases e óleos refrigerantes'),
  item('pump-kit', 'Kit refrigeração com bomba de vácuo e manifold', 'Bombas de vácuo'),
  item('pump', 'Bomba de vácuo 6 CFM', 'Bombas de vácuo'),
  item('cleaner', 'Bomba de limpeza de ar condicionado', 'Bombas de limpeza'),
  item('drill', 'Furadeira de impacto', 'Furadeiras e parafusadeiras'),
  item('driver', 'Parafusadeira elétrica', 'Furadeiras e parafusadeiras'),
  item('manifold', 'Manifold digital', 'Manifolds e manômetros'),
  item('gauge', 'Manômetro analógico', 'Manifolds e manômetros'),
  item('multimeter', 'Multímetro digital', 'Multímetros e alicates amperímetros'),
  item('clamp', 'Alicate amperímetro digital', 'Multímetros e alicates amperímetros'),
  item('wrench', 'Chave ajustável', 'Chaves e alicates'),
  item('pliers', 'Alicate universal', 'Chaves e alicates'),
  item('gas', 'Gás refrigerante R410A', 'Gases e óleos refrigerantes'),
  item('gases', 'Kit de gases refrigerantes', 'Gases e óleos refrigerantes'),
  item('hose', 'Mangueira de carga para refrigeração', 'Gases e óleos refrigerantes'),
  item('glue', 'Cola para isolamento térmico', 'Fitas e isolamento'),
  item('insulation', 'Isolamento térmico autocolante', 'Fitas e isolamento'),
];

test('broca matches the title, never the broad category shared by grinders and discs', async () => {
  const ui = await setup(fixtures); ui.search('Broca');
  assert.deepEqual(ui.ids(), ['bit', 'bits']);
});

for (const [query, expected] of [
  ['serracopo', ['hole-saw', 'hole-saws']],
  ['SERRAS-COPO', ['hole-saw', 'hole-saws']],
  ['bombas de vacuo', ['pump', 'pump-oil', 'pump-kit']],
  ['furadeiras', ['drill']],
  ['manifolds', ['manifold', 'pump-kit']],
  ['multimetros', ['multimeter']],
  ['chaves', ['wrench']],
  ['alicates', ['clamp', 'pliers']],
  ['gases', ['gas', 'gases']],
]) {
  test(`search ${JSON.stringify(query)} accepts common plurals without category-only results`, async () => {
    const ui = await setup(fixtures); ui.search(query);
    assert.deepEqual(ui.ids(), expected);
  });
}

test('accents, case, separators and connective words do not hide matching products', async () => {
  const ui = await setup(fixtures); ui.search('  BÓMBA — DE VÁCUO  ');
  assert.deepEqual(ui.ids(), ['pump', 'pump-oil', 'pump-kit']);
  ui.search('serra para copo');
  assert.deepEqual(ui.ids(), ['hole-saw', 'hole-saws']);
});

test('whole words reject misleading fragments and do not introduce fuzzy matches', async () => {
  const ui = await setup(fixtures);
  for (const [query, expected] of [['cola', ['glue']], ['gas', ['gas', 'gases']], ['bro', []], ['furadera', []]]) {
    ui.search(query); assert.deepEqual(ui.ids(), expected, query);
  }
});

test('supports common Portuguese consonant plurals without broad prefix stemming', async () => {
  const ui = await setup([
    item('connection', 'Conexão de cobre'), item('connections', 'Conexões de latão'),
    item('adapter', 'Adaptador para conexão'), item('adapters', 'Adaptadores de cobre'),
    item('terminal', 'Terminal elétrico'), item('terminals', 'Terminais elétricos'),
  ]);
  ui.search('conexões'); assert.deepEqual(ui.ids(), ['connection', 'connections', 'adapter']);
  ui.search('adaptador'); assert.deepEqual(ui.ids(), ['adapter', 'adapters']);
  ui.search('terminal'); assert.deepEqual(ui.ids(), ['terminal', 'terminals']);
});

test('requires every meaningful word and ranks direct titles before accessories and kits', async () => {
  const ui = await setup(fixtures); ui.search('bomba vácuo');
  assert.deepEqual(ui.ids(), ['pump', 'pump-oil', 'pump-kit']);
  ui.search('bomba limpeza'); assert.deepEqual(ui.ids(), ['cleaner']);
  ui.search('kit bomba manifold'); assert.deepEqual(ui.ids(), ['pump-kit']);
});

test('mangueira excludes an explicit sem mangueira while preserving included hoses and kits', async () => {
  const ui = await setup([
    item('no-hoses', 'Manifold 2 Vias Premium Sem Mangueiras Ar Condicionado Suryha'),
    item('no-hose', 'Manifold Digital Elitech SMG-1H com Manômetro Sem Mangueira'),
    item('hose', 'Mangueira de vácuo'),
    item('kit', 'Kit manifold com mangueiras e maleta'),
    item('wireless', 'Lavadora sem fio com mangueira'),
  ]);
  ui.search('mangueira'); assert.deepEqual(ui.ids(), ['hose', 'kit', 'wireless']);
  ui.search('manifold mangueiras'); assert.deepEqual(ui.ids(), ['kit']);
});

test('sem mangueira explicitly finds hose-free products without changing sem fio search', async () => {
  const ui = await setup([
    item('no-hose', 'Manifold digital sem mangueiras'),
    item('kit', 'Manifold com mangueira sem maleta'),
    item('wireless', 'Lavadora sem fio com mangueira'),
  ]);
  ui.search('sem mangueira'); assert.deepEqual(ui.ids(), ['no-hose']);
  ui.search('sem fio'); assert.deepEqual(ui.ids(), ['wireless']);
  ui.search('manifold'); assert.deepEqual(ui.ids(), ['no-hose', 'kit']);
});

test('category filters remain an independent intersection with title search', async () => {
  const ui = await setup(fixtures);
  ui.choose('Brocas e acessórios de corte');
  assert.deepEqual(ui.ids(), ['grinder', 'blade', 'bit', 'bits']);
  ui.search('brocas'); assert.deepEqual(ui.ids(), ['bit', 'bits']);
  ui.choose('Furadeiras e parafusadeiras'); assert.deepEqual(ui.ids(), []);
  ui.nodes['#reset-search'].dispatch('click');
  assert.deepEqual(ui.ids(), fixtures.map(product => product.id));
  assert.equal(ui.nodes['#category'].value, 'all');
  assert.equal(ui.nodes['#search'].focused, true);
});

test('blank and punctuation-only queries preserve catalogue order and pagination', async () => {
  const rows = Array.from({ length: 30 }, (_, index) => item(`item-${index}`, `Broca ${index}`));
  const ui = await setup(rows); ui.search(' -- ');
  assert.deepEqual(ui.ids(), rows.slice(0, 24).map(product => product.id));
  assert.equal(ui.nodes['#products'].nextElement.hidden, false);
  ui.nodes['#products'].nextElement.dispatch('click');
  assert.deepEqual(ui.ids(), rows.map(product => product.id));
  assert.equal(ui.nodes['#products'].nextElement.hidden, true);
  ui.search('broca 29'); assert.deepEqual(ui.ids(), ['item-29']);
  assert.equal(ui.nodes['#empty'].hidden, true);
  ui.search('inexistente'); assert.deepEqual(ui.ids(), []);
  assert.equal(ui.nodes['#empty'].hidden, false);
});

test('refresh reindexes changed titles and publishes the complete valid feed to carousel listeners', async () => {
  const ui = await setup(fixtures); ui.search('broca');
  assert.equal(ui.updates.at(-1).length, fixtures.length);
  await ui.refresh([item('grinder', 'Esmerilhadeira'), item('new', 'Brocas para madeira')]);
  assert.deepEqual(ui.ids(), ['new']);
  assert.deepEqual(ui.updates.at(-1).map(product => product.id), ['grinder', 'new']);
  assert.equal(ui.nodes['#products'].getAttribute('aria-busy'), 'false');
});

test('refresh resets a category that disappeared, so a valid search cannot remain invisibly filtered', async () => {
  const ui = await setup(fixtures); ui.choose('Brocas e acessórios de corte'); ui.search('broca');
  await ui.refresh([item('new', 'Broca de aço', 'Ferramentas manuais')]);
  assert.deepEqual(ui.ids(), ['new']);
  assert.equal(ui.nodes['#category'].value, 'all');
});

test('unsafe or duplicate feed entries never appear in results or update events', async () => {
  const ui = await setup([
    item('valid', 'Broca'), item('valid', 'Broca duplicada'),
    item('bad-link', 'Broca', undefined, { url: 'javascript:alert(1)' }),
    item('bad-image', 'Broca', undefined, { image: 'https://untrusted.invalid/image.jpg' }),
  ]); ui.search('broca');
  assert.deepEqual(ui.ids(), ['valid']);
  assert.deepEqual(ui.updates.at(-1).map(product => product.id), ['valid']);
  assert.match(ui.nodes['#products'].innerHTML, /rel="sponsored noopener noreferrer"/);
});

test('expired feed and failed refresh clear products, including carousel updates', async () => {
  const ui = await setup(fixtures);
  ui.advance(900001); ui.intervals.get(60000)();
  assert.deepEqual(ui.ids(), []); assert.deepEqual(ui.updates.at(-1), []);
  ui.search('broca'); assert.deepEqual(ui.ids(), []);
  await ui.refresh(fixtures); assert.deepEqual(ui.ids(), ['bit', 'bits']);
  await ui.failRefresh();
  assert.deepEqual(ui.ids(), []); assert.deepEqual(ui.updates.at(-1), []);
  assert.equal(ui.nodes['#products'].getAttribute('aria-busy'), 'false');
});

test('stale feed is rejected before search indexing', async () => {
  const ui = await setup(fixtures, { generatedAt: '2020-01-01T00:00:00Z' });
  ui.search('broca'); assert.deepEqual(ui.ids(), []); assert.deepEqual(ui.updates.at(-1), []);
});
