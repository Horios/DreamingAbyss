const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../js/ui/inventory-icon-model.js'),{loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));
test('all existing icon-bearing inventory categories and gathering inputs/outputs are selectable',()=>{
 const doc=structuredClone(published);doc.companions[0].unlockCondition={type:'ticket',price:100,chance:.1};
 doc.lifeSkills.gathering.push({id:'icon_fixture',name:'素材',output:'新採集產物',outputType:'material',bonusDrops:[{output:'額外產物',outputType:'material'}]});
 doc.lifeSkills.recipes.fixture={inputs:[['投入素材',1]],output:'煉金成品',outputType:'material'};
 const ids=new Set(M.entries(doc).map(x=>x.id));
 for(const item of doc.items)assert(ids.has('item:'+item.id));
 for(const token of doc.companionTokens.catalog)assert(ids.has('token:'+token.id));
 for(const id of ['item:level_scroll','item:companion-ticket-'+doc.companions[0].id,'gem:0','gem:1','gem:2',...['鍛鐵','粉塵','新採集產物','額外產物','投入素材','煉金成品'].map(k=>'material:'+k)])assert(ids.has(id),id);
 assert.equal(M.fallback('item','speed4_30m',{type:'timedBoost'}),'lucide:ticket');
});
test('icon choices reach actual inventory, shop, gathering and gem rendering and survive JSON/save reload',()=>{
 const r=loadRuntime(root);r.ctx.published=published;r.run('applyBalanceConfig(published,{persist:false});selectSaveSlot(1);start(1);closeModal();');
 r.run('applyBalanceConfig(exportableBalance(),{persist:false});');const before=r.run('JSON.stringify(packParty())');
 r.run(`globalThis.doc=exportableBalance();doc.skillIcons.push({id:'fixture-item',name:'素材圖示',layers:[{kind:'icon',icon:'lucide:leaf',x:0,y:0,scale:1,rotation:0}]});doc.inventoryIcons=[
  {kind:'item',key:'imbue_fire',iconType:'lucide:flame'},{kind:'item',key:'level_scroll',iconType:'lucide:scroll-text'},
  {kind:'material',key:'紅色草',iconType:'custom:fixture-item'},{kind:'gem',key:'0',iconType:'lucide:star'},
  {kind:'token',key:'berserk',iconType:'lucide:heart'}];applyBalanceConfig(doc);`);
 assert.equal(r.run('JSON.stringify(packParty())'),before);
 for(const [expr,icon] of [["inventoryItemIcon(SHOP.find(x=>x.id==='imbue_fire'))",'lucide:flame'],["inventoryShopOfferIcon({kind:'item',key:'imbue_fire'})",'lucide:flame'],["inventoryMaterialIcon('紅色草')",'custom:fixture-item'],['inventoryGemIcon(0)','lucide:star']]){
  assert(r.run(expr).includes(r.run(`__EMBERWILD_SKILL_ICONS.svgFor('${icon}',exportableBalance().skillIcons,{size:26})`)),expr);
 }
 assert(r.run('lifeSkillsView()').includes(r.run("__EMBERWILD_SKILL_ICONS.svgFor('custom:fixture-item',exportableBalance().skillIcons,{size:26})")));
 const exported=JSON.parse(r.run('JSON.stringify(exportableBalance())'));
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));
 assert.deepEqual(JSON.parse(reload.run('JSON.stringify(exportableBalance().inventoryIcons)')),exported.inventoryIcons);
 assert.equal(reload.run("inventoryMaterialIcon('紅色草')"),r.run("inventoryMaterialIcon('紅色草')"));
 const reset=structuredClone(exported);delete reset.inventoryIcons;r.ctx.reset=reset;r.run('applyBalanceConfig(reset,{persist:false})');
 assert.equal(r.run('exportableBalance().inventoryIcons.every(r=>r.iconType==="auto")'),true);assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
