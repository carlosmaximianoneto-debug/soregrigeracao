# SEO, design e CTA de entrada no grupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar SEO on-page, leitura visual e conversão para o grupo do WhatsApp em sorefrigeracao.com, sem mexer no carregamento do JSON nem nos bots.

**Architecture:** As páginas SEO (catálogo, categorias, produtos) são geradas em `seo-runtime.mjs`; a home é `index.html` processada por `scripts/build-site.mjs`. Os cliques são contados por `site-clicks.js` → relay → Edge `refri-site-click` (`operations/clicks/handler.mjs`) → tabela `refri_site_click_daily` com CHECK de placements.

**Tech Stack:** Node 22, `node:test`, HTML/CSS estático, Supabase Edge (Deno) e Postgres.

**Spec:** pedido do proprietário em 05/11/2026: "melhorar SEO (com skill), design e CTA de entrada no grupo; a velocidade fica para o final; não mexer no carregamento do JSON". Auditoria `searchfit-seo:seo-audit` registrada em `C:/Users/MORDOR/Documents/Codex/reports/refri-site-melhorias-20261106`.

## Global Constraints

- `index.html` deve manter **exatamente três** âncoras `href="https://chat.whatsapp.com/..."` idênticas (contrato de `invitationContract` e `scripts/publish_route.py`).
- Não alterar `catalogue.js` no fluxo de carregamento do JSON, `/api/catalogue-first`, nem `server/`.
- Não inventar dados de produto (estoque, avaliação, marca). Preço só o já exibido.
- Placements novos precisam existir nos três lugares: `site-clicks.js`, `operations/clicks/handler.mjs` (+ Edge publicada) e CHECK da tabela. Ordem de publicação: banco → Edge → site.
- Nenhum nome pessoal; identidade pública CMN DIGITAL.
- Texto em português do Brasil.

## Achados da auditoria (base)

1. Títulos de produto com pontuação solta: `. Medidor De Vácuo ... Mícrons.` em `<title>`, H1, alt e description.
2. `<title>` de produto passa de 70 caracteres; description repete o título e é genérica (185 caracteres).
3. Cards de produto usam `<h2>`: catálogo com 26 H2, produto com H2 para cada relacionado.
4. Home: H1/H2 com `<br>` sem espaço → texto extraído "PARAREFRIGERISTA", "ASÓ", "OFERTASCHEGAM"; `<h3>Nenhum produto nesta seleção.</h3>` no HTML estático; nenhum link estático para categorias; FAQ sem `FAQPage`.
5. Catálogo e categorias: nenhum convite do grupo.
6. Mobile: botão flutuante da home é só um círculo com ícone; páginas SEO não têm atalho fixo para o grupo.
7. Passo a passo "O grupo é simples" termina sem botão.

---

### Task 1: Título limpo, title tag e meta description de produto

**Files:**
- Modify: `seo-runtime.mjs` (normalização do título, `renderProduct`)
- Test: `tests/seo-product-copy.test.mjs` (novo)

**Interfaces:**
- Produces: `cleanTitle(value: string): string` exportada de `seo-runtime.mjs`; `products[i].title` passa a ser o título limpo.

