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
  set innerHTML(value) { this.markup = value; this.htmlWrites = (this.htmlWrites || 0) + 1; }
  get innerHTML() { return this.markup; }
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

async function setup(rows, { preview = false, generatedAt, storage, deferNetwork = false, initialTime, preloaded } = {}) {
  let now = initialTime ?? Date.parse('2026-10-25T12:00:00Z');
  const snapshot = products => ({ generatedAt: new Date(now).toISOString(), products });
  let data = { ...snapshot(rows), ...(generatedAt ? { generatedAt } : {}) };
  let fail = false;
  let blocked = deferNetwork;
  const pending = [], requests = [];
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
    document, window: { localStorage: storage, REFRI_CATALOGUE_PRELOAD: preloaded, REFRI_CATALOGUE: { catalogueUrl: './fixture.json', preview, maxAgeMs: 900000, refreshMs: 300000 } },
    URL, Intl, Date: Clock,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    AbortSignal: { timeout: () => undefined },
    fetch: async (url, options) => { requests.push({url, options}); if (blocked) await new Promise(resolve => pending.push(resolve)); if (fail) throw new Error('Fixture unavailable'); return { ok: true, json: async () => data }; },
    setTimeout: (callback, delay) => { timeouts.set(++timerId, {callback, due: now + delay, delay}); return timerId; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (callback, delay) => { intervals.set(delay, callback); return ++timerId; },
  };
  vm.runInNewContext(categories, context);
  vm.runInNewContext(source, context);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  await settle();
  return {
    nodes, document, updates, intervals, window: context.window, requests,
    ids: () => [...nodes['#products'].innerHTML.matchAll(/class="product-photo" href="https:\/\/meli\.la\/([^"]+)"/g)].map(match => match[1]),
    search: query => {
      nodes['#search'].value = query; nodes['#search'].dispatch('input');
      for (const [id, timer] of timeouts) if (timer.delay === 120) { timeouts.delete(id); timer.callback(); }
    },
    choose: category => { nodes['#category'].value = category; nodes['#category'].dispatch('change'); },
    refresh: async products => { data = snapshot(products); document.dispatch('visibilitychange'); await settle(); },
    failRefresh: async () => { fail = true; document.dispatch('visibilitychange'); await settle(); },
    advance: milliseconds => { now += milliseconds; },
    runDueTimers: () => { for (const [id, timer] of timeouts) if (timer.due <= now) { timeouts.delete(id); timer.callback(); } },
    releaseNetwork: async () => { blocked = false; pending.splice(0).forEach(resolve => resolve()); await settle(); },
    pauseNetwork: () => { blocked = true; },
  };
}

const cacheKey = 'refri-catalogue:v1:./fixture.json';
const epoch = Date.parse('2026-10-25T12:00:00Z');
function memoryStorage(value) {
  const values = new Map(value === undefined ? [] : [[cacheKey, typeof value === 'string' ? value : JSON.stringify(value)]]);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, v) => values.set(key, v), removeItem: key => values.delete(key) };
}
const cached = (rows, receivedAt = epoch, generatedAt = epoch) => ({ receivedAt, data: { generatedAt: new Date(generatedAt).toISOString(), products: rows } });

test('a recent cache displays products before the network finishes and is revalidated once', async () => {
  const storage = memoryStorage(cached([item('old', 'Alicate antigo')]));
  const ui = await setup([item('new', 'Alicate novo')], { storage, deferNetwork: true, initialTime: epoch + 10000 });
  assert.deepEqual(ui.ids(), ['old']);
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].options.cache, 'no-cache');
  assert.equal(ui.nodes['#result-count'].textContent, '1 de 1 produtos');
  await ui.releaseNetwork();
  assert.deepEqual(ui.ids(), ['new']);
  assert.deepEqual(ui.updates.at(-1).map(p => p.id), ['new']);
});

