import vm from 'node:vm';
import { publisher, publisherSchema } from './site-identity.mjs';

export const PAGE_SIZE = 24;
const BRAND = 'Só Refrigeração';
export function validateSeoOptions({ production = false, base = '', invitationURL = '/?direto=1' } = {}) {
  if (production !== Boolean(base)) throw new Error('Produção exige flag explícita e base HTTPS juntas.');
  if (base) {
    const candidate = new URL(base);
    if (candidate.protocol !== 'https:' || candidate.username || candidate.password || candidate.search || candidate.hash || candidate.pathname !== '/' || !candidate.hostname.includes('.') || candidate.hostname === 'localhost') throw new Error('A base deve ser uma origem HTTPS, sem caminho ou credenciais.');
    base = candidate.origin;
  }
  if (invitationURL !== '/?direto=1' && (typeof invitationURL !== 'string' || !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,64}$/.test(invitationURL))) throw new Error('O convite deve ser uma URL válida de grupo do WhatsApp.');
  return { production, base, invitationURL };
}

export function createSeoRenderer(source, config = {}, categorySource) {
const options = validateSeoOptions(config);
if (!Array.isArray(source.products)) throw new Error('O snapshot público precisa conter products.');
if (typeof categorySource !== 'string') throw new Error('As regras de categories.js são obrigatórias.');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const jsonLD = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const absolute = route => options.base && route.startsWith('/') ? `${options.base}${route}` : route;
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const decimalPrice = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeURL = (value, { local = false } = {}) => {
  if (typeof value !== 'string') return '';
  if (local && /^\/?assets\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)) return `/${value.replace(/^\//, '')}`;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
};
const snapshotDate = new Date(source.generatedAt);
if (!Number.isFinite(snapshotDate.getTime())) throw new Error('O snapshot precisa ter generatedAt válido.');
const dateText = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', dateStyle: 'long' }).format(snapshotDate);
const categoryContext = { window: {} };
vm.runInNewContext(categorySource, categoryContext, { timeout: 1000, filename: 'categories.js' });
if (typeof categoryContext.window.catalogueCategory !== 'function') throw new Error('categories.js precisa expor catalogueCategory.');
const seen = new Set();
const products = source.products.map((row, index) => {
  const id = String(row.id ?? '').trim();
  const title = String(row.title ?? '').trim();
  const url = safeURL(row.url);
  const image = safeURL(row.image, { local: true });
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !title || !url || !image) throw new Error(`Produto inválido na posição ${index}: id, título, URL HTTPS e imagem são obrigatórios.`);
  if (seen.has(id)) throw new Error(`ID repetido no snapshot: ${id}`);
  seen.add(id);
  const category = categoryContext.window.catalogueCategory(title);
  const route = `/produtos/${slug(title).slice(0, 110).replace(/-$/, '') || 'produto'}-${id}/`;
  const roundedPrice = typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0 ? Number(decimalPrice.format(row.price)) : null;
  const price = roundedPrice > 0 ? roundedPrice : null;
  return { id, title, url, image, category, route, price };
});
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
products.sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.id, b.id));
const categories = [...new Set(products.map(p => p.category))].sort(collator.compare).map(name => ({ name, route: `/categorias/${slug(name)}/`, products: products.filter(p => p.category === name) }));
const guidance = {
  'Bombas de vácuo': 'Compare a vazão em CFM, o número de estágios e a tensão informados no anúncio. Confira também as conexões e os acessórios incluídos.',
  'Bombas de limpeza': 'Confira a pressão de trabalho, a tensão e os acessórios incluídos. Verifique se mangueira, reservatório e bicos atendem ao seu uso.',
  'Manifolds e manômetros': 'Confira os refrigerantes indicados, a escala de medição e o tipo de conexão. Verifique se as mangueiras fazem parte do kit.',
  'Vacuômetros': 'Confira a faixa de medição, a unidade exibida e o tipo de conexão. Veja no anúncio os acessórios e a alimentação do instrumento.',
  'Flangeadores e alargadores': 'Compare as medidas de tubo atendidas e o padrão de flange. Confira se cortador, escareador e maleta estão incluídos.',
  'Cortadores e curvadores de tubos': 'Confira o material e os diâmetros de tubo atendidos. Compare a faixa de corte ou curvatura e os itens incluídos.',
  'Serras-copo': 'Compare o diâmetro, a profundidade de corte e os materiais indicados pelo fabricante. Confira o encaixe e os adaptadores incluídos.',
  'Furadeiras e parafusadeiras': 'Compare a tensão, o tipo de mandril e as funções informadas. Nos modelos a bateria, confira se bateria e carregador estão incluídos.',
  'Mangueiras e conexões': 'Confira o diâmetro, a rosca, o comprimento e as pressões indicadas no anúncio. Verifique a compatibilidade com o seu equipamento.',
  'Termômetros e medição': 'Compare a faixa de medição, a resolução e o tipo de sensor. Confira os acessórios e a alimentação informados pelo fabricante.',
  'Multímetros e alicates amperímetros': 'Confira as funções de medição, as faixas e a categoria de segurança indicada pelo fabricante. Veja as pontas e acessórios incluídos.',
  'Suportes para split': 'Confira as dimensões, o material, a capacidade indicada e os pontos de fixação. Verifique a compatibilidade com a condensadora.',
  'Fitas e isolamento': 'Confira largura, espessura, comprimento e material. Verifique a aplicação indicada pelo fabricante antes de escolher.',
  'Tubos e drenos': 'Compare diâmetro, espessura, comprimento e material. Confira as conexões necessárias para o serviço.',
};
const categoryAdvice = name => guidance[name] || 'Confira as medidas, a compatibilidade e os itens incluídos no anúncio. Compare as informações do fabricante com a necessidade do serviço.';
const catalogueRoute = '/catalogo/';
const snowflake = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#91dce5"/><g fill="none" stroke="#10232d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 9v46M12 20l40 24M12 44l40-24M24 13l8 8 8-8M24 51l8-8 8 8M12 29l10-3-2-10M52 35l-10 3 2 10M20 48l2-10-10-3M44 16l-2 10 10 3"/></g></svg>';
const breadcrumbHTML = crumbs => `<nav class="breadcrumbs" aria-label="Caminho da página"><ol>${crumbs.map((c, i) => `<li>${i === crumbs.length - 1 ? `<span aria-current="page">${escapeHTML(c.name)}</span>` : `<a href="${escapeHTML(c.route)}">${escapeHTML(c.name)}</a>`}</li>`).join('')}</ol></nav>`;
const breadcrumbData = crumbs => ({ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(c.route) })) });
const whatsappIcon = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 0 1 2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10Zm5.5-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.7-.9-2.8-1.6-4-3.5-.3-.5.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.4 3.3c.2.2 2.4 3.7 5.8 5.2 2.2.9 3 .9 4 .8.6-.1 1.8-.8 2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z"/></svg>';
const groupJoin = (productId) => `<section class="group-join" aria-label="Ofertas no WhatsApp"><p class="group-join-title">Ofertas de ferramentas no WhatsApp</p><a class="group-join-button" href="${escapeHTML(options.invitationURL)}" data-track-event="whatsapp_click" data-product-id="${escapeHTML(productId)}" data-placement="product_whatsapp" data-page-type="product" target="_blank" rel="noopener noreferrer">${whatsappIcon}<span>Entrar no grupo grátis</span><span class="sr-only"> (abre em nova aba)</span></a><p class="group-join-note">Sem custo para entrar. Saia quando quiser.</p></section>`;
function document({ route, title, description, crumbs, content, entity, image = '', pageType = 'catalogue', productId = 0 }) {
  const canonical = options.base ? `<link rel="canonical" href="${escapeHTML(absolute(route))}"><meta property="og:url" content="${escapeHTML(absolute(route))}">` : '';
  const site = { '@type': 'WebSite', name: BRAND, inLanguage: 'pt-BR', ...(options.base ? { '@id': `${options.base}/#website`, url: `${options.base}/` } : {}) };
  if (options.base) site.publisher = { '@id': `${options.base}/#organization` };
  const graph = { '@context': 'https://schema.org', '@graph': [site, ...(options.base ? [publisherSchema(options.base)] : []), breadcrumbData(crumbs), entity] };
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#10232d"><title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}"><meta name="robots" content="${options.production ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">${canonical}<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:image" content="${escapeHTML(absolute(image || '/assets/compartilhamento.png'))}"><meta property="og:image:alt" content="${escapeHTML(image ? title : 'Só Refrigeração — ferramentas para refrigerista')}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHTML(absolute(image || '/assets/compartilhamento.png'))}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="icon" href="/assets/favicon.ico" sizes="16x16 32x32 48x48"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180"><link rel="icon" href="/assets/icon-192.png" sizes="192x192" type="image/png"><link rel="icon" href="/assets/icon-512.png" sizes="512x512" type="image/png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/seo-pages.css"><script type="application/ld+json">${jsonLD(graph)}</script><script src="/site-clicks.js" defer></script></head>
<body data-page-type="${escapeHTML(pageType)}" data-product-id="${escapeHTML(productId)}"><a class="skip" href="#conteudo">Pular para o conteúdo</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Só Refrigeração, início">${snowflake}<span>SÓ REFRIGERAÇÃO<small>FERRAMENTAS PARA QUEM É DA ÁREA</small></span></a><nav aria-label="Principal"><a href="${catalogueRoute}">Catálogo</a><a href="/#catalogo">Buscar ferramenta</a></nav></div></header>
<main id="conteudo" class="wrap">${breadcrumbHTML(crumbs)}${content}</main>
<footer class="site-footer"><div class="wrap footer-inner"><p><strong>${BRAND}</strong><br>Ferramentas e equipamentos para refrigeração.<br>Uma iniciativa da <strong>${escapeHTML(publisher.name)}</strong><br>CNPJ ${escapeHTML(publisher.taxID)}<br><a href="mailto:${escapeHTML(publisher.email)}">${escapeHTML(publisher.email)}</a><br><a href="/#sobre">Sobre e transparência</a> · <a href="/privacidade/">Privacidade</a></p><p>O anúncio de destino informa preço, frete e disponibilidade.<br>Os links de compra são links de afiliado.</p><a href="${catalogueRoute}">Explorar o catálogo ↑</a></div></footer></body></html>`;
  return html;
}
const baseCrumbs = [{ name: 'Início', route: '/' }, { name: 'Catálogo', route: catalogueRoute }];
function card(product, index = 0, placement = 'collection_card', pageType = 'catalogue') {
  return `<article class="product-card"><a class="product-image" href="${escapeHTML(product.route)}" data-track-event="product_view_click" data-product-id="${escapeHTML(product.id)}" data-placement="${placement}" data-page-type="${pageType}"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.title)}" width="500" height="500" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async"></a><div class="product-copy"><p class="eyebrow">${escapeHTML(product.category)}</p><h2><a href="${escapeHTML(product.route)}" data-track-event="product_view_click" data-product-id="${escapeHTML(product.id)}" data-placement="${placement}" data-page-type="${pageType}">${escapeHTML(product.title)}</a></h2><a class="detail-link" href="${escapeHTML(product.route)}" data-track-event="product_view_click" data-product-id="${escapeHTML(product.id)}" data-placement="${placement}" data-page-type="${pageType}">Ver detalhes <span aria-hidden="true">→</span></a></div></article>`;
}
const pageRoute = (route, number) => number === 1 ? route : `${route}pagina/${number}/`;
function pagination(route, page, count) {
  if (count < 2) return '';
  const numbers = [...new Set([1, page - 1, page, page + 1, count])].filter(n => n > 0 && n <= count).sort((a, b) => a - b);
  let previous = 0;
  const links = numbers.map(n => {
    const dots = n > previous + 1 ? '<span class="ellipsis" aria-hidden="true">…</span>' : '';
    previous = n;
    return `${dots}<a href="${pageRoute(route, n)}"${n === page ? ' aria-current="page"' : ''} aria-label="Página ${n}">${n}</a>`;
  }).join('');
  return `<nav class="pagination" aria-label="Páginas do catálogo">${page > 1 ? `<a class="page-direction" href="${pageRoute(route, page - 1)}" rel="prev">← Anterior</a>` : ''}<div class="page-numbers">${links}</div>${page < count ? `<a class="page-direction" href="${pageRoute(route, page + 1)}" rel="next">Próxima →</a>` : ''}</nav>`;
}
const categoryLinks = current => categories.map(c => `<a href="${c.route}"${c.name === current ? ' aria-current="page"' : ''}><span>${escapeHTML(c.name)}</span><span class="category-count">${c.products.length}</span></a>`).join('');
function collection(name, route, list, isCategory = false, page = 1) {
  const total = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const currentRoute = pageRoute(route, page);
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const title = `${isCategory ? name : 'Ferramentas para refrigeração e ar-condicionado'}${page > 1 ? ` — Página ${page}` : ''} | ${BRAND}`;
    const description = isCategory ? `${name}: veja os ${list.length} produtos reunidos no catálogo Só Refrigeração. Compare modelos e confira as condições no anúncio.${page > 1 ? ` Página ${page}.` : ''}` : `Explore ${products.length} ferramentas e equipamentos para refrigeração em ${categories.length} categorias. Compare modelos e confira os anúncios.${page > 1 ? ` Página ${page}.` : ''}`;
    const crumbs = [...baseCrumbs, ...(isCategory ? [{ name, route }] : []), ...(page > 1 ? [{ name: `Página ${page}`, route: currentRoute }] : [])];
    const content = `<section class="collection-heading"><div class="collection-intro"><h1>${escapeHTML(isCategory ? name : 'Ferramentas para refrigeração')}</h1>${isCategory ? '' : '<p class="lead">Escolha uma categoria ou busque pelo nome da ferramenta.</p>'}</div><a class="text-link" href="/#catalogo">Buscar ferramenta <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></a></section>
