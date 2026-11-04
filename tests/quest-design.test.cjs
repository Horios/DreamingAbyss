const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
const M=require('../js/world/quest-design-model.js'),json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(time){const r=loadRuntime(root,'index.html',{},time);r.run('selectSaveSlot(1);start(0);closeModal();recruitCompanion(10);closeModal()');return r;}
function apply(r,d){r.ctx.doc=d;assert.notEqual(r.run('applyBalanceConfig(doc)'),false);}
function configure(r,fn){const d=json(r,'exportableBalance()');fn(d.balanceSettings.quests.design,d);apply(r,d);return d;}
function configuredTask(r){return json(r,'playerHero().board.tasks[0]');}
function fill(r,q){r.ctx.task=q;r.run(`for(const o of task.objectives){if(o.type==='material')playerHero().materials[o.key]=o.quantity+7;else if(o.type==='potion')setHealPotionCount(o.key,o.quantity+7);else if(o.type==='item')playerHero().consumables[o.key]=o.quantity+7;}`);}
function diffBoard(r){return r.run('JSON.stringify(playerHero().board)');}

test('game and standalone editor embed the exact same contract and migrate the original stable side IDs',()=>{
 const source=fs.readFileSync(path.join(root,'js/world/quest-design-model.js'),'utf8').trim(),html=fs.readFileSync(path.join(editorRoot,'balance-editor.html'),'utf8');
 assert.equal(html.match(/<script id="quest-design-model-v1">([\s\S]*?)<\/script>/)[1].trim(),source);
 const d=M.defaults({board:{taskBase:12,taskRandomRange:4,goldPerTier:999},side:[{required:9,gold:444,ore:22,gem:3}]});
 assert.deepEqual(d.side.map(q=>q.id),['wolves','witch','stars']);assert.equal(d.side[0].objectives[0].quantity,9);assert.equal(d.side[0].rewards.gold,444);assert.equal(d.daily.entries.length,7);assert.equal(d.daily.version,2);assert.deepEqual(M.issues(d),[]);
});

test('daily pool applies eligibility and weights, freezes resolved objectives and rewards, and survives cold reload',()=>{
 let r=game(Date.parse('2026-10-12T15:59:59Z'));
 configure(r,d=>{const a=M.entry('daily_custom','煉金與採集補給');a.objectives=[M.objective('material','紅色草',3),M.objective('potion','heal_small',2),M.objective('totalKills','',5)];a.rewards={...M.reward(),gold:123,ore:7,dust:4,gemCounts:[1,2,3],materials:[{key:'清水',quantity:2}]};d.daily.entries=[a,{...M.entry('disabled','停用'),enabled:false},{...M.entry('highlevel','等級不足'),minLevel:999},{...M.entry('wrongmap','地圖不符'),mapIndices:[5]}];/* daily claims also draw a random bonus material; pin it to one the test does not count */d.daily.materialRewards=[{key:'小蟲',min:1,max:1}];});
 r.advance(1000);assert.equal(r.run('ensureBoard()'),true);const q=configuredTask(r);assert.equal(q.templateId,'daily_custom');assert.equal(q.rewards.gold,123);assert.equal(q.objectives.length,3);const frozen=diffBoard(r);
 configure(r,d=>{d.daily.entries[0].title='明日的新名稱';d.daily.entries[0].rewards.gold=999;d.daily.entries[0].objectives[0].quantity=9;d.daily.entries[0].objectives[0].quantityMax=9;});assert.equal(diffBoard(r),frozen);
 fill(r,q);r.run('startDailyCommission(playerHero().board.tasks[0].id);playerHero().totalKills=5');const before=json(r,'({gold:state.gold,ore:state.ore,gems:state.gems})');assert.equal(r.run('questReadyCount()'),1);assert.equal(r.run('claimBoard(playerHero().board.tasks[0].id)'),true);assert.equal(r.run('state.gold'),before.gold+123);assert.equal(r.run('state.materials["紅色草"]'),7);assert.equal(r.run("healPotionCount('heal_small')"),7);assert.equal(r.run('state.totalKills'),5);/* gemCounts [1,2,3] reward the first three gem types; the other gem types are unchanged */assert.deepEqual(json(r,'state.gems'),before.gems.map((n,i)=>n+(i<3?i+1:0)));
 const done=diffBoard(r);r.run('save()');r=loadRuntime(root,'index.html',Object.fromEntries(r.values),Date.parse('2026-10-12T16:01:00Z'));r.run('continueFromTitle();closeModal()');assert.equal(diffBoard(r),done);assert.equal(r.run('claimBoard(playerHero().board.tasks[0].id)'),false);assert.equal(r.run('exportableBalance().balanceSettings.quests.design.daily.entries[0].rewards.gold'),999);assert.deepEqual(r.errors,[]);
});

