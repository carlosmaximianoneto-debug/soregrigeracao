(() => {
  'use strict';
  // Counts actions, not people. No cookie, storage, visitor ID or search text.
  if (location.hostname !== 'sorefrigeracao.com' || location.protocol !== 'https:' ||
      navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const events = new Set(['affiliate_click', 'product_view_click', 'whatsapp_click']);
  const placements = new Set(['home_card','home_carousel','home_hero','home_footer','home_floating','home_direct','product_offer','product_whatsapp','collection_card','related_card']);
  const pages = new Set(['home','product','category','catalogue']);
  let previous = '', previousAt = 0, minute = 0, count = 0, pageCounted = false, filterTimer;
  const filtersCounted = new Set();
  const filterState = () => document.querySelector('#products')?.dataset || {};
  function send(payload) {
    const body = JSON.stringify(payload);
    const now = Date.now(), bucket = Math.floor(now / 60000);
    if (body === previous && now - previousAt < 800) return;
    if (bucket !== minute) { minute = bucket; count = 0; }
    if (count >= 20) return;
    previous = body; previousAt = now; count++;
    try {
      // Never delay navigation, retry an event or send credentials/referrer.
      fetch('/api/site-click', {method:'POST', body, headers:{'Content-Type':'application/json'},
        credentials:'omit', referrerPolicy:'no-referrer', keepalive:true, cache:'no-store', redirect:'error'})
        .catch(() => {});
    } catch { /* The catalogue and links still work if collection is unavailable. */ }
  }
  function pageView() {
    if (pageCounted || document.visibilityState !== 'visible') return;
    const {pageType, productId} = document.body?.dataset || {};
    if (!pages.has(pageType) || !/^\d{1,10}$/.test(productId || '')) return;
    const id = Number(productId);
    if (id > 2_147_483_647 || (pageType === 'product' ? id === 0 : id !== 0)) return;
    pageCounted = true;
    send({event_type:'page_view', product_id:id, placement:'page_load', page_type:pageType});
  }
  function filterUse() {
    if (document.body?.dataset.pageType !== 'home' || document.visibilityState !== 'visible') return;
    const state = filterState();
    // Only boolean UI state is observed. Search terms and category names never leave the page.
    for (const [field, placement] of [['searchFiltered','search_filter'], ['categoryFiltered','category_filter']]) {
      if (state[field] !== 'true' || filtersCounted.has(placement)) continue;
      filtersCounted.add(placement);
      send({event_type:'filter_use', product_id:0, placement, page_type:'home'});
    }
  }
  function record(event) {
    if (!event.isTrusted || event.detail > 1 || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
    if (event.target?.closest?.('button[data-filter]')) filterUse();
    const link = event.target?.closest?.('a[data-track-event]');
    if (!link) return;
    const {trackEvent, productId, placement, pageType} = link.dataset;
    if (!events.has(trackEvent) || !placements.has(placement) || !pages.has(pageType) || !/^\d{1,12}$/.test(productId || '')) return;
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || (id === 0 && trackEvent !== 'whatsapp_click')) return;
    const state = filterState();
    const filtered = placement === 'home_card' && pageType === 'home' &&
      (state.searchFiltered === 'true' || state.categoryFiltered === 'true');
    if (filtered) filterUse();
    send({event_type:trackEvent, product_id:id, placement:filtered ? 'home_card_filtered' : placement, page_type:pageType});
  }
  document.addEventListener('click', record, {passive:true});
  document.addEventListener('auxclick', record, {passive:true});
  document.addEventListener('input', event => {
    if (!event.isTrusted || event.target?.id !== 'search') return;
    clearTimeout(filterTimer);filterTimer = setTimeout(filterUse, 250);
  }, {passive:true});
  document.addEventListener('change', event => {
    if (event.isTrusted && event.target?.id === 'category') filterUse();
  }, {passive:true});
  document.addEventListener('visibilitychange', pageView, {passive:true});
  pageView();
})();

