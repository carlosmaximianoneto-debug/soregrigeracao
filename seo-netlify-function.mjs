import fs from 'node:fs/promises';
import { createSeoRenderer, validateSeoOptions } from './seo-runtime.mjs';

// Deployment candidate only: no credentials, Supabase SDK, or database writes.
// Keep this file beside seo-runtime.mjs and include categories.js in its function bundle.
const CACHE_MS = 30_000;
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;
const RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const message = (title, description) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | Só Refrigeração</title><link rel="stylesheet" href="/seo-pages.css"></head><body><main class="wrap collection-heading"><p class="eyebrow">SÓ REFRIGERAÇÃO</p><h1>${title}</h1><p class="lead">${description}</p><a class="text-link" href="/seo/catalogo/">Voltar ao catálogo</a></main></body></html>`;

export function createSeoHandler({ snapshotURL, categorySource, base = '', production = false, fetchImpl = fetch, now = Date.now } = {}) {
  const options = validateSeoOptions({ production, base });
  const endpoint = new URL(snapshotURL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw new Error('O JSON público deve usar URL HTTPS sem credenciais ou parâmetros.');
  if (typeof categorySource !== 'string') throw new Error('categories.js deve estar incluído no pacote da função.');
  let cached = null;
  let pending = null;

  async function readCurrentCatalogue() {
    if (cached && now() < cached.expiresAt) return cached.renderer;
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
      cached = { renderer, expiresAt: Math.min(now() + CACHE_MS, sourceTime + MAX_SNAPSHOT_AGE_MS) };
      return renderer;
    })();
    try { return await pending; } finally { pending = null; }
  }

  return async function handler(request) {
    const requestURL = new URL(request.url);
    const route = requestURL.pathname;
    const headers = { ...RESPONSE_HEADERS, ...(!options.production ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
    const reply = (body, status = 200, extra = {}) => new Response(request.method === 'HEAD' ? null : body, { status, headers: { ...headers, ...extra } });
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Método não permitido.', 405, { Allow: 'GET, HEAD' });
    if (route === '/robots.txt' || route === '/seo/robots.txt') {
      const robots = options.production ? `User-agent: *\nAllow: /\nSitemap: ${options.base}/seo/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
      return reply(robots, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (!route.startsWith('/seo/') || /%|\/\.|\\/.test(route)) return reply(message('Página não encontrada', 'Use o catálogo para encontrar uma ferramenta.'), 404);
    try {
      const renderer = await readCurrentCatalogue();
      if (route === '/seo/sitemap.xml') return renderer.sitemap ? reply(renderer.sitemap, 200, { 'Content-Type': 'application/xml; charset=utf-8' }) : reply(message('Página não encontrada', 'O mapa do site fica disponível após a configuração do domínio.'), 404);
      const normalRoute = route.replace(/index\.html$/, '').replace(/\/?$/, '/');
      const html = renderer.render(normalRoute);
      if (html) {
        if (route !== normalRoute || requestURL.search) return reply('', 301, { Location: normalRoute });
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
export const config = { path: ['/seo/*', '/robots.txt'], preferStatic: false };
