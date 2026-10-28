import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function browser({host='sorefrigeracao.com',dnt='',gpc=false,reject=false}={}) {
  const calls=[], handlers={};
  const context={location:{hostname:host,protocol:'https:'}, navigator:{doNotTrack:dnt,globalPrivacyControl:gpc}, document:{addEventListener:(name,fn)=>{handlers[name]=fn;}}, fetch:(url,options)=>{calls.push({url,options});return reject?Promise.reject(new Error('offline')):Promise.resolve({ok:true});}, Date, JSON, Set, Number, String};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(new URL('../site-clicks.js',import.meta.url),'utf8'),context);
  const click=(data={},overrides={})=>{
    const a={dataset:{trackEvent:'affiliate_click',productId:'2441',placement:'home_card',pageType:'home',...data}};
    handlers[overrides.type||'click']?.({type:'click',isTrusted:true,button:0,detail:1,target:{closest:()=>a},...overrides});
  };
  return {calls,click};
}
test('records product ID and only aggregate dimensions without cookies or referrer',()=>{
  const b=browser();b.click();assert.equal(b.calls.length,1);
  assert.equal(b.calls[0].url,'/api/site-click');
  assert.deepEqual(JSON.parse(b.calls[0].options.body),{event_type:'affiliate_click',product_id:2441,placement:'home_card',page_type:'home'});
  assert.equal(b.calls[0].options.credentials,'omit');assert.equal(b.calls[0].options.referrerPolicy,'no-referrer');assert.equal(b.calls[0].options.keepalive,true);
});
test('never measures previews, local development, DNT or GPC',()=>{
  for(const config of [{host:'localhost'},{host:'deploy-preview-9--sorefrigeracao.netlify.app'},{dnt:'1'},{gpc:true}]){const b=browser(config);b.click();assert.equal(b.calls.length,0);}
});
test('ignores synthetic activation and repeated double click',()=>{
  const b=browser();b.click({}, {isTrusted:false});b.click({}, {detail:2});assert.equal(b.calls.length,0);
});
test('middle click is measured once and right click is ignored',()=>{
  const b=browser();b.click({}, {type:'auxclick',button:2});b.click({}, {type:'auxclick',button:1});assert.equal(b.calls.length,1);
});
test('invalid fields never reach the collector',()=>{
  for(const data of [{productId:'2441&email=a@b.test'},{productId:'-1'},{productId:'1.5'},{productId:'0'},{trackEvent:'form_submit'},{placement:'unknown'},{pageType:'other'}]){const b=browser();b.click(data);assert.equal(b.calls.length,0);}
});
test('WhatsApp clicks can have no product and product details are distinct',()=>{
  const b=browser();b.click({trackEvent:'whatsapp_click',productId:'0',placement:'home_hero'});b.click({trackEvent:'product_view_click',placement:'collection_card',pageType:'category'});
  assert.deepEqual(b.calls.map(c=>JSON.parse(c.options.body).event_type),['whatsapp_click','product_view_click']);
});
test('unavailable collector does not throw or cancel navigation',async()=>{
  const b=browser({reject:true});assert.doesNotThrow(()=>b.click());await Promise.resolve();assert.equal(b.calls.length,1);
});