test('no eligible daily task reserves an empty day and cannot be rerolled by maps, imports, or paid legacy actions',()=>{
 const r=game(Date.parse('2026-10-12T02:00:00Z'));configure(r,d=>{d.daily.entries=[{...M.entry('later','次日補給'),minLevel:999}];});r.advance(86400000);r.run('ensureBoard()');assert.equal(r.run('state.board.tasks.length'),0);assert.equal(r.run('validateParty(packParty()).members[0].board.tasks.length'),0);const frozen=diffBoard(r);
 configure(r,d=>{d.daily.entries[0].minLevel=1;});r.run('ensureBoard();buildBoard();refreshBoard();confirmRefresh();claimRepeat();party.map=1;questView()');assert.equal(diffBoard(r),frozen);r.advance(86400000);assert.equal(r.run('ensureBoard()'),true);assert.equal(r.run('state.board.tasks[0].templateId'),'later');assert.deepEqual(r.errors,[]);
});

test('one-time side chains enforce every stock and cumulative objective, share resources with companions, and award XP',()=>{
 const r=game();configure(r,d=>{const q=M.entry('supply_chain','營地的第二封信');q.prerequisites=['wolves'];q.objectives=[M.objective('material','紅色草',3),M.objective('potion','heal_small',2),M.objective('item','imbue_fire',1),M.objective('kill','黏稠凝膠',4),M.objective('totalKills','',5),M.objective('level','',1),M.objective('region',0,1),M.objective('bossKill',0,2),M.objective('eliteKill',-1,3)];/* progression curve v2: LV1 needs 800 EXP, so the reward must exceed it to show a level-up */q.rewards={...M.reward(),gold:77,ore:5,dust:6,xp:1000,randomGems:2,gemCounts:[1,0,0],materials:[{key:'清水',quantity:4}],potions:[{key:'heal_small',quantity:1}],items:[{key:'imbue_fire',quantity:2}],gear:[{quantity:1,tier:1,slot:0,rar:2,job:0,legendaryChance:0}]};d.side.push(q);});
 const q=json(r,'exportableBalance().balanceSettings.quests.design.side.at(-1)');fill(r,q);r.run('state.kills["黏稠凝膠"]=4;state.totalKills=5;party.achievements.bossKills[0]=2;party.achievements.eliteKills[0]=3');assert.equal(r.run("claimQuest('supply_chain')"),false);
 r.run('state.materials["完整狼牙"]=5');assert.equal(r.run("claimQuest('wolves')"),true);const before=json(r,'({gold:state.gold,ore:state.ore,dust:state.dust,bag:state.bag.length,gems:state.gems.reduce((a,b)=>a+b,0),lv:playerHero().lv})');
 r.run('party.selected=memberKey(party.members[1]);state=party.members[1]');assert.equal(r.run("claimQuest('supply_chain')"),true);assert.equal(r.run('state.gold'),before.gold+77);assert.equal(r.run('state.ore'),before.ore+5);assert.equal(r.run('state.dust'),before.dust+6);assert.equal(r.run('state.bag.length'),before.bag+1);assert.equal(r.run('state.materials["紅色草"]'),7);assert.equal(r.run("healPotionCount('heal_small')"),8);assert.equal(r.run('state.consumables.imbue_fire'),9);assert.equal(r.run('state.materials["清水"]'),4);assert.equal(r.run('state.gems.reduce((a,b)=>a+b,0)'),before.gems+3);assert(r.run('playerHero().lv')>before.lv);assert.equal(r.run('party.members[1].lv'),r.run('playerHero().lv'));assert.equal(r.run("claimQuest('supply_chain')"),false);assert(r.run('state.claimed.includes("wolves")'));assert(r.run('state.claimed.includes("supply_chain")'));assert.deepEqual(r.errors,[]);
});

test('failed saves roll back all inventories, XP, companions, team points and claim state without replacing member identities',()=>{
 const r=game();configure(r,d=>{const q=M.entry('atomic','原子交易測試');q.objectives=[M.objective('material','紅色草',2),M.objective('potion','heal_small',1),M.objective('item','imbue_fire',1)];q.rewards={...M.reward(),gold:88,ore:7,dust:5,xp:10000,randomGems:3,materials:[{key:'清水',quantity:5}],potions:[{key:'heal_small',quantity:2}],items:[{key:'imbue_fire',quantity:3}],gear:[{quantity:1,tier:1,slot:0,rar:2,job:0,legendaryChance:0}]};d.side.push(q);});fill(r,json(r,'exportableBalance().balanceSettings.quests.design.side.at(-1)'));
 r.run('globalThis.membersBefore=[...party.members];globalThis.prior=JSON.stringify(packParty());globalThis.oldSave=save;save=()=>false');assert.equal(r.run("claimQuest('atomic')"),false);assert.equal(r.run('JSON.stringify(packParty())'),r.run('prior'));assert(r.run('party.members.every((h,i)=>h===membersBefore[i])'));r.run('save=oldSave');assert.equal(r.run("claimQuest('atomic')"),true);assert.deepEqual(r.errors,[]);
});

