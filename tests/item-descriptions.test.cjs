const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../js/ui/inventory-icon-model.js'),{loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));
test('all inventory descriptions have one persisted source and migration keeps explicit blanks',()=>{
 const rows=M.entries(published).filter(r=>r.kind!=='skill');
 const keys=rows.map(row=>row.id),configured=published.inventoryIcons.filter(row=>row.kind!=='skill').map(row=>row.kind+':'+row.key);
 assert.equal(new Set(keys).size,keys.length,'catalogue must not generate duplicate identities');
 assert.equal(new Set(configured).size,configured.length,'each configured icon must have one identity');
 assert.deepEqual(keys.slice().sort(),configured.slice().sort(),'generated equipment/item/material/gem/token catalogue must match published metadata exactly');
 for(const row of rows)assert.equal(typeof M.itemDescription(published,row.kind,row.key),'string');
 for(const item of published.items)assert(!Object.hasOwn(item,'description')&&!Object.hasOwn(item,'desc'));
 for(const token of published.companionTokens.catalog)assert(!Object.hasOwn(token,'description'));
 for(const pool of [published.shopSettings.fixedOffers,published.shopSettings.randomOffers])for(const r of pool.entries)assert(!Object.hasOwn(r,'description'));
 const legacy=structuredClone(published);legacy.items[0].description='舊道具文字';legacy.inventoryIcons.find(r=>r.kind==='item'&&r.key===legacy.items[0].id).description='';
 assert.equal(M.itemDescription(M.migrateDescriptions(legacy),'item',legacy.items[0].id),'');
 legacy.inventoryIcons=legacy.inventoryIcons.filter(r=>r.key!==legacy.items[0].id);
 assert.equal(M.itemDescription(M.migrateDescriptions(legacy),'item',legacy.items[0].id),'舊道具文字');
 assert.deepEqual(M.migrateDescriptions(published),published);
});
test('shop, inventory, life stock, gems, scrolls and old token snapshots use current manager text across reload',()=>{
 const r=loadRuntime(root);r.ctx.doc=published;r.run('applyBalanceConfig(doc,{persist:false});selectSaveSlot(1);start(0);closeModal();applyBalanceConfig(exportableBalance(),{persist:false});');
 const before=r.run('JSON.stringify(packParty())');
 const doc=structuredClone(published),texts={'material:紅色草':'管理器的草','material:鍛鐵':'管理器的鐵','item:imbue_fire':'管理器的藥','item:level_scroll':'管理器的卷','gem:0':'管理器的寶石','token:berserk':'管理器的信物','equipment:form:0:0:0':'管理器的武器'};
 for(const row of doc.inventoryIcons){const value=texts[row.kind+':'+row.key];if(value)row.description=value;}
 doc.items.find(x=>x.id==='imbue_fire').description='過期道具文字';doc.shopSettings.fixedOffers.entries.find(x=>x.key==='imbue_fire').description='過期商店文字';
 r.ctx.next=doc;r.run('applyBalanceConfig(next)');assert.equal(r.run('JSON.stringify(packParty())'),before);
 for(const [id,text]of Object.entries(texts)){const [kind,...key]=id.split(':');assert.equal(r.run(`__EMBERWILD_ITEM_DESCRIPTION(${JSON.stringify(kind)},${JSON.stringify(key.join(':'))})`),text);}
 r.run('state.consumables.imbue_fire=1;state.materials["升級卷軸"]=1;state.materials["紅色草"]=1;state.gems[0]=1;');
 const itemList=r.run('accountItemsView()'),gemList=r.run('accountGemsView()');
 // Current inventory deliberately shows name and icon only. Copy belongs in the item detail dialog.
 assert.match(itemList,/data-item-kind="item" data-item-key="imbue_fire" data-item-context="inventory"/);
 assert.match(itemList,/data-item-kind="item" data-item-key="level_scroll" data-item-context="inventory"/);
 assert.match(gemList,/data-item-kind="gem" data-item-key="0" data-item-context="inventory"/);
 assert.doesNotMatch(itemList,/管理器的藥|管理器的卷/);
 assert.doesNotMatch(gemList,/管理器的寶石/);
 for(const [kind,key,expected] of [['item','imbue_fire',texts['item:imbue_fire']],['item','level_scroll',texts['item:level_scroll']],['gem','0',texts['gem:0']],['material','紅色草',texts['material:紅色草']]]){
  r.ctx.detailNode={dataset:{itemKind:kind,itemKey:key,itemContext:'inventory',itemQuantity:'1'}};
  r.run('openItemSlotDetails(detailNode)');
  assert.match(r.elements.get('item-detail-dialog').innerHTML,new RegExp(expected),'inventory detail must show managed text for '+kind+':'+key);
  r.run('closeItemDetails()');
 }
 r.run("setShopCategory('fixed')");
 assert.match(r.run('shopView()'),/火屬性附魔藥水/);
 assert.match(r.run('lifeSkillsView()'),/紅色草/);

 assert.equal(r.run('companionTokenDescription({tokenId:"berserk",snapshot:{description:"舊快照",name:"舊信物"}})'),'管理器的信物');
 assert.match(r.run('equipmentAttributeDetailsHTML(state.bag.find(g=>g.slot===0))'),/管理器的武器/);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('__EMBERWILD_ITEM_DESCRIPTION("material","紅色草")'),'管理器的草');
 const blank=JSON.parse(r.run('JSON.stringify(exportableBalance())'));for(const row of blank.inventoryIcons)if(texts[row.kind+':'+row.key])row.description='';
 r.ctx.blank=blank;r.run('applyBalanceConfig(blank)');assert.equal(r.run('inventoryMaterialDescription("紅色草")'),'');assert.equal(r.run('companionTokenDescription({tokenId:"berserk",snapshot:{description:"舊快照"}})'),'');assert(!r.run('accountItemsView()').includes('管理器的藥'));
 const exported=JSON.parse(r.run('JSON.stringify(exportableBalance())'));assert.equal(exported.inventoryIcons.find(x=>x.key==='imbue_fire').description,'');assert(!Object.hasOwn(exported.items[0],'description'));assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
