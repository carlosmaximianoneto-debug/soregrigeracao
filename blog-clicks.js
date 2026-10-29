(() => {
  'use strict';
  // Aggregate actions only: no cookies, storage, identifiers, referrers or search terms.
  const privacyOptOut = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  if (location.origin !== 'https://sorefrigeracao.com' || privacyOptOut()) return;
  const articles = new Set([
    'ferramentas-para-refrigerista-kit-iniciante', 'bomba-de-vacuo-3-cfm-ou-6-cfm',
    'bomba-de-vacuo-simples-ou-duplo-estagio', 'vacuometro-digital-como-escolher',
    'manifold-analogico-ou-digital', 'manifold-r32-r410a-compatibilidade',
    'mangueiras-para-manifold-como-escolher', 'bomba-de-limpeza-ar-condicionado',
    'bolsa-coletora-limpeza-split', 'flangeador-excentrico-como-escolher',
    'cortador-de-tubo-de-cobre', 'curvador-de-tubo-de-cobre',
    'torquimetro-para-refrigeracao', 'serra-copo-para-ar-condicionado',
    'furadeira-ou-martelete-ar-condicionado', 'alicate-amperimetro-para-refrigeracao',
    'termometro-infravermelho-ou-contato', 'detector-de-vazamento-refrigerante',
    'balanca-digital-para-refrigeracao', 'bomba-de-dreno-ar-condicionado',
  ]);
  const slug = document.body?.dataset.blogSlug;
  if (!articles.has(slug)) return;
  const placements = new Set(['article_mid', 'article_end']);
  const destinations = new Set(['chat.whatsapp.com', 'wa.me', 'api.whatsapp.com']);
  let previous = '', previousAt = 0, minute = 0, count = 0, pageCounted = false;

  function send(eventType, placement) {
    if (privacyOptOut()) return;
    const body = JSON.stringify({ event_type: eventType, article_slug: slug, placement });
    const now = Date.now(), bucket = Math.floor(now / 60000);
    if (body === previous && now - previousAt < 800) return;
    if (bucket !== minute) { minute = bucket; count = 0; }
    if (count >= 20) return;
    previous = body; previousAt = now; count++;
    try {
      fetch('/api/blog-click', { method: 'POST', body, headers: { 'Content-Type': 'application/json' },
        credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, cache: 'no-store', redirect: 'error' })
        .catch(() => {});
    } catch { /* Measurement never blocks links and is never retried. */ }
  }
  function pageView() {
    if (pageCounted || document.visibilityState !== 'visible' || privacyOptOut()) return;
    pageCounted = true;
    send('page_view', 'page_load');
  }
  function record(event) {
    if (!event.isTrusted || event.detail > 1 || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
    const link = event.target?.closest?.('a[data-blog-cta]');
    if (!link || !placements.has(link.dataset.blogCta)) return;
    try {
      const destination = new URL(link.href);
      if (destination.protocol !== 'https:' || !destinations.has(destination.hostname) || destination.port || destination.username || destination.password) return;
    } catch { return; }
    send('whatsapp_click', link.dataset.blogCta);
  }
  document.addEventListener('click', record, { passive: true });
  document.addEventListener('auxclick', record, { passive: true });
  document.addEventListener('visibilitychange', pageView, { passive: true });
  pageView();
})();
