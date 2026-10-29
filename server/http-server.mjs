import http from 'node:http';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const ORIGIN = 'https://sorefrigeracao.com';
const MAX_BODY_BYTES = 512;
const MAX_STATIC_BYTES = 10 * 1024 * 1024;
// Public artifacts only. A file being present in dist does not make it public.
export const PUBLIC_FILES = Object.freeze([
  'index.html', 'site-config.js', 'site-clicks.js', 'privacidade/index.html',
  'styles.css', 'mobile-refinements.css', 'carousel.css', 'floating-join.css', 'seo-pages.css',
  'catalogue.js', 'categories.js', 'catalogue-images.js', 'carousel.js',
  'assets/produto_149.jpg', 'assets/produto_263.jpg', 'assets/produto_1980.jpg', 'assets/produto_2164.jpg',
  'assets/favicon.svg', 'assets/favicon.ico', 'assets/apple-touch-icon.png',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/compartilhamento.png',
]);
const PUBLIC_SET = new Set(PUBLIC_FILES);
const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg' });
const SECURITY_HEADERS = Object.freeze({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });

function failure(status, extra = {}) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

function safeRoute(target) {
  if (typeof target !== 'string' || target.length > 4096 || !target.startsWith('/') || target.includes('#')) return null;
  const route = target.split('?')[0];
  // Inspect the raw path before URL removes dot segments. Encoded query values
  // are allowed for the bounded image endpoint; encoded path aliases are not.
  if (/%|\\|[\u0000-\u0020\u007f]|\/\//.test(route) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(route)) return null;
  return route;
}

const hasBody = req => Boolean(req.headers['transfer-encoding']) || Number(req.headers['content-length'] || 0) > 0;
const isSeo = route => /^\/(?:produtos|categorias|catalogo|seo)(?:\/|$)/.test(route)
  || route === '/sitemap.xml' || route === '/robots.txt' || route === '/api/catalogue-first';

function readBody(req, timeoutMs) {
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    req.pause();
    return Promise.reject(413);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const finish = (status, body) => {
      clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError);
      if (status) { req.pause(); reject(status); } else resolve(body);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) finish(413);
      else chunks.push(chunk);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks, size));
    const onError = () => finish(400);
    const timer = setTimeout(() => finish(408), timeoutMs);
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onError);
  });
}

