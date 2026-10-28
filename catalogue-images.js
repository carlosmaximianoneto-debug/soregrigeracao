(() => {
  'use strict';
  const publicStorage = 'https://xlwiwxaghbkdwbtwagwo.supabase.co';
  const publishedHost = /^(?:(?:www\.)?sorefrigeracao\.com|(?:[a-z0-9-]+--)?sorefrigeracao\.netlify\.app)$/;

  // Originals remain in the feed for a one-time fallback if the image CDN fails.
  // Keep thumbnail URLs stable for CDN reuse; version the source URL when replacing a photo.
  window.catalogueImageUrl = (original, width = 400) => {
    if (!window.REFRI_CATALOGUE?.imageOptimization || !publishedHost.test(window.location?.hostname || '')) return original;
    // VPS serves the same portable contract so already cached thumbnail URLs and
    // Netlify rollback both work. Unknown providers keep the original fallback.
    if (!['netlify', 'vps'].includes(window.REFRI_CATALOGUE.imageProvider || 'netlify')) return original;
    try {
      const source = new URL(original);
      const allowed = source.origin === publicStorage && source.pathname.startsWith('/storage/v1/object/public/imagens/')
        || source.origin === 'https://http2.mlstatic.com';
      if (!allowed || source.username || source.password) return original;
      const requested = Number(width);
      const size = Number.isFinite(requested) ? Math.max(160, Math.min(1200, Math.round(requested))) : 400;
      const query = new URLSearchParams({ url: source.href, w: String(size), q: '75', fm: 'webp', fit: 'contain' });
      return `/.netlify/images?${query}`;
    } catch {
      return original;
    }
  };
})();