<div class="catalogue-layout"><aside class="category-sidebar"><div class="desktop-category-list"><h2 class="category-heading">Categorias <span>${categories.length}</span></h2><nav class="category-list" aria-label="Categorias de ferramentas"><a href="${catalogueRoute}"${!isCategory ? ' aria-current="page"' : ''}><span>Todos os produtos</span><span class="category-count">${products.length}</span></a>${categoryLinks(isCategory ? name : '')}</nav></div><details><summary>Categorias <span>${categories.length}</span></summary><nav class="category-list" aria-label="Categorias de ferramentas"><a href="${catalogueRoute}"${!isCategory ? ' aria-current="page"' : ''}><span>Todos os produtos</span><span class="category-count">${products.length}</span></a>${categoryLinks(isCategory ? name : '')}</nav></details></aside><section class="listing" aria-label="Produtos de ${escapeHTML(name)}"><div class="listing-meta"><p><strong>${list.length}</strong> produtos${isCategory ? ' na categoria' : ' no catálogo'}</p><p>${list.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, list.length)} · Página ${page} de ${total}</p></div><div class="product-grid">${slice.length ? slice.map((product,index) => card(product,index,'collection_card',isCategory?'category':'catalogue')).join('') : '<p class="empty-catalogue">Nenhum produto está no catálogo agora. Volte em instantes para conferir novas opções.</p>'}</div>${pagination(route, page, total)}<p class="catalogue-note">Compare as versões e confira preço, frete e disponibilidade no anúncio de destino.</p>${isCategory ? `<section class="collection-advice" aria-labelledby="collection-advice-title"><h2 id="collection-advice-title">O que conferir antes de comprar</h2><p>${escapeHTML(categoryAdvice(name))}</p></section>` : ''}</section></div>`;
    return document({ route: currentRoute, pageType: isCategory ? 'category' : 'catalogue', title, description, crumbs, content, entity: { '@type': 'CollectionPage', name: isCategory ? name : 'Ferramentas para refrigeração', description, url: absolute(currentRoute), inLanguage: 'pt-BR', mainEntity: { '@type': 'ItemList', numberOfItems: slice.length, itemListElement: slice.map((p, i) => ({ '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + i + 1, name: p.title, url: absolute(p.route) })) } } });
}
function renderProduct(product) {
  const category = categories.find(c => c.name === product.category);
  const related = category.products.filter(p => p.id !== product.id).slice(0, 4);
  const description = `${product.title}. Veja a referência do catálogo ${BRAND}, confira o anúncio e compare outros produtos em ${product.category.toLowerCase()}.`;
  const price = product.price ? `<div class="price-reference"><span>Preço cadastrado</span><strong>${money(product.price)}</strong><p>O preço pode ter mudado. Confirme o valor e as condições no anúncio.</p></div>` : '<p class="offer-note">Consulte preço e condições no anúncio.</p>';
  const content = `<article><div class="product-detail"><div class="detail-photo"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.title)}" width="800" height="800" fetchpriority="high"></div><div class="detail-copy"><a class="eyebrow category-back" href="${category.route}">${escapeHTML(product.category)}</a><h1>${escapeHTML(product.title)}</h1>${price}<a class="primary-button" href="${escapeHTML(product.url)}" data-track-event="affiliate_click" data-product-id="${escapeHTML(product.id)}" data-placement="product_offer" data-page-type="product" target="_blank" rel="sponsored noopener noreferrer"><span>Ver oferta no Mercado Livre</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg><span class="sr-only"> (abre em nova aba)</span></a><p class="destination-note">Confira a versão selecionada, o vendedor, o frete e a disponibilidade antes de comprar. Link de afiliado: podemos receber comissão pela compra.</p>${groupJoin(product.id)}<dl class="product-facts"><div><dt>Categoria</dt><dd><a href="${category.route}">${escapeHTML(product.category)}</a></dd></div><div><dt>Referência no catálogo</dt><dd>${escapeHTML(product.id)}</dd></div></dl></div></div><section class="buying-guide" aria-labelledby="conferir"><p class="eyebrow">ANTES DE ESCOLHER</p><h2 id="conferir">Confira se atende ao seu serviço</h2><p>${escapeHTML(categoryAdvice(product.category))}</p><a class="text-link" href="${category.route}">Comparar ${escapeHTML(product.category.toLowerCase())} <span aria-hidden="true">→</span></a></section></article>${related.length ? `<section class="related" aria-labelledby="relacionados"><div class="section-title"><div><p class="eyebrow">NA MESMA CATEGORIA</p><h2 id="relacionados">Outros modelos para comparar</h2></div><a class="text-link" href="${category.route}">Ver categoria →</a></div><div class="product-grid">${related.map((product,index) => card(product,index,'related_card','product')).join('')}</div></section>` : ''}`;
  // Only describe an offer when its positive BRL amount is also visible above.
  // Stock, seller, expiry and reviews are not supplied by the catalogue feed.
  const entity = product.price
    ? { '@type': 'Product', name: product.title, image: absolute(product.image), category: product.category, url: absolute(product.route),
        offers: { '@type': 'Offer', priceCurrency: 'BRL', price: decimalPrice.format(product.price), url: product.url } }
    : { '@type': 'WebPage', name: product.title, description, image: absolute(product.image), url: absolute(product.route), inLanguage: 'pt-BR' };
  return document({ route: product.route, pageType: 'product', productId: product.id, title: `${product.title} | ${BRAND}`, description, image: product.image.startsWith('https:') ? product.image : (options.base ? product.image : ''), crumbs: [...baseCrumbs, { name: product.category, route: category.route }, { name: product.title, route: product.route }], content, entity });
}

