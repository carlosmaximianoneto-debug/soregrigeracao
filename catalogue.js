(() => {
  'use strict';
  const input = document.querySelector('#search');
  const select = document.querySelector('#category'), pills = document.querySelector('.filters');
  const grid = document.querySelector('#products'), count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty'), note = document.querySelector('.catalogue-note');
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stopwords = new Set(['a','o','as','os','de','da','do','das','dos','e','com','para','por','em','no','na','nos','nas']);
  const pluralForms = new Map([['gases','gas'],['manifolds','manifold'],['kits','kit'],['bits','bit']]);
  function singular(word){
    if(pluralForms.has(word))return pluralForms.get(word);
    // Normalize complete words conservatively; leave model numbers unchanged.
    if(word.length<4||/\d/.test(word))return word;
    if(/(?:oes|aes)$/.test(word))return word.slice(0,-3)+'ao';
    if(word.length>4&&/[aeou]is$/.test(word))return word.slice(0,-2)+'l';
    if(/ns$/.test(word))return word.slice(0,-2)+'m';
    if(/[rz]es$/.test(word))return word.slice(0,-2);
    return /[aeiou]s$/.test(word)?word.slice(0,-1):word;
  }
  function searchTokens(text){
    const words=normalize(text).replace(/\bserras?copos?\b/g,'serra copo').match(/[a-z0-9]+/g)||[];
    return words.filter(word=>!stopwords.has(word));
  }
  const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const settings = window.REFRI_CATALOGUE || {catalogueUrl:'./catalogue-public.json',preview:false,maxAgeMs:900000,refreshMs:300000};
  const cacheKey = `refri-catalogue:v1:${settings.catalogueUrl}`, cacheTtl = 60000;
  let snapshotTime = 0, loading = false, cacheExpiresAt = 0, cacheTimer, loadVersion = 0;
  let partial = false, catalogueTotal = 0;
  const orderSeed = Math.random().toString(36);
  function orderScore(id){
    let hash=2166136261;
    for(const character of orderSeed+String(id))hash=Math.imul(hash^character.charCodeAt(0),16777619);
    return hash>>>0;
  }
  function publishCatalogue(rows){window.REFRI_CURRENT_CATALOGUE=rows;document.dispatchEvent(new CustomEvent('catalogue:updated',{detail:{products:rows}}));}
  const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = (value,image=false) => {try {const u=new URL(value);return u.protocol==='https:'&&(image ? /(^|\.)(supabase\.co|mlstatic\.com)$/.test(u.hostname):/(^|\.)(meli\.la|mercadolivre\.com\.br|mercadolibre\.com)$/.test(u.hostname))?u.href:null;}catch{return null;}};
  let products=[], filtered=[], category='all', shown=24, debounce;
  let renderedMarkup = null, renderedCategories = null;
  const more=document.createElement('button');more.type='button';more.className='load-more';more.hidden=true;more.textContent='Mostrar mais produtos';grid.after(more);
  function render(){
    const imageUrl=window.catalogueImageUrl||((url)=>url);
    const markup=filtered.slice(0,shown).map(product=>{
      const title=product.title.length>96?product.title.slice(0,93).replace(/\s+\S*$/,'')+'…':product.title;
      const image=imageUrl(product.image,400);
      const responsive=image!==product.image?` srcset="${[240,400,640].map(width=>`${escape(imageUrl(product.image,width))} ${width}w`).join(', ')}" sizes="(max-width: 600px) calc((100vw - 48px) / 2), (max-width: 900px) 30vw, 280px" data-original="${escape(product.image)}"`:'';
      const discountBadge=product.discount?`<span class="catalogue-discount" title="Confirme o desconto no anúncio.">${product.discount}% OFF</span>`:'';
      return `<article class="product"><a class="product-photo" href="${escape(product.url)}" data-track-event="affiliate_click" data-product-id="${escape(product.id)}" data-placement="home_card" data-page-type="home" target="_blank" rel="sponsored noopener noreferrer" aria-label="Ver ${escape(product.title)} no Mercado Livre"><img src="${escape(image)}"${responsive} alt="${escape(product.title)}" width="400" height="400" loading="lazy" decoding="async"></a><div class="product-info"><p class="product-type">${escape(product.category)}</p><h3 title="${escape(product.title)}">${escape(title)}</h3><p class="catalogue-price">${product.price>0?money.format(product.price):'Consulte o preço'}${product.price>0?discountBadge:'<span>No anúncio</span>'}</p><a class="product-link" href="${escape(product.url)}" data-track-event="affiliate_click" data-product-id="${escape(product.id)}" data-placement="home_card" data-page-type="home" target="_blank" rel="sponsored noopener noreferrer">Ver no Mercado Livre <span aria-hidden="true">↗</span></a></div></article>`;
    }).join('');
    // Keep the actual image/card nodes when only the unfinished query or feed timestamp changes.
    if(markup!==renderedMarkup){
      grid.innerHTML=markup;renderedMarkup=markup;
      grid.querySelectorAll('img').forEach(img=>{
        let retried=false, failed=false;
        img.addEventListener('error',()=>{
          if(!retried&&img.dataset.original){retried=true;img.removeAttribute('srcset');img.src=img.dataset.original;return;}
          if(failed)return;failed=true;img.hidden=true;
          const fallback=document.createElement('span');fallback.className='image-unavailable';fallback.textContent='Foto indisponível';img.parentElement.append(fallback);
        });
      });
    }
    count.textContent=partial
      ? (searchTokens(input.value).length||category!=='all'?'Carregando resultados de todo o catálogo…':`${Math.min(shown,filtered.length)} de ${catalogueTotal.toLocaleString('pt-BR')} produtos · carregando restante…`)
      : filtered.length?`${Math.min(shown,filtered.length)} de ${filtered.length.toLocaleString('pt-BR')} produtos`:'Nenhum produto encontrado';
    more.hidden=partial||shown>=filtered.length;empty.hidden=partial||filtered.length>0;select.value=category;
    pills.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===category)));
  }
  function filter(resetPagination=true){
    const tokens=searchTokens(input.value), words=tokens.map(singular), last=words.length-1;
    grid.dataset.searchFiltered=String(words.length>0);
    grid.dataset.categoryFiltered=String(category!=='all');
    function matchIndex(product,queryIndex,partial=false){
      return product.searchWords.findIndex((word,titleIndex)=>{
        const matches=partial
          ? product.searchTokens[titleIndex].startsWith(tokens[queryIndex])||word.startsWith(tokens[queryIndex])
          : word===words[queryIndex];
        // Apply hose exclusions to the matched word, not to ambiguous prefixes like "man".
        return matches&&(word!=='mangueira'||(product.searchWords[titleIndex-1]==='sem')===(words[queryIndex-1]==='sem'));
      });
    }
    filtered=products.filter(p=>(category==='all'||p.category===category)&&words.slice(0,last).every((word,index)=>matchIndex(p,index)>=0));
    if(words.length){
      // Prefer whole words within the current filters; otherwise complete the word being typed.
      const partial=tokens[last].length>=2&&!filtered.some(p=>matchIndex(p,last)>=0);
      filtered=filtered.filter(p=>matchIndex(p,last,partial)>=0);
      // Keep genuine kits/accessories; titles naming the searched item first appear first.
      filtered.sort((a,b)=>matchIndex(a,0,partial&&last===0)-matchIndex(b,0,partial&&last===0));
    }
    if(resetPagination)shown=24;render();
  }
  function forgetCache(){try{window.localStorage.removeItem(cacheKey);}catch{/* Storage may be blocked or unavailable. */}}
  function clearCatalogue(message){
    clearTimeout(cacheTimer);cacheExpiresAt=0;snapshotTime=0;partial=false;catalogueTotal=0;products=[];filtered=[];renderedMarkup=null;
    grid.innerHTML='';count.textContent='O catálogo está sendo atualizado.';more.hidden=true;empty.hidden=true;note.textContent=message;publishCatalogue([]);
  }
  function validateSnapshot(data){
    if(!data||!Array.isArray(data.products))throw new Error('Catálogo inválido');
    const time=Date.parse(data.generatedAt);
    if(!settings.preview&&(!Number.isFinite(time)||Date.now()-time>=settings.maxAgeMs||time>Date.now()+60000))throw new Error('Catálogo desatualizado');
    return time;
  }
  function applySnapshot(data,firstPage=false){
    if(firstPage&&(!Number.isSafeInteger(data?.total)||data.total<0||!Array.isArray(data.categories)||data.categories.some(c=>typeof c!=='string'||c.length>150)||data.products?.length>24||data.total<data.products?.length))throw new Error('Primeira página inválida');
    const previousOrder=new Map(products.map((p,index)=>[String(p.id),index]));
    snapshotTime=validateSnapshot(data);
    partial=firstPage;catalogueTotal=firstPage?data.total:data.products.length;
    const ids=new Set();products=data.products.flatMap(p=>{
      if(!p||typeof p.title!=='string')return[];
      const url=safeUrl(p.url),image=safeUrl(p.image,true);
      if(!url||!image||!p.title||ids.has(String(p.id)))return[];
      ids.add(String(p.id));const category=typeof p.category==='string'&&p.category?p.category:window.catalogueCategory(p.title),tokens=searchTokens(p.title);
      const price=Number(p.price),discount=Number.isFinite(price)&&price>0&&Number.isInteger(p.discount)&&p.discount>0&&p.discount<100?p.discount:null;
      return[{...p,url,image,category,price,discount,searchTokens:tokens,searchWords:tokens.map(singular)}];
    });
    if(settings.randomOrder&&!firstPage){
      // Keep visible products in place as the complete feed arrives or refreshes.
      // New entries receive a stable order for this visit, not a new shuffle per render.
      products.sort((a,b)=>{
        const ai=previousOrder.get(String(a.id)),bi=previousOrder.get(String(b.id));
        return ai!==undefined||bi!==undefined?(ai??Infinity)-(bi??Infinity):orderScore(a.id)-orderScore(b.id)||String(a.id).localeCompare(String(b.id));
      });
    }
    const categories=[...new Set(firstPage?data.categories:products.map(p=>p.category))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if(category!=='all'&&!categories.includes(category))category='all';
    const categoryKey=JSON.stringify(categories);
    if(categoryKey!==renderedCategories){
      select.innerHTML='<option value="all">Todas as categorias</option>'+categories.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
      const quick=['Bombas de vácuo','Bombas de limpeza','Serras-copo','Manifolds e manômetros','Multímetros e alicates amperímetros'].filter(c=>categories.includes(c));
      pills.innerHTML='<button type="button" data-filter="all" aria-pressed="true">Todos</button>'+quick.map(c=>`<button type="button" data-filter="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('');
      renderedCategories=categoryKey;
    }
    const date=new Date(data.generatedAt);note.textContent=`Base consultada em ${Number.isNaN(date.getTime())?'data não informada':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}. Isso não indica atualização dos preços e descontos. Confira o valor e a disponibilidade no anúncio.`;
    document.querySelector('.results-meta>span').textContent='Produtos ativos no Supabase';filter(false);
    // Carousel and browser cache must never mistake the first page for the full catalogue.
    if(!firstPage)publishCatalogue(products);
  }
  function expireRestoredCache(){
    if(cacheExpiresAt&&Date.now()>=cacheExpiresAt){forgetCache();clearCatalogue('Aguardando uma base recente para exibir os produtos.');}
  }
  function restoreCache(){
    if(settings.preview)return;
    try{
      const entry=JSON.parse(window.localStorage.getItem(cacheKey));
      if(!entry)return;
      if(!Number.isFinite(entry.receivedAt)||entry.receivedAt>Date.now()||Date.now()-entry.receivedAt>=cacheTtl)throw new Error('Cache vencido');
      const time=validateSnapshot(entry.data);
      applySnapshot(entry.data);
      // Reading a cached response never renews its lease or the feed's freshness deadline.
      cacheExpiresAt=Math.min(entry.receivedAt+cacheTtl,time+settings.maxAgeMs);
      cacheTimer=setTimeout(expireRestoredCache,cacheExpiresAt-Date.now());
    }catch{forgetCache();}
  }
  function rememberSnapshot(){
    if(settings.preview)return;
    const rows=products.map(({id,title,image,url,price,discount,category})=>({id,title,image,url,price,discount,category}));
    try{window.localStorage.setItem(cacheKey,JSON.stringify({receivedAt:Date.now(),data:{generatedAt:new Date(snapshotTime).toISOString(),products:rows}}));}catch{/* Live results work even without storage. */}
  }
  async function readResponse(request){
    const response=await request;
    if(!response.ok)throw new Error('Catálogo indisponível');
    return response.json();
  }
  async function load(){
    if (loading) return;
    loading = true;
    const version=++loadVersion;
    let complete=false;
    expireRestoredCache();
    grid.setAttribute('aria-busy','true');if(!snapshotTime)count.textContent='Carregando catálogo conferido…';
    try{
      const early=window.REFRI_CATALOGUE_PRELOAD;delete window.REFRI_CATALOGUE_PRELOAD;
      const request=()=>readResponse(fetch(settings.catalogueUrl,{cache:'no-cache',...(settings.firstPageUrl?{priority:'low'}:{}),signal:AbortSignal.timeout(15000)}));
      if(settings.firstPageUrl&&!snapshotTime){
        const firstRequest=early?.url===settings.firstPageUrl?early.request:fetch(settings.firstPageUrl,{cache:'no-cache',priority:'high',signal:AbortSignal.timeout(15000)});
        // Race the small same-origin response against the full public feed. Neither
        // request blocks the other; a late first page cannot replace complete results.
        readResponse(firstRequest).then(data=>{
          if(version===loadVersion&&!complete&&!snapshotTime)applySnapshot(data,true);
        }).catch(()=>{/* The full feed remains the fallback. */});
      }
      // A slow page can outlive the early request's timeout. Retry it once, including body read failures.
      let data;
      if(early?.url===settings.catalogueUrl){try{data=await readResponse(early.request);}catch{data=await request();}}
      else data=await request();
      complete=true;applySnapshot(data);
      clearTimeout(cacheTimer);cacheExpiresAt=0;rememberSnapshot();
    }catch{complete=true;forgetCache();clearCatalogue('Não foi possível obter uma base recente. Tente novamente em alguns minutos.');}
    finally{grid.setAttribute('aria-busy','false');loading=false;}
  }
  input.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(filter,120);});
  select.addEventListener('change',()=>{category=select.value;filter();});
  document.querySelector('#catalogue-search').addEventListener('submit', event => event.preventDefault());
  pills.addEventListener('click',event=>{const button=event.target.closest('button[data-filter]');if(button){category=button.dataset.filter;filter();}});
  more.addEventListener('click',()=>{const next=shown;shown+=24;render();grid.querySelectorAll('.product-photo')[next]?.focus({preventScroll:true});});
  document.querySelector('#reset-search').addEventListener('click', () => { category = 'all'; input.value = ''; filter(); input.focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {event.preventDefault(); input.focus();}
  });
  const dock = document.querySelector('.mobile-join');
  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
      dock.classList.toggle('is-visible', visible.size === 0);
    });
    document.querySelectorAll('.hero-join,.final-join').forEach(cta => observer.observe(cta));
  } else dock.classList.add('is-visible');
  restoreCache();load();
  if (!settings.preview) {
    setInterval(()=>{if(!document.hidden)load();},settings.refreshMs);
    setInterval(()=>{expireRestoredCache();if(snapshotTime&&Date.now()-snapshotTime>=settings.maxAgeMs){forgetCache();clearCatalogue('Aguardando uma base recente para exibir os produtos.');}},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  }
})();

