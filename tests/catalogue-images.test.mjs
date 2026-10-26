import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../catalogue-images.js', import.meta.url), 'utf8').catch(() => '');
const storage = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/imagens/';
function helper(hostname = 'sorefrigeracao.com', enabled = true) {
  const window = { location: { hostname }, REFRI_CATALOGUE: { imageOptimization: enabled } };
  vm.runInNewContext(source, { window, URL, URLSearchParams });
  assert.equal(typeof window.catalogueImageUrl, 'function', 'image URL helper must be available');
  return window.catalogueImageUrl;
}

test('public product images use a bounded WebP thumbnail without changing the source URL', () => {
  const original = `${storage}produto_26.jpg`;
  const url = new URL(helper()(original, 400), 'https://sorefrigeracao.com');
  assert.equal(url.pathname, '/.netlify/images');
  assert.equal(url.searchParams.get('url'), original);
  assert.equal(url.searchParams.get('w'), '400');
  assert.equal(url.searchParams.get('fm'), 'webp');
  assert.equal(url.searchParams.get('fit'), 'contain');
  assert.equal(url.searchParams.get('q'), '75');
  assert.equal(url.searchParams.size, 5, 'do not add per-visit cache busters');
});

test('thumbnail URL safely encodes remote query values and preserves ML source', () => {
  const original = 'https://http2.mlstatic.com/photo.jpg?v=2&name=A%26B';
  const url = new URL(helper()(original, 640), 'https://sorefrigeracao.com');
  assert.equal(url.searchParams.get('url'), original);
  assert.equal(url.searchParams.get('w'), '640');
  assert.equal(url.searchParams.get('name'), null);
});

test('image transforms are restricted to the known public image origins and path', () => {
  const thumbnail = helper();
  for (const original of [
    'https://example.com/photo.jpg',
    'https://http2.mlstatic.com.evil.example/photo.jpg',
    'https://other.supabase.co/storage/v1/object/public/imagens/photo.jpg',
    `${storage.replace('/imagens/', '/private/')}photo.jpg`,
    'https://user:password@http2.mlstatic.com/photo.jpg',
    'https://http2.mlstatic.com:8443/photo.jpg',
    'http://http2.mlstatic.com/photo.jpg',
    'not-a-url',
  ]) assert.equal(thumbnail(original, 400), original);
});

test('Netlify preview and the custom domain optimize but local previews and disabled settings do not', () => {
  const original = `${storage}produto_26.jpg`;
  for (const host of ['sorefrigeracao.com', 'www.sorefrigeracao.com', 'sorefrigeracao.netlify.app', 'deploy-preview-4--sorefrigeracao.netlify.app']) {
    assert.match(helper(host)(original, 400), /^\/\.netlify\/images\?/);
  }
  for (const host of ['localhost', '127.0.0.1', 'sorefrigeracao.com.evil.example', 'example.com']) {
    assert.equal(helper(host)(original, 400), original);
  }
  assert.equal(helper('sorefrigeracao.com', false)(original, 400), original);
});

test('thumbnail width is bounded and deterministic', () => {
  const thumbnail = helper(), original = `${storage}produto_26.jpg`;
  for (const [requested, expected] of [[0, '160'], [500.4, '500'], [9000, '1200'], [undefined, '400'], [NaN, '400']]) {
    assert.equal(new URL(thumbnail(original, requested), 'https://sorefrigeracao.com').searchParams.get('w'), expected);
  }
});

test('the Netlify remote image allowlist is restricted to the same supported image origins', async () => {
  const config = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const block = config.match(/\[images\]([\s\S]*?)(?=\n\[|$)/)?.[1] || '';
  const patterns = [...block.matchAll(/'([^']+)'/g)].map(match => new RegExp(match[1]));
  assert.equal(patterns.length, 2);
  for (const url of [`${storage}produto_26.jpg`, 'https://http2.mlstatic.com/photo.jpg']) assert.ok(patterns.some(pattern => pattern.test(url)));
  for (const url of ['https://evil.example/photo.jpg', 'https://http2.mlstatic.com.evil.example/photo.jpg', `${storage.replace('/imagens/', '/private/')}photo.jpg`]) assert.ok(!patterns.some(pattern => pattern.test(url)));
});
