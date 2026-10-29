import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlogRenderer } from '../blog-runtime.mjs';
const article = { slug:'guia-de-teste', title:'Como escolher uma ferramenta', description:'Critérios de escolha para o técnico.', category:'Escolha de ferramentas', keyword:'ferramenta', intro:'Compare o modelo com o trabalho que você realiza.', answer:'Confira a compatibilidade no manual.', sections:[{heading:'Antes da compra',paragraphs:['Texto <script>alert(1)</script> escapado.'],bullets:['Confira o modelo.']},{heading:'Comparação',paragraphs:['Observe a aplicação.'],table:{headers:['Critério','O que conferir'],rows:[['Medida','Manual']]}}],sources:[{label:'Fabricante',url:'https://example.com/manual'}],related:[],catalogueCategories:[{label:'Catálogo',href:'/#catalogo'}],datePublished:'2026-10-29',dateModified:'2026-10-29' };
const options={production:true,base:'https://sorefrigeracao.com',invitationURL:'https://chat.whatsapp.com/ABCDEFGHIJKLM123456789'};
test('blog renders escaped content and factual BlogPosting with shared group invite',()=>{
 const renderer=createBlogRenderer([article],options);const html=renderer.render('/blog/guia-de-teste/');
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 assert.equal((html.match(/href="https:\/\/chat.whatsapp.com\/ABCDEFGHIJKLM123456789"/g)||[]).length,2);
 assert.match(html,/data-blog-cta="article_mid"/);assert.match(html,/data-blog-cta="article_end"/);
 assert.match(html,/data-blog-slug="guia-de-teste"/);assert.match(html,/"@type":"BlogPosting"/);
 assert.doesNotMatch(html,/"@type":"Product"|aggregateRating|data-track-event/);
 assert.match(html,/rel="canonical" href="https:\/\/sorefrigeracao.com\/blog\/guia-de-teste\/"/);
 assert.equal(renderer.render('/blog/unknown/'),null);
 assert.match(renderer.sitemapEntries,/\/blog\/guia-de-teste\//);
});
test('blog index links guides and preview remains noindex',()=>{
 const renderer=createBlogRenderer([article],{production:false});
 assert.match(renderer.render('/blog/'),/href="\/blog\/guia-de-teste\/"/);
 assert.match(renderer.render('/blog/'),/noindex,nofollow/);
 assert.doesNotMatch(renderer.render('/blog/'),/rel="canonical"/);
 assert.equal(renderer.sitemapEntries,'');
});
test('reject invalid slugs, duplicated routes and unsafe source links at startup',()=>{
 assert.throws(()=>createBlogRenderer([{...article,slug:'../secret'}],options));
 assert.throws(()=>createBlogRenderer([article,article],options));
 assert.throws(()=>createBlogRenderer([{...article,sources:[{label:'Bad',url:'javascript:alert(1)'}]}],options));
 assert.throws(()=>createBlogRenderer([{...article,catalogueCategories:[{label:'Bad',href:'//evil.test'}]}],options));
});
