import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import { buildSite, PUBLIC_FILES } from '../scripts/build-site.mjs';

const storage = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/imagens/';
const photo = `${storage}produto_2768.jpg`;
const jpeg = await sharp({ create:{ width:800, height:400, channels:3, background:'#d28024' } }).jpeg().toBuffer();
const request = (source = photo, width = 400, extra = {}) => new Request(`https://sorefrigeracao.com/.netlify/images?${new URLSearchParams({url:source,w:String(width),q:'75',fm:'webp',fit:'contain',...extra})}`);
const upstream = (bytes = jpeg, headers = {}) => new Response(bytes, { headers:{'content-type':'image/jpeg',...headers} });
async function handler(options = {}) {
  const module = await import('../server/image-handler.mjs').catch(error => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.createImageHandler, 'function', 'the portable image handler must exist');
  return module.createImageHandler(options);
}

test('VPS transforms real raster bytes to a contained WebP and strips source metadata/headers', async () => {
  let captured;
  const image = await handler({ fetchImpl:async (url, options) => { captured={url,options}; return upstream(jpeg,{'set-cookie':'never=forward','server':'upstream-secret'}); } });
  const response = await image(request());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('cache-control'),/public/);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(response.headers.get('server'),null);
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(metadata.format,'webp');
  assert.equal(metadata.width,400);
  assert.equal(metadata.height,400);
  assert.equal(metadata.exif,undefined);
  assert.equal(captured.url,photo);
  assert.equal(captured.options.redirect,'error');
  assert.equal(captured.options.credentials,'omit');
  assert.equal(captured.options.referrerPolicy,'no-referrer');
  assert.equal(new Headers(captured.options.headers).get('authorization'),null);
});

test('only exact public image origins and paths can be fetched; unsafe URLs never reach upstream', async () => {
  let calls=0;
  const image=await handler({fetchImpl:async()=>{calls++;return upstream();}});
  for (const source of [
    'http://http2.mlstatic.com/a.jpg','https://http2.mlstatic.com:8443/a.jpg',
    'https://http2.mlstatic.com.evil.example/a.jpg','https://127.0.0.1/a.jpg',
    'https://169.254.169.254/latest/meta-data','file:///etc/passwd',
    'https://user:password@http2.mlstatic.com/a.jpg','https://@http2.mlstatic.com/a.jpg',
    'https://http2.mlstatic.com/a.jpg#fragment','https://http2.mlstatic.com\\@evil.example/a.jpg',
    `${storage}../other/a.jpg`,`${storage}%2e%2e/other/a.jpg`,`${storage}%252e%252e/a.jpg`,
    `${storage}a%2fb.jpg`,`${storage}a.svg`,`${storage}a.jpg/anything`,
    storage.replace('/imagens/','/private/')+'a.jpg',
    'https://other.supabase.co/storage/v1/object/public/imagens/a.jpg',
  ]) assert.equal((await image(request(source))).status,400,source);
  assert.equal(calls,0);
  assert.equal((await image(request('https://http2.mlstatic.com/D_NQ_NP_123-MLB_1-O.webp?v=2'))).status,200);
  assert.equal(calls,1);
});

test('unsupported methods, routes, duplicate parameters and unbounded transforms are rejected', async () => {
  let calls=0;
  const image=await handler({fetchImpl:async()=>{calls++;return upstream();}});
  for(const method of ['POST','PUT','DELETE','HEAD','OPTIONS']) {
    const response=await image(new Request(request().url,{method}));
    assert.equal(response.status,405,method);
    assert.equal(response.headers.get('allow'),'GET');
  }
  assert.equal((await image(new Request('https://sorefrigeracao.com/not-images'))).status,404);
  for(const width of [0,159,1201,400.5,'0400','Infinity','1e3']) assert.equal((await image(request(photo,width))).status,400,String(width));
  for(const extra of [{q:'100'},{fm:'png'},{fit:'cover'},{h:'1200'},{token:'x'}]) assert.equal((await image(request(photo,400,extra))).status,400);
  assert.equal((await image(new Request(request().url+'&url=https://example.com/a.jpg'))).status,400);
  assert.equal((await image(new Request(request().url.replace('&q=75','')))).status,400);
  assert.equal(calls,0);
  for(const width of [160,1200]) assert.equal((await image(request(photo,width))).status,200);
});

