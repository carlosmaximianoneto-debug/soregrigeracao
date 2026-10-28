import sharp from 'sharp';

const INPUT_BYTES = 8 * 1024 * 1024;
const INPUT_PIXELS = 16_000_000;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MIME_FORMAT = Object.freeze({'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'});
const STORAGE_HOST = 'xlwiwxaghbkdwbtwagwo.supabase.co';
const STORAGE_PATH = '/storage/v1/object/public/imagens/';
const PARAMETERS = new Set(['url','w','q','fm','fit']);
const FAILURES = Object.freeze({400:'Invalid image request.',404:'Not found.',405:'Method not allowed.',413:'Image exceeds limits.',429:'Image service busy.',502:'Image unavailable.',504:'Image processing timed out.'});

// The container also has an OS memory/CPU cap. Avoid an additional native cache
// or a thread per CPU on the shared VPS; this module owns the bounded LRU below.
sharp.cache(false);
sharp.concurrency(1);

class ImageFailure extends Error {
  constructor(status){super(FAILURES[status]);this.status=status;}
}
function fail(status) {
  return new Response(FAILURES[status], {status,headers:{
    'content-type':'text/plain; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    ...(status===405?{allow:'GET'}:{}),...(status===429?{'retry-after':'1'}:{}),
  }});
}
function boundedInteger(value, maximum, name) {
  if(!Number.isSafeInteger(value)||value<1||value>maximum)throw new TypeError(`Invalid ${name}.`);
  return value;
}
function imageRequest(request) {
  const url=new URL(request.url);
  if(url.pathname!=='/.netlify/images')throw new ImageFailure(404);
  if(request.method!=='GET')throw new ImageFailure(405);
  const params=url.searchParams;
  if(url.href.length>4096||url.hash||params.size!==5||[...params.keys()].some(key=>!PARAMETERS.has(key))||[...PARAMETERS].some(key=>params.getAll(key).length!==1))throw new ImageFailure(400);
  if(params.get('q')!=='75'||params.get('fm')!=='webp'||params.get('fit')!=='contain'||!/^\d{3,4}$/.test(params.get('w')))throw new ImageFailure(400);
  const width=Number(params.get('w'));
  if(width<160||width>1200||String(width)!==params.get('w'))throw new ImageFailure(400);
  const original=params.get('url');
  // Validate the raw authority and path before URL normalization. No credentials,
  // explicit ports, encoded paths, dot segments, fragments or URL-like filenames.
  const match=/^https:\/\/(xlwiwxaghbkdwbtwagwo\.supabase\.co|http2\.mlstatic\.com)(\/[^?#]*)(\?[^#]*)?$/i.exec(original);
  if(!match||original.length>2048||/[\s\\\u0000-\u001f\u007f]/.test(original))throw new ImageFailure(400);
  const pathname=match[2];
  if(!/^\/[a-z0-9_/.\-]+\.(?:jpe?g|png|webp)$/i.test(pathname)||pathname.includes('//')||pathname.split('/').some(part=>part==='.'||part==='..'))throw new ImageFailure(400);
  const source=new URL(original);
  if(source.hostname===STORAGE_HOST&&!pathname.startsWith(STORAGE_PATH))throw new ImageFailure(400);
  if(source.search.length>512||source.searchParams.size>8)throw new ImageFailure(400);
  return {source:source.href,width,key:`${source.href}\n${width}`};
}
function magicFormat(bytes) {
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpeg';
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}

export function createImageHandler({fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=8000,cacheTTLms=3_600_000,maxCacheBytes=MAX_CACHE_BYTES,maxCacheEntries=64}={}) {
  boundedInteger(timeoutMs,8000,'timeout');
  boundedInteger(cacheTTLms,3_600_000,'cache lifetime');
  boundedInteger(maxCacheBytes,MAX_CACHE_BYTES,'cache byte limit');
  boundedInteger(maxCacheEntries,64,'cache entry limit');
  if(typeof fetchImpl!=='function'||typeof now!=='function')throw new TypeError('Invalid image handler dependencies.');
  const cache=new Map(),inFlight=new Map();
  let cacheBytes=0,active=0;
  function drop(key){const value=cache.get(key);if(value){cacheBytes-=value.bytes.length;cache.delete(key);}}
  function cached(key){
    const value=cache.get(key);
    if(!value)return null;
    if(value.expiresAt<=now()){drop(key);return null;}
    cache.delete(key);cache.set(key,value);return value;
  }
  function remember(key,bytes){
    const value={bytes,expiresAt:now()+cacheTTLms};
    if(bytes.length>maxCacheBytes)return value;
    drop(key);
    while(cache.size>=maxCacheEntries||cacheBytes+bytes.length>maxCacheBytes)drop(cache.keys().next().value);
    cache.set(key,value);cacheBytes+=bytes.length;
    return value;
  }
  function success(value){return new Response(value.bytes,{headers:{
    'content-type':'image/webp','content-length':String(value.bytes.length),
    'cache-control':`public, max-age=${Math.max(1,Math.floor(cacheTTLms/1000))}`,
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  }});}
  function start({source,width,key}) {
    active++;
    const controller=new AbortController(), started=Date.now();
    let reader,processor,timer;
    const timeout=new Promise((_resolve,reject)=>{
      timer=setTimeout(()=>{
        const error=new ImageFailure(504);
        controller.abort(error);
        reader?.cancel().catch(()=>{});
        processor?.destroy();
        reject(error);
      },timeoutMs);
    });
    const work=(async()=>{
      const response=await fetchImpl(source,{redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{accept:'image/jpeg, image/png, image/webp'},signal:controller.signal});
      const mime=(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();
      if(response.status!==200||response.redirected||!MIME_FORMAT[mime]||!response.body){response.body?.cancel().catch(()=>{});throw new ImageFailure(502);}
      const declared=Number(response.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>INPUT_BYTES){response.body.cancel().catch(()=>{});throw new ImageFailure(413);}
      reader=response.body.getReader();
      const chunks=[];let size=0;
      while(true){
        const {done,value}=await reader.read();
        if(controller.signal.aborted)throw new ImageFailure(504);
        if(done)break;
        size+=value.byteLength;
        if(size>INPUT_BYTES){reader.cancel().catch(()=>{});controller.abort();throw new ImageFailure(413);}
        chunks.push(Buffer.from(value));
      }
      const bytes=Buffer.concat(chunks,size),format=magicFormat(bytes);
      if(!format||format!==MIME_FORMAT[mime])throw new ImageFailure(502);
      processor=sharp(bytes,{failOn:'warning',limitInputPixels:INPUT_PIXELS,limitInputChannels:4,sequentialRead:true,unlimited:false});
      // Sharp's native deadline complements the wall-clock HTTP deadline. Retain
      // the concurrency slot until the native job settles, even after HTTP timeout.
      processor.timeout({seconds:Math.max(1,Math.ceil((timeoutMs-(Date.now()-started))/1000))});
      const metadata=await processor.metadata();
      if(controller.signal.aborted)throw new ImageFailure(504);
      if(metadata.width*metadata.height>INPUT_PIXELS)throw new ImageFailure(413);
      if(metadata.format!==format||!metadata.width||!metadata.height||(metadata.pages||1)>1)throw new ImageFailure(502);
      const output=await processor.autoOrient().resize({width,height:width,fit:'contain',withoutEnlargement:true,background:'#ffffff'}).webp({quality:75,effort:3}).toBuffer();
      if(controller.signal.aborted)throw new ImageFailure(504);
      if(output.length>INPUT_BYTES)throw new ImageFailure(413);
      return remember(key,output);
    })();
    const pending=Promise.race([work,timeout]).then(value=>({value}),error=>({status:error instanceof ImageFailure?error.status:/pixel limit/i.test(error?.message||'')?413:/timeout/i.test(error?.message||'')?504:502}));
    inFlight.set(key,pending);
    const finish=()=>{clearTimeout(timer);active--;if(inFlight.get(key)===pending)inFlight.delete(key);};
    // Both handlers consume rejection; a timed-out native task is never detached
    // from its slot or left as an unhandled promise.
    work.then(finish,finish);
    return pending;
  }
  return async request=>{
    let input;
    try{input=imageRequest(request);}catch(error){return fail(error instanceof ImageFailure?error.status:400);}
    const value=cached(input.key);
    if(value)return success(value);
    let pending=inFlight.get(input.key);
    if(!pending){if(active>=2)return fail(429);pending=start(input);}
    const result=await pending;
    return result.value?success(result.value):fail(result.status);
  };
}