test('bad designs and cyclic/missing references fail atomically; snapshots reject unresolved or malformed rewards',()=>{
 const r=game(),baseline=json(r,'exportableBalance()'),saved=r.run('JSON.stringify(packParty())'),stored=Object.fromEntries(r.values);
 for(const change of [d=>d.side[0].id=d.side[1].id,d=>d.side[0].prerequisites=['missing'],d=>{d.side[0].prerequisites=['witch'];d.side[1].prerequisites=['wolves'];},d=>d.daily.entries[0].objectives[0].consume='true',d=>d.side[0].rewards.potions=[{key:'imbue_fire',quantity:1}],d=>d.side[0].rewards.gear=[{quantity:1,tier:1,slot:8,rar:2,job:0,legendaryChance:0}],d=>d.side[0].minLevel=2.2,d=>d.daily.entries[0].weight=0,d=>d.side[0].objectives.push({...d.side[0].objectives[0]})]){
  const doc=structuredClone(baseline);change(doc.balanceSettings.quests.design);r.ctx.bad=doc;assert.throws(()=>r.run('applyBalanceConfig(bad)'),/委託|支線|需求/);assert.deepEqual(json(r,'exportableBalance()'),baseline);assert.equal(r.run('JSON.stringify(packParty())'),saved);assert.deepEqual(Object.fromEntries(r.values),stored);
 }
 for(const mutation of ['q.templateId=undefined','q.rewards.choice="gearOrGems"','q.rewards.goldPerTier=1','q.objectives[0].quantity=0','q.objectives[0].quantityMax+=1','q.objectives[0].type="script"']){r.run('globalThis.badSave=JSON.parse(JSON.stringify(packParty()));globalThis.q=badSave.members[0].board.tasks[0];'+mutation);assert.throws(()=>r.run('loadParty(badSave)'),/委託/);assert.equal(r.run('JSON.stringify(packParty())'),saved);}
 assert.deepEqual(r.errors,[]);
});

test('six designer JSON import/export/reload cycles retain dynamic lists, dependencies, objectives and all reward arrays',async()=>{
 let e=loadRuntime(editorRoot,'balance-editor.html'),g=game();
 for(let cycle=1;cycle<=6;cycle++){
  const d=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()'),quests=d.balanceSettings.quests.design;
  const a=M.entry('custom_daily','每日補給 '+cycle);a.weight=cycle+1;a.minLevel=cycle;a.maxLevel=50;a.mapIndices=[0,1];a.prerequisites=['wolves'];a.objectives=[M.objective('material','紅色草',cycle),M.objective('potion','heal_small',2)];a.objectives[0].quantityMax=cycle+4;a.rewards={...M.reward(),gold:cycle*10,dust:cycle,xp:cycle,gemCounts:[cycle,cycle+1,0],materials:[{key:'小蟲',quantity:cycle}],potions:[{key:'heal_small',quantity:cycle}],items:[{key:'imbue_fire',quantity:cycle}],gear:[{quantity:1,tier:cycle,slot:0,rar:2,job:0,legendaryChance:0}]};
  const s=M.entry('custom_side','支線 '+cycle);s.prerequisites=['wolves'];s.objectives=[M.objective('kill','黏稠凝膠',cycle),M.objective('bossKill',-1,cycle)];s.rewards={...M.reward(),gold:cycle*7,randomGems:cycle};quests.daily.entries=[a];quests.side=[...quests.side.filter(x=>x.id!=='custom_side'),s];
  e.ctx.importText=JSON.stringify(d);await e.elements.get('fileInput').onchange({target:{files:[{name:'quests.json',text:async()=>e.ctx.importText}],value:''}});assert.deepEqual(json(e,'validateData()'),[]);
  const out=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');assert.deepEqual(out.balanceSettings.quests.design,quests);g.ctx.importText=JSON.stringify(out);assert.equal(await g.run('importBalanceJSON({target:{files:[{size:importText.length,text:async()=>importText}],value:""}})'),true);g.run('save()');g=loadRuntime(root,'index.html',Object.fromEntries(g.values));g.run('continueFromTitle();closeModal()');assert.deepEqual(json(g,'exportableBalance().balanceSettings.quests.design'),quests);
  e.ctx.importText=g.run('JSON.stringify(exportableBalance())');await e.elements.get('fileInput').onchange({target:{files:[{name:'game.json',text:async()=>e.ctx.importText}],value:''}});assert.deepEqual(json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport().balanceSettings.quests.design'),quests);assert.deepEqual(g.errors,[]);assert.deepEqual(e.errors,[]);
 }
});

test('weighted pool respects relative weights and permits a zero-entry disabled catalog',()=>{
 const a={weight:1},b={weight:3};assert.equal(M.weighted([a,b],()=>.24),a);assert.equal(M.weighted([a,b],()=>.25),b);assert.equal(M.weighted([],()=>0),null);const d=M.defaults();d.daily.entries=[];d.daily.enabled=false;d.side=[];assert.deepEqual(M.issues(d),[]);
});
