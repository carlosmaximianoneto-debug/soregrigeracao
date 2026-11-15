import http from 'node:http';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BLOG_COVER_FILES } from '../blog/covers.mjs';
import { FONT_FILES, fontHead } from '../site-identity.mjs';

const ORIGIN = 'https://sorefrigeracao.com';
const MAX_BODY_BYTES = 512;
const MAX_STATIC_BYTES = 10 * 1024 * 1024;
// Public artifacts only. A file being present in dist does not make it public.
export const PUBLIC_FILES = Object.freeze([
  ...BLOG_COVER_FILES, ...FONT_FILES,
  'index.html', 'site-config.js', 'site-clicks.js', 'blog-clicks.js', 'blog.css', 'privacidade/index.html',
  'styles.css', 'mobile-refinements.css', 'carousel.css', 'floating-join.css', 'seo-pages.css',
  'catalogue.js', 'categories.js', 'catalogue-images.js', 'carousel.js',
  'assets/produto_149.jpg', 'assets/produto_263.jpg', 'assets/produto_1980.jpg', 'assets/produto_2164.jpg',
  'assets/favicon.svg', 'assets/favicon.ico', 'assets/apple-touch-icon.png',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/compartilhamento.png',
]);
const PUBLIC_SET = new Set(PUBLIC_FILES);
const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' });
const SECURITY_HEADERS = Object.freeze({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });

// ---------------------------------------------------------------------------
// /grupos: página de entrada para tráfego do Instagram (impulsionamento).
// Uma única ação: entrar no grupo. Quando o grupo lotar, troque só GROUP_INVITE.
// Grupo atual: Só Refrigeração Promoções #8 (G8).
export const GROUP_INVITE = 'https://chat.whatsapp.com/Hwnf3PvtVqBBLRtRcc1meD';
export const GROUP_REDIRECT_SECONDS = 5;
const GROUP_TOOLS = Object.freeze([
  [26, 'Manifold'], [775, 'Bomba de vácuo'], [3314, 'Flangeador'], [3625, 'Vacuômetro'], [856, 'Cortador de tubo'],
]);
const toolImage = (id, width) => '/.netlify/images?url=' + encodeURIComponent(
  `https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/imagens/produto_${id}.jpg`)
  + `&amp;w=${width}&amp;q=75&amp;fm=webp&amp;fit=contain`;
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8.2 8.2 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.6 6.2 6.2 0 0 0 1.3 3.3 14 14 0 0 0 5.5 4.8c2 .9 2.8 1 3.8.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.4ZM12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8Zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.9L0 24l6.3-1.6A11.8 11.8 0 0 0 24 12a11.7 11.7 0 0 0-3.6-8.4Z"/></svg>';
const LOGO = '<svg aria-hidden="true" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#86dae6"/><g fill="none" stroke="#10232d" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 9v46M12 20l40 24M12 44l40-24M24 13l8 8 8-8M24 51l8-8 8 8M12 29l10-3-2-10M52 35l-10 3 2 10M20 48l2-10-10-3M44 16l-2 10 10 3"/></g></svg>';

