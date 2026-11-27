const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),d=require('../data/balance.json'),M=require('../js/items/material-economy-model.js'),{loadRuntime}=require('./headless-runtime.cjs');
function game(){const r=loadRuntime(root);r.ctx.doc=d;r.run('applyBalanceConfig(doc,{persist:false});selectSaveSlot(1);start(0);closeModal()');return r;}
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('every map gives recommended gear level ×20 dust per 720 defeated monsters, and map 0 gives six iron',()=>{
 for(const [i,m] of d.balanceSettings.maps.catalog.entries()){const y=M.expected(d,i);assert(Math.abs(y.dust-m.recommendedGearLevel*20)<1e-9,m.name);for(const rule of d.balanceSettings.drops.entries.filter(x=>x.id.startsWith('base_dust_map'+i+'_')))assert(rule.independent&&rule.chanceByDifficulty.every(x=>x>=0&&x<=1));}
 const legacy={...d,lifeSkills:{obsolete:true}},Document=require('../js/balance/balance-document.js');assert(!Object.hasOwn(Document.migrate(legacy,d),'lifeSkills'));
 const y=M.expected(d,0);assert(Math.abs(y.ore-6)<1e-10);assert.equal(y.eliteShare,.06);
 const edited=structuredClone(d);edited.balanceSettings.maps.catalog[0].recommendedGearLevel=60;edited.balanceSettings.maps.catalog[0].eliteChance=.25;M.calibrateDust(edited);assert(Math.abs(M.expected(edited,0).dust-1200)<1e-8);
});
test('two million seeded per-kill draws agree with theoretical independent material yields',t=>{
 let seed=8913;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),N=2000000,mix=M.killMix(d,0),rules=d.balanceSettings.drops.entries.filter(r=>r.enabled&&r.independent&&(r.type==='ore'||r.type==='material'&&r.key==='粉塵')),totals={dust:0,ore:0};
 for(let i=0;i<N;i++){let t=random(),x=mix.at(-1);for(const m of mix){t-=m.share;if(t<=0){x=m;break;}}for(const r of rules)if(r.sources.includes(x.id)&&r.kinds.includes(x.kind)&&random()<r.chanceByDifficulty[0])totals[r.type==='ore'?'ore':'dust']+=r.quantityMin+Math.floor(random()*(r.quantityMax-r.quantityMin+1));}
 t.diagnostic(JSON.stringify({kills:N,dustPerHour:totals.dust/N*720,orePerHour:totals.ore/N*720}));
 assert(Math.abs(totals.dust/N*720-100)<1.5,JSON.stringify(totals));assert(Math.abs(totals.ore/N*720-6)<.3,JSON.stringify(totals));
});
test('real runtime independent dust and iron survive maxDrops zero, bonus scaling and preserve other rule definitions',()=>{
 const r=game();r.run(`state.dust=0;state.ore=0;globalThis.e=makeEnemy(0,playerHero(),()=>.5);e.kind='normal';monsterCatalogEntry(e.monsterId).maxDrops=0;rollConfiguredDrops(e,()=>0);`);assert(r.run('state.dust>0&&state.ore===1'));assert.equal(r.run('GAMEPLAY_SETTINGS.drops.entries.find(x=>x.id==="base_dust_map0_normal").independent'),true);
 const before=JSON.parse(cp.execFileSync('git',['show','d9fe925:data/balance.json'],{cwd:root,encoding:'utf8',maxBuffer:1<<28}));assert.deepEqual(d.balanceSettings.drops.entries.filter(x=>x.type!=='ore'&&!(x.type==='material'&&x.key==='粉塵')),before.balanceSettings.drops.entries.filter(x=>x.type!=='ore'));assert.deepEqual(d.balanceSettings.equipment.enhance,before.balanceSettings.equipment.enhance);assert.deepEqual(d.balanceSettings.equipment.boss,before.balanceSettings.equipment.boss);
});
test('immediate crafting handles one, batch, max, invalid quantity, cap, rollback and reload; dust cannot be sold',()=>{
 const r=game();r.run('state.dust=1000;state.ore=30');assert.equal(r.run('craftEtherIron(1)'),true);assert.equal(r.run('craftEtherIron(2)'),true);assert.deepEqual(json(r,'[state.dust,state.ore,state.materials["以太鍛鐵"]]'),[700,21,3]);assert.equal(r.run('craftEtherIron(0)'),false);assert.equal(r.run('craftEtherIron(.5)'),false);assert.equal(r.run('craftEtherIron(8)'),false);
 assert.equal(r.run('craftEtherIron(craftingQuote().max)'),true);assert.equal(r.run('state.materials["以太鍛鐵"]'),10);
 r.run('state.dust=200;state.ore=6;globalThis.savedPlayer=playerHero;playerHero=()=>({dust:200,ore:6,materials:{以太鍛鐵:1e9}})');assert.equal(r.run('craftingQuote().max'),0);assert.equal(r.run('craftEtherIron(1)'),false);
 r.run('playerHero=savedPlayer;delete state.materials["以太鍛鐵"];globalThis.originalSave=save;save=()=>false');assert.equal(r.run('craftEtherIron(1)'),false);assert.deepEqual(json(r,'[state.dust,state.ore,Object.hasOwn(state.materials,"以太鍛鐵")]'),[200,6,false]);r.run('save=()=>{throw Error("quota")};');assert.equal(r.run('craftEtherIron(1)'),false);assert.equal(r.run('state.dust'),200);r.run('save=originalSave');assert.equal(r.run('craftEtherIron(2)'),true);
 r.run('state.dust=100;globalThis.goldBefore=state.gold;sellMaterial("粉塵",100)');assert.equal(r.run('state.dust'),100);assert.equal(r.run('state.gold===goldBefore'),true);assert.equal(r.run('__EMBERWILD_CAN_SELL("material","粉塵")'),false);assert.deepEqual(r.errors,[]);
});
test('equipment salvage uses actual equipmentLevel and powerTier, ignores quality and plus; core custom rewards are rejected',()=>{
 const r=game();for(const [level,tier,dust,ore]of [[1,1,10,0],[1,2,10,1],[3,3,30,1],[5,4,50,2],[10,5,100,2],[10,6,100,3],[20,8,200,4],[30,10,300,5]]){r.ctx.params={level,tier};for(const [rar,plus]of [[0,0],[3,12]]){r.ctx.q=rar;r.ctx.p=plus;assert.deepEqual(json(r,'(()=>{const g=gear(1,0,0,0);Object.assign(g,{equipmentLevel:params.level,powerTier:params.tier,rar:q,plus:p});return update12SalvageRewards(g);})()'),{dust,ore});}}
 const bad=structuredClone(d);bad.inventoryIcons.push({kind:'equipment',key:'form:0:0:0',iconType:'auto',salvageRewards:[{type:'dust',quantity:999}]});r.ctx.bad=bad;assert.throws(()=>r.run('EmberwildBalanceDocument.validate(bad)'));
});
test('life runtime, navigation and old state fields are gone, while BOSS craft remains usable',()=>{
 const r=game();assert.equal(r.run('typeof startLifeGathering+":"+typeof startLifeWork+":"+typeof emberwildLifeHeartbeat'),'undefined:undefined:undefined');assert(!JSON.stringify(d).match(/lifeSkills|紅色草|藍色草|紅色草泥|小蟲|藥水瓶|清水/));assert(!fs.existsSync(path.join(root,'js/items/life-skills.js')));
 r.run('globalThis.legacy=JSON.parse(JSON.stringify(packParty()));legacy.members[0].materials["紅色草"]=3;legacy.tutorials.pages.gather=1;legacy.tutorials.pages.alchemy=1;legacy.tutorials.records.gather_basics={completed:true};legacy.story.autoBuy=true;legacy.progressStats.gather=12;legacy.progressStats.alchemy=3;legacy.progressStats.acquired["material:紅色草"]=3;legacy.members[0].board.tasks[0].objectives=[EmberwildQuestDesign.objective("material","紅色草",1)];legacy.members[0].board.tasks[0].templateId="daily_herb";globalThis.keptTask=legacy.members[0].board.tasks[1].id;legacy.members[0].board.tasks[1].started=true;legacy.members[0].board.tasks[1].done=true;loadParty(legacy);ensureBoard()');assert.equal(r.run('materialCount("紅色草")'),0);assert.equal(r.run('state.board.tasks.length'),5);assert.equal(r.run('state.board.tasks.some(q=>!q.done&&q.objectives.some(o=>o.key==="紅色草"))'),false);assert.equal(r.run('state.board.tasks.find(q=>q.id===keptTask)?.done'),true);assert.equal(r.run('Object.hasOwn(packParty().tutorials.pages,"gather")'),false);assert.equal(r.run('Object.hasOwn(packParty().tutorials.records,"gather_basics")'),false);
 assert.equal(r.run('typeof bossCraftView'), 'function');assert(r.run('bossCraftView().includes("BOSS")'));assert.equal(r.run('Object.hasOwn(packParty().story,"autoBuy")'),false);assert.equal(r.run('Object.hasOwn(packParty().progressStats,"alchemy")'),false);
});

