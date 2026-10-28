// Read-only audit of one public catalogue snapshot. No private keys or database writes.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createSeoRenderer } from '../seo-runtime.mjs';
import { createSeoHandler } from '../seo-netlify-function.mjs';
import { CATALOGUE_URL, invitationContract } from '../scripts/build-site.mjs';

const snapshot = await (await fetch(CATALOGUE_URL, {signal:AbortSignal.timeout(20000)})).json();
const categorySource = await fs.readFile(new URL('../categories.js',import.meta.url),'utf8');
const invitationURL = invitationContract(await fs.readFile(new URL('../index.html',import.meta.url),'utf8'));
const options = {production:true,base:'https://sorefrigeracao.com',invitationURL};
const renderer = createSeoRenderer(snapshot,options,categorySource);
const handler = createSeoHandler({...options,categorySource,snapshotURL:CATALOGUE_URL,
  now:()=>Date.parse(snapshot.generatedAt)+1000,fetchImpl:async()=>new Response(JSON.stringify(snapshot))});
let redirects=0, links=0;
const known = new Set(renderer.routes);
const locations = [...renderer.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.equal(new Set(locations).size,locations.length,'sitemap URLs must be unique');
assert.ok(!locations.some(url=>new URL(url).pathname.startsWith('/seo/')));
for(const route of renderer.routes) {
  assert.ok(!route.startsWith('/seo/'));
  const response = await handler(new Request(options.base+route));
  assert.equal(response.status,200,route);
  const html = await response.text();
  assert.ok(html.includes(`rel="canonical" href="${options.base}${route}"`),route);
  for(const [,href] of html.matchAll(/href="(\/[^"?#]*)"/g)) {
    if(href.startsWith('/produtos/')||href.startsWith('/categorias/')||href.startsWith('/catalogo/')) {
      links++; assert.ok(known.has(href),`${route} -> missing ${href}`);
    }
    assert.ok(!href.startsWith('/seo/'),`legacy internal link on ${route}`);
  }
  const old = await handler(new Request(options.base+'/seo'+route));
  assert.equal(old.status,301,route);
  assert.equal(old.headers.get('location'),route,`direct legacy redirect ${route}`);
  redirects++;
}
console.log(JSON.stringify({snapshotTime:snapshot.generatedAt,products:renderer.products.length,
  canonicalPages:renderer.routes.length,sitemapURLs:locations.length,checkedInternalLinks:links,
  directLegacyRedirects:redirects,allPassed:true},null,2));
