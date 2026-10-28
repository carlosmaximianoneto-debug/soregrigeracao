(() => {
  'use strict';
  // Counts actions, not people. No cookie, storage, visitor ID or search text.
  if (location.hostname !== 'sorefrigeracao.com' || location.protocol !== 'https:' ||
      navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const events = new Set(['affiliate_click', 'product_view_click', 'whatsapp_click']);
  const placements = new Set(['home_card','home_carousel','home_hero','home_footer','home_floating','home_direct','product_offer','product_whatsapp','collection_card','related_card']);
  const pages = new Set(['home','product','category','catalogue']);
  let previous = '', previousAt = 0, minute = 0, count = 0;
  function record(event) {
    if (!event.isTrusted || event.detail > 1 || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
    const link = event.target?.closest?.('a[data-track-event]');
    if (!link) return;
    const {trackEvent, productId, placement, pageType} = link.dataset;
    if (!events.has(trackEvent) || !placements.has(placement) || !pages.has(pageType) || !/^\d{1,12}$/.test(productId || '')) return;
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || (id === 0 && trackEvent !== 'whatsapp_click')) return;
    const body = JSON.stringify({event_type:trackEvent, product_id:id, placement, page_type:pageType});
    const now = Date.now(), bucket = Math.floor(now / 60000);
    if (body === previous && now - previousAt < 800) return;
    if (bucket !== minute) { minute = bucket; count = 0; }
    if (count >= 20) return;
    previous = body; previousAt = now; count++;
    try {
      // Never delay the link, retry a click or send browser credentials/referrer.
      fetch('/api/site-click', {method:'POST', body, headers:{'Content-Type':'application/json'},
        credentials:'omit', referrerPolicy:'no-referrer', keepalive:true, cache:'no-store', redirect:'error'})
        .catch(() => {});
    } catch { /* The catalogue and links still work if collection is unavailable. */ }
  }
  document.addEventListener('click', record, {passive:true});
  document.addEventListener('auxclick', record, {passive:true});
})();