test('cached reads do not renew their one minute lease and expire even while a request is pending', async () => {
  const storage = memoryStorage(cached([item('old', 'Alicate antigo')]));
  const ui = await setup([], { storage, deferNetwork: true, initialTime: epoch + 59000 });
  assert.deepEqual(ui.ids(), ['old']);
  assert.equal(JSON.parse(storage.getItem(cacheKey)).receivedAt, epoch);
  ui.advance(1000); ui.runDueTimers();
  assert.deepEqual(ui.ids(), []);
  assert.deepEqual(ui.updates.at(-1), []);
  assert.equal(storage.getItem(cacheKey), null);
  await ui.releaseNetwork();
});

test('expired, future, corrupt and stale-generated caches never populate the page', async () => {
  for (const value of [cached([item('old', 'Alicate')], epoch - 60000), cached([item('old', 'Alicate')], epoch + 1),
    cached([item('old', 'Alicate')], epoch, epoch - 900001), '{invalid', {receivedAt:epoch, data:{products:null}}]) {
    const ui = await setup([], {storage:memoryStorage(value), deferNetwork:true});
    assert.deepEqual(ui.ids(), []);
    await ui.releaseNetwork();
  }
});

test('a snapshot near its freshness limit expires before the cache lease does', async () => {
  const ui = await setup([], {storage:memoryStorage(cached([item('old', 'Alicate')],epoch,epoch-899000)),deferNetwork:true});
  assert.deepEqual(ui.ids(), ['old']);
  ui.advance(1001);ui.runDueTimers();
  assert.deepEqual(ui.ids(), []);
  await ui.releaseNetwork();
});

test('network errors invalidate stored snapshots and storage failures do not break live results', async () => {
  const storage = memoryStorage();
  const ui = await setup([item('live', 'Alicate')], {storage});
  assert.ok(storage.getItem(cacheKey));
  await ui.failRefresh();
  assert.equal(storage.getItem(cacheKey), null);
  const unavailable = {getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}};
  const fallback = await setup([item('live', 'Alicate')], {storage:unavailable});
  assert.deepEqual(fallback.ids(), ['live']);
});

test('preview and unsafe cached links cannot leak into published results', async () => {
  const storage = memoryStorage(cached([item('bad', 'Alicate', undefined, {url:'javascript:alert(1)'})]));
  const ui = await setup([], {storage,deferNetwork:true});
  assert.deepEqual(ui.ids(), []);
  await ui.releaseNetwork();
  const previewStorage = memoryStorage(cached([item('old', 'Alicate')]));
  const preview = await setup([], {storage:previewStorage,preview:true,deferNetwork:true});
  assert.deepEqual(preview.ids(), []);
  await preview.releaseNetwork();
});

test('unchanged search results keep the existing cards while refreshed prices and URLs update', async () => {
  const rows = [item('pliers', 'Alicate universal')];
  const ui = await setup(rows);
  ui.search('alic');const writes = ui.nodes['#products'].htmlWrites;
  ui.search('alica');ui.search('alicate');
  assert.equal(ui.nodes['#products'].htmlWrites, writes);
  await ui.refresh(rows);
  assert.equal(ui.nodes['#products'].htmlWrites, writes);
  await ui.refresh([item('pliers', 'Alicate universal', undefined, {price:42,url:'https://meli.la/new-link'})]);
  assert.equal(ui.nodes['#products'].htmlWrites, writes + 1);
  assert.match(ui.nodes['#products'].innerHTML,/42,00/);
  assert.deepEqual(ui.ids(), ['new-link']);
});

test('unchanged background refresh preserves expanded pagination and the result count', async () => {
  const rows = Array.from({length:30},(_,i)=>item(`item-${i}`,`Broca ${i}`));
  const ui = await setup(rows);
  ui.nodes['#products'].nextElement.dispatch('click');
  const writes=ui.nodes['#products'].htmlWrites;
  ui.pauseNetwork(); await ui.refresh(rows);
  assert.equal(ui.nodes['#result-count'].textContent,'30 de 30 produtos');
  await ui.releaseNetwork();
  assert.equal(ui.ids().length,30);
  assert.equal(ui.nodes['#products'].htmlWrites,writes);
});

test('the early catalogue request is consumed once instead of downloading the feed twice', async () => {
  const preload={url:'./fixture.json', request:Promise.resolve({ok:true,json:async()=>cached([item('early','Alicate')]).data})};
  const ui = await setup([], {preloaded:preload});
  assert.deepEqual(ui.ids(),['early']);
  assert.equal(ui.requests.length,0);
  await ui.refresh([item('fresh','Alicate')]);
  assert.deepEqual(ui.ids(),['fresh']);
  assert.equal(ui.requests.length,1);
});

