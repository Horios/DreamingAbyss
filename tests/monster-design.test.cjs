const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../js/world/monster-design-model.js'),{loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
test('fixed and random lineups preserve counts, guarantee a BOSS and exclude disabled bosses',()=>{
 const maps=[{mapType:'normal',bossEnabled:true,bossStageMode:'fixed',bossStageRandomCount:3,name:'測試地圖'}],rows=[{id:'a',mapIndex:0,kind:'boss',enabled:true,bossStageCount:1,spawnWeight:1},{id:'b',mapIndex:0,kind:'boss',enabled:true,bossStageCount:1,spawnWeight:3},{id:'c',mapIndex:0,kind:'elite',enabled:false,bossStageCount:2},{id:'d',mapIndex:0,kind:'boss',enabled:false,bossStageCount:20}];
 assert.deepEqual(M.stageIssues(maps,rows),[]);assert.equal(M.stageRows(maps,rows,0).reduce((n,s)=>n+s.count,0),4);maps[0].bossStageMode='random';
 for(const rng of [()=>0,()=>.99999,()=>.35]){const specs=M.stageRows(maps,rows,0,rng);assert.equal(specs.reduce((n,s)=>n+s.count,0),3);assert(specs.some(s=>s.kind==='boss'));assert(!specs.some(s=>s.row.id==='d'));for(const spec of specs)assert(spec.count<=spec.row.bossStageCount);}
 maps[0].bossStageRandomCount=5;assert(M.stageIssues(maps,rows).length);maps[0].bossEnabled=false;assert.deepEqual(M.stageRows(maps,rows,0),[]);
});
test('runtime excludes BOSS variants from roaming, spawns real randomized stage stats and preserves old lineups',()=>{
 const r=loadRuntime(root);r.ctx.doc=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));r.run('applyBalanceConfig(doc,{persist:false});');
 assert.equal(r.run('configuredBossStageRows(0).reduce((n,s)=>n+s.count,0)'),1);
 r.run('const cfg=exportableBalance();const original=cfg.balanceSettings.monsters.catalog.find(m=>m.id==="map0_boss");cfg.balanceSettings.monsters.catalog.push({...structuredClone(original),id:"variant_boss",name:"隨機變體",hpMultiplier:2,attackMultiplier:3,spawnWeight:3,baseStats:{hp:1234,attack:67,defense:8}});cfg.balanceSettings.maps.catalog[0].bossStageMode="random";cfg.balanceSettings.maps.catalog[0].bossStageRandomCount=1;applyBalanceConfig(cfg,{persist:false});');
 assert.equal(r.run('configuredBossStageRows(0,()=>.999).find(s=>s.kind==="boss").row.id'),'variant_boss');
 assert.deepEqual(plain(r.run('EmberwildProgression.baseMonsterStats(GAMEPLAY_SETTINGS,5,"boss",monsterCatalogEntry("variant_boss"))')),{hp:2468,atk:201,def:8});
 assert.equal(r.run('makeBaseEnemy(0,{lv:5},()=>.999).kind'),'normal');assert.equal(r.run('makeBaseEnemy(0,{lv:5},()=>0).kind'),'elite');
 assert(!r.run('Array.from({length:20},()=>makeBaseEnemy(0,{lv:5}).kind)').includes('boss'));
 r.run('start(0);closeModal();party.map=0;state.map=0;bossProgressEntry(0).charges=1;Math.random=()=>.999;startBossChallenge();');
 assert.equal(r.run('foes.length'),1);assert.equal(r.run('foes[0].monsterId'),'variant_boss');assert.equal(r.run('bossProgressEntry(0).charges'),0);assert.equal(r.run('foes[0].kind'),'boss');
 assert.deepEqual(r.errors,[]);
});
test('explicit equipment and token drops grant the selected definition and variant materials use their own keys',()=>{
 const r=loadRuntime(root);r.run('start(0);closeModal();');
 r.ctx.doc=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));r.run('applyBalanceConfig(doc,{persist:false});');
 r.run('grantConfiguredDrop({type:"equipment",key:"form:0:0:1",name:"指定裝備",quantityMin:1,quantityMax:1},{kind:"boss",region:0,difficulty:0},()=>.9);');
 assert.equal(r.run('state.bag.at(-1).form'),1);assert.equal(r.run('state.bag.at(-1).formJob'),0);
 r.run('grantConfiguredDrop({type:"token",key:"berserk",name:"狂戰信物",quantityMin:1,quantityMax:1},{kind:"boss",region:0,difficulty:0},()=>0);');assert.equal(r.run('state.bag.at(-1).tokenId'),'berserk');
 r.run('grantConfiguredDrop({type:"sourceMaterial",quantityMin:1,quantityMax:1},{kind:"boss",mat:"變體專屬素材",region:0,difficulty:1},()=>0);');assert.equal(r.run('state.materials["【困難】變體專屬素材"]'),1);
 assert.deepEqual(r.errors,[]);
});

test('default drop entries survive legacy economy settings without a drops.entries field',()=>{
 const r=loadRuntime(root);
 const shape=plain(r.run('({defaults:GAMEPLAY_SETTINGS_DEFAULTS.drops.entries,normalized:normalizeGameplaySettings({drops:{}}).drops.entries,published:exportableBalance().balanceSettings.drops.entries})'));
 assert(Array.isArray(shape.defaults)&&shape.defaults.length>0,'shipped defaults must include a nonempty drop table');
 assert.deepEqual(shape.normalized,shape.defaults,'legacy settings must inherit every shipped drop entry');
 assert(Array.isArray(shape.published)&&shape.published.length>0,'export must retain a usable drop table');
 assert.deepEqual(r.errors,[]);
});
