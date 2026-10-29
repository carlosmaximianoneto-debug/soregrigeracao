import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publisherSchema } from '../site-identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_URL = 'https://sorefrigeracao.com';
export const CATALOGUE_URL = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/refri-catalogue/catalogue.json';
export const PUBLIC_FILES = Object.freeze([
  'index.html', 'site-clicks.js', 'privacidade/index.html', 'styles.css', 'mobile-refinements.css', 'carousel.css',
  'catalogue.js', 'categories.js', 'catalogue-images.js', 'carousel.js', 'seo-pages.css',
  'assets/produto_149.jpg', 'assets/produto_263.jpg',
  'assets/produto_1980.jpg', 'assets/produto_2164.jpg',
  'floating-join.css', 'assets/favicon.svg', 'assets/favicon.ico',
  'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/compartilhamento.png',
]);

export function invitationContract(html) {
  const invites = [...html.matchAll(/<a\b[^>]*\bhref="(https:\/\/chat\.whatsapp\.com\/[^"\s]+)"[^>]*>/gi)].map(match => match[1]);
  if (invites.length !== 3 || new Set(invites).size !== 1 || !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,64}$/.test(invites[0])) throw new Error('index.html deve preservar exatamente três convites WhatsApp idênticos e válidos, com aspas duplas.');
  return invites[0];
}

export function productionHTML(source) {
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Só Refrigeração', url: `${SITE_URL}/`, inLanguage: 'pt-BR', publisher: { '@id': `${SITE_URL}/#organization` } },
    publisherSchema(SITE_URL),
  ] };
  let html = source
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, '<meta name="robots" content="index,follow,max-image-preview:large">')
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Ferramentas para Refrigerista | Só Refrigeração</title>')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<script>if\(new URLSearchParams\(location\.search\)[\s\S]*?<\/script>/, '')
    .replace('<section class="hero-visual pump-carousel"','<section hidden class="hero-visual pump-carousel"');
  const metadata = `<link rel="canonical" href="${SITE_URL}/"><meta property="og:site_name" content="Só Refrigeração"><meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:image" content="${SITE_URL}/assets/compartilhamento.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Só Refrigeração — ferramentas para refrigerista"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE_URL}/assets/compartilhamento.png"><meta property="og:url" content="${SITE_URL}/"><meta property="og:title" content="Ferramentas para Refrigerista | Só Refrigeração"><meta property="og:description" content="Ferramentas para refrigerista: bombas de vácuo, manifolds e serras-copo. Consulte o catálogo e receba ofertas no WhatsApp."><script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;
  html = html.replace('</head>', `${metadata}</head>`);
  if (!html.includes('content="index,follow,max-image-preview:large"') || /noindex|Prévia de entrada/.test(html)) throw new Error('Metadados de prévia permaneceram no HTML de produção.');
  return html;
}

export async function buildSite({ root = ROOT, context = process.env.CONTEXT || 'local-preview' } = {}) {
  root = path.resolve(root);
  const production = context === 'production' || context === 'vps-production';
  const output = path.resolve(root, 'dist');
  if (output !== path.join(root, 'dist') || !output.startsWith(`${root}${path.sep}`)) throw new Error('Saída fora do diretório autorizado.');
  const outputStat = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (outputStat?.isSymbolicLink()) throw new Error('dist não pode ser um link simbólico.');
  // Check all inputs before touching the previously generated public output.
  const content = new Map(await Promise.all(PUBLIC_FILES.map(async name => [name, await fs.readFile(path.join(root, name))])));
  const original = content.get('index.html').toString('utf8');
  const invite = invitationContract(original);
  // VPS starts with a small first page; catalogue.js loads the complete feed in
  // the background. Other deployments keep their direct public-feed fallback.
  const firstPageUrl = context === 'vps-production' ? '/api/catalogue-first' : undefined;
  const catalogueURLLiteral = JSON.stringify(firstPageUrl || CATALOGUE_URL).replace(/</g, '\\u003c');
  const catalogueHints = `<link rel="preconnect" href="${new URL(CATALOGUE_URL).origin}" crossorigin><script id="catalogue-preload-script">(()=>{try{if(typeof fetch!=='function'||typeof AbortSignal==='undefined'||typeof AbortSignal.timeout!=='function')return;const url=${catalogueURLLiteral},request=fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(15000)});request.catch(()=>{});window.REFRI_CATALOGUE_PRELOAD={url,request};}catch{}})();</script>`;
  const html = (production ? productionHTML(original) : original).replace('<head>', `<head>${catalogueHints}`);
  if (invitationContract(html) !== invite) throw new Error('O build alterou o convite gerenciado pelo publicador.');
  if (Buffer.byteLength(html) >= 250_000) throw new Error('HTML excede o limite do publicador de convites.');
  if (!production && !html.includes('noindex,nofollow')) throw new Error('A prévia precisa continuar noindex.');
  for (const [, asset] of html.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)) {
    if (!PUBLIC_FILES.includes(asset)) throw new Error(`Asset fora da lista pública: ${asset}`);
  }
  const imageProvider = context === 'vps-production' ? 'vps' : ['production', 'deploy-preview', 'branch-deploy'].includes(context) ? 'netlify' : 'original';
  const browserOptions = { catalogueUrl: CATALOGUE_URL, ...(firstPageUrl ? {firstPageUrl, randomOrder:true} : {}), preview: !production, maxAgeMs: 15 * 60_000, refreshMs: 5 * 60_000, imageOptimization: imageProvider !== 'original', imageProvider };
  const serverOptions = { snapshotURL: CATALOGUE_URL, production, base: production ? SITE_URL : '', invitationURL: invite };
  // The resolved target above is exactly <project>/dist; source files are untouched.
  if (outputStat) await fs.rm(output, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  content.set('index.html', Buffer.from(html));
  if (!production) content.set('privacidade/index.html', Buffer.from(content.get('privacidade/index.html').toString('utf8').replace('content="index,follow"', 'content="noindex,nofollow"').replace(/<link rel="canonical"[^>]*>/g, '')));
  for (const [name, bytes] of content) {
    const target = path.join(output, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  await fs.writeFile(path.join(output, 'site-config.js'), `// Public settings generated by the build; no credentials.\nwindow.REFRI_CATALOGUE = Object.freeze(${JSON.stringify(browserOptions, null, 2)});\n`, 'utf8');
  const generated = path.join(root, 'netlify', 'generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(path.join(generated, 'catalogue-config.mjs'), `// Generated server-only configuration. Do not edit or publish as a static file.\nexport const serverOptions = Object.freeze(${JSON.stringify(serverOptions, null, 2)});\nexport const categorySource = ${JSON.stringify(content.get('categories.js').toString('utf8'))};\n`, 'utf8');
  const result = { context, production, publicFiles: [...content.keys(), 'site-config.js'], output, canonical: production ? SITE_URL : null, requiresLiveCatalogue: true };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildSite();
