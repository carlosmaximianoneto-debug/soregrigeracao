import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function browser({host='sorefrigeracao.com',dnt='',gpc=false,reject=false,page={},visibility='visible'}={}) {
  const calls=[], handlers={}, timers=new Map(), grid={dataset:{searchFiltered:'false',categoryFiltered:'false'}};
  let timer=0;
  const doc={body:{dataset:page},visibilityState:visibility,querySelector:s=>s==='#products'?grid:null,addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);}};
  const dispatch=(type,event={})=>(handlers[type]||[]).forEach(fn=>fn({type,...event}));
  const context={location:{hostname:host,protocol:'https:'}, navigator:{doNotTrack:dnt,globalPrivacyControl:gpc}, document:doc, fetch:(url,options)=>{calls.push({url,options});return reject?Promise.reject(new Error('offline')):Promise.resolve({ok:true});}, Date, JSON, Set, Number, String, setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(new URL('../site-clicks.js',import.meta.url),'utf8'),context);
  const click=(data={},overrides={})=>{
    const a={dataset:{trackEvent:'affiliate_click',productId:'2441',placement:'home_card',pageType:'home',...data}};
    dispatch(overrides.type||'click',{isTrusted:true,button:0,detail:1,target:{closest:s=>s==='a[data-track-event]'?a:null},...overrides});
  };
  return {calls,click,grid,dispatch,visible:()=>{doc.visibilityState='visible';dispatch('visibilitychange');},flush:()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());}};
}

test('counts one visible page load with no source, visitor or URL information',()=>{
  const b=browser({page:{pageType:'home',productId:'0'},visibility:'hidden'});
  assert.equal(b.calls.length,0);b.visible();b.visible();
  assert.deepEqual(b.calls.map(c=>JSON.parse(c.options.body)),[{event_type:'page_view',product_id:0,placement:'page_load',page_type:'home'}]);
  const p=browser({page:{pageType:'product',productId:'2441'}});
  assert.equal(JSON.parse(p.calls[0].options.body).product_id,2441);
});
test('page views require coherent page metadata and obey privacy preferences',()=>{
  for(const config of [{page:{pageType:'product',productId:'0'}},{page:{pageType:'home',productId:'2441'}},{page:{pageType:'unknown',productId:'0'}},{page:{pageType:'home',productId:'0'},dnt:'1'},{page:{pageType:'home',productId:'0'},gpc:true}]) assert.equal(browser(config).calls.length,0);
});
test('filter use is bounded once per type per load and never sends the search text',()=>{
  const b=browser({page:{pageType:'home',productId:'0'}});b.calls.length=0;
  b.grid.dataset.searchFiltered='true';
  b.dispatch('input',{isTrusted:true,target:{id:'search',value:'private search words'}});b.flush();
  b.dispatch('input',{isTrusted:true,target:{id:'search',value:'different words'}});b.flush();
  b.grid.dataset.categoryFiltered='true';b.dispatch('change',{isTrusted:true,target:{id:'category'}});
  assert.deepEqual(b.calls.map(c=>JSON.parse(c.options.body)),[
    {event_type:'filter_use',product_id:0,placement:'search_filter',page_type:'home'},
    {event_type:'filter_use',product_id:0,placement:'category_filter',page_type:'home'}]);
});
test('only clicks in currently filtered catalogue results get filtered placement',()=>{
  const b=browser();b.grid.dataset.searchFiltered='true';b.click();
  assert.equal(JSON.parse(b.calls.at(-1).options.body).placement,'home_card_filtered');
  b.click({placement:'home_carousel'});
  assert.equal(JSON.parse(b.calls.at(-1).options.body).placement,'home_carousel');
  b.grid.dataset.searchFiltered='false';b.click();
  assert.equal(JSON.parse(b.calls.at(-1).options.body).placement,'home_card');
});
test('synthetic input and clearing filters do not count filter use',()=>{
  const b=browser({page:{pageType:'home',productId:'0'}});b.calls.length=0;
  b.grid.dataset.searchFiltered='true';b.dispatch('input',{isTrusted:false,target:{id:'search'}});b.flush();
  b.grid.dataset.searchFiltered='false';b.dispatch('input',{isTrusted:true,target:{id:'search'}});b.flush();
  assert.equal(b.calls.length,0);
});
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