function fetchRequest(req, body, { image = false } = {}) {
  // Do not pass cookies, inbound authorization, IPs or proxy headers to handlers.
  const headers = new Headers();
  const names = image ? ['accept'] : ['origin', 'content-type', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'];
  for (const name of names) if (typeof req.headers[name] === 'string') headers.set(name, req.headers[name]);
  if (body) headers.set('content-length', String(body.length));
  return new Request(ORIGIN + req.url, { method: image && req.method === 'HEAD' ? 'GET' : req.method,
    headers, ...(body ? { body } : {}) });
}

async function boundedHandler(handler, request, timeoutMs) {
  let expired = false, timer;
  const work = Promise.resolve().then(() => handler(request)).then(response => {
    if (expired) response?.body?.cancel().catch(() => {});
    return response;
  });
  try {
    return await Promise.race([work, new Promise(resolve => {
      timer = setTimeout(() => { expired = true; resolve(failure(504)); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function staticResponse(root, name, method, requestHeaders, revision) {
  let handle;
  try {
    const rootStat = await fs.lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return failure(404);
    const rootReal = await fs.realpath(root);
    const segments = name.split('/');
    let target = root;
    for (const [index, segment] of segments.entries()) {
      target = path.join(target, segment);
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) return failure(404);
    }
    const targetReal = await fs.realpath(target);
    if (path.relative(rootReal, targetReal) !== segments.join(path.sep)) return failure(404);
    // The runtime filesystem is read-only. O_NOFOLLOW also protects the final
    // component if a caller uses this adapter outside the hardened container.
    handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_STATIC_BYTES) { await handle.close(); return failure(404); }
    // Weak validator survives transfer compression. A new release always gets
    // a different tag; HTML/config still revalidate instead of hiding updates.
    const etag = `W/"${revision || 'local'}-${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = { 'Content-Type': MIME[path.extname(name)],
      'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
    const validators = requestHeaders['if-none-match'];
    if (typeof validators === 'string' && validators.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
      await handle.close();
      return new Response(null, { status: 304, headers });
    }
    headers['Content-Length'] = String(stat.size);
    if (method === 'HEAD') { await handle.close(); return new Response(null, { headers }); }
    return new Response(Readable.toWeb(handle.createReadStream({ autoClose: true })), { headers });
  } catch {
    if (handle) await handle.close().catch(() => {});
    return failure(404);
  }
}

function sendResponse(req, res, response) {
  if (!(response instanceof Response)) throw new Error('Invalid HTTP handler response');
  if (res.destroyed) { response.body?.cancel().catch(() => {}); return; }
  res.statusCode = response.status;
  for (const [key, value] of response.headers) res.setHeader(key, value);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  if (req.method === 'HEAD' || !response.body) {
    response.body?.cancel().catch(() => {});
    res.end();
    return;
  }
  const stream = Readable.fromWeb(response.body);
  stream.once('error', () => res.destroy());
  res.once('close', () => stream.destroy());
  stream.pipe(res);
}

export function createVpsServer({ distDir, seoHandler, clickHandler, imageHandler, revision,
  bodyTimeoutMs = 3000, handlerTimeoutMs = 10_000 } = {}) {
  if (!distDir || ![seoHandler, clickHandler, imageHandler].every(value => typeof value === 'function')) throw new Error('Missing VPS runtime configuration');
  if (revision !== undefined && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid site revision');
  const root = path.resolve(distDir);
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10_000,
    keepAliveTimeout: 5000, connectionsCheckingInterval: 1000 }, (req, res) => {
    if (active >= 64) { sendResponse(req, res, failure(503, { 'Retry-After': '1', Connection: 'close' })); return; }
    active++;
    let released = false;
    const release = () => { if (!released) { active--; released = true; } };
    res.once('finish', release); res.once('close', release);
    (async () => {
      const route = safeRoute(req.url);
      if (!route) return failure(404, { Connection: 'close' });
      if (route === '/api/site-click') {
        if (!['POST', 'OPTIONS'].includes(req.method)) return failure(405, { Allow: 'POST, OPTIONS', Connection: 'close' });
        if (req.method === 'OPTIONS' && hasBody(req)) return failure(400, { Connection: 'close' });
        let body;
        try { if (req.method === 'POST') body = await readBody(req, bodyTimeoutMs); }
        catch (status) { return failure(status, { Connection: 'close' }); }
        return boundedHandler(clickHandler, fetchRequest(req, body), handlerTimeoutMs);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return failure(405, { Allow: 'GET, HEAD', Connection: 'close' });
      if (hasBody(req)) return failure(400, { Connection: 'close' });
      if (route === '/healthz') return Response.json({ ok: true, ...(revision ? { revision } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
      if (route === '/.netlify/images') return boundedHandler(imageHandler, fetchRequest(req, null, { image: true }), handlerTimeoutMs);
      if (isSeo(route)) return boundedHandler(seoHandler, fetchRequest(req), handlerTimeoutMs);
      if (route === '/index.html' || route === '/privacidade' || route === '/privacidade/index.html') {
        return failure(301, { Location: route === '/index.html' ? '/' : '/privacidade/' });
      }
      const name = route === '/' ? 'index.html' : route === '/privacidade/' ? 'privacidade/index.html' : route.slice(1);
      return PUBLIC_SET.has(name) ? staticResponse(root, name, req.method, req.headers, revision) : failure(404);
    })().then(response => sendResponse(req, res, response)).catch(() => {
      if (!res.headersSent) sendResponse(req, res, failure(500)); else res.destroy();
    });
  });
  server.maxConnections = 256;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(15_000, socket => socket.destroy());
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    else socket.destroy();
  });
  return server;
}
