const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),key='emberwild-item-display';

test('item slots always include names and the display preference is UI-only and persistent',()=>{
  const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal()');
  const before=r.run('JSON.stringify(packParty())'),balance=r.run('JSON.stringify(exportableBalance())');
  const slot=r.run("itemSlotHTML('material','鍛鐵',{count:12,context:'inventory'})");
  assert.match(slot,/class="item-slot-art"/);assert.match(slot,/class="item-slot-name">鍛鐵</);assert.match(slot,/class="item-slot-count"[^>]*>×12</);
  assert.match(r.run('itemDisplayOptionsView()'),/圖示＋名稱/);assert.match(r.run('itemDisplayOptionsView()'),/僅顯示名稱/);
  assert.equal(r.run("setItemDisplayMode('name')"),true);assert.equal(r.ctx.document.documentElement.dataset.itemDisplay,'name');assert.equal(r.values.get(key),'name');
  assert.equal(r.run('JSON.stringify(packParty())'),before);assert.equal(r.run('JSON.stringify(exportableBalance())'),balance);
  assert.equal(r.run("setItemDisplayMode('unknown')"),false);
  const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.ctx.document.documentElement.dataset.itemDisplay,'name');
  const invalid=loadRuntime(root,'index.html',{[key]:'retired-mode'});assert.equal(invalid.ctx.document.documentElement.dataset.itemDisplay,'icon-name');
  assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);assert.deepEqual(invalid.errors,[]);
});

test('only backpack slots open details; references stay passive and shop keeps direct purchase controls',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();state.gold=100000;');
 for(const context of ['reference','mail','reward','forge','shop']){
  const html=r.run(`itemSlotHTML('material','鍛鐵',{context:'${context}',count:2})`);assert.match(html,/^<span /);assert.doesNotMatch(html,/onclick="openItemSlotDetails/);
  r.ctx.slotContext=context;assert.equal(r.run("openItemSlotDetails({dataset:{itemKind:'material',itemKey:'鍛鐵',itemContext:slotContext}})"),false);
 }
 const inv=r.run("itemSlotHTML('material','鍛鐵',{context:'inventory'})");assert.match(inv,/^<button /);assert.match(inv,/openItemSlotDetails/);r.run("openItemSlotDetails({dataset:{itemKind:'material',itemKey:'鍛鐵',itemContext:'inventory'}})");assert(r.elements.get('item-detail-dialog').open);r.run('closeItemDetails()');
 for(const category of ['random','fixed','equipment','life']){r.ctx.category=category;r.run('setShopCategory(category)');const html=r.run('shopView()');assert.match(html,/shop-inline-controls/);assert.match(html,/onclick="buy(?:MarketOffer|FixedShopOffer|EquipmentShopOffer|LifeMaterial)/);assert.doesNotMatch(html,/onclick="openItemSlotDetails/);}
 const custom=r.run("gearSlotHTML(state.bag[0],{onclick:\"selectInventoryGear('test')\"})");assert.match(custom,/^<button /);assert.match(custom,/selectInventoryGear/);assert.deepEqual(r.errors,[]);
});