test('unknown icons, dangling custom references and duplicate entries reject before replacing settings or save data',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(1);closeModal();');const base=JSON.parse(r.run('JSON.stringify(exportableBalance())')),before=r.run('JSON.stringify(packParty())');
 for(const icons of [[{kind:'item',key:base.items[0].id,iconType:'lucide:does-not-exist'}],[{kind:'material',key:'紅色草',iconType:'custom:missing'}],[{kind:'gem',key:'99',iconType:'sword'}],[{kind:'material',key:'__proto__',iconType:'sword'}],[{kind:'gem',key:'0',iconType:'sword'},{kind:'gem',key:'0',iconType:'shield'}]]){
  r.ctx.bad={...base,inventoryIcons:icons};assert.throws(()=>r.run('applyBalanceConfig(bad)'),/道具圖示/);assert.equal(r.run('JSON.stringify(packParty())'),before);assert.deepEqual(JSON.parse(r.run('JSON.stringify(exportableBalance().inventoryIcons)')),base.inventoryIcons);
 }

});
test('direct per-object colors, descriptions and equipment icons survive apply/save/reload without custom icon copies',()=>{
 const r=loadRuntime(root);r.ctx.published=published;r.run('applyBalanceConfig(published,{persist:false});selectSaveSlot(1);start(1);closeModal();applyBalanceConfig(exportableBalance(),{persist:false});');
 const before=r.run('JSON.stringify(packParty())');const customCount=r.run('exportableBalance().skillIcons.length');
 r.run(`globalThis.colored=exportableBalance();colored.inventoryIcons=[
 {kind:'material',key:'紅色草',iconType:'lucide:leaf',color:'#123abc',description:'製作藥水的採集材料。'},
 {kind:'item',key:'imbue_fire',iconType:'lucide:flame',color:'#abcdef'},
 {kind:'gem',key:'0',iconType:'auto',color:'#ff6677'},
 {kind:'equipment',key:'form:1:0:0',iconType:'lucide:sword',color:'#3489ab',description:'法師武器說明。'},
 {kind:'equipment',key:'boss:0:1',iconType:'lucide:skull',color:'#ffab12'}];applyBalanceConfig(colored);`);
 assert.equal(r.run('exportableBalance().skillIcons.length'),customCount);assert.equal(r.run('JSON.stringify(packParty())'),before);
 for(const expr of ["inventoryMaterialIcon('紅色草')","inventoryShopOfferIcon({kind:'material',key:'紅色草'})",'lifeSkillsView()'])assert.match(r.run(expr),/#123abc/);
 assert.match(r.run("inventoryItemIcon(SHOP.find(x=>x.id==='imbue_fire'))"),/#abcdef/);assert.match(r.run('inventoryGemIcon(0)'),/#ff6677/);
 assert.match(r.run('equipmentNameHTML(state.bag.find(g=>g.slot===0))'),/#3489ab/);assert.match(r.run("equipmentNameHTML({job:1,slot:0,tier:1,boss:0,region:0,rar:0,plus:0,affix:[]})"),/#ffab12/);
 r.run('openItemSlotDetails({dataset:{itemKind:"material",itemKey:"紅色草",itemContext:"inventory"}})');assert.match(r.elements.get('item-detail-dialog').innerHTML,/製作藥水的採集材料。/);assert.match(r.run('equipmentAttributeDetailsHTML(state.bag.find(g=>g.slot===0))'),/法師武器說明。/);
 const saved=Object.fromEntries(r.values),reload=loadRuntime(root,'index.html',saved);assert.match(reload.run("inventoryMaterialIcon('紅色草')"),/#123abc/);assert.equal(reload.run("inventoryMaterialDescription('紅色草')"),'製作藥水的採集材料。');
 for(const color of ['red','#12345','url(javascript:x)','" onload="x']){r.ctx.bad={...published,inventoryIcons:[{kind:'material',key:'紅色草',iconType:'auto',color}]};assert.throws(()=>r.run('applyBalanceConfig(bad)'),/顏色/);}assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
