import { createSeoHandler } from '../../seo-netlify-function.mjs';
import { serverOptions, categorySource } from '../generated/catalogue-config.mjs';

// Static imports are bundled by esbuild. No runtime file path or environment secret
// is required to read the public catalogue or the shared category definitions.
const handler = createSeoHandler({ ...serverOptions, categorySource });
export default handler;
export const config = { path: ['/blog', '/blog/*', '/produtos', '/produtos/*', '/categorias', '/categorias/*', '/catalogo', '/catalogo/*', '/seo', '/seo/*', '/sitemap.xml', '/robots.txt'], preferStatic: false };
