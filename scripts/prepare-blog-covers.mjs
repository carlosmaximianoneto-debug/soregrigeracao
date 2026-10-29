import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { articlesA } from '../blog/articles-a.mjs';
import { articlesB } from '../blog/articles-b.mjs';
import { getBlogCover } from '../blog/covers.mjs';

// Publication encoding only: preserve the entire generated composition.
// Originals and prompt manifests remain in the local report directory.
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Provide the directory containing the 20 approved originals.');
const source=path.resolve(process.argv[2]);
const report=[];
for(const article of [...articlesA,...articlesB]){
 const cover=getBlogCover(article.slug);
 const original=path.join(source,`${article.slug}.png`);
 const bytes=await fs.readFile(original);
 const metadata=await sharp(bytes,{limitInputPixels:16_000_000}).metadata();
 if(!metadata.width||!metadata.height||metadata.width<1200||metadata.height<675)throw Error(`Original too small: ${article.slug}`);
 const outputs=[];
 for(const [url,width,height,format,quality] of [[cover.small,640,360,'webp',78],[cover.large,1200,675,'webp',80],[cover.social,1200,675,'jpeg',84]]){
  const destination=path.join(root,url.slice(1));
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const image=sharp(bytes).autoOrient().resize(width,height,{fit:'contain',background:'#10232d'});
  const encoded=await (format==='webp'?image.webp({quality,effort:5}):image.jpeg({quality,mozjpeg:true})).toBuffer();
  await fs.writeFile(destination,encoded);
  outputs.push({file:url,bytes:encoded.length,width,height,format});
 }
 report.push({slug:article.slug,original:{width:metadata.width,height:metadata.height,bytes:bytes.length},outputs});
}
console.log(JSON.stringify({articles:report.length,totalBytes:report.reduce((n,a)=>n+a.outputs.reduce((sum,o)=>sum+o.bytes,0),0),images:report},null,2));
