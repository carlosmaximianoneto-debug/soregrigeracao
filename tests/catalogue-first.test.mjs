import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSeoHandler } from '../seo-netlify-function.mjs';

const categorySource = await fs.readFile(new URL('../categories.js', import.meta.url), 'utf8');
const epoch = Date.parse('2026-10-29T12:00:00Z');
const rows = Array.from({length:60}, (_, i) => ({id:i+1, title:`Alicate profissional ${i+1}`, price:100, discount:15,
  category:'Ferramentas manuais', image:`https://http2.mlstatic.com/produto_${i+1}.jpg`, url:`https://meli.la/p${i+1}`, internalNote:'never expose'}));
const request = (route = '/api/catalogue-first', method = 'GET') => new Request(`https://sorefrigeracao.com${route}`, {method});
function fixture({ products = rows, initialTime = epoch } = {}) {
  let now=initialTime, calls=0, fail=false;
  let snapshot={generatedAt:new Date(epoch).toISOString(),products};
  const handler=createSeoHandler({snapshotURL:'https://public.example/catalogue.json',production:true,base:'https://sorefrigeracao.com',categorySource,
    now:()=>now, fetchImpl:async()=>{calls++;if(fail)throw Error('offline');return Response.json(snapshot);}});
  return {handler, calls:()=>calls, advance:ms=>now+=ms, fail:()=>fail=true,
    replace:products=>snapshot={generatedAt:new Date(now).toISOString(),products}};
}

test('initial page selects only24 public products, rotates deterministically and shares SEO cache',async()=>{
  const f=fixture();
  const response=await f.handler(request());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('content-type'),/^application\/json/);
  const first=await response.json();
  assert.equal(first.total,60);assert.equal(first.products.length,24);
  assert.equal(new Set(first.products.map(p=>p.id)).size,24);
  assert.deepEqual(first.categories,['Ferramentas manuais']);
  assert.deepEqual(Object.keys(first.products[0]).sort(),['category','discount','id','image','price','title','url']);
  assert.equal(first.products[0].discount,15);
  assert.notDeepEqual(first.products.map(p=>Number(p.id)),rows.slice(0,24).map(p=>p.id));
  assert.deepEqual(await (await f.handler(request())).json(),first);
  assert.equal((await f.handler(request('/catalogo/'))).status,200);
  assert.equal(f.calls(),1);
  f.advance(30001);
  assert.deepEqual(await (await f.handler(request())).json(),first);
  assert.equal(f.calls(),2);
  f.replace(rows.slice(5));f.advance(30001);
  const refreshed=await (await f.handler(request())).json();
  assert.equal(refreshed.total,55);
  assert.ok(refreshed.products.every(p=>Number(p.id)>5));
});

test('unknown external destinations are never returned and source secrets remain absent',async()=>{
  const f=fixture({products:[...rows.slice(0,2),{...rows[2],url:'https://example.net/nope'},
    {...rows[3],image:'https://example.net/p.png'}]});
  const data=await (await f.handler(request())).json();
  assert.equal(data.total,2);assert.equal(data.products.length,2);
  assert.doesNotMatch(JSON.stringify(data),/internalNote|never expose|example.net/);
});

test('an expired cached snapshot is not served after failure; freshness deadline is not renewed',async()=>{
  const f=fixture({initialTime:epoch+899000});
  assert.equal((await f.handler(request())).status,200);
  f.advance(1001);f.fail();
  assert.equal((await f.handler(request())).status,503);
  const stale=fixture({initialTime:epoch+900001});
  assert.equal((await stale.handler(request())).status,503);
});

test('endpoint rejects query overrides and writes, supports bodyless HEAD, and deduplicates fetches',async()=>{
  const f=fixture();
  assert.equal((await f.handler(request('/api/catalogue-first?url=https://private.test'))).status,400);
  assert.equal((await f.handler(request('/api/catalogue-first','POST'))).status,405);
  assert.equal(f.calls(),0);
  const [a,b,c]=await Promise.all([f.handler(request()),f.handler(request()),f.handler(request('/api/catalogue-first','HEAD'))]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(await c.text(),'');assert.equal(f.calls(),1);
});
