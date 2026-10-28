import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionHTML, invitationContract} from '../scripts/build-site.mjs';
import {createSeoRenderer} from '../seo-runtime.mjs';
import {publisher} from '../site-identity.mjs';
const home = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const graph = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('business identity is visible and matches production structured data',()=>{
  const html=productionHTML(home), data=graph(html);
  const organization=data.find(x=>x['@type']==='Organization');
  for(const [key,value] of Object.entries(publisher)){
    assert.ok(home.includes(value),`Visible ${key}`);
    assert.equal(organization[key],value);
  }
  assert.equal(data.find(x=>x['@type']==='WebSite').publisher['@id'],organization['@id']);
  assert.equal(invitationContract(html),invitationContract(home));
  assert.equal(html.match(/id="sobre"/g).length,1);
});

test('SEO pages refer to the same publisher and link to visible company details',()=>{
  const renderer=createSeoRenderer({products:[],generatedAt:new Date().toISOString()},
    {production:true,base:'https://sorefrigeracao.com'},'window.catalogueCategory = () => "Brocas";');
  const html=renderer.render('/catalogo/');
  assert.equal(graph(html).find(x=>x['@type']==='Organization').taxID,publisher.taxID);
  assert.ok(html.includes('href="/#sobre"'));
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  for (const value of Object.values(publisher)) assert.ok(footer.includes(value), 'company details are visible on generated pages');
  assert.ok(footer.includes(`mailto:${publisher.email}`));
});
