import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSeoHandler } from '../seo-netlify-function.mjs';
import { createBlogRenderer, articleWordCount } from '../blog-runtime.mjs';
import { articlesA } from '../blog/articles-a.mjs';
import { articlesB } from '../blog/articles-b.mjs';
import { invitationContract } from '../scripts/build-site.mjs';
import { validateBlogClick } from '../operations/blog-clicks/handler.mjs';
const articles=[...articlesA,...articlesB];
const categorySource=await fs.readFile(new URL('../categories.js',import.meta.url),'utf8');
const home=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const options={production:true,base:'https://sorefrigeracao.com',invitationURL:invitationContract(home)};
test('20 original guides have sources, related routes, correct schema and two invitations',()=>{
 assert.equal(articles.length,20);assert.equal(new Set(articles.map(a=>a.keyword)).size,20);
 const blog=createBlogRenderer(articles,options);
 for(const a of articles){
  assert.ok(articleWordCount(a)>=450,`${a.slug} needs a useful complete guide`);
  assert.ok(a.sources.length>=2,`${a.slug} sources`);
  assert.ok(a.related.length>=1,`${a.slug} needs contextual links`);
  const html=blog.render(`/blog/${a.slug}/`);
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.equal((html.match(/data-blog-cta=/g)||[]).length,2);
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const post=graph.find(x=>x['@type']==='BlogPosting');
  assert.equal(post.headline,a.title);assert.equal(post.datePublished,a.datePublished);
  assert.equal(post.author.name,'Só Refrigeração');assert.ok(!post.review);
  assert.ok(validateBlogClick({article_slug:a.slug,event_type:'page_view',placement:'page_load'}));
 }
});
test('blog remains available when catalogue is offline; canonical redirects and unknown slugs work',async()=>{
 let calls=0;
 const handler=createSeoHandler({...options,categorySource,snapshotURL:'https://example.com/feed.json',fetchImpl:()=>{calls++;throw Error('offline')}});
 const request=route=>new Request('https://sorefrigeracao.com'+route);
 for(const route of ['/blog/',...articles.map(a=>`/blog/${a.slug}/`)]) assert.equal((await handler(request(route))).status,200,route);
 for(const route of ['/blog','/blog/index.html',`/blog/${articles[0].slug}`]) assert.equal((await handler(request(route))).status,301);
 assert.equal((await handler(request('/blog/unknown/'))).status,404);
 assert.equal(calls,0);assert.equal((await handler(request('/catalogo/'))).status,503);
});
test('sitemap contains all blog pages and homepage only promotes blog in footer',async()=>{
 const handler=createSeoHandler({...options,categorySource,snapshotURL:'https://example.com/feed.json',fetchImpl:async()=>Response.json({generatedAt:new Date().toISOString(),products:[]})});
 const response=await handler(new Request('https://sorefrigeracao.com/sitemap.xml'));
 assert.equal(response.status,200);const xml=await response.text();
 assert.equal((xml.match(/<loc>https:\/\/sorefrigeracao.com\/blog\//g)||[]).length,21);
 const beforeFooter=home.split('<footer')[0];assert.doesNotMatch(beforeFooter,/href="\/blog\//);
 assert.equal((home.match(/href="\/blog\/"/g)||[]).length,1);
 assert.equal(invitationContract(home),options.invitationURL);
});
