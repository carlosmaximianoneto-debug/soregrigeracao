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
  removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
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

function setup({ reducedMotion = false, initial, optimized = false, desktop = true } = {}) {
  const document = new Element('document'), carousel = new Element('section', 'pump-carousel');
  const viewport = new Element('div', 'pump-viewport'), track = new Element('div', 'pump-track');
  const controls = new Element('div', 'pump-controls'), pause = new Element('button', 'pump-pause');
  const previous = new Element('button', 'pump-prev'), next = new Element('button', 'pump-next'), counter = new Element('span', 'pump-position'), dots = new Element('div', 'pump-dots');
  viewport.append(track); controls.append(pause, dots, previous, counter, next); carousel.append(viewport, controls); document.append(carousel);
  document.createElement = tag => new Element(tag); document.hidden = false;
  const media = new Element(); media.matches = reducedMotion;
  const desktopMedia = new Element(); desktopMedia.matches = desktop;
  const timers = new Map(); let timerId = 0;
  const context = { document, window: { REFRI_CATALOGUE: { preview: false }, matchMedia: query => query === '(min-width: 901px)' ? desktopMedia : media }, URL, console, setInterval: callback => { timers.set(++timerId, callback); return timerId; }, clearInterval: id => timers.delete(id) };
  if (optimized) context.window.catalogueImageUrl = (url, width) => `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}`;
  if (initial) context.window.REFRI_CURRENT_CATALOGUE = initial;
  vm.runInNewContext(categories, context);
  vm.runInNewContext(source, context);
  return { carousel, track, pause, previous, next, counter, timers, document, media,
    resize: isDesktop => { desktopMedia.matches = isDesktop; desktopMedia.dispatch('change'); },
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

test('initial carousel exposes only current and adjacent image sources, while keeping all 54 pumps', () => {
  const ui = setup({ initial: Array.from({ length: 54 }, (_, i) => pump(i + 1)) });
  const sourced = () => ui.track.children.filter(slide => slide.querySelector('img').src).map(slide => slide.dataset.productId);
  assert.equal(ui.ids().length, 54);
  assert.deepEqual(sourced(), ['1', '2', '54']);
  assert.equal(ui.active().querySelector('img').loading, 'eager');
  assert.equal(ui.active().querySelector('img').fetchPriority, 'high');
  ui.next.dispatch('click');
  assert.deepEqual(sourced(), ['1', '2', '3', '54']);
  for (let i = 0; i < 53; i++) ui.next.dispatch('click');
  assert.equal(ui.active().dataset.productId, '1');
  assert.equal(sourced().length, 54);
});

test('same catalogue preserves active nodes, image sources and the pending rotation timer', () => {
  const rows = [pump(1), pump(2), pump(3), pump(4)];
  const ui = setup({ initial: rows });
  [...ui.timers.values()][0]();
  const active = ui.active(), image = active.querySelector('img'), timer = [...ui.timers.keys()][0];
  ui.update(rows.map(row => ({ ...row })));
  assert.equal(ui.active(), active);
  assert.equal(ui.active().querySelector('img'), image);
  assert.equal([...ui.timers.keys()][0], timer);
});

test('optimized images provide responsive sources and fall back to the original once on failure', () => {
  const ui = setup({ initial: [pump(1)], optimized: true });
  const image = ui.active().querySelector('img');
  assert.match(image.src, /^\/\.netlify\/images\?/);
  assert.match(image.srcset, /400w/); assert.match(image.srcset, /800w/);
  image.dispatch('error');
  assert.equal(image.src, pump(1).image);
  assert.equal(image.srcset, ''); assert.equal(image.hidden, false);
  image.dispatch('error'); assert.equal(image.hidden, true);
  ui.update([pump(1)]); assert.equal(image.hidden, true);
  ui.update([pump(1, undefined, { image: 'https://http2.mlstatic.com/new.jpg' })]);
  assert.equal(image.hidden, false); assert.match(image.src, /new.jpg/);
});

test('a changed offscreen image remains deferred until navigation reaches its neighborhood', () => {
  const rows = Array.from({ length: 8 }, (_, i) => pump(i + 1));
  const ui = setup({ initial: rows });
  ui.update(rows.map(row => row.id === 5 ? { ...row, image: 'https://http2.mlstatic.com/new5.jpg' } : row));
  const image = ui.track.children.find(slide => slide.dataset.productId === '5').querySelector('img');
  assert.equal(image.src, undefined);
  for (let i = 0; i < 3; i++) ui.next.dispatch('click');
  assert.equal(image.src, 'https://http2.mlstatic.com/new5.jpg');
});

test('mobile initial load creates no slides or image sources and starts no autoplay', () => {
  const rows = Array.from({ length: 54 }, (_, i) => pump(i + 1));
  const ui = setup({ desktop: false, initial: rows });
  assert.deepEqual(ui.ids(), []); assert.equal(ui.track.querySelectorAll('img').length, 0);
  assert.equal(ui.timers.size, 0); assert.equal(ui.carousel.hidden, true);
  ui.update(rows); assert.deepEqual(ui.ids(), []); assert.equal(ui.timers.size, 0);
  ui.resize(true);
  assert.equal(ui.ids().length, 54); assert.equal(ui.carousel.hidden, false);
  assert.equal(ui.track.querySelectorAll('img').filter(image => image.src).length, 3);
  assert.equal(ui.timers.size, 1);
});

test('desktop to mobile suspends rotation and defers catalogue changes until desktop returns', () => {
  const ui = setup({ initial: [pump(10), pump(20), pump(30), pump(40)] });
  [...ui.timers.values()][0]();
  assert.equal(ui.active().dataset.productId, '20');
  const previousImage = ui.active().querySelector('img');
  ui.resize(false);
  assert.equal(ui.timers.size, 0); assert.equal(ui.carousel.hidden, true);
  ui.update([pump(5), pump(20, 'Bomba de vácuo nova 20', { image: 'https://http2.mlstatic.com/new20.jpg' }), pump(50)]);
  assert.equal(previousImage.src, pump(20).image);
  assert.deepEqual(ui.ids(), ['10', '20', '30', '40']);
  ui.next.dispatch('click'); assert.equal(ui.active().dataset.productId, '20');
  ui.resize(true);
  assert.deepEqual(ui.ids(), ['5', '20', '50']);
  assert.equal(ui.active().dataset.productId, '20');
  assert.equal(ui.active().querySelector('img').src, 'https://http2.mlstatic.com/new20.jpg');
  assert.equal(ui.carousel.hidden, false); assert.equal(ui.timers.size, 1);
});

test('unchanged catalogue becomes visible again after mobile without rebuilding or losing active product', () => {
  const ui = setup({ initial: [pump(10), pump(20)] });
  [...ui.timers.values()][0](); const active = ui.active();
  ui.resize(false); assert.equal(ui.carousel.hidden, true); assert.equal(ui.timers.size, 0); ui.resize(true);
  assert.equal(ui.active(), active); assert.equal(ui.carousel.hidden, false); assert.equal(ui.timers.size, 1);
});

test('catalogue invalidated on mobile cannot restore removed products on desktop', () => {
  const ui = setup({ initial: [pump(10), pump(20)] });
  ui.resize(false); assert.equal(ui.carousel.hidden, true); ui.update([]); ui.resize(true);
  assert.deepEqual(ui.ids(), []); assert.equal(ui.carousel.hidden, true); assert.equal(ui.timers.size, 0);
});

test('a pending optimized image failure cannot start a fallback download while mobile is hidden', () => {
  const ui = setup({ initial: [pump(1)], optimized: true });
  const image = ui.active().querySelector('img');
  ui.resize(false); image.dispatch('error');
  assert.notEqual(image.src, pump(1).image);
  ui.resize(true); assert.match(image.src, /^\/\.netlify\/images\?/);
  image.dispatch('error'); assert.equal(image.src, pump(1).image);
});
