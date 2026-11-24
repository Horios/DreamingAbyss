const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),seed=require('../data/balance.json'),root=path.resolve(__dirname,'..');
const D=require('../js/world/drop-rework-model.js');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){
 const r=loadRuntime(root);r.ctx.seed=structuredClone(seed);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();
  globalThis.seq=12345;Math.random=()=>{seq=(Math.imul(seq,1664525)+1013904223)>>>0;return seq/4294967296;};
  globalThis.always=()=>{GAMEPLAY_SETTINGS.drops.entries=GAMEPLAY_SETTINGS.drops.entries.map(x=>({...x,chanceByDifficulty:[1,1,1]}));};
  globalThis.killAt=(map,n)=>{party.map=map;running=true;for(let k=0;k<n;k++){spawnGroup();for(const e of foes)rewardGroupKill(e);}};`);
 return r;
}
const entries=seed.balanceSettings.drops.entries,monsters=seed.balanceSettings.monsters.catalog;

test('data: shared gear, legendary, random gem, potion and dust drops are gone; every monster has its own 1–2 form pool and every map its gem',()=>{
 for(const e of entries){assert(!D.isObsolete(e),'obsolete rule '+e.id);assert.notEqual(e.type,'item','monsters drop no consumables: '+e.id);}
 for(const m of monsters){
  const pools=entries.filter(e=>e.type==='monsterGear'&&e.sources.includes(m.id));
  assert(pools.length>=1,'gear pool for '+m.id);
  for(const p of pools){assert.deepEqual(p.sources,[m.id]);assert(p.pool.length>=1&&p.pool.length<=2);assert.deepEqual(D.ruleIssues(p),[]);}
  // Normal and elite versions share the same forms.
  const keys=new Set(pools.map(p=>JSON.stringify(p.pool.map(x=>x.key))));assert.equal(keys.size,1,m.id);
 }
 const forms=new Set(entries.filter(e=>e.type==='monsterGear').flatMap(e=>e.pool.map(p=>p.key)));
 for(const [job,slots] of seed.equipmentForms.slice(0,4).entries())for(const [slot,list] of slots.entries())for(const i of list.keys())assert(forms.has('form:'+job+':'+slot+':'+i),'general form without a source: '+job+':'+slot+':'+i);
 for(const [mi] of seed.balanceSettings.maps.catalog.entries()){
  const normals=monsters.filter(m=>m.mapIndex===mi&&m.kind==='normal').map(m=>m.id),gems=entries.filter(e=>e.type==='gemPool'&&e.kinds.some(k=>k==='normal'||k==='elite')&&e.sources.some(id=>normals.includes(id)));
  if(normals.length)assert.equal(new Set(gems.flatMap(g=>g.pool.map(p=>p.key))).size,1,'one gem kind on map '+mi);
  const boss=entries.find(e=>e.type==='gemPool'&&e.id==='gem_map'+mi+'_boss');if(boss)assert.equal(boss.pool.length,3);
 }
 const kinds=new Set(entries.filter(e=>e.type==='gemPool').flatMap(e=>e.pool.map(p=>p.key)));assert.deepEqual([...kinds].sort(),['0','1','2','3','4']);
});
test('monsters drop only their own forms, unidentified, plus map gems; no dust; drops are the same instance after identification',()=>{
 const r=game();r.run('globalThis.d0=state.dust;always();killAt(0,25)');
 const out=json(r,`(()=>{const pools=new Map(GAMEPLAY_SETTINGS.drops.entries.filter(e=>e.type==='monsterGear').map(e=>[e.sources[0],e.pool.map(p=>p.key)]));const bag=state.bag.filter(g=>!EmberwildTokens.isToken(g));return {bag:bag.map(g=>({id:g.id,u:g.unidentified,form:'form:'+g.formJob+':'+g.slot+':'+g.form,boss:g.boss})),allowed:[...pools.entries()].filter(([id])=>id.startsWith('map0_')).flatMap(([,k])=>k),gems:[...state.gems],dust:state.dust}})()`);
 assert(out.bag.length>0);assert(out.bag.every(g=>g.u&&g.u.version===1&&Number.isInteger(g.u.slot)&&g.u.source.monsterId),'all monster gear is unidentified');
 const exclusive=new Set(['form:4:0:0','form:4:3:2','form:4:3:1','form:4:2:1']);
 for(const g of out.bag)if(g.boss===undefined&&!exclusive.has(g.form))assert(out.allowed.includes(g.form),'unexpected general form '+g.form);
 assert.equal(out.dust,r.run('d0'),'no dust from monsters');
 assert(out.gems[1]>0,'map 0 gem is 疾風石');for(const i of [0,2,3,4])assert.equal(out.gems[i],0);
 // Hidden before identification: names, journal and detail show only the slot.
 const first=out.bag[0].id;r.ctx.id=first;
 assert.match(r.run('equipmentDisplayName(findGear(id))'),/^未鑑定(武器|護甲|副手|飾品)$/);
 assert.match(r.run('gearSlotHTML(findGear(id),{context:"inventory"})'),/item-unidentified[^]*gear-unidentified-mark/);
 assert.doesNotMatch(r.run('gearSlotHTML(findGear(id),{context:"inventory"})'),/item-quality-|gear-tier-chip/);
 assert(!json(r,'logs.map(l=>l.text)').some(t=>/獲得 (普通|精良|稀有|傳說) /.test(t)&&!/信物/.test(t)),'journal hides quality');
 assert.equal(r.run('eligibleWearers(findGear(id)).length'),0);assert.equal(r.run('canEnhance(findGear(id))'),false);assert.equal(r.run('salvage(id)'),false);assert(r.run('!!findGear(id)'));
 const snap=r.run('JSON.stringify((({unidentified,...g})=>g)(findGear(id)))');
 const slotsBefore=r.run('EmberwildItems.slots().tabs.equipment.used');
 assert.equal(r.run('identifyGear(id).count'),1);assert.equal(r.run('identifyGear(id)'),false);
 assert.equal(r.run('JSON.stringify((({identifiedAt,...g})=>g)(findGear(id)))'),snap,'identification reveals, never rerolls');
 assert.equal(r.run('EmberwildItems.slots().tabs.equipment.used'),slotsBefore);
 const all=json(r,'identifyAllGear()');assert.equal(all.count,out.bag.length-1);assert.equal(r.run('state.bag.filter(g=>g.unidentified).length'),0);
 assert.equal(r.run('identifyAllGear().count'),0);assert.deepEqual(json(r,'EmberwildItems.audit()'),[]);assert.deepEqual(r.errors,[]);
});
test('identification order and reloads never change results; a failed save keeps everything unidentified',()=>{
 const a=game(),b=game();for(const r of [a,b])r.run('always();killAt(0,10)');
 const ids=json(a,'state.bag.filter(g=>g.unidentified).map(g=>g.id)');assert(ids.length>2);
 a.run('identifyAllGear()');b.run('save();loadParty(JSON.parse(JSON.stringify(packParty())));for(const g of [...state.bag].reverse())if(g.unidentified)identifyGear(g.id)');
 const view=r=>json(r,'state.bag.map(g=>{const {identifiedAt,id,acquiredAt,...x}=g;return x;})');assert.deepEqual(view(b),view(a));
 const c=game();c.run('always();killAt(0,5);globalThis.realSave=save;save=()=>false');const n=c.run('state.bag.filter(g=>g.unidentified).length');
 assert.equal(c.run('identifyAllGear()'),null);assert.equal(c.run('state.bag.filter(g=>g.unidentified).length'),n);
});
test('bulk sale and salvage skip unidentified gear; batch selection cannot pick it',()=>{
 const r=game();r.run('always();killAt(0,8);for(const g of state.bag)if(!EmberwildTokens.isToken(g))g.locked=false;');
 const n=r.run('state.bag.filter(g=>g.unidentified).length');assert(n>0);
 r.run('salvageAll()');assert.equal(r.run('state.bag.filter(g=>g.unidentified).length'),n);
 r.run('toggleGearInventoryMulti();selectVisibleGear()');assert(r.run('__EMBERWILD_GEAR_INVENTORY.selection().every(id=>!findGear(id).unidentified)'));
});
test('BOSS gem pool picks from three gems by weight; normal/elite drops follow the map gem on every difficulty',()=>{
 const r=game();r.run('always()');
 for(const mode of [0,1,2]){r.run(`party.difficulty=${mode};state.gems.fill(0);`);r.run('killAt(3,6)');const g=json(r,'[...state.gems]');assert(g[3]>0);}
 const boss=seed.balanceSettings.drops.entries.find(e=>e.id==='gem_map0_boss');const seen=new Set();let s=1;const rng=()=>{s=(s*16807)%2147483647;return s/2147483647;};
 for(let i=0;i<300;i++)seen.add(D.pick(boss.pool,rng).key);assert.deepEqual([...seen].sort(),boss.pool.map(p=>p.key).sort());
});
test('gem dust upgrade: ceil(base × 1.5), one gem of the stack, all or nothing, not above tier 3; dust gem craft is gone',()=>{
 const r=game();assert.equal(r.run('typeof craftGem'),'undefined');assert.doesNotMatch(r.run('accountGemsView()'),/合成隨機寶石/);
 assert.equal(D.gemUpgradeCost({multiplier:1.5,baseDustByTargetTier:[0,10,25]},2),15);assert.equal(D.gemUpgradeCost({multiplier:1.5,baseDustByTargetTier:[0,25,50]},2),38);
 r.run('state.gems.fill(0);state.gems[2]=3;state.dust=71');
 assert.equal(r.run('gemUpgradeQuote(2).cost'),72);assert.equal(r.run('upgradeGemWithDust(2)'),false);assert.equal(r.run('state.gems[2]'),3);assert.equal(r.run('state.dust'),71);
 r.run('state.dust=72');assert.equal(r.run('upgradeGemWithDust(2)'),true);assert.deepEqual([r.run('state.gems[2]'),r.run('state.gems[7]'),r.run('state.dust')],[2,1,0]);
 r.run('state.gems[12]=1;state.dust=99999');assert.equal(r.run('upgradeGemWithDust(12)'),false);assert.equal(r.run('state.gems[12]'),1);
 assert.equal(r.run('gemUpgradeQuote(7).cost'),810);assert.match(r.run('openGemUpgrade(2);$("modal").innerHTML'),/1 階 → 2 階[^]*暴擊率 \+1% → 暴擊率 \+2%/);
 assert.deepEqual(json(r,'EmberwildItems.audit()'),[]);
});
test('exclusive equipment enhancement spends its bound material per attempt; general gear is unchanged; shortage blocks with no deduction',()=>{
 const r=game();r.run(`globalThis.mk=(job,slot,form)=>{const g=gear(1,slot,0,job===4?0:job);g.formJob=job;g.form=form;g.name=gearName(g);state.bag.push(g);return g;};
  globalThis.staff=mk(4,0,0);globalThis.plain=mk(0,0,0);state.dust=100;state.ore=100;state.gold=1e6;state.materials['活性樹芯']=0;`);
 assert.deepEqual(json(r,'upgradeMaterials(staff).exclusive'),{material:'活性樹芯',monster:'map0_mob2',quantity:1});assert.equal(r.run('upgradeMaterials(plain).exclusive===undefined'),true);
 assert.equal(r.run('canEnhance(staff)'),false);assert.equal(r.run('enhance(staff.id)'),false);assert.equal(r.run('state.dust'),100);
 assert.match(r.run('itemCostHTML(staff)'),/活性樹芯[^]*本次需要 1，持有 0[^]*迷路樹精/);
 r.run("state.materials['活性樹芯']=5;Math.random=()=>0");assert.equal(r.run('enhance(staff.id)'),'success');assert.equal(r.run("state.materials['活性樹芯']"),4);
 r.run('globalThis.realSave=save;save=()=>false');assert.equal(r.run('enhance(staff.id)'),false);assert.equal(r.run("state.materials['活性樹芯']"),4);r.run('save=realSave');
 const boss=json(r,`(()=>{const g=bossGear(0,0,0);return upgradeMaterials(g).exclusive})()`);assert.equal(boss.material,'古木年輪');
});
test('old balance documents load: obsolete drop rules are removed before validation and never granted',()=>{
 const r=game();r.run(`globalThis.d=exportableBalance();d.balanceSettings.drops.entries.push({id:'gear_normal',name:'一般裝備',enabled:true,type:'gear',key:'',kinds:['normal'],chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1,sources:['map0_mob0']},{id:'gem_normal',name:'隨機',enabled:true,type:'gem',key:'random',kinds:['normal'],chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1,sources:['map0_mob0']},{id:'potion_all',name:'藥水',enabled:true,type:'potion',key:'',kinds:['normal'],chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1,sources:['map0_mob0']});applyBalanceConfig(d,{persist:false});`);
 assert.equal(r.run("GAMEPLAY_SETTINGS.drops.entries.some(x=>['gear','potion'].includes(x.type)||x.key==='random')"),false);
 r.run(`d.balanceSettings.drops.entries.push({id:'bad_pool',name:'x',enabled:true,type:'monsterGear',key:'',kinds:['normal'],chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1,sources:['map0_mob0'],pool:[{key:'form:0:0:0',weight:1},{key:'form:0:1:0',weight:1},{key:'form:0:2:0',weight:1}]})`);
 assert.throws(()=>r.run('applyBalanceConfig(d,{persist:false})'),/1～2 種/);
});
test('new characters receive no gear; the prologue still hands over the starter weapon and the charm',()=>{
 const r=game();assert.equal(r.run('state.bag.length'),0);assert.deepEqual(json(r,'state.equipped'),[null,null,null,null,null]);assert.equal(r.run('party.mailbox.messages.filter(m=>/新手禮包/.test(m.subject)).length'),0);
 assert.equal(r.run('typeof sendStarterPackMail'),'undefined');
 const rows=json(r,'__EMBERWILD_STARTER_PACK.rows(0).map(x=>({type:x.type,starter:!!x.gear?.starterPack}))');assert.equal(rows[0].type,'gear');assert(rows[0].starter);
});
