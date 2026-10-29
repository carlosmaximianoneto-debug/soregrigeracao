import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSeoRenderer, validateSeoOptions } from './seo-runtime.mjs';
import { createBlogRenderer } from './blog-runtime.mjs';
import { articlesA } from './blog/articles-a.mjs';
import { articlesB } from './blog/articles-b.mjs';

// Deployment candidate only: no credentials, Supabase SDK, or database writes.
// Keep this file beside seo-runtime.mjs and include categories.js in its function bundle.
const CACHE_MS = 30_000;
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;
// Only public catalogue fields cross this boundary. The small first page shares
// the SEO snapshot cache and its deadline; it never queries private tables.
function firstPage(snapshot, renderer) {
  const originals = new Map(snapshot.products.map(row => [String(row.id), row]));
  const allowed = (value, image = false) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (image ? /(^|\.)(supabase\.co|mlstatic\.com)$/.test(url.hostname)
          : /(^|\.)(meli\.la|mercadolivre\.com\.br|mercadolibre\.com)$/.test(url.hostname));
    } catch { return false; }
  };
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
const RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const message = (title, description) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | Só Refrigeração</title><link rel="stylesheet" href="/seo-pages.css"></head><body><main class="wrap collection-heading"><p class="eyebrow">SÓ REFRIGERAÇÃO</p><h1>${title}</h1><p class="lead">${description}</p><a class="text-link" href="/catalogo/">Voltar ao catálogo</a></main></body></html>`;

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
      const renderer = createSeoRenderer(snapshot, options, categorySource);
      cached = { renderer, firstPage: firstPage(snapshot, renderer), expiresAt: Math.min(now() + CACHE_MS, sourceTime + MAX_SNAPSHOT_AGE_MS) };
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  }

  return async function handler(request) {
    const requestURL = new URL(request.url);
    const route = requestURL.pathname;
    const headers = { ...RESPONSE_HEADERS, ...(!options.production ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
    const reply = (body, status = 200, extra = {}) => new Response(request.method === 'HEAD' ? null : body, { status, headers: { ...headers, ...extra } });
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Método não permitido.', 405, { Allow: 'GET, HEAD' });
    const missing = () => reply(message('Página não encontrada', 'Use o catálogo para encontrar uma ferramenta.'), 404);
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
        if (!renderer.sitemap) return reply(message('Página não encontrada', 'O mapa do site fica disponível após a configuração do domínio.'), 404);
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
      return reply(message('Produto ou página não encontrado', 'Este item não está no catálogo atual. Explore as categorias para encontrar outras opções.'), 404);
    } catch {
      return reply(message('Catálogo em atualização', 'Não foi possível confirmar o catálogo agora. Tente novamente em instantes.'), 503, { 'Retry-After': '60', 'X-Robots-Tag': 'noindex, nofollow' });
    }
  };
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
