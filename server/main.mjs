import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSeoHandler } from '../seo-netlify-function.mjs';
import { createSiteClickRelay } from '../site-click-handler.mjs';
import { createBlogClickRelay } from '../blog-click-handler.mjs';
import { serverOptions, categorySource } from '../netlify/generated/catalogue-config.mjs';
import { createVpsServer } from './http-server.mjs';
import { createImageHandler } from './image-handler.mjs';

const SITE_URL = 'https://sorefrigeracao.com';
const SNAPSHOT_URL = 'https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/refri-catalogue/catalogue.json';

async function main() {
  // These inputs are generated from the reviewed release, never from requests.
  if (!serverOptions.production || serverOptions.base !== SITE_URL || serverOptions.snapshotURL !== SNAPSHOT_URL) throw new Error('Invalid production build');
  const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
  await fs.access(new URL('../dist/index.html', import.meta.url));
  const enabled = process.env.REFRI_CLICK_ENABLED !== 'false';
  const apiKey = process.env.REFRI_CLICK_ANON_KEY;
  if (enabled) {
    // Fail closed if an operator accidentally supplies an elevated DB key.
    let claims;
    try { claims = JSON.parse(Buffer.from(apiKey.split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('Anonymous click credential required'); }
    if (claims?.role !== 'anon' || claims?.ref !== 'xlwiwxaghbkdwbtwagwo') throw new Error('Anonymous click credential required');
  }
  const configuredRevision = process.env.REFRI_SITE_REVISION;
  const revision = configuredRevision && configuredRevision !== 'local' ? configuredRevision : undefined;
  const server = createVpsServer({ distDir, revision,
    seoHandler: createSeoHandler({ ...serverOptions, categorySource }),
    clickHandler: createSiteClickRelay({ apiKey, enabled }),
    blogClickHandler: createBlogClickRelay({ apiKey, enabled }),
    imageHandler: createImageHandler(),
  });
  server.once('error', () => { console.error('Site HTTP startup failed.'); process.exitCode = 1; });
  server.listen(8080, '0.0.0.0', () => console.log(`Site listening on8080; revision=${revision || 'local'}.`));
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 8000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch(() => { console.error('Site startup failed; check the production build and runtime configuration.'); process.exitCode = 1; });
