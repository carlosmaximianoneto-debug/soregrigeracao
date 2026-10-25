import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../carousel.js', import.meta.url), 'utf8');
const categories = await fs.readFile(new URL('../categories.js', import.meta.url), 'utf8');

// The browser DOM is the external boundary; selection, refresh and navigation run
// through the real carousel script. This minimal fixture needs no runtime package.
class Element {
  constructor(tag = 'div', className = '') { Object.assign(this, { tagName: tag.toUpperCase(), className, children: [], dataset: {}, attributes: {}, events: {}, style: {}, hidden: false, textContent: '' }); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(type, listener) { (this.events[type] ||= []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this.events[type] || []) listener({ target: this, preventDefault() {}, ...event }); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) {
    const parts = selector.split(' '), matches = (node, part) => part.startsWith('.') ? node.className.split(' ').includes(part.slice(1)) : part === '[data-slide]' ? node.dataset.slide !== undefined : node.tagName === part.toUpperCase();
    const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
    let scope = [this];
    for (const part of parts) scope = scope.flatMap(node => descendants(node).filter(child => matches(child, part)));
    return scope;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
}

function setup({ reducedMotion = false, initial } = {}) {
  const document = new Element('document'), carousel = new Element('section', 'pump-carousel');
  const viewport = new Element('div', 'pump-viewport'), track = new Element('div', 'pump-track');
  const controls = new Element('div', 'pump-controls'), pause = new Element('button', 'pump-pause');
  const previous = new Element('button', 'pump-prev'), next = new Element('button', 'pump-next'), counter = new Element('span', 'pump-position'), dots = new Element('div', 'pump-dots');
  viewport.append(track); controls.append(pause, dots, previous, counter, next); carousel.append(viewport, controls); document.append(carousel);
  document.createElement = tag => new Element(tag); document.hidden = false;
  const media = new Element(); media.matches = reducedMotion;
  const timers = new Map(); let timerId = 0;
  const context = { document, window: { REFRI_CATALOGUE: { preview: false }, matchMedia: () => media }, URL, console, setInterval: callback => { timers.set(++timerId, callback); return timerId; }, clearInterval: id => timers.delete(id) };
  if (initial) context.window.REFRI_CURRENT_CATALOGUE = initial;
  vm.runInNewContext(categories, context);
  vm.runInNewContext(source, context);
  return { carousel, track, pause, previous, next, counter, timers, document, media,
    update: products => document.dispatch('catalogue:updated', { detail: { products } }),
    ids: () => track.children.map(slide => slide.dataset.productId),
    active: () => track.children.find(slide => slide.getAttribute('aria-hidden') === 'false'),
  };
}

const pump = (id, title = `Bomba de vácuo ${id} 6 CFM`, changes = {}) => ({ id, title, image: `https://http2.mlstatic.com/${id}.jpg`, url: `https://meli.la/pump${id}`, ...changes });

test('classifies vacuometers and pump accessories separately without excluding complete pumps', () => {
  const context = { window: {} }; vm.runInNewContext(categories, context);
  for (const title of ['Vacuômetro Analógico Para Bomba De Vácuo', 'Vacuômetro Analógico + Adaptador Para Bomba Vácuo', 'Vacuometro Analógico Suryha Para Bomba De Vacuo']) assert.equal(context.window.catalogueCategory(title), 'Vacuômetros');
  assert.equal(context.window.catalogueCategory('Bomba de Vácuo 3 CFM Com Vacuômetro'), 'Bombas de vácuo');
});

test('shows all live pumps beyond the former four, while excluding cleaning pumps and accessories', () => {
  const ui = setup();
  ui.update([...Array.from({ length: 12 }, (_, i) => pump(i + 1)), pump(20, 'Kit Refrigeração com Bomba de Vácuo e Manifold'), pump(30, 'Bomba de Limpeza de Ar Condicionado'), pump(31, 'Vacuômetro Para Bomba De Vácuo'), pump(32, 'Óleo Para Bomba De Vácuo'), pump(33, 'Mangueira Para Bomba De Vácuo'), pump(34, 'Tampa Para Bomba De Vácuo')]);
  assert.deepEqual(ui.ids(), ['1','2','3','4','5','6','7','8','9','10','11','12','20']);
  assert.equal(ui.carousel.hidden, false);
  assert.equal(ui.counter.textContent, '1 / 13');
});

test('refresh adds new pumps, removes unavailable pumps and preserves the active product by ID', () => {
  const ui = setup(); ui.update([pump(10), pump(20), pump(30)]); ui.next.dispatch('click');
  assert.equal(ui.active().dataset.productId, '20');
  ui.update([pump(30), pump(5), pump(20)]);
  assert.deepEqual(ui.ids(), ['5','20','30']);
  assert.equal(ui.active().dataset.productId, '20');
  ui.update([pump(30)]);
  assert.deepEqual(ui.ids(), ['30']);
  assert.equal(ui.active().dataset.productId, '30');
});

test('refresh uses the current product title, image and affiliate URL', () => {
  const ui = setup(); ui.update([pump(10)]);
  ui.update([pump(10, 'Bomba de vácuo atualizada <6 CFM>', { image: 'https://http2.mlstatic.com/new.jpg', url: 'https://meli.la/newPJ' })]);
  assert.equal(ui.active().querySelector('strong').textContent, 'Bomba de vácuo atualizada <6 CFM>');
  assert.equal(ui.active().querySelector('img').src, 'https://http2.mlstatic.com/new.jpg');
  assert.equal(ui.active().querySelector('a').href, 'https://meli.la/newPJ');
});

test('empty or expired catalogue event removes all slides without restoring fixed fallback products', () => {
  const ui = setup(); assert.equal(ui.carousel.hidden, true); ui.update([pump(10), pump(20)]); assert.equal(ui.timers.size, 1); ui.update([]);
  assert.deepEqual(ui.ids(), []); assert.equal(ui.carousel.hidden, true); assert.equal(ui.timers.size, 0);
});

test('handles a catalogue that loaded before the carousel script and deduplicates IDs', () => {
  const ui = setup({ initial: [pump(10), pump(10), pump(20)] });
  assert.deepEqual(ui.ids(), ['10','20']);
});

test('keeps automatic motion paused for reduced motion and supports manual next and previous', () => {
  const ui = setup({ reducedMotion: true }); ui.update([pump(10), pump(20)]);
  assert.equal(ui.timers.size, 0); ui.next.dispatch('click'); assert.equal(ui.active().dataset.productId, '20');
  ui.previous.dispatch('click'); assert.equal(ui.active().dataset.productId, '10');
  assert.equal(ui.timers.size, 0);
});

test('does not render unsafe destinations or accessories mislabeled as pumps', () => {
  const ui = setup(); ui.update([pump(1), pump(2, 'Vacuômetro Para Bomba De Vácuo', { category: 'Bombas de vácuo' }), pump(3, undefined, { url: 'javascript:alert(1)' }), pump(4, undefined, { image: 'https://untrusted.invalid/image.jpg' })]);
  assert.deepEqual(ui.ids(), ['1']);
});
