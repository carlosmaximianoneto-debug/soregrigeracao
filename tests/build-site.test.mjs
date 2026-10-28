import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildSite, PUBLIC_FILES, CATALOGUE_URL, invitationContract } from '../scripts/build-site.mjs';

for (const context of ['production', 'deploy-preview', 'local-preview']) {
  test(`${context} build includes thumbnail helper and discovers the catalogue in the head`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refri-build-performance-'));
    try {
      for (const file of PUBLIC_FILES) {
        const target = path.join(root, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(new URL(`../${file}`, import.meta.url), target);
      }
      const result = await buildSite({ root, context });
      const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
      const source = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
      const head = html.split('</head>')[0];
      assert.equal(invitationContract(html), invitationContract(source));
      const serverConfig = await fs.readFile(path.join(root, 'netlify/generated/catalogue-config.mjs'), 'utf8');
      const serverOptions = JSON.parse(serverConfig.match(/Object\.freeze\(([\s\S]*?)\);/)[1]);
      assert.equal(serverOptions.invitationURL, invitationContract(source), 'SEO pages follow the managed group invitation');
      assert.ok(result.publicFiles.includes('catalogue-images.js'));
      assert.ok(html.indexOf('src="catalogue-images.js"') < html.indexOf('src="catalogue.js"'));
      assert.match(head, /rel="preconnect" href="https:\/\/xlwiwxaghbkdwbtwagwo\.supabase\.co" crossorigin/);
      const earlySource = head.match(/<script id="catalogue-preload-script">([\s\S]*?)<\/script>/)?.[1];
      assert.equal(typeof earlySource, 'string');
      assert.ok(head.indexOf('id="catalogue-preload-script"') < head.indexOf('rel="stylesheet"'));
      assert.ok(!head.includes('rel="preload"'), 'the early fetch must be the only catalogue request');
      const requests = [], pending = new Promise(() => {});
      const preload = { window: {}, AbortSignal: { timeout: ms => ms }, fetch: (url, options) => { requests.push({url, options}); return pending; } };
      vm.runInNewContext(earlySource, preload);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, CATALOGUE_URL);
      assert.equal(requests[0].options.cache, 'no-cache');
      assert.equal(requests[0].options.signal, 15000);
      assert.equal(preload.window.REFRI_CATALOGUE_PRELOAD.url, CATALOGUE_URL);
      assert.equal(preload.window.REFRI_CATALOGUE_PRELOAD.request, pending);
      assert.doesNotThrow(() => vm.runInNewContext(earlySource, {window:{}}), 'normal loading remains available without fetch or timeout support');
      const config = { window: {} };
      vm.runInNewContext(await fs.readFile(path.join(root, 'dist/site-config.js'), 'utf8'), config);
      assert.equal(config.window.REFRI_CATALOGUE.imageOptimization, context !== 'local-preview');
      assert.equal(config.window.REFRI_CATALOGUE.catalogueUrl, CATALOGUE_URL);
      assert.equal(config.window.REFRI_CATALOGUE.maxAgeMs, 900000);
      assert.equal(html.includes('noindex,nofollow'), context !== 'production');
      assert.ok(!html.includes('service_role'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
