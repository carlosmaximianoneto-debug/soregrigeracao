import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSeoRenderer, validateSeoOptions } from './seo-runtime.mjs';
import { fontHead } from './site-identity.mjs';
import { createBlogRenderer } from './blog-runtime.mjs';
import { articlesA } from './blog/articles-a.mjs';
import { articlesB } from './blog/articles-b.mjs';

// Deployment candidate only: no credentials, Supabase SDK, or database writes.
// Keep this file beside seo-runtime.mjs and include categories.js in its function bundle.
const CACHE_MS = 30_000;
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;
const LOCAL_IMAGE = /^\/?assets\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/i;
function allowed(value, image = false) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    if (!image) return /(^|\.)(?:meli\.la|mercadolivre\.com\.br|mercadolibre\.com)$/.test(url.hostname);
    return /\.(?:jpe?g|png|webp)$/i.test(url.pathname) && (
      (url.hostname === 'xlwiwxaghbkdwbtwagwo.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/imagens/'))
      || /(^|\.)mlstatic\.com$/.test(url.hostname));
  } catch { return false; }
}
// Only public catalogue fields cross this boundary. The small first page shares
// the SEO snapshot cache and its deadline; it never queries private tables.
function firstPage(snapshot, renderer) {
  const originals = new Map(snapshot.products.map(row => [String(row.id), row]));
  const generatedAt = renderer.snapshotDate.toISOString();
  const rows = renderer.products.filter(row => allowed(row.url) && allowed(row.image, true)).map(row => {
    const original = originals.get(row.id);
    const discount = row.price > 0 && Number.isInteger(original?.discount) && original.discount > 0 && original.discount < 100 ? original.discount : null;
    const category = typeof original?.category === 'string' && original.category ? original.category : row.category;
    return { id: row.id, title: row.title, image: row.image, url: row.url, price: row.price, discount, category };
  });
  const categories = [...new Set(rows.map(row => row.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // A new public snapshot rotates the selection, but repeated requests to that
  // snapshot reuse the same images and do not undermine the image cache.
  const ranked = rows.map(row => ({ row, rank: createHash('sha256').update(`${generatedAt}:${row.id}`).digest('hex') }));
  ranked.sort((a, b) => a.rank.localeCompare(b.rank));
  return { generatedAt, total: rows.length, categories, products: ranked.slice(0, 24).map(entry => entry.row) };
}
const snowflake = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#91dce5"/><g fill="none" stroke="#10232d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 9v46M12 20l40 24M12 44l40-24M24 13l8 8 8-8M24 51l8-8 8 8M12 29l10-3-2-10M52 35l-10 3 2 10M20 48l2-10-10-3M44 16l-2 10 10 3"/></g></svg>';
const whatsappIcon = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 0 1 2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10Zm5.5-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.7-.9-2.8-1.6-4-3.5-.3-.5.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.4 3.3c.2.2 2.4 3.7 5.8 5.2 2.2.9 3 .9 4 .8.6-.1 1.8-.8 2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z"/></svg>';
const RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
// Error pages keep the site's header, a way back to the catalogue and the group.
// No click script here: visits to broken links must not count as catalogue views.
const message = (title, description, invitationURL = '/?direto=1') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#10232d"><title>${title} | Só Refrigeração</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">${fontHead()}<link rel="stylesheet" href="/seo-pages.css"></head><body><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Só Refrigeração, início">${snowflake}<span>SÓ REFRIGERAÇÃO<small>FERRAMENTAS PARA QUEM É DA ÁREA</small></span></a><nav aria-label="Principal"><a href="/catalogo/">Catálogo</a><a href="/#catalogo">Buscar ferramenta</a></nav></div></header><main id="conteudo" class="wrap not-found"><section class="collection-heading"><p class="eyebrow">SÓ REFRIGERAÇÃO</p><h1>${title}</h1><p class="lead">${description}</p><a class="primary-button not-found-button" href="/catalogo/"><span>Ver o catálogo de ferramentas</span><span aria-hidden="true">→</span></a></section><section class="group-join" aria-label="Ofertas no WhatsApp"><p class="group-join-title">Receba as ofertas de ferramentas no WhatsApp</p><a class="group-join-button" href="${invitationURL}" target="_blank" rel="noopener noreferrer">${whatsappIcon}<span>Entrar no grupo grátis</span><span class="sr-only"> (abre em nova aba)</span></a><p class="group-join-note">Sem custo para entrar. Saia quando quiser.</p></section></main></body></html>`;

export function createSeoHandler({ snapshotURL, categorySource, base = '', production = false, invitationURL, fetchImpl = fetch, now = Date.now } = {}) {
  const options = validateSeoOptions({ production, base, invitationURL });
  const blog = createBlogRenderer([...articlesA, ...articlesB], options);
  const endpoint = new URL(snapshotURL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw new Error('O JSON público deve usar URL HTTPS sem credenciais ou parâmetros.');
  if (typeof categorySource !== 'string') throw new Error('categories.js deve estar incluído no pacote da função.');
  let cached = null;
  let pending = null;

  async function readCurrentCatalogue() {
    if (cached && now() < cached.expiresAt) return cached;
    if (pending) return pending;
    // An expired snapshot is never served if fetching or validating the new one fails.
    cached = null;
    pending = (async () => {
      const response = await fetchImpl(endpoint.href, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('O JSON público está temporariamente indisponível.');
      const body = await response.text();
      if (body.length > 10 * 1024 * 1024) throw new Error('Snapshot maior que o limite permitido.');
      const snapshot = JSON.parse(body);
      const sourceTime = Date.parse(snapshot.generatedAt);
      if (!Number.isFinite(sourceTime) || now() - sourceTime > MAX_SNAPSHOT_AGE_MS || sourceTime - now() > 60_000) throw new Error('O snapshot público está atrasado ou tem data inválida.');
      // Discard offsite destinations before one bad row can disable all SEO pages.
      const safeSnapshot = { ...snapshot, products: snapshot.products.filter(row => row && allowed(row.url)
        && (allowed(row.image, true) || (typeof row.image === 'string' && LOCAL_IMAGE.test(row.image)))) };
      const renderer = createSeoRenderer(safeSnapshot, options, categorySource);
      cached = { renderer, firstPage: firstPage(safeSnapshot, renderer), expiresAt: Math.min(now() + CACHE_MS, sourceTime + MAX_SNAPSHOT_AGE_MS) };
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  }

  const page = (title, description) => message(title, description, options.invitationURL);
  const handler = async function handler(request) {
    const requestURL = new URL(request.url);
    const route = requestURL.pathname;
    const headers = { ...RESPONSE_HEADERS, ...(!options.production ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
    const reply = (body, status = 200, extra = {}) => new Response(request.method === 'HEAD' ? null : body, { status, headers: { ...headers, ...extra } });
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Método não permitido.', 405, { Allow: 'GET, HEAD' });
    const missing = () => reply(page('Página não encontrada', 'Use o catálogo para encontrar uma ferramenta.'), 404);
    if (/%|\/\.|\\|\/\//.test(route)) return missing();
    // Editorial pages are versioned with the release and work even when the
    // product feed is unavailable. Never fetch Supabase to render an article.
    if (/^\/blog(?:\/|$)/.test(route)) {
      const normalRoute = route.replace(/\/index\.html$/, '/').replace(/\/?$/, '/');
      const html = blog.render(normalRoute);
      if (!html) return missing();
      if (route !== normalRoute) return reply('', 301, { Location: normalRoute });
      return reply(html, 200, { 'Cache-Control': 'public, max-age=0, must-revalidate' });
    }
    const publicRoute = route.startsWith('/seo/') ? route.slice(4) : route;
    if (publicRoute === '/robots.txt') {
      if (route !== '/robots.txt') return reply('', 301, { Location: '/robots.txt' });
      const robots = options.production ? `User-agent: *\nAllow: /\nSitemap: ${options.base}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
      return reply(robots, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const initialPage = route === '/api/catalogue-first';
    if (initialPage && requestURL.search) return reply('', 400);
    if (!initialPage && publicRoute !== '/sitemap.xml' && !/^\/(?:produtos|categorias|catalogo)(?:\/|$)/.test(publicRoute)) return missing();
    try {
      const current = await readCurrentCatalogue();
      if (initialPage) return reply(JSON.stringify(current.firstPage), 200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' });
      const { renderer } = current;
      if (publicRoute === '/sitemap.xml') {
        if (!renderer.sitemap) return reply(page('Página não encontrada', 'O mapa do site fica disponível após a configuração do domínio.'), 404);
        if (route !== '/sitemap.xml') return reply('', 301, { Location: '/sitemap.xml' });
        return reply(renderer.sitemap.replace('</urlset>', `${blog.sitemapEntries}</urlset>`), 200, { 'Content-Type': 'application/xml; charset=utf-8' });
      }
      let normalRoute = publicRoute.replace(/\/index\.html$/, '/').replace(/\/?$/, '/');
      const pagination = normalRoute.match(/^(\/catalogo\/|\/categorias\/[a-z0-9-]+\/)pagina\/(0*[1-9]\d*)\/$/);
      if (pagination) {
        const page = Number(pagination[2]);
        if (!Number.isSafeInteger(page)) return missing();
        normalRoute = page === 1 ? pagination[1] : `${pagination[1]}pagina/${page}/`;
      }
      const html = renderer.render(normalRoute);
      if (html) {
        // Only normalize paths: Netlify forwards query strings on redirects.
        // Redirecting a canonical path for its query would create a loop.
        if (route !== normalRoute) return reply('', 301, { Location: normalRoute });
        return reply(html);
      }
      const renamed = renderer.replacementRoute(normalRoute);
      if (renamed) return reply('', 301, { Location: renamed });
      return reply(page('Produto ou página não encontrado', 'Este item não está no catálogo atual. Explore as categorias para encontrar outras opções.'), 404);
    } catch {
      return reply(page('Catálogo em atualização', 'Não foi possível confirmar o catálogo agora. Tente novamente em instantes.'), 503, { 'Retry-After': '60', 'X-Robots-Tag': 'noindex, nofollow' });
    }
  };
  // Static-server fallback for unknown page routes (assets keep an empty 404).
  handler.notFound = method => new Response(method === 'HEAD' ? null : page('Página não encontrada', 'O endereço pode ter mudado ou estar incompleto. Procure a ferramenta no catálogo ou receba as ofertas no grupo.'), { status: 404, headers: { ...RESPONSE_HEADERS, 'X-Robots-Tag': 'noindex, nofollow' } });
  return handler;
}

let configuredHandler;
export default async function handler(request) {
  try {
    if (!configuredHandler) configuredHandler = createSeoHandler({
      snapshotURL: process.env.CATALOGUE_JSON_URL,
      categorySource: await fs.readFile(new URL('./categories.js', import.meta.url), 'utf8'),
      base: process.env.SEO_BASE_URL || '',
      production: process.env.SEO_INDEXING_ENABLED === 'true',
    });
    return await configuredHandler(request);
  } catch {
    return new Response(message('Catálogo em preparação', 'A configuração do catálogo está sendo concluída.'), { status: 503, headers: { ...RESPONSE_HEADERS, 'X-Robots-Tag': 'noindex, nofollow', 'Retry-After': '60' } });
  }
}

// preferStatic false is essential: generated preview HTML must never shadow live data.
export const config = { path: ['/blog', '/blog/*', '/produtos', '/produtos/*', '/categorias', '/categorias/*', '/catalogo', '/catalogo/*', '/seo', '/seo/*', '/sitemap.xml', '/robots.txt'], preferStatic: false };
