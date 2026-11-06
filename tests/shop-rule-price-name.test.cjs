// Shop rules set the price and the shown name of their offers, healing potions included.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(entries){const r=loadRuntime(root);r.ctx.entries=entries;r.run("selectSaveSlot(1);start(0);closeModal();{const cfg=exportableBalance();cfg.shopSettings.randomOffers.entries=[];cfg.shopSettings.fixedOffers.entries=entries;applyBalanceConfig(cfg,{persist:false});}state.gold=100000;");return r;}
test('healing potions are charged the rule unit price; an empty unit price falls back to the item price',()=>{
 const r=game([{id:'a',enabled:true,type:'item',key:'heal_small',quantity:3,unitPrice:7,name:'',description:''},{id:'b',enabled:true,type:'item',key:'heal_small',quantity:2,unitPrice:null,name:'',description:''}]);
 const cost=r.run('SHOP.find(x=>x.id==="heal_small").cost'),before=r.run('state.gold');
 r.run('buyFixedShopOffer("a")');assert.equal(before-r.run('state.gold'),21);
 const mid=r.run('state.gold');r.run('buyFixedShopOffer("b")');assert.equal(mid-r.run('state.gold'),2*cost);
 assert.equal(r.run('healPotionCount("heal_small")')-0>=5,true);assert.deepEqual(r.errors,[]);
});
test('a rule display name replaces the item name on the shop slot and leads its tooltip',()=>{
 const r=game([{id:'a',enabled:true,type:'item',key:'power_tier_reroll',quantity:3,unitPrice:9,name:'測試重鑄石',description:''},{id:'b',enabled:true,type:'item',key:'heal_small',quantity:1,unitPrice:null,name:'',description:''}]);
 r.run("setTab('shop');setShopCategory('fixed');render()");const html=r.elements.get('app').innerHTML;
 assert.match(html,/<span class="item-slot-name">測試重鑄石/);assert.match(html,/data-item-display-name="測試重鑄石"/);
 assert.match(html,/<span class="item-slot-name">簡易治療藥水/,'rules without a name keep the item name');
 assert.match(html,/商品數量 3 · 27 金幣/);assert.deepEqual(r.errors,[]);
});