- [ ] **Step 1: Write the failing test** (`tests/seo-product-copy.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer, cleanTitle } from '../seo-runtime.mjs';
const categorySource = 'window.catalogueCategory = () => "Vacuômetros";';
const snap = { generatedAt: new Date().toISOString(), products: [
  { id: '3554', title: '. Medidor De Vácuo Digital Preciso De 1 A 19.000 Mícrons.', price: 383, url: 'https://meli.la/abc', image: 'https://http2.mlstatic.com/a.jpg' },
  { id: '7', title: 'Vacuômetro Digital Com Bateria Recarregável E Conexão 1/4 Para Refrigeração Profissional', price: 199.9, url: 'https://meli.la/def', image: 'https://http2.mlstatic.com/b.jpg' },
] };
test('cleanTitle removes stray leading/trailing punctuation and spaces', () => {
  assert.equal(cleanTitle('. Medidor De Vácuo 19.000 Mícrons.'), 'Medidor De Vácuo 19.000 Mícrons');
  assert.equal(cleanTitle('  Kit 1/4 - 3/8 ;'), 'Kit 1/4 - 3/8');
  assert.equal(cleanTitle('(10 Peças) Broca'), '(10 Peças) Broca');
});
test('product page uses the clean title in title, h1 and alt', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '3554').route);
  assert.match(html, /<title>Medidor De Vácuo Digital Preciso De 1 A 19\.000 Mícrons \| Só Refrigeração<\/title>/);
  assert.match(html, /<h1>Medidor De Vácuo Digital Preciso De 1 A 19\.000 Mícrons<\/h1>/);
  assert.doesNotMatch(html, />\. Medidor/);
});
test('long product titles drop the brand suffix instead of overflowing', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '7').route);
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(!title.includes('| Só Refrigeração'));
  assert.ok(title.startsWith('Vacuômetro Digital Com Bateria'));
});
test('meta description is specific, mentions price and the group, max 160 chars', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const html = r.render(r.products.find(p => p.id === '3554').route);
  const d = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(d.length <= 160, d.length);
  assert.match(d, /R\$\s?383,00/);
  assert.match(d, /WhatsApp/);
  assert.doesNotMatch(d, /^\./);
});
```

- [ ] **Step 2:** `node --test tests/seo-product-copy.test.mjs` → FAIL (`cleanTitle` não exportada).
- [ ] **Step 3: Implement** em `seo-runtime.mjs`:

```js
export const cleanTitle = value => String(value ?? '').replace(/\s+/g, ' ').trim()
  .replace(/^[.,;:!\-–—·\s]+/, '').replace(/[.,;:\-–—·\s]+$/, '').trim();
const fitText = (text, max) => text.length <= max ? text : text.slice(0, text.lastIndexOf(' ', max - 1)).replace(/[,;:\-–—\s]+$/, '') + '…';
// produtos: const title = cleanTitle(row.title);  (rota continua derivada do mesmo slug)
// renderProduct:
const pageTitle = product.title.length + BRAND.length + 3 <= 65 ? `${product.title} | ${BRAND}` : product.title;
const description = fitText(`${product.title}${product.price ? ` por ${money(product.price)}` : ''}. Compare com outros modelos de ${product.category.toLowerCase()} e receba ofertas no grupo do WhatsApp.`, 160);
```

- [ ] **Step 4:** teste novo PASS e `npm test` completo PASS.
- [ ] **Step 5: Commit** `feat(seo): clean product titles, shorter titles and specific descriptions`

### Task 2: Hierarquia de títulos nos cards e listagens

**Files:** Modify `seo-runtime.mjs` (`card`, `collection`), `seo-pages.css`; Test `tests/seo-headings.test.mjs` (novo)

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';
const categorySource = 'window.catalogueCategory = () => "Brocas";';
const snap = { generatedAt: new Date().toISOString(), products: Array.from({length: 6}, (_, i) => ({ id: String(i + 1), title: `Broca ${i + 1}`, price: 10, url: `https://meli.la/x${i}`, image: 'https://http2.mlstatic.com/a.jpg' })) };
test('product cards are h3 under a section h2, never extra h2', () => {
  const r = createSeoRenderer(snap, {}, categorySource);
  const cat = r.render('/catalogo/');
  assert.equal((cat.match(/<h3><a /g) || []).length, 6);
  assert.match(cat, /<h2 class="sr-only">Produtos[^<]*<\/h2>/);
  const product = r.render(r.products[0].route);
  assert.equal((product.match(/<h1>/g) || []).length, 1);
  assert.doesNotMatch(product, /<h2><a /);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** em `card()` trocar `<h2>…</h2>` por `<h3>…</h3>`; em `collection()` inserir `<h2 class="sr-only">Produtos de ${name}</h2>` no início de `.listing`; em `seo-pages.css` trocar `.product-copy>h2` e `.catalogue-layout .product-copy h2` por `h3` e garantir `.sr-only` existente. **Step 4:** PASS + suíte. **Step 5: Commit** `fix(seo): product cards use h3 under a section heading`

### Task 3: Convite do grupo no catálogo/categorias e barra fixa no celular

**Files:** Modify `seo-runtime.mjs` (`groupJoin`, `document`, `collection`), `seo-pages.css`; Modify `tests/seo-group-join.test.mjs`

**Interfaces:** `groupJoin({ productId, placement, pageType })`; placements `product_whatsapp`, `collection_whatsapp`, `product_floating`, `collection_floating`.

- [ ] **Step 1: Atualizar teste** (substitui "collections omit invitations"):

```js
test('collections end with one invitation and every SEO page has a mobile join bar', () => {
  const renderer = createSeoRenderer(snapshot, { invitationURL }, categorySource);
  const html = renderer.render('/categorias/brocas/');
  const inline = [...html.matchAll(/<a class="group-join-button" href="([^"]+)"[^>]*data-placement="([^"]+)"/g)];
  assert.equal(inline.length, 1);
  assert.equal(inline[0][2], 'collection_whatsapp');
  assert.ok(html.indexOf('class="group-join"') > html.indexOf('class="product-grid"'));
  assert.match(html, /class="seo-join-bar"[\s\S]*data-placement="collection_floating"/);
  const product = renderer.render(renderer.products[0].route);
  assert.match(product, /class="seo-join-bar"[\s\S]*data-placement="product_floating" data-page-type="product"/);
});
```
e no primeiro teste trocar a contagem para `1` em todas as rotas.

- [ ] **Step 2:** FAIL. **Step 3:** `groupJoin` parametrizado; em `collection()` acrescentar `groupJoin({productId:0, placement:'collection_whatsapp', pageType})` depois do `.collection-advice`/`catalogue-note`; em `document()` acrescentar antes de `</body>`:

```html
<aside class="seo-join-bar" aria-label="Grupo de ofertas no WhatsApp"><a href="{convite}" data-track-event="whatsapp_click" data-product-id="{id|0}" data-placement="{product_floating|collection_floating}" data-page-type="{pageType}" target="_blank" rel="noopener noreferrer">{ícone}<span>Entrar no grupo de ofertas</span><small>grátis</small></a></aside>
```
CSS: escondida acima de 700px; abaixo, `position:fixed; bottom:0; left:0; right:0;` verde, 56px, `padding-bottom:env(safe-area-inset-bottom)`, e `body{padding-bottom:72px}` no mobile.
- [ ] **Step 4:** PASS + suíte. **Step 5: Commit** `feat(cta): group invitation on collections and mobile join bar on SEO pages`

### Task 4: Contagem dos novos CTAs

**Files:** Modify `operations/clicks/handler.mjs`, `site-clicks.js`; Test `tests/site-click-backend.test.mjs`, `tests/site-clicks.test.mjs`; Create `operations/clicks/add-cta-placements.sql`

- [ ] **Step 1: Teste** em `site-click-backend.test.mjs`:

```js
test('accepts the new group CTAs with coherent product ids', () => {
  const ok = [
    { event_type: 'whatsapp_click', product_id: 0, placement: 'home_steps', page_type: 'home' },
    { event_type: 'whatsapp_click', product_id: 0, placement: 'collection_whatsapp', page_type: 'category' },
    { event_type: 'whatsapp_click', product_id: 0, placement: 'collection_floating', page_type: 'catalogue' },
    { event_type: 'whatsapp_click', product_id: 42, placement: 'product_floating', page_type: 'product' },
  ];
  for (const e of ok) assert.deepEqual(validateClick(e), e);
  assert.equal(validateClick({ ...ok[1], product_id: 42 }), null);
  assert.equal(validateClick({ ...ok[3], product_id: 0 }), null);
  assert.equal(validateClick({ ...ok[1], page_type: 'product' }), null);
});
```
- [ ] **Step 2:** FAIL. **Step 3:** RULES `home_steps:['home','whatsapp_click']`, `collection_whatsapp`/`collection_floating:[['catalogue','category'],'whatsapp_click']`, `product_floating:['product','whatsapp_click']`; regra `noProduct` para whatsapp passa a `page_type !== 'product'`; mesmos placements em `site-clicks.js`. SQL: recriar `refri_site_click_daily_placement_check` e `refri_click_coherent_dimensions` com os quatro placements.
- [ ] **Step 4:** PASS + suíte. **Step 5: Commit** `feat(metrics): count new group CTAs`

### Task 5: Home — textos legíveis, FAQ estruturado, categorias e CTAs

**Files:** Modify `index.html`, `floating-join.css`, `mobile-refinements.css`, `scripts/build-site.mjs`; Test `tests/home-seo-cta.test.mjs` (novo)

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productionHTML, invitationContract } from '../scripts/build-site.mjs';
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const text = h => h.replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
test('headings keep word boundaries when tags are stripped', () => {
  for (const [, h] of source.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)) assert.doesNotMatch(text(h), /PARAREFRIGERISTA|ASÓ|OFERTASCHEGAM|ÉSIMPLES/);
});
test('static empty state is not a heading', () => assert.doesNotMatch(source, /<h3>Nenhum produto/));
test('home links to core categories without JavaScript', () => {
  const links = [...source.matchAll(/href="(\/categorias\/[a-z0-9-]+\/)"/g)].map(m => m[1]);
  assert.ok(new Set(links).size >= 8);
});
test('steps section has a join CTA that keeps the three managed invitations', () => {
  assert.match(source, /data-placement="home_steps"/);
  assert.equal(invitationContract(source).startsWith('https://chat.whatsapp.com/'), true);
});
test('production home exposes the visible FAQ as FAQPage', () => {
  const html = productionHTML(source);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const faq = graph.find(n => n['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 6);
  assert.match(faq.mainEntity[0].name, /refrigerista/);
});
```
- [ ] **Step 2:** FAIL. **Step 3:** espaços antes de `<br>`; `<h3>` vazio → `<p class="empty-title">`; `<nav class="home-categories">` com 8 categorias núcleo; CTA após `<ol>` do passo a passo: `<a class="button button-wa how-join" href="/?direto=1" data-join-copy …placement="home_steps">` + script que copia o href do `.hero-join` (fallback sem JS: `/?direto=1`); `productionHTML` extrai `<details><summary>` da seção `.questions` para `FAQPage`; `floating-join.css` no celular vira barra com texto "Entrar no grupo de ofertas".
- [ ] **Step 4:** PASS + suíte + `npm run build`. **Step 5: Commit** `feat(home): readable headings, FAQ schema, category links and join CTAs`

### Task 6: Publicação

- [ ] Migration do CHECK no Supabase (superset) → deploy Edge `refri-site-click` com o handler novo → PR e merge em `main` → autodeploy da VPS.
- [ ] Verificar `/healthz` com a revisão nova; títulos/H1 de um produto; contagem de convites; barra no celular (375px); clique de teste? **não** (não gerar métrica falsa).
- [ ] PM2 dos bots com os mesmos PIDs.

### Task 7 (final): Velocidade

Medir com Lighthouse depois da publicação e tratar o que não for o carregamento do JSON (cache de CSS/JS, fontes, CLS da home).