test('redirects and HTML/SVG/corrupt/animated sources never become cached images', async () => {
  for(const response of [
    new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}}),
    new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),
    new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>',{headers:{'content-type':'image/svg+xml'}}),
    upstream(Buffer.from('<svg>not a JPEG</svg>')),
    upstream(Buffer.from([0xff,0xd8,0xff,0x00])),
  ]) {
    let calls=0;
    const image=await handler({fetchImpl:async()=>{calls++;return response.clone();}});
    const result=await image(request());
    assert.equal(result.status,502);
    assert.equal(result.headers.get('cache-control'),'no-store');
    assert.equal((await image(request())).status,502);
    assert.equal(calls,2,'failures must not be retained in the success cache');
  }
  const png=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).png().toBuffer();
  assert.equal((await (await handler({fetchImpl:async()=>upstream(png)}))(request())).status,502,'MIME and actual image format must agree');
  const pixels=Buffer.alloc(10*20*3,100);pixels.fill(200,300);
  const animated=await sharp(pixels,{raw:{width:10,height:20,channels:3,pageHeight:10}}).webp({loop:0,delay:[100,100]}).toBuffer();
  const animation=await handler({fetchImpl:async()=>upstream(animated,{'content-type':'image/webp'})});
  assert.equal((await animation(request(`${storage}animation.webp`))).status,502,'animated input must not multiply decode work');
});

test('source size limit applies before allocation and while reading streams without Content-Length', async () => {
  const bytes=8*1024*1024;
  let cancelled=false;
  const large=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const image=await handler({fetchImpl:async()=>new Response(large,{headers:{'content-type':'image/jpeg'}})});
  assert.equal((await image(request())).status,413);
  assert.equal(cancelled,true);
  let read=false;
  const declared=await handler({fetchImpl:async()=>new Response(new ReadableStream({pull(){read=true;}},{highWaterMark:0}),{headers:{'content-type':'image/jpeg','content-length':String(bytes+1)}})});
  assert.equal((await declared(request())).status,413);
  assert.equal(read,false,'oversized declared sources must not be read');
});

test('a compressed image above sixteen million pixels is rejected before resize', async () => {
  const large=await sharp({create:{width:4001,height:4000,channels:3,background:'#fff'}}).png().toBuffer();
  const image=await handler({fetchImpl:async()=>upstream(large,{'content-type':'image/png'})});
  assert.equal((await image(request(`${storage}large.png`))).status,413);
});

test('a burst waits in FIFO order while only two sources transform at a time', async () => {
  const releases=[],started=[];
  const image=await handler({fetchImpl:url=>new Promise(resolve=>{started.push(url);releases.push(()=>resolve(upstream()));})});
  const first=image(request(`${storage}1.jpg`));
  const second=image(request(`${storage}2.jpg`));
  assert.equal(releases.length,2);
  const third=image(request(`${storage}3.jpg`));
  const fourth=image(request(`${storage}4.jpg`));
  assert.equal(releases.length,2,'queued sources do not allocate fetch or decoder work');
  releases[0]();
  assert.equal((await first).status,200);
  assert.equal(started[2],`${storage}3.jpg`);
  assert.equal(started.length,3,'one freed slot starts exactly one queued source');
  releases[1]();
  assert.equal((await second).status,200);
  assert.equal(started[3],`${storage}4.jpg`);
  releases[2]();releases[3]();
  assert.equal((await third).status,200);
  assert.equal((await fourth).status,200);
});

