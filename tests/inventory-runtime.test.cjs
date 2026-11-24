const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),seed=require('../data/balance.json'),root=path.resolve(__dirname,'..');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){
 const r=loadRuntime(root);r.ctx.seed=structuredClone(seed);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();
  globalThis.fixture=(id,job=0,slot=0)=>{const g=createEquipmentShopGear('equipment_lv1','job'+job+'-slot'+slot+'-form0');g.id=id;return g;};
  globalThis.sizes=id=>EmberwildItems.stacks().filter(s=>s.item===id).map(s=>s.qty);
  globalThis.clearStackables=()=>{state.ore=0;state.dust=0;state.gems=Array(GEMS.length).fill(0);state.materials={};state.consumables={};party.members[0].healingPotions={};};
  /* v0.206: characters start without gear; wear one weapon so worn-gear rules are exercised. */
  if(!state.equipped[0]){const w=fixture('worn-weapon');state.bag.push(w);equipSharedGear('worn-weapon',memberKey(state),0);}`);
 return r;
}
const audit=r=>assert.deepEqual(json(r,'EmberwildItems.audit()'),[]);

test('legacy fields are facades over one stack store: writes stack, split at the cap, never lose items',()=>{
 const r=game();r.run('clearStackables();state.ore+=1500;state.dust=2000;state.materials["蛇鱗"]=5;state.materials["蛇鱗"]+=995;state.gems[0]+=3;state.consumables.imbue_fire=120;');
 assert.deepEqual(json(r,"sizes('material:鍛鐵')"),[999,501]);assert.deepEqual(json(r,"sizes('material:粉塵')"),[999,999,2]);assert.deepEqual(json(r,"sizes('material:蛇鱗')"),[999,1]);
 assert.deepEqual(json(r,"sizes('item:imbue_fire')"),[99,21]);assert.deepEqual(json(r,"sizes('gem:0')"),[3]);
 assert.equal(r.run('state.ore'),1500);assert.equal(r.run('state.materials["蛇鱗"]'),1000);assert.equal(r.run("EmberwildItems.count('material:鍛鐵')"),1500);
 assert.deepEqual(json(r,'party.members.map(h=>h.ore)'),json(r,'party.members.map(()=>1500)'));audit(r);
 // Invalid writes throw and leave the count untouched.
 assert.throws(()=>r.run('state.ore=-1'),/非負整數/);assert.throws(()=>r.run('state.materials["蛇鱗"]=1.5'),/非負整數/);assert.equal(r.run('state.ore'),1500);assert.equal(r.run('state.materials["蛇鱗"]'),1000);
 // Deleting a key or setting 0 removes every stack of that item.
 r.run('delete state.materials["蛇鱗"];');assert.deepEqual(json(r,"sizes('material:蛇鱗')"),[]);assert.equal(r.run('"蛇鱗" in state.materials'),false);audit(r);
});
test('unified API: add, count, has, all-or-nothing removal across stacks, merge and split keep totals',()=>{
 const r=game();r.run('clearStackables();EmberwildItems.add("material:鍛鐵",1500)');
 assert.equal(r.run('EmberwildItems.has("material:鍛鐵",1500)'),true);assert.equal(r.run('EmberwildItems.has("material:鍛鐵",1501)'),false);
 assert.equal(r.run('EmberwildItems.remove("material:鍛鐵",1501)'),false);assert.equal(r.run('state.ore'),1500);
 assert.equal(r.run('EmberwildItems.remove("material:鍛鐵",1000)'),true);assert.deepEqual(json(r,"sizes('material:鍛鐵')"),[500]);assert.equal(r.run('state.ore'),500);
 r.run('state.dust=5');assert.equal(r.run('EmberwildItems.removeMany({"material:鍛鐵":10,"material:粉塵":6})'),false);assert.equal(r.run('state.ore'),500);assert.equal(r.run('state.dust'),5);
 r.run('EmberwildItems.add("item:heal_standard",150)');const [a,b]=json(r,"EmberwildItems.stacks().filter(s=>s.item==='item:heal_standard').map(s=>s.uid)");
 r.ctx.a=a;r.ctx.b=b;const uid=r.run('EmberwildItems.split(a,40)');r.ctx.c=uid;assert.deepEqual(json(r,"sizes('item:heal_standard')"),[59,40,51]);
 assert.throws(()=>r.run('EmberwildItems.merge(c,EmberwildItems.stacks().find(s=>s.item==="material:鍛鐵").uid)'),/不同物品/);
 assert.equal(r.run('EmberwildItems.merge(b,a)'),40);assert.deepEqual(json(r,"sizes('item:heal_standard')"),[99,40,11]);assert.equal(r.run('party.members[0].healingPotions.heal_standard'),150);audit(r);
 // Tickets are quest items: counted and spent through the same API, no bag slot.
 r.run('EmberwildItems.add("item:companion-ticket-10",5)');assert.equal(r.run('companionTicketCount(10)'),5);assert.equal(r.run('EmberwildItems.slots().tabs.special.used'),1);
 assert.equal(r.run('EmberwildItems.remove("item:companion-ticket-10",6)'),false);assert.equal(r.run('EmberwildItems.remove("item:companion-ticket-10",5)'),true);assert.equal(r.run('companionTicketCount(10)'),0);
});
test('slots are counted per tab: 裝備 / 信物 / 寶石 / 素材 / 消耗品 / 特殊, 100 each; worn gear is free',()=>{
 const r=game();r.run(`clearStackables();for(const k of Object.keys(party.achievements.tickets))delete party.achievements.tickets[k];state.bag=state.bag.filter(g=>gearWearer(g.id));for(let i=0;i<15;i++)state.bag.push(fixture('g'+i));state.ore=1500;state.dust=2000;state.gems[0]=3;EmberwildItems.add('item:heal_standard',120);EmberwildItems.add('item:companion-ticket-10',5);`);
 const tabs=()=>json(r,'Object.fromEntries(Object.entries(EmberwildItems.slots().tabs).map(([k,t])=>[k,[t.used,t.capacity]]))');
 assert.deepEqual(tabs(),{equipment:[15,100],token:[0,100],gem:[1,100],material:[5,100],consumable:[2,100],special:[1,100]});assert.equal(r.run('EmberwildItems.slots().enforced'),false);
 r.run("unequipSharedGear(state.equipped[0])");assert.equal(tabs().equipment[0],16);r.run("equipSharedGear('g0',memberKey(state),0)");assert.equal(tabs().equipment[0],15);
 // Exceeding a tab capacity never blocks a grant in this stage.
 r.run('EmberwildItems.add("material:鍛鐵",999*200)');assert(tabs().material[0]>100);assert.equal(r.run('EmberwildItems.slots().tabs.material.over'),tabs().material[0]-100);assert.equal(r.run('state.ore'),1500+999*200);
 r.run('globalThis.idoc=exportableBalance();idoc.balanceSettings.inventory.capacities.gem=150;applyBalanceConfig(idoc,{persist:false})');assert.deepEqual(tabs().gem,[1,150]);
 assert.match(r.run('inventoryTabs()'),/背包格數[^]*寶石 1 \/ 150[^]*特殊 1 \/ 100/);
 assert.equal(r.run("EmberwildItems.byCategory('equipment').length"),15);assert.equal(r.run("EmberwildItems.byCategory('special')[0].quantity"),5);assert.equal(r.run("EmberwildItems.getGear('g3').id"),'g3');
 assert.equal(r.run("EmberwildItems.definition('material:鍛鐵').category"),'enhancementMaterial');assert.equal(r.run("EmberwildItems.definition('gem:0').maxStack"),99);assert.equal(r.run("EmberwildItems.definition('item:heal_standard').tab"),'consumable');
 const b=JSON.parse(r.run("JSON.stringify(EmberwildItems.gearDefinition(findGear('g1')))"));assert.equal(b.stackable,false);assert.equal(b.maxStack,1);assert.equal(b.tab,'equipment');
 // Identical gear stays two instances.
 r.run("globalThis.twin=structuredClone(findGear('g1'));twin.id='g1-twin';EmberwildItems.addGear(twin)");assert.equal(tabs().equipment[0],16);assert.throws(()=>r.run("EmberwildItems.addGear(structuredClone(twin))"),/重複/);audit(r);
});
test('save layout round trip keeps stack uids, splits and order; totals stay authoritative over a damaged or stale layout',()=>{
 const r=game();r.run('clearStackables();state.ore=1500;state.gems[2]=10;EmberwildItems.split(EmberwildItems.stacks().find(s=>s.item==="material:鍛鐵").uid,100);save();');
 const saved=json(r,'packParty()');assert.equal(saved.inventory.version,1);assert.deepEqual(saved.inventory.stacks.filter(s=>s.item==='material:鍛鐵').map(s=>s.qty),[899,100,501]);assert.equal(saved.members[0].ore,1500);
 r.ctx.saved=saved;r.run('loadParty(structuredClone(saved))');assert.deepEqual(json(r,'packParty().inventory'),saved.inventory);audit(r);
 // Cold boot from localStorage.
 const r2=loadRuntime(root,'index.html',Object.fromEntries(r.values));r2.run('selectSaveSlot(1)');assert.equal(r2.run('state.ore'),1500);assert.deepEqual(json(r2,"EmberwildItems.stacks().filter(s=>s.item==='material:鍛鐵').map(s=>s.qty)"),[899,100,501]);assert.deepEqual(json(r2,'EmberwildItems.audit()'),[]);
 // A layout claiming more than the totals cannot duplicate items; a broken layout is rebuilt from totals.
 assert.equal(saved.inventory.stacks.filter(s=>s.item==='gem:2').length,0,'standard layouts are not written');
 const stale=structuredClone(saved);stale.inventory.stacks.find(s=>s.item==='material:鍛鐵').qty=999;r.ctx.stale=stale;r.run('loadParty(stale)');assert.equal(r.run('state.ore'),1500);assert.equal(r.run('state.ore'),1500);assert.deepEqual(json(r,"sizes('gem:2')"),[10]);audit(r);
 const broken=structuredClone(saved);broken.inventory.stacks.push(broken.inventory.stacks[0]);r.ctx.broken=broken;r.run('loadParty(broken)');assert.equal(r.run('state.ore'),1500);audit(r);
 // Old saves (no layout) load and build stacks from totals.
 const old=structuredClone(saved);delete old.inventory;r.ctx.old=old;r.run('loadParty(old)');assert.deepEqual(json(r,"sizes('material:鍛鐵')"),[999,501]);audit(r);
 // With standard layouts a rolled-back change writes the same bytes as before (custom split layouts are not restored stack by stack).
 r.run('globalThis.b0=JSON.stringify(packParty());globalThis.rs=save;save=()=>false;state.gems[2]-=1;sellMaterial("鍛鐵",1);save=rs;state.gems[2]+=1');assert.equal(r.run('JSON.stringify(packParty())'),r.run('b0'));
 assert.deepEqual(r.errors,[]);
});
test('balance stack limits and per-item overrides apply to new and existing stacks without changing totals',()=>{
 const r=game();r.run('clearStackables();state.ore=1500;state.materials["紅色草"]=50;');
 r.run(`globalThis.doc=exportableBalance();doc.balanceSettings.inventory.stackLimits.enhancementMaterial=400;doc.inventoryIcons.push({id:'material:紅色草x',kind:'material',key:'紅色草x',iconType:'auto'});const row=doc.inventoryIcons.find(x=>x.kind==='material'&&x.key==='紅色草');row.maxStack=20;row.occupiesSlot=false;applyBalanceConfig(doc,{persist:false});`);
 assert.deepEqual(json(r,"sizes('material:鍛鐵')"),[400,400,400,300]);assert.equal(r.run('state.ore'),1500);assert.deepEqual(json(r,"sizes('material:紅色草')"),[20,20,10]);
 assert.equal(r.run("EmberwildItems.definition('material:紅色草').occupiesSlot"),false);assert.equal(r.run('EmberwildItems.slots().tabs.material.used'),4);audit(r);
 r.run("doc.balanceSettings.inventory.stackLimits.equipment=2");assert.throws(()=>r.run('applyBalanceConfig(doc,{persist:false})'),/不可堆疊/);assert.equal(r.run('state.ore'),1500);
 r.run("doc.balanceSettings.inventory.stackLimits.equipment=1;doc.inventoryIcons.find(x=>x.kind==='material'&&x.key==='紅色草').maxStack=0");assert.throws(()=>r.run('applyBalanceConfig(doc,{persist:false})'),/堆疊上限/);
});
test('shop purchase and sale, material sale, failed-save rollbacks and gem sockets keep the store consistent',()=>{
 const r=game();r.run('clearStackables();state.gold=100000;state.materials["蛇鱗"]=1200;');
 r.run("if(typeof shopView==='function')shopView();");const offers=json(r,'(party.market?.offers||[]).filter(o=>!o.sold).map(o=>o.id)');assert(offers.length>0,'market has offers');
 for(const id of offers){r.ctx.oid=id;r.run('buyMarketOffer(oid)');}assert(r.run('party.market.offers.some(o=>o.sold)'));audit(r);
 r.run("state.consumables.imbue_fire=3;sellItem('imbue_fire',1)");assert.equal(r.run('state.consumables.imbue_fire'),2);audit(r);
 r.run('globalThis.realSave=save;save=()=>false;sellMaterial("蛇鱗",300);save=realSave');assert.equal(r.run('state.materials["蛇鱗"]'),1200);assert.deepEqual(json(r,"sizes('material:蛇鱗')"),[999,201]);
 r.run('sellMaterial("蛇鱗",300)');assert.equal(r.run('state.materials["蛇鱗"]'),900);assert.deepEqual(json(r,"sizes('material:蛇鱗')"),[900]);audit(r);
 // Socketing moves one gem from the store into the gear; removing it returns it. Socketed gems are not counted twice.
 r.run(`globalThis.g=findGear(state.equipped[0]);g.skillSockets={version:1,count:2,gems:[null,null]};state.gems[1]=2;`);
 const ok=r.run('socketEquipmentGem(g.id,0,1)');if(ok!==false){assert.equal(r.run('state.gems[1]'),1);assert.deepEqual(json(r,"sizes('gem:1')"),[1]);r.run('socketEquipmentGem(g.id,0,-1)');assert.equal(r.run('state.gems[1]'),2);}
 audit(r);
});
test('battle rewards, salvage, enhancement, mail and quest rewards keep stacks within caps',()=>{
 const r=game();r.run(`clearStackables();state.ore=998;state.dust=998;GAMEPLAY_SETTINGS.drops.entries=GAMEPLAY_SETTINGS.drops.entries.map(x=>({...x,chanceByDifficulty:[1,1,1]}));Math.random=()=>.5;running=true;spawnGroup();for(const e of foes)rewardGroupKill(e);`);
 assert(r.run('state.ore')>998);audit(r);
 r.run(`globalThis.a=fixture('salv-a');state.bag.push(a);salvage('salv-a');`);audit(r);
 r.run(`state.ore=5000;state.dust=5000;state.gold=1e7;state.materials['以太鍛鐵']=50;globalThis.w=findGear(state.equipped[0]);for(let i=0;i<3;i++)enhance(w.id);`);audit(r);
 // Starter-pack style mail with items goes through the existing claim flow.
 const mail=json(r,"party.mailbox.messages.filter(m=>!m.claimed).map(m=>m.id)");for(const id of mail){r.ctx.mid=id;r.run('claimMailboxAttachments(mid)');}audit(r);
 assert.deepEqual(r.errors,[]);
});
test('offline settlement drops land in stacks and survive a reload without duplication',async()=>{
 const r=loadRuntime(root);r.ctx.seed=structuredClone(seed);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();state.ore=990;GAMEPLAY_SETTINGS.drops.entries=GAMEPLAY_SETTINGS.drops.entries.filter(x=>x.type==='ore').map(x=>({...x,chanceByDifficulty:[1,1,1],quantityMin:20,quantityMax:20}));globalThis.rngState=99;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);
 const before=r.run('state.ore+state.dust');r.advance(20*60*1000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);
 assert(r.run('state.ore+state.dust')>before);audit(r);r.run('save()');
 const totals=json(r,'({ore:state.ore,dust:state.dust,gems:[...state.gems],materials:{...state.materials},stacks:EmberwildItems.stacks().map(s=>s.item+"×"+s.qty).sort()})');
 const r2=loadRuntime(root,'index.html',Object.fromEntries(r.values));r2.run('selectSaveSlot(1)');
 assert.deepEqual(json(r2,'({ore:state.ore,dust:state.dust,gems:[...state.gems],materials:{...state.materials},stacks:EmberwildItems.stacks().map(s=>s.item+"×"+s.qty).sort()})'),totals);assert.deepEqual(json(r2,'EmberwildItems.audit()'),[]);
});