test('equipment dust and gem dust have independent stock, uses, sale rules and icons',()=>{
 const r=game();r.run('state.dust=1000;state.gems[0]=2;setMaterialCount("寶石粉塵",0)');assert.equal(r.run('gemUpgradeQuote(0).ok'),false,'equipment dust cannot upgrade gems');
 const before=r.run('state.dust'),q=r.run('salvageGems({0:1})');assert(q&&q.dust>0);assert.equal(r.run('state.dust'),before);assert.equal(r.run('materialCount("寶石粉塵")'),q.dust);
 const cost=r.run('gemUpgradeQuote(0).cost');r.ctx.n=cost;r.run('setMaterialCount("寶石粉塵",n)');assert.equal(r.run('upgradeGemWithDust(0)'),true);assert.equal(r.run('state.dust'),before);assert.equal(r.run('materialCount("寶石粉塵")'),0);
 assert.equal(r.run('__EMBERWILD_CAN_SELL("material","寶石粉塵")'),true);assert.equal(r.run('EmberwildItems.definition("material:粉塵").name'),'粉塵');assert.equal(r.run('EmberwildItems.definition("material:寶石粉塵").name'),'寶石粉塵');assert.notEqual(r.run('inventoryMaterialIcon("粉塵")'),r.run('inventoryMaterialIcon("寶石粉塵")'));assert.deepEqual(r.errors,[]);
});
