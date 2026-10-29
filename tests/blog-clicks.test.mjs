import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../blog-clicks.js', import.meta.url), 'utf8').catch(() => '');
const slug = 'ferramentas-para-refrigerista-kit-iniciante';
function browser({ origin = 'https://sorefrigeracao.com', articleSlug = slug, dnt, gpc, visibility = 'visible', reject = false } = {}) {
  const listeners = {}, calls = [];
  let now = 60_000;
  const navigator = { doNotTrack: dnt, globalPrivacyControl: gpc };
  const document = { body: { dataset: { blogSlug: articleSlug } }, visibilityState: visibility, addEventListener: (event, callback) => { listeners[event] = callback; } };
  vm.runInNewContext(source, { location: new URL(origin), URL, navigator, document, Date: { now: () => now }, fetch: (url, options) => { calls.push({ url, options }); return reject ? Promise.reject(new Error('unavailable')) : Promise.resolve({ ok: true }); } });
  return {
    calls, navigator, advance: duration => { now += duration; },
    visible: () => { document.visibilityState = 'visible'; listeners.visibilitychange?.(); },
    click: (placement = 'article_mid', overrides = {}, href = 'https://chat.whatsapp.com/example') => {
      const link = { dataset: { blogCta: placement }, href };
      const event = { type: 'click', isTrusted: true, detail: 1, button: 0, target: { closest: selector => selector === 'a[data-blog-cta]' ? link : null }, ...overrides };
      listeners[event.type]?.(event);
    },
  };
}

test('blog measures one visible page load and only the exact anonymous dimensions', () => {
  assert.ok(source, 'blog browser collector must exist');
  const b = browser();
  b.visible(); b.visible();
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].url, '/api/blog-click');
  assert.deepEqual(JSON.parse(b.calls[0].options.body), { event_type: 'page_view', article_slug: slug, placement: 'page_load' });
  assert.equal(b.calls[0].options.credentials, 'omit');
  assert.equal(b.calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(b.calls[0].options.keepalive, true);
  assert.equal(b.calls[0].options.redirect, 'error');
  assert.equal(b.calls[0].options.cache, 'no-store');
});

test('blog defers hidden page view until visible', () => {
  const b = browser({ visibility: 'hidden' });
  assert.equal(b.calls.length, 0);
  b.visible();
  assert.equal(b.calls.length, 1);
});

test('blog never counts previews, non-HTTPS origins, unapproved articles, DNT or GPC', () => {
  for (const config of [{ origin: 'http://sorefrigeracao.com' }, { origin: 'https://sorefrigeracao.com:444' },
    { origin: 'http://localhost' }, { origin: 'https://preview.example' }, { dnt: '1' }, { gpc: true },
    { articleSlug: 'unknown' }, { articleSlug: `${slug}?email=private` }, { articleSlug: '' }]) {
    const b = browser(config); b.click(); b.visible();
    assert.equal(b.calls.length, 0);
  }
});

test('blog accepts trusted primary, keyboard and middle activation but rejects synthetic or double clicks', () => {
  const b = browser();
  b.click('article_mid', { isTrusted: false }); b.click('article_mid', { detail: 2 });
  b.click('article_mid', { type: 'auxclick', button: 2 });
  assert.equal(b.calls.length, 1);
  b.click(); b.advance(801); b.click('article_end', { detail: 0 });
  b.advance(801); b.click('article_mid', { type: 'auxclick', button: 1 });
  assert.deepEqual(b.calls.slice(1).map(call => JSON.parse(call.options.body)), [
    { event_type: 'whatsapp_click', article_slug: slug, placement: 'article_mid' },
    { event_type: 'whatsapp_click', article_slug: slug, placement: 'article_end' },
    { event_type: 'whatsapp_click', article_slug: slug, placement: 'article_mid' },
  ]);
});

test('blog rejects unknown placements or destinations and suppresses repeated activation', () => {
  const b = browser();
  b.click('page_load'); b.click('home_hero');
  for (const href of ['https://evil.example', 'https://chat.whatsapp.com.evil.example/invite', 'http://chat.whatsapp.com/invite', 'javascript:void(0)']) b.click('article_mid', {}, href);
  assert.equal(b.calls.length, 1);
  b.click(); b.click();
  assert.equal(b.calls.length, 2);
});

test('blog honors privacy changes after load and never blocks navigation on network failure', async () => {
  const b = browser({ reject: true });
  assert.doesNotThrow(() => b.click());
  b.navigator.globalPrivacyControl = true;
  b.advance(801); b.click('article_end');
  await Promise.resolve();
  assert.equal(b.calls.length, 2);
});

test('blog bounds sending to 20 aggregate events per minute without persisted identity', () => {
  const b = browser();
  for (let index = 0; index < 30; index++) { b.advance(801); b.click(index % 2 ? 'article_end' : 'article_mid'); }
  assert.equal(b.calls.length, 20);
  b.advance(60_000); b.click();
  assert.equal(b.calls.length, 21);
});