const GROUPS_CSS = `:root{--navy:#10232d;--navy2:#183642;--ice:#86dae6;--green:#5ee093;--copper:#eda16c;--paper:#f5f5ef}
*{box-sizing:border-box}html,body{margin:0}body{min-height:100dvh;background:radial-gradient(120% 70% at 50% -10%,#1d4250 0,var(--navy) 60%) fixed,var(--navy);color:#eef4f2;font-family:Inter,Arial,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
a{-webkit-tap-highlight-color:transparent}svg{display:block}
.g{width:100%;max-width:480px;margin:0 auto;padding:18px 20px 24px;flex:1}
.top{display:flex;align-items:center;gap:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:20px;letter-spacing:.05em}.top svg{width:30px;height:30px}
.tag{display:inline-flex;align-items:center;gap:8px;margin:26px 0 0;padding:7px 12px;border:1px solid #2f5260;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--green)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(94,224,147,.6);animation:pulse 1.6s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 9px rgba(94,224,147,0)}100%{box-shadow:0 0 0 0 rgba(94,224,147,0)}}
h1{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;text-transform:uppercase;font-size:clamp(38px,11vw,50px);line-height:.98;letter-spacing:-.01em;margin:14px 0 0}h1 span{color:var(--ice)}
.lead{font-size:15px;line-height:1.55;color:#c3d3d6;margin:14px 0 0}
.tools{list-style:none;margin:22px -20px 0;padding:2px 20px 6px;display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline:20px;scrollbar-width:none}.tools::-webkit-scrollbar{display:none}
.tools li{flex:0 0 112px;scroll-snap-align:start;background:#fff;border-radius:12px;overflow:hidden;color:var(--navy)}
.tools img{width:112px;height:96px;object-fit:contain;padding:10px;display:block}
.tools span{display:block;padding:7px 8px 9px;font-size:11.5px;font-weight:700;text-align:center;background:#e8eee9;line-height:1.2}
.why{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:11px}
.why li{display:flex;gap:11px;align-items:flex-start;font-size:14px;line-height:1.45;color:#dce7e8}
.why b{color:#fff}.why svg{width:20px;height:20px;flex-shrink:0;margin-top:1px;color:var(--green)}
.proof{display:flex;align-items:center;gap:12px;margin:22px 0 0;padding:13px 14px;background:var(--navy2);border:1px solid #2b4a56;border-radius:12px;font-size:13px;line-height:1.4;color:#c3d3d6}
.proof strong{font-family:'Barlow Condensed',sans-serif;font-size:30px;line-height:1;color:var(--copper);white-space:nowrap}
.cta{position:sticky;bottom:0;z-index:2;width:100%;max-width:480px;margin:0 auto;padding:14px 20px max(16px,env(safe-area-inset-bottom));background:linear-gradient(rgba(16,35,45,0),var(--navy) 22%)}
.btn{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;min-height:62px;padding:0 18px;border-radius:14px;background:var(--green);color:#0f2a1d;text-decoration:none;font-weight:800;font-size:17px;box-shadow:0 10px 30px rgba(94,224,147,.28);animation:nudge 2.4s ease-in-out 1.2s infinite}
.btn svg{width:26px;height:26px;position:relative}.btn .t{position:relative;flex:1;white-space:nowrap}
.btn .n{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#0f2a1d;color:var(--green);font-size:15px;font-variant-numeric:tabular-nums}
.btn .fill{position:absolute;inset:0 auto 0 0;width:0;background:#86f0b2}
.btn:active{transform:scale(.98)}
@keyframes nudge{0%,100%{transform:none}50%{transform:translateY(-2px)}}
.status{margin:10px 0 0;text-align:center;font-size:12.5px;color:#a9bfc4;min-height:18px}
.legal{max-width:480px;margin:0 auto;padding:0 20px 18px;font-size:10.5px;line-height:1.6;color:#7f979d;text-align:center}
@media (min-height:760px){.g{padding-top:28px}.tag{margin-top:34px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

const GROUPS_SCRIPT = `(()=>{'use strict';
const INVITE=${JSON.stringify(GROUP_INVITE)},SECONDS=${GROUP_REDIRECT_SECONDS},KEY='sr-grupos-aberto';
const btn=document.getElementById('join'),num=document.getElementById('n'),fill=document.getElementById('fill'),status=document.getElementById('status');
let left=SECONDS,timer=0,sent=false,done=false;
function track(){if(sent)return;sent=true;try{if(location.hostname!=='sorefrigeracao.com'||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
fetch('/api/site-click',{method:'POST',body:JSON.stringify({event_type:'whatsapp_click',product_id:0,placement:'home_direct',page_type:'home'}),headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,cache:'no-store',redirect:'error'}).catch(()=>{});}catch(e){}}
function remember(){try{sessionStorage.setItem(KEY,'1')}catch(e){}}
function manual(text){clearInterval(timer);num.textContent='\\u2192';fill.style.transition='none';fill.style.width='0';status.textContent=text;}
function go(){if(done)return;done=true;clearInterval(timer);track();remember();status.textContent='Abrindo o WhatsApp\\u2026';location.href=INVITE;}
btn.addEventListener('click',()=>{done=true;clearInterval(timer);track();remember();});
let seen=false;try{seen=sessionStorage.getItem(KEY)==='1'}catch(e){}
if(seen){manual('N\\u00e3o abriu? Toque no bot\\u00e3o verde para entrar.');}
else{requestAnimationFrame(()=>{fill.style.transition='width '+SECONDS+'s linear';fill.style.width='100%';});
timer=setInterval(()=>{left--;if(left<=0){num.textContent='0';go();return;}num.textContent=String(left);status.textContent='Abrindo o grupo em '+left+' s\\u2026';},1000);}
addEventListener('pageshow',e=>{if(e.persisted){done=false;manual('N\\u00e3o abriu? Toque no bot\\u00e3o verde para entrar.');}});
})();`;

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

export const GROUPS_PAGE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#10232d"><meta name="robots" content="noindex,nofollow">
<title>Grupo de ofertas para refrigerista | Só Refrigeração</title>
<meta name="description" content="Grupo grátis no WhatsApp com ofertas de ferramentas para refrigerista: manifold, bomba de vácuo, flangeador e mais.">
<meta property="og:type" content="website"><meta property="og:url" content="https://sorefrigeracao.com/grupos">
<meta property="og:title" content="Grupo grátis de ofertas para refrigerista"><meta property="og:description" content="Ofertas de ferramentas de refrigeração todo dia no seu WhatsApp.">
<meta property="og:image" content="https://sorefrigeracao.com/assets/compartilhamento.png">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://chat.whatsapp.com">
${fontHead()}<style>${GROUPS_CSS}</style></head>
<body>
<main class="g">
<header class="top">${LOGO}<span>SÓ REFRIGERAÇÃO</span></header>
<p class="tag"><span class="dot"></span>GRUPO GRÁTIS NO WHATSAPP</p>
<h1>Ferramenta de refri <span>com preço baixo</span> todo dia.</h1>
<p class="lead">A gente garimpa as ofertas no Mercado Livre e manda direto no seu WhatsApp. Você só escolhe.</p>
<ul class="tools" aria-label="Exemplos de ferramentas que aparecem no grupo">
${GROUP_TOOLS.map(([id, name], i) => `<li><img src="${toolImage(id, 240)}" alt="${name}" width="112" height="96" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"><span>${name}</span></li>`).join('')}
</ul>
<ul class="why">
<li>${CHECK}<span><b>Só ferramenta de refri e ar-condicionado.</b> Nada de oferta aleatória.</span></li>
<li>${CHECK}<span><b>Cupons e descontos</b> conferidos antes de ir pro grupo.</span></li>
<li>${CHECK}<span><b>Grátis.</b> Silencie ou saia quando quiser.</span></li>
</ul>
<p class="proof"><strong>+6 mil</strong><span>técnicos e instaladores já recebem as ofertas nos nossos grupos.</span></p>
</main>
<div class="cta">
<a class="btn" id="join" href="${GROUP_INVITE}" rel="noopener"><span class="fill" id="fill"></span>${WA_ICON}<span class="t">Entrar no grupo</span><span class="n" id="n" aria-hidden="true">${GROUP_REDIRECT_SECONDS}</span></a>
<p class="status" id="status" aria-live="polite">Abrindo o grupo em ${GROUP_REDIRECT_SECONDS} s…</p>
</div>
<p class="legal">Links de afiliado do Mercado Livre. Os preços podem mudar. CMN DIGITAL · <a href="/privacidade/" style="color:inherit">Privacidade</a></p>
<script>${GROUPS_SCRIPT}</script>
</body></html>`;

function groupsResponse(method) {
  return new Response(method === 'HEAD' ? null : GROUPS_PAGE_HTML, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
// ---------------------------------------------------------------------------

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

const isAssetRoute = route => route.startsWith('/assets/') || /(?:^|\/)\./.test(route)
  || /\.(?:css|js|mjs|cjs|map|json|txt|xml|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|env|ts|py|sh|zip|gz)$/i.test(route);
const hasBody = req => Boolean(req.headers['transfer-encoding']) || Number(req.headers['content-length'] || 0) > 0;
const isSeo = route => /^\/(?:blog|produtos|categorias|catalogo|seo)(?:\/|$)/.test(route)
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
  const names = image ? ['accept'] : ['origin', 'content-type', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'dnt', 'sec-gpc'];
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
      'Cache-Control': name.startsWith('assets/blog/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate', ETag: etag };
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

export function createVpsServer({ distDir, seoHandler, clickHandler, blogClickHandler, imageHandler, revision,
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
      if (route === '/api/site-click' || route === '/api/blog-click') {
        const eventHandler = route === '/api/blog-click' ? blogClickHandler : clickHandler;
        if (typeof eventHandler !== 'function') return failure(503);
        if (!['POST', 'OPTIONS'].includes(req.method)) return failure(405, { Allow: 'POST, OPTIONS', Connection: 'close' });
        if (req.method === 'OPTIONS' && hasBody(req)) return failure(400, { Connection: 'close' });
        let body;
        try { if (req.method === 'POST') body = await readBody(req, bodyTimeoutMs); }
        catch (status) { return failure(status, { Connection: 'close' }); }
        return boundedHandler(eventHandler, fetchRequest(req, body), handlerTimeoutMs);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return failure(405, { Allow: 'GET, HEAD', Connection: 'close' });
      if (hasBody(req)) return failure(400, { Connection: 'close' });
      if (route === '/grupos') return groupsResponse(req.method);
      if (route === '/grupos/' || route === '/grupo' || route === '/grupo/') {
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return failure(301, { Location: '/grupos' + query });
      }
      if (route === '/healthz') return Response.json({ ok: true, ...(revision ? { revision } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
      if (route === '/.netlify/images') return boundedHandler(imageHandler, fetchRequest(req, null, { image: true }), handlerTimeoutMs);
      if (isSeo(route)) return boundedHandler(seoHandler, fetchRequest(req), handlerTimeoutMs);
      if (route === '/index.html' || route === '/privacidade' || route === '/privacidade/index.html') {
        return failure(301, { Location: route === '/index.html' ? '/' : '/privacidade/' });
      }
      const name = route === '/' ? 'index.html' : route === '/privacidade/' ? 'privacidade/index.html' : route.slice(1);
      if (PUBLIC_SET.has(name)) return staticResponse(root, name, req.method, req.headers, revision);
      // Pages get the branded 404; assets, dotfiles and source files stay an empty 404.
      if (typeof seoHandler.notFound === 'function' && !isAssetRoute(route)) return seoHandler.notFound(req.method);
      return failure(404);
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
