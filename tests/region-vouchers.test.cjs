const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
const MIN=60000;
// v0.179: players always meet groups; the sampling run keeps the internal single-enemy setting so it builds its 30-minute
// snapshot without wipes.
// One runtime with a real 30-minute snapshot of map 0, reused through state copies (building it takes ~30 game minutes).
let base=null;
function sampled(){
 if(!base){const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=99;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);
  // Play online until a 30-minute snapshot exists: level-ups that equip new skills restart the sampling run.
  for(let i=0;i<120*60*2&&!r.run('!!EmberwildRegionVouchers.ticketFor(0,0)');i++){r.advance(500);r.run('tick()');}r.run('save()');assert(json(r,'EmberwildRegionVouchers.ticketFor(0,0)'),'snapshot built');base={values:Object.fromEntries(r.values),now:r.now};}
 const r=loadRuntime(root,'index.html',base.values);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.advance(base.now-r.now);r.run("continueFromTitle();closeModal()");return r;
}
// Let the boot catch-up started by continueFromTitle finish, so each test starts with no unsettled time.
async function ready(r){await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.busy'),false);r.run('acknowledgeOfflineExploration()');return r;}
async function offlineVouchers(r,ms,{confirm=true}={}){
 r.advance(ms);r.run('globalThis.__job=EmberwildOffline.settle();1');await new Promise(res=>setImmediate(res));
 const html=r.run("document.getElementById('offline-settlement').innerHTML");
 if(confirm){assert.equal(r.run("offerOfflineVouchers('open')"),true);assert.match(r.run("document.getElementById('offline-settlement').innerHTML"),/確認改領[\s\S]*繼續計算/);assert.equal(r.run("offerOfflineVouchers('confirm')"),true);}
 await r.run('__job');assert.equal(r.run('EmberwildOffline.failed'),false);return html;
}
const voucherMail=r=>json(r,'party.mailbox.messages.filter(m=>m.rewardKey.startsWith("voucher-")).map(m=>({id:m.id,n:m.attachments[0].quantity,claimed:m.claimed}))');
test('offline settlement offers vouchers with an explanation and confirmation; confirming stops the replay and mails 30-minute tickets',async()=>{
 const r=await ready(sampled()),before=json(r,'({kills:state.totalKills,lastAt:party.offlineExploration.lastAt})');
 const t=Date.now(),html=await offlineVouchers(r,8*3600000);assert(Date.now()-t<5000,'8 hours convert without replaying combat');
 assert.match(html,/改領收益券（16 張）/);
 const receipt=json(r,'party.offlineExploration.receipt');assert.equal(receipt.vouchers,16);assert.equal(receipt.voucherMs,8*3600000);assert.equal(r.run('party.offlineExploration.lastAt'),r.now,'the whole absence is settled once');
 assert.equal(r.run('state.totalKills'),before.kills,'no combat was replayed');
 assert.deepEqual(voucherMail(r).map(m=>[m.n,m.claimed]),[[16,false]]);
 // Reloading the committed save neither repeats the conversion nor re-offers the same time.
 r.run('save()');const cold=loadRuntime(root,'index.html',Object.fromEntries(r.values));cold.ctx.setTimeout=fn=>setImmediate(fn);cold.run("continueFromTitle();closeModal()");await cold.run('EmberwildOffline.settle()');
 assert.deepEqual(voucherMail(cold).map(m=>m.n),[16]);assert.deepEqual(r.errors,[]);assert.deepEqual(cold.errors,[]);
});
test('remainders under 30 minutes are kept per region and the cap follows the existing 24-hour limit',async()=>{
 const r=await ready(sampled());await offlineVouchers(r,45*MIN);assert.deepEqual(voucherMail(r).map(m=>m.n),[1]);assert.equal(json(r,'party.regionVouchers.remainders')['0:0'],15*MIN);
 r.run('acknowledgeOfflineExploration()');await offlineVouchers(r,16*MIN);assert.deepEqual(voucherMail(r).map(m=>m.n),[1,1],'15 + 16 minutes make one more ticket');assert.equal(json(r,'party.regionVouchers.remainders')['0:0'],MIN);
 r.run('acknowledgeOfflineExploration()');await offlineVouchers(r,30*3600000);assert.equal(voucherMail(r).at(-1).n,48,'only the 24-hour cap converts');
 assert.deepEqual(r.errors,[]);
});
test('regions without a snapshot never offer vouchers and keep the full simulation',async()=>{
 const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();startSelectedExploration();save();`);
 const html=await offlineVouchers(r,40*MIN,{confirm:false});assert(!/改領收益券/.test(html));assert.equal(r.run("offerOfflineVouchers('open')"),false);
 assert(json(r,'party.offlineExploration.receipt').kills>0);assert.deepEqual(voucherMail(r),[]);assert.deepEqual(r.errors,[]);
});
const mails=(r,kind)=>json(r,`party.mailbox.messages.filter(m=>/^voucher-${kind}-\\d+$/.test(m.rewardKey))`);
test('claimed tickets become inventory items with a short description; using them calculates earnings and mails them',async()=>{
 const r=await ready(sampled());await offlineVouchers(r,8*3600000);r.run('acknowledgeOfflineExploration()');
 assert.equal(r.run(`claimMailboxAttachments(${voucherMail(r)[0].id})`),true);const stack=json(r,'party.regionVouchers.stacks[0]');assert.equal(stack.count,16);
 assert.equal(stack.levelMax,r.run('MAPS[0].max'));assert.equal(stack.gold,Math.max(0,stack.baseGold-stack.potionCost));
 r.run('inventoryCategory="items";setTab("equipment")');const html=r.elements.get('app').innerHTML;
 // v0.211 grid bag: one slot of the 消耗品 tab per voucher stack (the potion status sits in the tab's toolbar).
 assert.match(html,/目前藥水效果：[\s\S]*class="bag-cell[^"]*" data-bag-ref="v:v1:0" data-item-kind="item" data-item-key="region-voucher:v1"[^>]*aria-label="無名密林 30 分鐘收益券 ×16"/);
 assert.match(html,/data-item-key="region-voucher:v1"[\s\S]*?<svg/,'the ticket uses an SVG icon');
 const virtual=json(r,`(()=>{const v=__EMBERWILD_VIRTUAL_ITEM('region-voucher:v1');return {name:v.name,glyph:v.glyph,description:v.description,detail:v.detail(),actions:v.actions()};})()`);
 assert.equal(virtual.glyph,'ticket');assert.match(virtual.description,/使用時計算金幣與道具，收益寄到信箱/);assert(!/經驗 \d|金幣 \d/.test(virtual.description+virtual.detail),'the item shows no earnings until used');
 assert.match(virtual.actions,/useRegionVouchers\('v1',1\)[\s\S]*全部使用（16）/);
 // Later team changes cannot raise a locked ticket.
 r.run('playerHero().autoPotion=!playerHero().autoPotion');assert.deepEqual(json(r,'party.regionVouchers.stacks[0]'),stack);
 r.run('running=false;save()');
 const stats=json(r,'party.idleStatistics.regions["0:0"].total'),kills=r.run('state.totalKills'),inv=json(r,'({gold:state.gold,lv:state.lv,bag:state.bag.length,ore:state.ore,mats:state.materials})');
 assert.equal(r.run(`useRegionVouchers('${stack.id}',3)`),true);assert.match(r.run("$('modal').innerHTML"),/預估收益[\s\S]*金幣[\s\S]*確認使用/);
 r.run('render()');assert.match(r.run("$('modal').innerHTML"),/確認使用/,'a mailbox refresh does not overwrite the dialog');
 const p=json(r,`EmberwildRegionVouchers.preview([{id:'${stack.id}',count:3}])`);
 r.run('confirmRegionVouchers()');assert.match(r.run("$('modal').innerHTML"),/收益已寄到信箱/);
 assert.deepEqual(json(r,'({gold:state.gold,lv:state.lv,bag:state.bag.length,ore:state.ore,mats:state.materials})'),inv,'nothing is granted before the mail is claimed');
 const h=json(r,'party.regionVouchers.history.at(-1)');assert.equal(h.tickets,3);assert.equal(h.overlevel,p.overlevel);assert.equal(json(r,'party.regionVouchers.stacks[0].count'),13);
 const gold=mails(r,'gold');assert.equal(gold.length,1);const cur=Object.fromEntries(gold[0].attachments.map(a=>[a.type,a.quantity]));
 assert.equal(cur.voucherGold,h.gold);assert.equal(cur.voucherXp||0,h.xp);assert.equal(h.overlevel,0);assert.equal(h.gold,3*stack.gold);
 assert.equal(r.run(`claimMailboxAttachments(${gold[0].id})`),true);assert.equal(r.run('state.gold'),inv.gold+h.gold);
 const items=mails(r,'items');assert.equal(items.length>0,h.overlevel<3);
 r.run('claimAllMailboxAttachments()');assert(json(r,'party.mailbox.messages.filter(m=>m.rewardKey.startsWith("voucher-")).every(m=>m.claimed)'),'item mail is claimed into the inventory');
 assert(r.run('state.ore')>=inv.ore);
 assert.equal(r.run('state.totalKills'),kills,'using tickets adds no kills');assert.deepEqual(json(r,'party.idleStatistics.regions["0:0"].total'),stats,'using tickets never feeds statistics');
 // v0.161: no over-level rule; more tickets mail full gold and no XP.
 const t=json(r,`EmberwildRegionVouchers.redeem([{id:'${stack.id}',count:5}])`);assert.equal(t.overlevel,0);assert.equal(t.xp,0);
 assert.deepEqual(mails(r,'gold').at(-1).attachments.map(a=>[a.type,a.quantity]),[['voucherGold',5*stack.gold]]);
 assert.deepEqual(r.errors,[]);
});
test('used tickets roll drops through the existing per-enemy loot rules without touching the real inventory',async()=>{
 const r=await ready(sampled());await offlineVouchers(r,4*3600000);r.run(`acknowledgeOfflineExploration();claimAllMailboxAttachments();running=false;`);
 const stack=json(r,'party.regionVouchers.stacks[0]');
 r.run(`party.regionVouchers.stacks[0].levelMax=999;globalThis.__calls=0;const base=rollEnemyItemLoot;rollEnemyItemLoot=function(e,o){__calls++;if(!o?.voucher)throw Error('voucher flag');return base(e,o);};EmberwildItems.add('material:光輝碎塊',10);{const s=EmberwildItems.stacks().find(s=>s.item==='material:光輝碎塊');EmberwildItems.split(s.uid,3);}`);
 const inv=r.run('JSON.stringify({bag:state.bag.map(g=>g.id),ore:state.ore,dust:state.dust,mats:state.materials,gems:state.gems,heal:playerHero().healingPotions,layout:EmberwildItems.snapshot()})');
 const t=json(r,`EmberwildRegionVouchers.redeem([{id:'${stack.id}',count:8}])`);const expected=Object.values(stack.enemies).reduce((a,b)=>a+b,0)*8;
 assert(Math.abs(r.run('__calls')-expected)<=Object.keys(stack.enemies).length*8,'one loot roll per locked enemy');
 assert.equal(r.run('JSON.stringify({bag:state.bag.map(g=>g.id),ore:state.ore,dust:state.dust,mats:state.materials,gems:state.gems,heal:playerHero().healingPotions,layout:EmberwildItems.snapshot()})'),inv,'rolls happen in a scratch inventory');
 assert.equal(t.xp,0);assert(Object.keys(t.items).length>0);
 const goods=mails(r,'items').flatMap(m=>m.attachments);assert(goods.every(a=>['catalogue','gear'].includes(a.type)));assert.equal(goods.filter(a=>a.type==='gear').length,t.gear);
 assert.equal(goods.filter(a=>a.type==='catalogue').reduce((n,a)=>n+a.quantity,0),Object.values(t.items).reduce((a,b)=>a+b,0));
 assert(mails(r,'items').every(m=>m.attachments.length<=6));
 assert.doesNotThrow(()=>r.run('validateParty(JSON.parse(JSON.stringify(packParty())))'));
 assert.deepEqual(r.errors,[]);
});
test('using tickets and claims are atomic, refuse another tab and keep mailbox validation strict',async()=>{
 const r=await ready(sampled());await offlineVouchers(r,2*3600000);r.run('acknowledgeOfflineExploration()');
 assert.doesNotThrow(()=>r.run('validateParty(JSON.parse(JSON.stringify(packParty())))'));
 assert.throws(()=>r.run('{const d=JSON.parse(JSON.stringify(packParty()));d.mailbox.messages.find(m=>m.rewardKey.startsWith("voucher-")).attachments[0].quantity=0;validateParty(d)}'),/信箱存檔無效/);
 assert.throws(()=>r.run('{const d=JSON.parse(JSON.stringify(packParty()));const m=d.mailbox.messages.find(m=>m.rewardKey.startsWith("voucher-"));d.mailbox.messages.push(JSON.parse(JSON.stringify(m)));validateParty(d)}'),/信箱存檔無效/,'duplicate voucher mail IDs must be rejected before rewards can be claimed');
 assert.throws(()=>r.run('{const d=JSON.parse(JSON.stringify(packParty()));d.mailbox.messages.find(m=>m.rewardKey.startsWith("voucher-")).attachments[0].voucher.enemies={};validateParty(d)}'),/信箱存檔無效/);
 assert.throws(()=>r.run('{const d=JSON.parse(JSON.stringify(packParty()));const m=d.mailbox.messages.find(m=>m.rewardKey.startsWith("voucher-"));m.rewardKey="voucher-gold-"+m.id;validateParty(d)}'),/信箱存檔無效/,'ticket attachments cannot pose as gold mail');
 r.run('claimAllMailboxAttachments()');const id=r.run('party.regionVouchers.stacks[0].id'),snap=r.run('JSON.stringify({v:party.regionVouchers,m:party.mailbox,gold:state.gold,lv:state.lv,bag:state.bag.length})');
 r.run('globalThis.__EMBERWILD_SAVE_OWNER=false');assert.equal(r.run(`EmberwildRegionVouchers.redeem([{id:'${id}',count:1}])`),false);r.run('globalThis.__EMBERWILD_SAVE_OWNER=true');
 r.run('globalThis.__save=save;save=()=>false');assert.equal(r.run(`EmberwildRegionVouchers.redeem([{id:'${id}',count:2}])`),false);r.run('save=__save');
 assert.equal(r.run('JSON.stringify({v:party.regionVouchers,m:party.mailbox,gold:state.gold,lv:state.lv,bag:state.bag.length})'),snap,'a failed save restores tickets and mailbox together');
 const requests=`[{id:'${id}',count:2},{id:'${id}',count:99}]`;
 assert.equal(json(r,`EmberwildRegionVouchers.preview(${requests})`).tickets,4,'duplicate requests share the held stock');
 assert.equal(json(r,'party.regionVouchers.stacks[0].count'),4,'preview does not consume tickets');
 assert.equal(json(r,`EmberwildRegionVouchers.redeem(${requests})`).tickets,4,'duplicate requests never redeem more than held');assert.equal(json(r,'party.regionVouchers.stacks').length,0);
 assert.equal(r.run(`EmberwildRegionVouchers.redeem([{id:'${id}',count:1}])`),false,'a used ticket cannot be used again');
 // Claiming XP/gold mail twice grants once; a failed save keeps it in the mailbox.
 const g=mails(r,'gold')[0];r.run('globalThis.__save=save;save=()=>false');assert.equal(r.run(`claimMailboxAttachments(${g.id})`),false);r.run('save=__save');
 const gold=r.run('state.gold');assert.equal(r.run(`claimMailboxAttachments(${g.id})`),true);assert.equal(r.run(`claimMailboxAttachments(${g.id})`),false);
 assert.equal(r.run('state.gold'),gold+(g.attachments.find(a=>a.type==='voucherGold')?.quantity||0));
 assert.deepEqual(json(r,'EmberwildRegionVouchers.normalize({version:1,serial:3,remainders:{"0:0":99999999,"6:0":5,"x":1},stacks:[{id:"v1",count:0},{id:"bad"}],history:[]})'),{version:1,serial:3,remainders:{'0:0':30*MIN-1},stacks:[],history:[]});
 // v0.161: maps carry a recommended gear level (default: the map's max level) instead of an over-level voucher price.
 assert.equal(r.run('worldMapConfig(0).recommendedGearLevel'),r.run('MAPS[0].max'));assert.equal(r.run('worldMapConfig(0).overlevelVoucherGold'),undefined);
 assert.equal(r.run('party.mailbox.messages.some(m=>m.rewardKey.startsWith("starter-"))'),false,'creation no longer sends starter mail');
 assert.deepEqual(r.errors,[]);
});
test('ticket length and potion charging come from balance settings; invalid values are rejected',async()=>{
 const r=await ready(sampled()),before=json(r,'EmberwildRegionVouchers.ticketFor(0,0)');
 assert.deepEqual(json(r,'exportableBalance().balanceSettings.rewards.regionVouchers'),{ticketMinutes:30,sampleMinutes:30,maxGapMinutes:10,chargePotions:true,averageMinutes:180});
 assert.equal(before.minutes,30);
 // Balance changes are refused while exploring, so stop, apply and resume.
 r.run('stopTeamExploration();closeModal();globalThis.__doc=exportableBalance();__doc.balanceSettings.rewards.regionVouchers={ticketMinutes:15,sampleMinutes:30,maxGapMinutes:10,chargePotions:false}');
 assert.notEqual(r.run('applyBalanceConfig(__doc,{persist:false})'),false);r.run('startSelectedExploration();closeModal();save()');
 const after=json(r,'EmberwildRegionVouchers.ticketFor(0,0)');
 assert.equal(after.minutes,15);assert(Math.abs(after.xp-before.xp/2)<=1,'a 15-minute ticket is worth half the 30-minute sample');
 assert.equal(after.potionCost,0,'potions are not charged when charging is off');assert.equal(after.gold,after.baseGold);
 await offlineVouchers(r,60*MIN);
 const mail=json(r,'party.mailbox.messages.filter(m=>m.rewardKey.startsWith("voucher-")).at(-1)');
 assert.equal(mail.attachments[0].quantity,4);assert.match(mail.subject,/15 分鐘收益券 ×4/);
 for(const bad of [{ticketMinutes:3},{sampleMinutes:500},{maxGapMinutes:0.5}]){
  r.ctx.bad=bad;assert.throws(()=>r.run('__doc.balanceSettings.rewards.regionVouchers={ticketMinutes:30,sampleMinutes:30,maxGapMinutes:10,chargePotions:true,...bad};validateBalanceConfig(structuredClone(__doc))'),/收益券設定/,JSON.stringify(bad));
 }
 assert.deepEqual(r.errors,[]);
});

