(() => {
  'use strict';
  const input = document.querySelector('#search');
  const select = document.querySelector('#category'), pills = document.querySelector('.filters');
  const grid = document.querySelector('#products'), count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty'), note = document.querySelector('.catalogue-note');
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-–·]/g, ' ');
  const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const settings = window.REFRI_CATALOGUE || {catalogueUrl:'./catalogue-public.json',preview:false,maxAgeMs:900000,refreshMs:300000};
  let snapshotTime = 0, loading = false;
  function publishCatalogue(rows){window.REFRI_CURRENT_CATALOGUE=rows;document.dispatchEvent(new CustomEvent('catalogue:updated',{detail:{products:rows}}));}
  const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = (value,image=false) => {try {const u=new URL(value);return u.protocol==='https:'&&(image ? /(^|\.)(supabase\.co|mlstatic\.com)$/.test(u.hostname):/(^|\.)(meli\.la|mercadolivre\.com\.br|mercadolibre\.com)$/.test(u.hostname))?u.href:null;}catch{return null;}};
  let products=[], filtered=[], category='all', shown=24, debounce;
  const more=document.createElement('button');more.type='button';more.className='load-more';more.hidden=true;more.textContent='Mostrar mais produtos';grid.after(more);
  function render(){
    grid.innerHTML=filtered.slice(0,shown).map(product=>{
      const title=product.title.length>96?product.title.slice(0,93).replace(/\s+\S*$/,'')+'…':product.title;
      return `<article class="product"><a class="product-photo" href="${escape(product.url)}" target="_blank" rel="sponsored noopener noreferrer" aria-label="Ver ${escape(product.title)} no Mercado Livre"><img src="${escape(product.image)}" alt="${escape(product.title)}" width="400" height="400" loading="lazy" decoding="async"></a><div class="product-info"><p class="product-type">${escape(product.category)}</p><h3 title="${escape(product.title)}">${escape(title)}</h3><p class="catalogue-price">${product.price>0?money.format(product.price):'Consulte o preço'}<span>${product.price>0?'Preço cadastrado':'No anúncio'}</span></p><a class="product-link" href="${escape(product.url)}" target="_blank" rel="sponsored noopener noreferrer">Ver no Mercado Livre <span aria-hidden="true">↗</span></a></div></article>`;
    }).join('');
    grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const fallback=document.createElement('span');fallback.className='image-unavailable';fallback.textContent='Foto indisponível';img.parentElement.append(fallback);},{once:true}));
    count.textContent=filtered.length?`${Math.min(shown,filtered.length)} de ${filtered.length.toLocaleString('pt-BR')} produtos`:'Nenhum produto encontrado';
    more.hidden=shown>=filtered.length;empty.hidden=filtered.length>0;select.value=category;
    pills.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===category)));
  }
  function filter(){const words=normalize(input.value.trim()).split(/\s+/).filter(Boolean);filtered=products.filter(p=>(category==='all'||p.category===category)&&words.every(w=>p.search.includes(w)));shown=24;render();}
  async function load(){
    if (loading) return;
    loading = true;
    grid.setAttribute('aria-busy','true');count.textContent='Carregando catálogo conferido…';
    try{
      const response=await fetch(settings.catalogueUrl,{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Catálogo indisponível');
      const data=await response.json();if(!Array.isArray(data.products))throw new Error('Catálogo inválido');
      snapshotTime = Date.parse(data.generatedAt);
      if (!settings.preview && (!Number.isFinite(snapshotTime) || Date.now()-snapshotTime>settings.maxAgeMs || snapshotTime>Date.now()+60000)) throw new Error('Catálogo desatualizado');
      const ids=new Set();products=data.products.flatMap(p=>{const url=safeUrl(p.url),image=safeUrl(p.image,true);if(!url||!image||!p.title||ids.has(p.id))return[];ids.add(p.id);const category=p.category||window.catalogueCategory(p.title);return[{...p,url,image,category,price:Number(p.price),search:normalize(`${p.title} ${category}`)}];});
      const categories=[...new Set(products.map(p=>p.category))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      select.innerHTML='<option value="all">Todas as categorias</option>'+categories.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
      const quick=['Bombas de vácuo','Bombas de limpeza','Serras-copo','Manifolds e manômetros','Multímetros e alicates amperímetros'].filter(c=>categories.includes(c));
      pills.innerHTML='<button type="button" data-filter="all" aria-pressed="true">Todos</button>'+quick.map(c=>`<button type="button" data-filter="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('');
      const date=new Date(data.generatedAt);note.textContent=`Base consultada em ${Number.isNaN(date.getTime())?'data não informada':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}. Isso não indica atualização dos preços. Confira o valor e a disponibilidade no anúncio.`;
      document.querySelector('.results-meta>span').textContent='Produtos ativos no Supabase';filter();
      publishCatalogue(products);
    }catch{products=[];filtered=[];grid.innerHTML='';count.textContent='O catálogo está sendo atualizado.';more.hidden=true;empty.hidden=true;note.textContent='Não foi possível obter uma base recente. Tente novamente em alguns minutos.';publishCatalogue([]);}
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
  load();
  if (!settings.preview) {
    setInterval(()=>{if(!document.hidden)load();},settings.refreshMs);
    setInterval(()=>{if(snapshotTime && Date.now()-snapshotTime>settings.maxAgeMs){products=[];filtered=[];grid.innerHTML='';more.hidden=true;empty.hidden=true;count.textContent='O catálogo está sendo atualizado.';note.textContent='Aguardando uma base recente para exibir os produtos.';publishCatalogue([]);}},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  }
})();