test('an early request failure or expired response body gets one normal retry', async () => {
  for(const request of [Promise.reject(new Error('early timeout')),Promise.resolve({ok:true,json:async()=>{throw Error('body aborted');}})]){
    request.catch(()=>{});
    const ui=await setup([item('live','Alicate')],{preloaded:{url:'./fixture.json',request}});
    assert.deepEqual(ui.ids(),['live']);
    assert.equal(ui.requests.length,1);
  }
});

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

test('complete words keep precise matches and do not introduce fuzzy matches', async () => {
  const ui = await setup(fixtures);
  for (const [query, expected] of [['cola', ['glue']], ['gas', ['gas', 'gases']], ['furadera', []]]) {
    ui.search(query); assert.deepEqual(ui.ids(), expected, query);
  }
});

test('typing alica immediately shows pliers in the product grid, without a suggestion menu', async () => {
  const ui = await setup(fixtures);
  for (const query of ['ali', 'alic', 'alica', 'alicat', 'alicate', 'alicates']) {
    ui.search(query); assert.deepEqual(ui.ids(), ['clamp', 'pliers'], query);
  }
  ui.choose('Chaves e alicates'); ui.search('alica');
  assert.deepEqual(ui.ids(), ['pliers']);
});

test('unfinished words rank direct products before matching accessories', async () => {
  const ui = await setup([item('holder', 'Suporte para alicate'), item('pliers', 'Alicate universal')]);
  ui.search('alica'); assert.deepEqual(ui.ids(), ['pliers', 'holder']);
});

test('the final word can be partial while earlier terms must match', async () => {
  const ui = await setup(fixtures);
  ui.search('bomba vá'); assert.deepEqual(ui.ids(), ['pump', 'pump-oil', 'pump-kit']);
  ui.search('alicate digi'); assert.deepEqual(ui.ids(), ['clamp']);
});

test('raw prefixes are not mistaken for inflected complete words', async () => {
  const ui = await setup([
    item('brand', 'Alicate Tramontina'), item('transformer', 'Transformador de tensão'),
    item('adapter', 'Adaptador de conexão'), item('adapters', 'Jogo de Adaptadores de latão'),
  ]);
  ui.search('trans'); assert.deepEqual(ui.ids(), ['transformer']);
  ui.search('adaptadore'); assert.deepEqual(ui.ids(), ['adapters']);
});

test('an exact word elsewhere does not block a partial model or a category search', async () => {
  const ui = await setup([
    item('number', 'Kit com 18 peças'), item('drill', 'Furadeira GSB 18V'),
    item('brand', 'Abraçadeira SD TOOLS'), item('bit', 'Broca SDS Plus', 'Brocas'),
  ]);
  ui.search('gsb 18'); assert.deepEqual(ui.ids(), ['drill']);
  ui.choose('Brocas'); ui.search('sd'); assert.deepEqual(ui.ids(), ['bit']);
});

test('complete broca keeps precision instead of expanding to brocante', async () => {
  const ui = await setup([item('screw', 'Parafuso auto brocante'), item('bit', 'Broca de concreto')]);
  ui.search('broca'); assert.deepEqual(ui.ids(), ['bit']);
  ui.search('bro'); assert.deepEqual(ui.ids(), ['bit', 'screw']);
});

test('partial hose searches preserve explicit absence and ambiguous prefixes', async () => {
  const ui = await setup([
    item('no-hose', 'Manifold sem mangueiras'), item('hose', 'Mangueira de carga'),
    item('kit', 'Lavadora sem fio com mangueira'), item('gauge', 'Manômetro digital'),
  ]);
  ui.search('mangu'); assert.deepEqual(ui.ids(), ['hose', 'kit']);
  ui.search('sem mangu'); assert.deepEqual(ui.ids(), ['no-hose']);
  ui.search('man'); assert.deepEqual(ui.ids(), ['no-hose', 'hose', 'gauge', 'kit']);
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
