(() => {
  'use strict';
  const carousel = document.querySelector('.pump-carousel');
  if (!carousel) return;
  const track = carousel.querySelector('.pump-track');
  const viewport = carousel.querySelector('.pump-viewport');
  const pause = carousel.querySelector('.pump-pause');
  const previous = carousel.querySelector('.pump-prev');
  const next = carousel.querySelector('.pump-next');
  const position = carousel.querySelector('.pump-position');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 901px)');
  const order = new Intl.Collator('pt-BR', { numeric: true });
  let slides = [], latestProducts = [], index = 0, userPaused = reduced.matches, hovered = false, inView = true, timer = null, start = null, pausedOnPress = null, catalogueKey = '';

  const normal = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^[^a-z0-9]+/, '');
  function safeURL(value, image = false) {
    try {
      const url = new URL(value);
      const allowed = image ? /(^|\.)(supabase\.co|mlstatic\.com)$/ : /(^|\.)(meli\.la|mercadolivre\.com\.br|mercadolibre\.com)$/;
      return url.protocol === 'https:' && !url.username && !url.password && allowed.test(url.hostname) ? url.href : '';
    } catch { return ''; }
  }
  function currentPumps(products) {
    const ids = new Set();
    return (Array.isArray(products) ? products : []).flatMap(product => {
      const id = String(product.id ?? ''), title = String(product.title ?? '').trim();
      const accessory = /^(?:kit\s+(?:de\s+)?)?(?:acessorios?|vacuometro|manometro|oleo|filtro|tampa|vedacao|reparo|valvula|nucleo|mangueira|adaptador|engate|conexao|motor|retentor|reservatorio|junta)\b/.test(normal(title));
      const url = safeURL(product.url), image = safeURL(product.image, true);
      if (!id || ids.has(id) || accessory || window.catalogueCategory?.(title) !== 'Bombas de vácuo' || !url || !image) return [];
      ids.add(id);
      return [{ id, title, url, image }];
    }).sort((a, b) => order.compare(a.id, b.id));
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function makeSlide(product) {
    const slide = element('figure', 'pump-slide');
    slide.dataset.productId = product.id;
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    const stage = element('div', 'product-stage');
    const image = element('img');
    image.width = 800; image.height = 800; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
    image.addEventListener('error', () => {
      // A request begun on desktop may fail after a resize. Defer its retry.
      if (!desktop.matches) {
        image.dataset.loaded = ''; image.removeAttribute('src'); image.removeAttribute('srcset'); return;
      }
      if (image.dataset.optimized === 'true' && image.dataset.fallback !== 'true') {
        image.dataset.fallback = 'true'; image.srcset = ''; image.src = image.dataset.originalSrc;
      } else image.hidden = true;
    });
    stage.append(element('span', 'stage-label', 'BOMBAS DE VÁCUO PARA REFRIGERAÇÃO'), image);
    const caption = element('figcaption'), copy = element('div'), link = element('a');
    copy.append(element('strong'), element('span', '', 'Confira os detalhes e o preço no anúncio.'));
    link.target = '_blank'; link.rel = 'sponsored noopener noreferrer';
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    caption.append(copy, link); slide.append(stage, caption);
    return slide;
  }
  function updateSlide(slide, product) {
    slide.querySelector('strong').textContent = product.title;
    const image = slide.querySelector('img');
    if (image.dataset.originalSrc !== product.image) {
      image.hidden = false; image.dataset.originalSrc = product.image;
      image.dataset.loaded = ''; image.dataset.fallback = ''; image.dataset.optimized = '';
      image.removeAttribute('src'); image.removeAttribute('srcset');
    }
    image.alt = product.title;
    const link = slide.querySelector('a');
    link.href = product.url;
    link.dataset.trackEvent = 'affiliate_click'; link.dataset.productId = product.id;
    link.dataset.placement = 'home_carousel'; link.dataset.pageType = 'home';
    link.setAttribute('aria-label', `Ver ${product.title} no Mercado Livre`);
  }
  function loadImage(image, active) {
    if (!desktop.matches) return;
    image.loading = active ? 'eager' : 'lazy';
    image.fetchPriority = active ? 'high' : 'low';
    if (image.dataset.loaded === 'true') return;
    const original = image.dataset.originalSrc;
    const source = window.catalogueImageUrl?.(original, 800) || original;
    image.dataset.optimized = String(source !== original);
    if (source !== original) {
      image.sizes = '(max-width: 1100px) 420px, 500px';
      image.srcset = [400, 800, 1200].map(width => `${window.catalogueImageUrl(original, width)} ${width}w`).join(', ');
    }
    image.dataset.loaded = 'true'; image.src = source;
  }
  function render() {
    carousel.setAttribute('aria-busy', 'false');
    carousel.hidden = !desktop.matches || slides.length === 0;
    if (!desktop.matches) return;
    previous.disabled = next.disabled = pause.disabled = slides.length < 2;
    position.textContent = slides.length ? `${index + 1} / ${slides.length}` : '0 / 0';
    position.setAttribute('aria-label', slides.length ? `Bomba ${index + 1} de ${slides.length}` : 'Nenhuma bomba disponível');
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, i) => {
      slide.setAttribute('aria-label', `${i + 1} de ${slides.length}`);
      slide.setAttribute('aria-hidden', String(i !== index));
      slide.inert = i !== index;
      // Assign sources only as slides approach the active one. Native lazy loading
      // alone may fetch many horizontally adjacent images on initial render.
      if (i === index || i === (index + 1) % slides.length || i === (index + slides.length - 1) % slides.length) loadImage(slide.querySelector('img'), i === index);
      else slide.querySelector('img').fetchPriority = 'low';
    });
  }
  function schedule() {
    clearInterval(timer);
    pause.setAttribute('aria-label', userPaused ? 'Reproduzir carrossel de bombas' : 'Pausar carrossel de bombas');
    pause.innerHTML = userPaused
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg> Reproduzir'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg> Pausar';
    position.setAttribute('aria-live', userPaused ? 'polite' : 'off');
    if (desktop.matches && !userPaused && !hovered && inView && !document.hidden && slides.length > 1) timer = setInterval(() => { if (!desktop.matches) return; index = (index + 1) % slides.length; render(); }, 5000);
  }
  function go(nextIndex) {
    if (!desktop.matches || !slides.length) return;
    index = (nextIndex + slides.length) % slides.length;
    userPaused = true; render(); schedule();
  }
  function updateCatalogue(event) {
    latestProducts = currentPumps(event.detail?.products);
    applyCatalogue();
  }
  function applyCatalogue(resized = false) {
    // Mobile keeps only data; no slide creation or new image request is needed.
    if (!desktop.matches) { render(); schedule(); return; }
    const products = latestProducts, nextKey = JSON.stringify(products);
    // Price is not rendered here. Compare only the validated fields this carousel uses.
    if (nextKey === catalogueKey) { if (resized) { render(); schedule(); } return; }
    catalogueKey = nextKey;
    const activeId = slides[index]?.dataset.productId;
    const previousSlides = new Map(slides.map(slide => [slide.dataset.productId, slide]));
    const focusInside = track.contains(document.activeElement);
    const nextSlides = products.map(product => {
      const slide = previousSlides.get(product.id) || makeSlide(product);
      updateSlide(slide, product);
      return slide;
    });
    const changed = nextSlides.length !== slides.length || nextSlides.some((slide, i) => slide !== slides[i]);
    slides = nextSlides;
    index = Math.max(0, slides.findIndex(slide => slide.dataset.productId === activeId));
    if (changed) track.replaceChildren(...slides);
    render(); schedule();
    if (changed && focusInside && slides.length) (slides[index].querySelector('a') || pause).focus({ preventScroll: true });
  }
  previous.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));
  pause.addEventListener('pointerdown', () => { pausedOnPress = userPaused; });
  pause.addEventListener('click', () => { userPaused = !(pausedOnPress ?? userPaused); pausedOnPress = null; schedule(); });
  carousel.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  carousel.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  carousel.addEventListener('focusin', () => { userPaused = true; schedule(); });
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(index + (event.key === 'ArrowRight' ? 1 : -1)); }
  });
  viewport.addEventListener('pointerdown', event => { if (!start) start = { id: event.pointerId, x: event.clientX, y: event.clientY }; });
  viewport.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    start = null;
    if (Math.abs(x) > 40 && Math.abs(x) > Math.abs(y)) go(index + (x < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => { start = null; });
  viewport.addEventListener('lostpointercapture', () => { start = null; });
  document.addEventListener('visibilitychange', () => { start = null; schedule(); });
  document.addEventListener('catalogue:updated', updateCatalogue);
  desktop.addEventListener('change', () => { start = null; hovered = false; applyCatalogue(true); });
  reduced.addEventListener('change', () => { userPaused = reduced.matches; schedule(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; schedule(); }).observe(carousel);
  // There is no static product fallback: only the latest accepted catalogue is shown.
  track.replaceChildren();
  if (Array.isArray(window.REFRI_CURRENT_CATALOGUE)) updateCatalogue({ detail: { products: window.REFRI_CURRENT_CATALOGUE } });
  else { render(); schedule(); }
})();
