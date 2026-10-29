import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { articlesA } from '../blog/articles-a.mjs';
import { articlesB } from '../blog/articles-b.mjs';
import { getBlogCover,BLOG_COVER_FILES } from '../blog/covers.mjs';
import { createBlogRenderer } from '../blog-runtime.mjs';
import { PUBLIC_FILES as buildFiles } from '../scripts/build-site.mjs';
import { PUBLIC_FILES as servedFiles } from '../server/http-server.mjs';
const articles=[...articlesA,...articlesB];
const options={production:true,base:'https://sorefrigeracao.com',invitationURL:'https://chat.whatsapp.com/ABCDEFGHIJKLM123456789'};
test('all twenty approved covers have bounded responsive assets in both publication allowlists',async()=>{
 assert.equal(BLOG_COVER_FILES.length,60);assert.equal(new Set(BLOG_COVER_FILES).size,60);
 const dockerIgnore=await fs.readFile(new URL('../.dockerignore',import.meta.url),'utf8');
 assert.ok(dockerIgnore.includes('!blog/covers.mjs'));
 let total=0;
 for(const a of articles){
  const cover=getBlogCover(a.slug);assert.ok(cover?.alt);
  for(const [url,width,height,format,limit] of [[cover.small,640,360,'webp',100_000],[cover.large,1200,675,'webp',220_000],[cover.social,1200,675,'jpeg',300_000]]){
   const file=url.slice(1);assert.ok(buildFiles.includes(file));assert.ok(servedFiles.includes(file));assert.ok(dockerIgnore.split(/\r?\n/).includes('!'+file),`${file} missing from Docker context`);
   const bytes=await fs.readFile(new URL('../'+file,import.meta.url));total+=bytes.length;
   assert.ok(bytes.length<limit,`${file} exceeds byte budget`);
   const meta=await sharp(bytes).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);assert.equal(meta.format,format);
  }
 }
 assert.ok(total<8_000_000);assert.equal(getBlogCover('../secret'),undefined);
 assert.ok(!servedFiles.includes('blog/covers.mjs'));assert.ok(!servedFiles.includes('assets/blog/private.jpg'));
});
test('article hero, social preview and schema agree without pretending illustrations are product tests',()=>{
 const blog=createBlogRenderer(articles,options);
 for(const a of articles){
  const cover=getBlogCover(a.slug),html=blog.render(`/blog/${a.slug}/`);
  assert.ok(html.includes(`src="${cover.large}"`));assert.ok(html.includes(`srcset="${cover.small} 640w, ${cover.large} 1200w"`));
  assert.match(html,/width="1200" height="675"[^>]*loading="eager"[^>]*fetchpriority="high"/);
  assert.match(html,/Ilustração gerada por IA/);
  assert.ok(html.includes(`<meta property="og:image" content="${options.base}${cover.social}">`));
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const post=graph.find(x=>x['@type']==='BlogPosting');assert.equal(post.image.url,options.base+cover.social);assert.equal(post.image.width,1200);assert.equal(post.image.height,675);
  assert.equal((html.match(/data-blog-cta=/g)||[]).length,2);
 }
 const index=blog.render('/blog/');assert.equal((index.match(/class="guide-cover"/g)||[]).length,20);
 assert.equal((index.match(/loading="lazy"/g)||[]).length,20);
});
