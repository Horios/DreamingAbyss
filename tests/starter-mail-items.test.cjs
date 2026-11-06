const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(edit){const r=loadRuntime(root),d=json(r,'exportableBalance()');if(edit)edit(d);r.ctx.doc=d;r.run('applyBalanceConfig(doc);selectSaveSlot(1);start(0);closeModal()');return r;}

test('all classes start with five ordinary white items; only the weapon is mailed and claiming never equips it',()=>{
 for(let job=0;job<4;job++){
  const r=game();if(job)r.run(`start(${job});closeModal()`);
  assert.equal(r.run('state.bag.length'),5);assert.equal(r.run('state.bag.every(g=>!g.starterPack&&g.tier===1&&g.powerTier===1&&g.plus===0&&g.affix.length===0&&!g.prefixId&&!g.suffixId)'),true);
  assert.equal(r.run('party.mailbox.messages.length'),1);assert.equal(r.run('party.mailbox.messages[0].attachments.length'),1);
  assert.equal(r.run('party.mailbox.messages[0].attachments[0].gear.slot'),0);
  assert.equal(r.run('party.mailbox.messages[0].attachments[0].gear.starterPack.baseAttack'),4);
  const worn=json(r,'state.equipped');assert.equal(r.run('claimMailboxAttachments(1)'),true);assert.equal(r.run('state.bag.length'),6);assert.deepEqual(json(r,'state.equipped'),worn);
  assert.equal(r.run('claimMailboxAttachments(1)'),false);assert.equal(r.run('state.bag.length'),6);assert.deepEqual(r.errors,[]);
 }
});
test('mailed weapon can be opened and enhanced, while manual/auto affixes and power reroll do not charge',()=>{
 const r=game();r.run('claimMailboxAttachments(1);globalThis.g=state.bag.find(g=>g.starterPack);state.ore=1000;state.dust=1000;state.gold=10000;state.consumables.power_tier_reroll=2;openForge(g.id)');
 assert.match(r.run('forgeView()'),/onclick="enhance\(/);assert.equal(r.run('canEnhance(g)'),true);
 const before=r.run('gearStatBreakdown(g).raw.atk');assert.equal(before,4);r.run('enhance(g.id)');assert.equal(r.run('g.plus'),1);
 const inventory=r.run('JSON.stringify({gold:state.gold,ore:state.ore,dust:state.dust,consumables:state.consumables,gear:g})');
 r.run('reroll(g.id);autoReroll(g.id,3);rerollEquipmentPowerTier(g.id)');assert.equal(r.run('JSON.stringify({gold:state.gold,ore:state.ore,dust:state.dust,consumables:state.consumables,gear:g})'),inventory);
});
test('all catalogue kinds are mailed in chunks of at most six and land in their actual inventories',()=>{
 const r=game(d=>{d.companions.find(p=>p.id===15).unlockCondition={type:'ticket',price:10,chance:.1};d.starterPackItems[0]=[
  {kind:'item',key:'heal_small',quantity:3},{kind:'material',key:'鍛鐵',quantity:7},{kind:'material',key:'粉塵',quantity:4},{kind:'gem',key:'1',quantity:5},
  {kind:'item',key:'level_scroll',quantity:2},{kind:'item',key:'imbue_fire',quantity:4},{kind:'item',key:'companion-ticket-15',quantity:2},
  {kind:'equipment',key:'form:0:1:0',quantity:2},{kind:'token',key:'berserk',quantity:1}];});
 assert.deepEqual(json(r,'party.mailbox.messages.map(m=>m.attachments.length)'),[6,4]);
 const ore=r.run('state.ore'),dust=r.run('state.dust'),heal=r.run('healPotionCount("heal_small")');
 assert.equal(r.run('claimAllMailboxAttachments()'),true);assert.equal(r.run('state.ore'),ore+7);assert.equal(r.run('state.dust'),dust+4);assert.equal(r.run('healPotionCount("heal_small")'),heal+3);
 assert.equal(r.run('state.gems[1]'),5);assert.equal(r.run('materialCount("升級卷軸")'),2);assert.equal(r.run('state.consumables.imbue_fire'),4);assert.equal(r.run('companionTicketCount(15)'),2);
 assert.equal(r.run('state.bag.filter(g=>g.slot===1).length'),3);assert.equal(r.run('state.bag.filter(g=>g.type===EmberwildTokens.TYPE).length'),1);
 assert.equal(r.run('new Set(state.bag.map(g=>g.id)).size===state.bag.length'),true);assert.doesNotThrow(()=>r.run('validateParty(packParty())'));
});
test('failed saves, a full bag and stock overflow retain every attachment and roll back all inventory changes',()=>{
 const r=game(d=>d.starterPackItems[0]=[{kind:'material',key:'紅色草',quantity:3}]);
 const before=r.run('JSON.stringify(packParty())');r.run('globalThis.realSave=save;save=()=>false');for(const claim of ['claimMailboxAttachments(1)','claimAllMailboxAttachments()']){assert.equal(r.run(claim),false);assert.equal(r.run('JSON.stringify(packParty())'),before);}
 r.run('save=()=>{throw Error("disk")};');for(const claim of ['claimMailboxAttachments(1)','claimAllMailboxAttachments()']){assert.equal(r.run(claim),false);assert.equal(r.run('JSON.stringify(packParty())'),before);}
 r.run('save=realSave;while(state.bag.length<RULES.bagCapacity)state.bag.push(gear(1,1,0,0));');assert.equal(r.run('claimMailboxAttachments(1)'),false);assert.equal(r.run('party.mailbox.messages[0].claimed'),false);
 r.run('state.bag=state.bag.slice(0,5);state.materials["紅色草"]=1e9;');assert.equal(r.run('claimMailboxAttachments(1)'),false);assert.equal(r.run('state.bag.length'),5);assert.equal(r.run('party.mailbox.messages[0].claimed'),false);
 r.run('state.materials["紅色草"]=0;globalThis.saveCalls=0;save=(...args)=>{if(++saveCalls>1)throw Error("duplicate save");return realSave(...args);};');
 assert.equal(r.run('claimMailboxAttachments(1)'),true);assert.equal(r.run('saveCalls'),1);assert.equal(r.run('claimAllMailboxAttachments()'),false);assert.equal(r.run('saveCalls'),1);
});
test('pending/claimed mail survives cold reload and no gifts are sent again on loading an existing save',async()=>{
 const r=game();r.run('save()');let reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('party.mailbox.messages.length'),1);assert.equal(reload.run('state.bag.length'),5);reload.run('continueFromTitle();closeModal()');assert.equal(reload.run('EmberwildOffline.busy'),true);assert.equal(reload.run('claimMailboxAttachments(1)'),false);assert.equal(reload.run('party.mailbox.messages[0].claimed'),false);await reload.run('EmberwildOffline.settle()');assert.equal(reload.run('claimMailboxAttachments(1)'),true);
 reload=loadRuntime(root,'index.html',Object.fromEntries(reload.values));assert.equal(reload.run('party.mailbox.messages.length'),1);assert.equal(reload.run('party.mailbox.messages[0].claimed'),true);assert.equal(reload.run('claimMailboxAttachments(1)'),false);assert.equal(reload.run('state.bag.length'),6);assert.deepEqual(reload.errors,[]);
});
test('six attachment slots use SVG; inventory keeps detail actions; references and mail stay non-modal',()=>{
 const r=game();assert.equal((r.run('mailboxView()').match(/class="item-slot /g)||[]).length,6);assert.match(r.run('mailboxView()'),/data-item-mail="1"/);
 r.run('claimMailboxAttachments(1);state.materials["紅色草"]=3;state.consumables.imbue_fire=2;state.gems[0]=1;continueFromTitle()');
 for(const view of ['inventoryGearListItem(state.bag[0],true)','forgeView()','accountMaterialsView()','accountItemsView()','lifeSkillsView()','shopView()'])assert.match(r.run(view),/<svg/);
 const html=r.run('inventoryGearListItem(state.bag[0],true)');assert.match(html,/selectInventoryGear/);assert.doesNotMatch(html,/inventory-list-name|inventory-list-meta/);
 r.run('openItemSlotDetails({dataset:{itemKind:"material",itemKey:"紅色草",itemContext:"inventory"}})');assert.match(r.elements.get('item-detail-dialog').innerHTML,/紅色草/);assert.match(r.elements.get('item-detail-dialog').innerHTML,/sellMaterial/);
 r.run('openUtilityPanel("mailbox");globalThis.mailHTML=$("modal").innerHTML;openItemSlotDetails({dataset:{itemMail:"1",itemIndex:"0"}})');assert.equal(r.run('$("modal").innerHTML'),r.run('mailHTML'));assert.match(r.elements.get('item-detail-dialog').innerHTML,/紅色草/);assert.deepEqual(r.errors,[]);
});
test('shop uses an inventory-style slot grid and item details stay scoped to their source',()=>{
 const r=game();r.run('state.materials["清水"]=3');let shop=r.run('shopView()');assert.match(shop,/class="shop-product-grid"/);assert.match(shop,/data-item-context="shop"/);assert.match(shop,/class="shop-product-stock">庫存<br><b>\d+/);assert.match(shop,/class="shop-product-label">[^<]+/);assert.doesNotMatch(shop,/class="shop-product-meta"/);
 r.run('setShopCategory("life")');shop=r.run('shopView()');assert.match(shop,/class="shop-product-stock">庫存<br><b>3<\/b>/);assert.match(shop,/class="shop-product-label">清水<\/small>/);
 const slot=r.run(`itemSlotHTML('item','heal_small',{context:'shop',count:3,detailLabel:'商品數量',price:99,shopType:'fixed',shopId:'fixed-heal-small'})`);
 assert.match(slot,/商品數量 3/);assert.match(slot,/99 金幣/);assert.match(slot,/buyFixedShopOffer/);assert.doesNotMatch(slot,/openItemSlotDetails/);
 assert.equal(r.run('openItemSlotDetails({dataset:{itemKind:"material",itemKey:"紅色草",itemContext:"reference"}})'),false);assert.notEqual(r.elements.get('item-detail-dialog')?.open,true);assert.deepEqual(r.errors,[]);
});
test('inline shop purchase uses the original offer and updates its sold state without a detail dialog',()=>{
 const r=game();r.run('state.gold=1e6;shopView();globalThis.o=party.market.offers.find(x=>!x.sold&&!String(x.ruleId).startsWith("companion-recruit-"));globalThis.before=state.gold;buyMarketOffer(o.id)');
 assert.equal(r.run('o.sold'),true);assert.equal(r.run('state.gold'),r.run('before-o.price'));const html=r.run('shopView()');assert.match(html,/已售完/);assert.match(html,/data-item-sold="true"/);assert.doesNotMatch(html,/sellMaterial|sellInventoryItem|openItemSlotDetails/);assert.deepEqual(r.errors,[]);
});
test('legacy five-item gift configurations migrate to a weapon and invalid item references reject atomically',()=>{
 const r=game();r.run('globalThis.d=exportableBalance();d.starterPacks=d.starterPacks.map(row=>[row[0],{slot:1},{slot:2},{slot:3},{slot:3}]);applyBalanceConfig(d);');assert.deepEqual(json(r,'exportableBalance().starterPacks.map(row=>row.length)'),[1,1,1,1]);
 const before=r.run('JSON.stringify(exportableBalance())');r.run('d=exportableBalance();d.starterPackItems[0]=[{kind:"item",key:"missing",quantity:1}]');assert.throws(()=>r.run('applyBalanceConfig(d)'),/不存在/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);
});
