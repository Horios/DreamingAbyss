/* v0.215 general equipment slimming, weapon/armor bases and class-weighted monster gear pools.
   - 18 general templates: 7 weapons (one per class and weapon type), 3 armors (鐵甲 warrior, 皮衣 archer, 布袍 mage and
     priest), 4 class off-hands, 4 accessories worn by every class.
   - Base differences: weapons (attack, attack speed, spell damage, cooldown, defense), 皮衣／布袍 (lower armor defense),
     皮盾 (defense instead of attack). Every other template has no fixed effect.
   - Monster-exclusive equipment (job group 4), its skills, drops and enhancement bindings are unchanged; BOSS bases keep the
     base percents they read from the old first standard form.
   - Monster gear pools keep their forms and total rate; class gear the player's class can wear weighs 70%, others 10%.
   - Old saves that point at a removed or moved template are migrated idempotently. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),seed=require('../data/balance.json'),root=path.resolve(__dirname,'..');
const D=require('../js/world/drop-rework-model.js');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
const REMOVED=['job0-slot0-form1','job0-slot1-form1','job1-slot0-form1','job1-slot1-form1','job2-slot0-form2','job2-slot1-form1','job3-slot0-form1','job3-slot0-form2','job3-slot1-form0','job3-slot1-form1'];
const ALL=[0,1,2,3];
const SPEC={
 'job0-slot0-form0':{name:'長劍',type:'sword',effects:[]},
 'job0-slot0-form2':{name:'巨斧',type:'axe',effects:[{key:'gearAtkPct',value:10},{key:'attackSpeedPct',value:-10}]},
 'job1-slot0-form0':{name:'木杖',type:'staff',effects:[{key:'skillDamagePct',value:5}]},
 'job1-slot0-form2':{name:'水晶球',type:'grimoire',effects:[{key:'cooldownPct',value:5}]},
 'job2-slot0-form0':{name:'長弓',type:'bow',effects:[{key:'gearAtkPct',value:10},{key:'attackSpeedPct',value:-10}]},
 'job2-slot0-form1':{name:'手弩',type:'crossbow',effects:[{key:'attackSpeedPct',value:10}]},
 'job3-slot0-form0':{name:'權杖',type:'holyStaff',effects:[{key:'defensePct',value:5}]},
 'job0-slot1-form0':{name:'鐵甲',jobs:[0],effects:[]},
 'job1-slot1-form0':{name:'布袍',jobs:[1,3],effects:[{key:'gearDefPct',value:-20}]},
 'job2-slot1-form0':{name:'皮衣',jobs:[2],effects:[{key:'gearDefPct',value:-10}]},
 'job0-slot2-form0':{name:'皮盾',jobs:[0],effects:[],baseStat:'defense'},
 'job1-slot2-form0':{name:'法書',jobs:[1],effects:[]},
 'job2-slot2-form0':{name:'皮箭袋',jobs:[2],effects:[]},
 'job3-slot2-form0':{name:'聖徽',jobs:[3],effects:[]},
 'job0-slot3-form0':{name:'木腕甲',jobs:ALL,effects:[]},
 'job1-slot3-form0':{name:'硬木符印',jobs:ALL,effects:[]},
 'job2-slot3-form0':{name:'木戒指',jobs:ALL,effects:[]},
 'job3-slot3-form0':{name:'手鍊',jobs:ALL,effects:[]}
};
const forms=seed.equipmentForms,general=forms.slice(0,4).flatMap((slots,group)=>slots.flatMap((list,slot)=>list.map((form,index)=>({form,group,slot,index}))));
const effective=f=>(f.fixedEffects||[]).filter(e=>!(e.key==='flatAttack'&&e.value===0));
function game(job=0){
 const r=loadRuntime(root,'index.html',{},undefined,{bareStart:true});r.ctx.seed=structuredClone(seed);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(${job});closeModal();
  globalThis.make=(group,slot,index,tier=3)=>{const g=gear(tier,slot,0,group);g.formJob=group;g.form=index;g.powerTier=5;g.affix=[];g.prefixId='';g.suffixId='';delete g.baseSnapshot;if(slot===0)g.weaponType=itemForm(g).weaponType;g.name=gearName(g);return g;};
  globalThis.wear=(group,index,slot=0)=>{const g=make(group,slot,index);addGear(g);equipGear(g.id);return g;};`);
 return r;
}

test('data: 18 general templates with the given names, wearers and base differences; no removed id anywhere',()=>{
 assert.equal(general.length,18);
 assert.deepEqual([0,1,2,3].map(slot=>general.filter(x=>x.slot===slot).length),[7,3,4,4]);
 for(const {form,slot} of general){
  const want=SPEC[form.id];assert(want,'unexpected template '+form.id);
  assert.equal(form.name,want.name);assert.deepEqual(effective(form),want.effects,form.name);
  if(want.type)assert.equal(form.weaponType,want.type);
  if(want.jobs)assert.deepEqual(form.wearableJobs,want.jobs,form.name);
  assert.equal(form.baseStat,want.baseStat,form.name);
 }
 for(let job=0;job<4;job++)assert.equal(general.filter(x=>x.slot===1&&x.form.wearableJobs.includes(job)).length,1,'one armor per class');
 const types=general.filter(x=>x.slot===0).map(x=>x.group+':'+x.form.weaponType);assert.equal(new Set(types).size,types.length);
 const text=JSON.stringify(seed);for(const id of REMOVED)assert(!text.includes('"'+id+'"'),'removed form still referenced: '+id);
 for(const r of seed.balanceSettings.drops.entries)if(r.type==='monsterGear')for(const p of r.pool){const [,g,s,i]=p.key.split(':').map(Number);assert(forms[g]?.[s]?.[i],'pool form exists: '+r.id+' '+p.key);}
 for(const row of seed.inventoryIcons.filter(x=>x.kind==='equipment'&&/^form:/.test(x.key))){const [,g,s,i]=row.key.split(':').map(Number);assert(forms[g]?.[s]?.[i],'icon form exists: '+row.key);}
 for(const stage of seed.shopSettings.equipmentStages)assert.equal(stage.entries.length,18,stage.id);
});

test('data: monster-exclusive equipment, its skills, drops and enhancement bindings are unchanged',()=>{
 const g4=forms[4];
 assert.deepEqual(g4.map(s=>s.map(f=>f.id)),[['vine-staff'],['gel-armor'],['living-core-talisman','ancient-heart-bracer'],['job4-slot3-form0','wolf-fang-pendant','gel-charm']]);
 assert.deepEqual(g4[0][0].fixedEffects,[{key:'gearAtkPct',value:10}]);
 assert.deepEqual(g4[2][1].fixedEffects,[{key:'flatHp',value:50}]);
 assert.deepEqual(g4[3][1].fixedEffects,[{key:'attackPct',value:2}]);
 assert.deepEqual(g4[3][2].fixedEffects,[{key:'flatHp',value:5}]);
 const rules=Object.fromEntries(seed.skillSystem.equipment.formRules.map(r=>[r.formId,r.skillId]));
 assert.deepEqual(rules,{'gel-armor':'gel-recovery','living-core-talisman':'living-core-renewal','gel-charm':'gel-recovery','wolf-fang-pendant':'wolf-double-bite','vine-staff':'living-core-renewal','ancient-heart-bracer':'ancient-heart-revival'});
 const eq=seed.balanceSettings.drops.entries.filter(r=>r.type==='equipment').map(r=>r.key).sort();
 assert.deepEqual(eq,['form:4:0:0','form:4:0:0','form:4:2:1','form:4:3:1','form:4:3:1','form:4:3:2','form:4:3:2']);
 assert.deepEqual(seed.balanceSettings.equipment.exclusiveEnhance.bindings.filter(b=>b.equipment.startsWith('form:')).map(b=>b.equipment),['form:4:0:0','form:4:1:0','form:4:2:0','form:4:2:1','form:4:3:1','form:4:3:2']);
});

test('runtime: weapon base lines use 攻擊力／攻擊速度 X 次／秒／技能傷害＋／技能冷卻－／防禦力＋',()=>{
 const r=game(0),rows=json(r,`[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1],[3,0]].map(([j,i])=>{const g=make(j,0,i);return {name:g.name,atk:equipmentStatContributions(g).total.atk,lines:weaponBaseLines(g),html:equipmentTotalSummaryHTML(g),summary:equipmentAbilitySummary(g).values};})`);
 const speed=['0.5','0.45','0.377','0.377','0.643','0.786','0.377'],extra=[null,null,'技能傷害＋5%','技能冷卻－5%',null,null,'防禦力＋5%'];
 assert.deepEqual(rows.map(x=>x.name),['長劍','巨斧','木杖','水晶球','長弓','手弩','權杖']);
 rows.forEach((row,i)=>{
  assert.equal(row.lines[0],'攻擊力：'+row.atk,row.name);
  assert.equal(row.lines[1],'攻擊速度：'+speed[i]+' 次／秒',row.name);
  assert.deepEqual(row.lines.slice(2),extra[i]?[extra[i]]:[],row.name);
  assert.match(row.html,/class="equipment-weapon-base"/);
  assert(!row.summary.some(v=>/攻擊速度|技能傷害|技能冷卻/.test(v)),'base values are not repeated in the summary: '+row.name);
 });
 assert.deepEqual(json(r,'weaponBaseLines(make(0,1,0))'),[],'armor has no weapon block');
 assert.deepEqual(r.errors,[]);
});

test('runtime: bases act in combat (attack, attack speed, spell damage, cooldown, defense, armor and shield bases)',()=>{
 let r=game(1);
 const none=json(r,`[__EMBERWILD_MASTERY_DAMAGE.multiplier(state,'fire'),skillCooldown(0)]`);
 r.run('wear(1,0)');assert.equal(r.run(`__EMBERWILD_MASTERY_DAMAGE.multiplier(state,'fire')`),none[0]*1.05,'木杖: spells +5%');
 assert.equal(r.run(`__EMBERWILD_MASTERY_DAMAGE.multiplier(state,'fire',{basic:true})`),1,'basic attacks are not spells');
 assert.equal(r.run('skillCooldown(0)'),none[1]);
 r.run('wear(1,1)');assert.equal(r.run(`__EMBERWILD_MASTERY.currentWeaponType(state)`),'grimoire');
 assert.equal(r.run('skillCooldown(0)'),Math.round(none[1]*.95*1e6)/1e6,'水晶球: cooldown −5%');
 r=game(0);r.run('wear(0,1)');const axe=json(r,'heroAttackSpeedSummary(state)');assert.equal(axe.bonusPct,-10);assert.equal(Number(axe.attacksPerSecond.toFixed(3)),.45);
 r=game(2);r.run('wear(2,1)');assert.equal(json(r,'heroAttackSpeedSummary(state)').bonusPct,10);
 r=game(3);r.run('{const a=make(1,1,0,10);addGear(a);equipGear(a.id);}');const d0=r.run('stats(state).def');r.run('wear(3,0)');
 assert.equal(r.run('stats(state).def'),Math.round(d0*1.05),'權杖: defense +5%');
 r=game(0);
 const base=json(r,`(()=>{const b=g=>{gearStatBreakdown(g);return g.baseSnapshot.base;};return {sword:b(make(0,0,0,6)),axe:b(make(0,0,1,6)),iron:b(make(0,1,0,6)),leather:b(make(2,1,0,6)),robe:b(make(1,1,0,6)),shield:b(make(0,2,0,6)),book:b(make(1,2,0,6))};})()`);
 assert(Math.abs(base.axe.atk/base.sword.atk-1.1)<.05,'巨斧 attack ≈110% of 長劍');
 assert(Math.abs(base.leather.def/base.iron.def-.9)<.06&&Math.abs(base.robe.def/base.iron.def-.8)<.06,'皮衣 90%, 布袍 80% of 鐵甲 defense: '+JSON.stringify(base));
 assert.equal(base.leather.hp,base.iron.hp);assert.equal(base.robe.hp,base.iron.hp);
 assert.equal(base.shield.atk,0);assert.equal(base.shield.def,base.iron.def,'皮盾 defense per tier is the armor defense');assert.equal(base.shield.hp,base.book.hp);
 assert(base.book.atk>0&&base.book.def===0,'other off-hands keep attack');
});

test('runtime: armor and accessory wearers; classes without an armor of their own roll the armor they can wear',()=>{
 const r=game(1);
 assert.deepEqual(json(r,"[0,1,2,3].map(j=>{const g=gear(2,1,0,j);return itemForm(g).name+' '+gearWearableJobsText(g);})"),['鐵甲 戰士','布袍 法師、牧師','皮衣 弓箭手','布袍 法師、牧師']);
 assert.deepEqual(json(r,'[0,1,2,3].map(j=>gearWearableJobsText(make(j,3,0)))'),['全職業','全職業','全職業','全職業']);
 const shop=r.run('equipmentShopView()');assert.match(shop,/全職業 · 飾品/);assert.match(shop,/法師、牧師 · 護甲/);
 assert.deepEqual(r.errors,[]);
});

test('BOSS bases keep the base percents of the old first standard forms',()=>{
 const r=game(0);
 const out=json(r,`[0,1,2,3].map(job=>{const g=bossGear(0,job,0);return {slot:g.slot,raw:g.baseSnapshot?.raw,ver:g.baseRuleVersion};})`);
 for(const g of out)assert(g.raw,'boss gear has a base');
 // The table is fixed in code; any change of the standard forms must leave it alone.
 const src=require('node:fs').readFileSync(path.join(root,'js/equipment/equipment-identity.js'),'utf8');
 assert.match(src,/BOSS_BASE_FORM_PCT=\[\[\{"atk":5\},\{"hp":15,"def":25\},\{"atk":20\},\{"hp":30\}\],\[\{"atk":15\},\{\},\{"atk":15\},\{"hp":10\}\],\[\{"atk":15\},\{"def":10\},\{\},\{"atk":10\}\],\[\{"atk":10\},\{"hp":15\},\{"atk":10\},\{"hp":25\}\]\]/);
});

test('drops: pools keep forms and total; class gear of the player class weighs 70%, others 10%; accessories keep their share',()=>{
 const formOf=ref=>forms[ref.job]?.[ref.slot]?.[ref.index];
 const two=[{key:'form:2:0:0',weight:1},{key:'form:2:1:0',weight:1}];
 assert.deepEqual(D.classWeightedPool(two,{job:2,formOf}).map(p=>p.weight),[1,1],'both archer gear: unchanged for an archer');
 assert.deepEqual(D.classWeightedPool(two,{job:0,formOf}).map(p=>p.weight),[1,1],'both other-class gear: unchanged');
 const mixed=[{key:'form:3:0:0',weight:1},{key:'form:0:1:0',weight:1}];
 const p=D.classWeightedPool(mixed,{job:3,formOf});assert.deepEqual(p.map(x=>x.key),mixed.map(x=>x.key));
 assert.equal(p[0].weight+p[1].weight,2);assert(Math.abs(p[0].weight/(p[0].weight+p[1].weight)-.875)<1e-9,'70:10');
 const robe=D.classWeightedPool([{key:'form:1:1:0',weight:1},{key:'form:0:0:0',weight:1}],{job:3,formOf});assert(robe[0].weight>robe[1].weight,'布袍 counts for a priest');
 const acc=D.classWeightedPool([{key:'form:3:3:0',weight:1},{key:'form:3:0:0',weight:1}],{job:0,formOf});assert.deepEqual(acc.map(x=>x.weight),[1,1],'one class entry and an accessory: unchanged');
 // Runtime: with every rule certain, a mage's drops from a mixed pool favour mage gear about 7:1.
 const r=game(1);
 r.run(`globalThis.seq=7;Math.random=()=>{seq=(Math.imul(seq,1664525)+1013904223)>>>0;return seq/4294967296;};
  GAMEPLAY_SETTINGS.drops.entries=GAMEPLAY_SETTINGS.drops.entries.filter(e=>e.type==='monsterGear'&&e.sources[0]==='map0_mob0'&&e.kinds.includes('normal')).map(e=>({...e,pool:[{key:'form:1:0:0',weight:1},{key:'form:0:0:0',weight:1}],chanceByDifficulty:[1,1,1]}));
  party.map=0;running=true;for(let k=0;k<160;k++){spawnGroup();for(const e of foes)if(e.monsterId==='map0_mob0')rewardGroupKill(e);}`);
 const counts=json(r,'(()=>{const c={mage:0,warrior:0};for(const g of state.bag)if(g.slot===0&&g.boss===undefined){if(g.formJob===1)c.mage++;else if(g.formJob===0)c.warrior++;}return c;})()');
 const share=counts.mage/(counts.mage+counts.warrior);assert(counts.mage+counts.warrior>40,JSON.stringify(counts));assert(share>.8&&share<.95,'mage share '+share);
});

test('saves: old templates migrate to the kept template of the same class, slot and weapon type, idempotently',()=>{
 const r=game(0);
 const out=json(r,`(()=>{const L=[
  {id:'a',slot:0,job:0,formJob:0,form:1,weaponType:'sword'},{id:'b',slot:0,job:0,formJob:0,form:2,weaponType:'axe'},{id:'c',slot:0,job:0,formJob:0,form:1,weaponType:'axe'},
  {id:'d',slot:1,job:2,formJob:2,form:1},{id:'e',slot:0,job:1,formJob:1,form:1,weaponType:'staff'},{id:'f',slot:0,job:1,formJob:1,form:2,weaponType:'grimoire'},
  {id:'g',slot:0,job:2,formJob:2,form:2,weaponType:'bow'},{id:'h',slot:0,job:3,formJob:3,form:2,weaponType:'holyStaff'},{id:'i',slot:3,job:3,formJob:4,form:2},
  {id:'k',slot:2,job:3,formJob:4,form:1},{id:'m',slot:3,job:1,formJob:1,form:0},{id:'n',slot:0,job:2,formJob:2,form:1,weaponType:'crossbow'},
  {id:'o',slot:1,job:3,formJob:3,form:0},{id:'p',slot:1,job:0,formJob:0,form:1},{id:'q',slot:1,job:1,formJob:1,form:1},{id:'w',slot:1,job:0,formJob:0,form:0}];
  migrateSlimEquipmentForms(L,{wearerJob:1,worn:['w']});const once=JSON.stringify(L);migrateSlimEquipmentForms(L,{wearerJob:1,worn:['w']});
  return {same:once===JSON.stringify(L),rows:L.map(g=>g.id+' '+itemForm(g)?.name+' '+(g.weaponType||''))};})()`);
 assert(out.same,'idempotent');
 assert.deepEqual(out.rows,['a 長劍 sword','b 巨斧 axe','c 巨斧 axe','d 皮衣 ','e 木杖 staff','f 水晶球 grimoire','g 長弓 bow','h 權杖 holyStaff','i 凝膠護符 ','k 古木之心護腕 ','m 硬木符印 ','n 手弩 crossbow','o 布袍 ','p 鐵甲 ','q 布袍 ','w 布袍 ']);
 // A full save written with the old layout loads with every general gear on a kept template.
 r.run(`{for(const slot of [0,1,0]){const g=gear(2,slot,0,0);addGear(g);}save();
  const data=JSON.parse(JSON.stringify(packParty())),bag=data.members[0].bag.filter(g=>g.boss===undefined&&g.tokenId===undefined).slice(-3);
  Object.assign(bag[0],{formJob:0,form:2,weaponType:'axe'});Object.assign(bag[1],{formJob:3,form:1});Object.assign(bag[2],{formJob:0,form:1,weaponType:'sword'});
  loadParty(data);}`);
 const names=json(r,'state.bag.filter(g=>!EmberwildTokens.isToken(g)&&g.boss===undefined).map(g=>itemForm(g)?.name)');
 assert(names.includes('巨斧')&&names.includes('長劍')&&names.includes('布袍'),names.join());
 assert(!names.includes(undefined),'no gear without a template after loading');
 assert.deepEqual(r.errors,[]);
});
