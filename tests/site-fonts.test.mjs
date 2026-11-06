import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FONT_FILES, fontHead } from '../site-identity.mjs';
import { createSeoRenderer } from '../seo-runtime.mjs';
import { createBlogRenderer } from '../blog-runtime.mjs';
import { productionHTML, PUBLIC_FILES as BUILD_FILES } from '../scripts/build-site.mjs';
import { PUBLIC_FILES as SERVER_FILES } from '../server/http-server.mjs';

const google = /fonts\.(googleapis|gstatic)\.com/;

test('self-hosted fonts exist, are versioned and are published by build and server', () => {
  assert.equal(FONT_FILES.length, 3);
  for (const file of FONT_FILES) {
    assert.match(file, /^assets\/blog\/fonts\/[a-z-]+-[a-f0-9]{10}\.woff2$/);
    assert.ok(fs.existsSync(new URL('../' + file, import.meta.url)), file);
    assert.ok(BUILD_FILES.includes(file) && SERVER_FILES.includes(file), file);
  }
  assert.match(fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8'), /!assets\/blog\/fonts\//);
});

test('font head preloads the two first-paint fonts and declares every face locally', () => {
  const head = fontHead();
  assert.equal((head.match(/rel="preload"[^>]*as="font"[^>]*type="font\/woff2" crossorigin/g) || []).length, 2);
  assert.equal((head.match(/@font-face/g) || []).length, 3);
  assert.match(head, /font-display:swap/);
  assert.doesNotMatch(head, google);
});

test('home, SEO pages and blog no longer wait for Google Fonts', () => {
  const home = productionHTML(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const snap = { generatedAt: new Date().toISOString(), products: [{ id: '1', title: 'Broca', price: 9, url: 'https://meli.la/a', image: 'https://http2.mlstatic.com/a.jpg' }] };
  const seo = createSeoRenderer(snap, {}, 'window.catalogueCategory = () => "Brocas";').render('/catalogo/');
  for (const html of [home, seo]) {
    assert.doesNotMatch(html, google);
    assert.match(html, /\/assets\/blog\/fonts\/inter-[a-f0-9]{10}\.woff2/);
  }
  const blogSource = fs.readFileSync(new URL('../blog-runtime.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(blogSource, google);
  assert.match(blogSource, /fontHead\(\)/);
});