test('queued duplicates share one transform, a full queue rejects only new distinct images, and cached images bypass it', async () => {
  let pause=false;
  const releases=[],started=[];
  const image=await handler({maxQueued:2,fetchImpl:async url=>{started.push(url);if(pause)await new Promise(resolve=>releases.push(resolve));return upstream();}});
  assert.equal((await image(request())).status,200);
  pause=true;
  const first=image(request(`${storage}1.jpg`)),second=image(request(`${storage}2.jpg`));
  const third=image(request(`${storage}3.jpg`)),duplicate=image(request(`${storage}3.jpg`));
  const fourth=image(request(`${storage}4.jpg`));
  assert.equal(started.length,3,'only cached prime and two active sources have fetched');
  const busy=await image(request(`${storage}5.jpg`));
  assert.equal(busy.status,429);
  assert.equal(busy.headers.get('retry-after'),'1');
  assert.equal((await image(request())).status,200,'cached image bypasses both active and waiting limits');
  releases[0]();releases[1]();
  assert.equal((await first).status,200);assert.equal((await second).status,200);
  releases[2]();releases[3]();
  const [a,b,c]=await Promise.all([third,duplicate,fourth]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(c.status,200);
  assert.equal(started.filter(url=>url===`${storage}3.jpg`).length,1);
  assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()));
});

test('expired queued requests never start later and release their queue entries for new work', async () => {
  const releases=[],started=[];
  const image=await handler({queueTimeoutMs:30,maxQueued:1,fetchImpl:url=>new Promise(resolve=>{started.push(url);releases.push(()=>resolve(upstream()));})});
  const first=image(request(`${storage}1.jpg`)),second=image(request(`${storage}2.jpg`));
  const expired=await image(request(`${storage}3.jpg`));
  assert.equal(expired.status,429);
  assert.equal(expired.headers.get('cache-control'),'no-store');
  const fourth=image(request(`${storage}4.jpg`));
  releases[0]();releases[1]();
  await Promise.all([first,second]);
  assert.deepEqual(started,[`${storage}1.jpg`,`${storage}2.jpg`,`${storage}4.jpg`]);
  releases[2]();
  assert.equal((await fourth).status,200);
});

test('timed-out upstream work retains its slot until it settles; queued work cannot exceed concurrency', async () => {
  let calls=0;
  const rejecters=[];
  const image=await handler({timeoutMs:40,queueTimeoutMs:15,fetchImpl:async()=>{
    calls++;
    await new Promise((_resolve,reject)=>rejecters.push(reject));
    return upstream();
  }});
  const first=image(request(`${storage}1.jpg`)),second=image(request(`${storage}2.jpg`));
  assert.equal((await first).status,504);assert.equal((await second).status,504);
  assert.equal((await image(request(`${storage}3.jpg`))).status,429);
  assert.equal(calls,2,'an ignored abort must not create another upstream worker');
  rejecters.forEach(reject=>reject(new Error('upstream finally settled')));
  await new Promise(resolve=>setImmediate(resolve));
  const next=image(request(`${storage}4.jpg`));
  assert.equal(calls,3,'settled work releases its slot');
  rejecters[2](new Error('test cleanup'));
  assert.equal((await next).status,502);
});

test('queue and cache limits cannot expand beyond the shared VPS budget', async () => {
  for(const options of [{queueTimeoutMs:1501},{queueTimeoutMs:0},{maxQueued:25},{maxQueued:0},{maxCacheEntries:257}]) {
    await assert.rejects(handler(options),/Invalid/);
  }
});

test('identical concurrent requests share one transform but return independently readable responses', async () => {
  let calls=0,release;
  const image=await handler({fetchImpl:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return upstream();}});
  const first=image(request()), second=image(request());
  assert.equal(calls,1);
  release();
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()));
});

test('whole-request timeout aborts a slow source and permits later work', async () => {
  let slow=true,aborted=false;
  const image=await handler({timeoutMs:60,fetchImpl:async(_url,{signal})=>{
    if(!slow)return upstream();
    await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));
    return upstream();
  }});
  assert.equal((await image(request())).status,504);
  assert.equal(aborted,true);
  slow=false;
  assert.equal((await image(request())).status,200);
});