const routeMap = new Map();
const addCollection = (name, route, list, isCategory) => {
  const total = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  for (let page = 1; page <= total; page++) routeMap.set(pageRoute(route, page), { kind: 'collection', name, route, list, isCategory, page });
};
addCollection('Todos os produtos', catalogueRoute, products, false);
for (const category of categories) addCollection(category.name, category.route, category.products, true);
for (const item of products) routeMap.set(item.route, { kind: 'product', item });
const routes = [...routeMap.keys()];
return {
  products, categories, routes, options, snapshotDate,
  robots: options.production ? 'User-agent: *\nAllow: /\nSitemap: ' + options.base + '/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n',
  sitemap: options.production ? '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ['/', ...routes].map(route => '<url><loc>' + escapeHTML(absolute(route)) + '</loc></url>').join('') + '</urlset>\n' : null,
  render(route) {
    const entry = routeMap.get(route);
    if (!entry) return null;
    return entry.kind === 'product' ? renderProduct(entry.item) : collection(entry.name, entry.route, entry.list, entry.isCategory, entry.page);
  },
  replacementRoute(route) {
    const currentRoute = route.startsWith('/seo/') ? route.slice(4) : route;
    // This mixed category was split into brocas, discos, esmerilhadeiras and serras.
    if (/^\/categorias\/brocas-e-acessorios-de-corte\/(?:pagina\/[1-9]\d*\/)?$/.test(currentRoute)) return catalogueRoute;
    if (!/^\/produtos\/[a-zA-Z0-9_-]+\/$/.test(currentRoute)) return null;
    return products.find(item => currentRoute.endsWith('-' + item.id + '/'))?.route || null;
  },
};
}

