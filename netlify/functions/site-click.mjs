import { createSiteClickRelay } from '../../site-click-handler.mjs';

export default createSiteClickRelay({
  apiKey: process.env.REFRI_CLICK_ANON_KEY,
  enabled: process.env.REFRI_CLICK_ENABLED === 'true',
});

export const config = { path: '/api/site-click' };