test('whole-request deadline also cancels a source that sends headers but never finishes its body', async () => {
  let cancelled=false;
  const image=await handler({timeoutMs:40,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'image/jpeg'}})});
  assert.equal((await image(request())).status,504);
  assert.equal(cancelled,true);
});

test('LRU entry and byte budgets evict old thumbnails and expired entries refresh', async () => {
  const calls=new Map();
  let now=0;
  const fetchImpl=async url=>{calls.set(url,(calls.get(url)||0)+1);return upstream();};
  const image=await handler({fetchImpl,maxCacheEntries:2,now:()=>now,cacheTTLms:1000});
  for(const name of ['a','b','a','c','b']) assert.equal((await image(request(`${storage}${name}.jpg`))).status,200);
  assert.equal(calls.get(`${storage}a.jpg`),1);
  assert.equal(calls.get(`${storage}b.jpg`),2);
  now=1001;
  assert.equal((await image(request(`${storage}b.jpg`))).status,200);
  assert.equal(calls.get(`${storage}b.jpg`),3);
  let smallCalls=0;
  const tinyCache=await handler({maxCacheBytes:1,fetchImpl:async()=>{smallCalls++;return upstream();}});
  assert.equal((await tinyCache(request())).status,200);
  assert.equal((await tinyCache(request())).status,200);
  assert.equal(smallCalls,2,'a thumbnail larger than the entire cache is never retained');
  const sample=await (await handler({fetchImpl:async()=>upstream()}))(request());
  const bytes=(await sample.arrayBuffer()).byteLength;
  const budgetCalls=new Map();
  const budget=await handler({maxCacheBytes:bytes*2-1,fetchImpl:async url=>{budgetCalls.set(url,(budgetCalls.get(url)||0)+1);return upstream();}});
  for(const name of ['a','b','a'])assert.equal((await budget(request(`${storage}${name}.jpg`))).status,200);
  assert.equal(budgetCalls.get(`${storage}a.jpg`),2,'combined buffers exceeding the byte budget must evict the oldest image');
});

test('vps-production emits production metadata and portable image configuration without public server files', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refri-vps-images-'));
  try {
    for(const name of PUBLIC_FILES){const target=path.join(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(new URL(`../${name}`,import.meta.url),target);}
    const result=await buildSite({root,context:'vps-production'});
    assert.equal(result.production,true);
    const html=await fs.readFile(path.join(root,'dist/index.html'),'utf8');
    assert.match(html,/<meta name="robots" content="index,follow,max-image-preview:large">/);
    assert.match(html,/<link rel="canonical" href="https:\/\/sorefrigeracao.com\/">/);
    const config={window:{}};
    vm.runInNewContext(await fs.readFile(path.join(root,'dist/site-config.js'),'utf8'),config);
    assert.equal(config.window.REFRI_CATALOGUE.imageOptimization,true);
    assert.equal(config.window.REFRI_CATALOGUE.imageProvider,'vps');
    assert.equal(config.window.REFRI_CATALOGUE.preview,false);
    const server=await fs.readFile(path.join(root,'netlify/generated/catalogue-config.mjs'),'utf8');
    const options=JSON.parse(server.match(/Object\.freeze\(([\s\S]*?)\);/)[1]);
    assert.equal(options.production,true);assert.equal(options.base,'https://sorefrigeracao.com');
    assert.equal(result.publicFiles.some(file=>/server|package|\.env|generated|lock/.test(file)),false);
    const window={location:{hostname:'sorefrigeracao.com'},REFRI_CATALOGUE:config.window.REFRI_CATALOGUE};
    vm.runInNewContext(await fs.readFile(path.join(root,'dist/catalogue-images.js'),'utf8'),{window,URL,URLSearchParams});
    assert.match(window.catalogueImageUrl(photo,400),/^\/\.netlify\/images\?/,'existing image URLs remain compatible');
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
