'use strict';
/* v0.180 enhancement: the balance table (balanceSettings.equipment.enhance.levels) sets each target level's cost, success
   rate, failure result and cumulative bonus to the item's base stats; costs × ceil(裝等 / 5); accessories cannot be
   enhanced; a failed +11/+12 destroys the item (worn or not) after a confirmation. 鍛鐵 and 粉塵 swapped drop sources
   and salvage amounts. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
function game(){
 const r=loadRuntime(root);r.prompts=[];r.ctx.confirm=m=>{r.prompts.push(m);return r.answer??true;};
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);state.dust=1e6;state.ore=1e6;state.materials['以太鍛鐵']=1e6;
  globalThis.roll=0;Math.random=()=>roll;
  globalThis.weapon=()=>{const g=gear(1,0,0,0);g.equipmentLevel=1;addGear(g);return g.id;};`);
 return r;
}
const E='__EMBERWILD_ENHANCE';
test('the table comes from the balance data and matches the design',()=>{
 const r=game(),t=json(r,`${E}.table`);
 assert.equal(t.length,12);assert.equal(r.run(`${E}.max`),12);
 assert.deepEqual(t.map(x=>x.rate),[1,1,1,.9,.8,.7,.6,.5,.4,.3,.2,.1]);
 assert.deepEqual(t.map(x=>x.fail),[null,null,null,2,3,4,3,3,0,0,'destroy','destroy']);
 assert.deepEqual(t.map(x=>x.bonus),[.05,.10,.15,.22,.30,.40,.55,.75,1,1.3,1.6,1.9]);
 assert.deepEqual(t.map(x=>x.cost),[{dust:2,ore:0,ether:0},{dust:4,ore:0,ether:0},{dust:6,ore:0,ether:0},{dust:8,ore:0,ether:0},{dust:0,ore:2,ether:0},{dust:0,ore:3,ether:0},{dust:0,ore:4,ether:0},{dust:0,ore:5,ether:0},{dust:0,ore:6,ether:0},{dust:0,ore:0,ether:1},{dust:0,ore:0,ether:2},{dust:0,ore:0,ether:3}]);
 // An edited table is used; an invalid one is refused before it changes anything.
 r.run(`{const d=exportableBalance();d.balanceSettings.equipment.enhance.levels[0].successRate=.5;d.balanceSettings.equipment.enhance.levels[0].failure='drop';d.balanceSettings.equipment.enhance.levels[0].failureLevel=0;applyBalanceConfig(d,{persist:false});}`);
 assert.equal(json(r,`${E}.row(1).rate`),.5);
 assert.throws(()=>r.run(`{const d=exportableBalance();d.balanceSettings.equipment.enhance.levels[5].failureLevel=9;applyBalanceConfig(d,{persist:false});}`),/失敗後的等級/);
 assert.throws(()=>r.run(`{const d=exportableBalance();d.balanceSettings.equipment.enhance.levels[3].successRate=1.5;applyBalanceConfig(d,{persist:false});}`),/成功率/);
 assert.equal(json(r,`${E}.row(1).rate`),.5,'the refused document changed nothing');
 assert.deepEqual(r.errors,[]);
});
test('costs scale with item level; every attempt spends materials; failures follow the table',()=>{
 const r=game();const id=r.run('weapon()');
 const cost=lv=>json(r,`(()=>{const g=findGear('${id}');g.equipmentLevel=${lv};const c=upgradeMaterials(g);g.equipmentLevel=1;return c;})()`);
 assert.deepEqual(cost(1),{ore:0,dust:2,ether:0});assert.deepEqual(cost(5),{ore:0,dust:2,ether:0});assert.deepEqual(cost(6),{ore:0,dust:4,ether:0});assert.deepEqual(cost(11),{ore:0,dust:6,ether:0});
 // +1..+3 always succeed.
 r.run(`roll=.999;for(let i=0;i<3;i++)enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),3);
 // +4 at 90%: a roll of .95 fails and drops to +2, spending the 粉塵 anyway.
 const before=r.run('state.dust');r.run(`roll=.95;enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),2);assert.equal(r.run('state.dust'),before-8);
 r.run(`roll=0;enhance('${id}');enhance('${id}');enhance('${id}');enhance('${id}');enhance('${id}');enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),8);
 r.run(`roll=.99;enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),0,'+9 failure goes back to +0');
 r.run(`roll=0;for(let i=0;i<9;i++)enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),9);
 r.run(`roll=.99;enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),0,'+10 failure goes back to +0');
 assert.deepEqual(r.errors,[]);
});
test('+11/+12 failures destroy the item, worn or not, after a warning; declining spends nothing',()=>{
 const r=game();const id=r.run('weapon()');
 r.run(`roll=0;for(let i=0;i<10;i++)enhance('${id}');previewEquip('${id}',memberKey(playerHero()),0);if($('modal').open)confirmEquipComparison('${id}',memberKey(playerHero()),0);closeModal();`);
 assert.equal(r.run(`findGear('${id}').plus`),10);assert.equal(r.run(`playerHero().equipped[0]`),id,'worn');
 r.answer=false;const ether=r.run("state.materials['以太鍛鐵']");r.run(`roll=.99;enhance('${id}')`);
 assert.equal(r.prompts.length,1);assert.match(r.prompts[0],/損毀/);assert.match(r.prompts[0],/穿戴中/);
 assert.equal(r.run(`findGear('${id}').plus`),10,'declined: nothing happens');assert.equal(r.run("state.materials['以太鍛鐵']"),ether);
 r.answer=true;r.run(`roll=.99;enhance('${id}')`);
 assert.equal(r.run(`!!findGear('${id}')`),false,'destroyed');assert.equal(r.run('playerHero().equipped[0]'),null,'unequipped');assert.equal(r.run("state.materials['以太鍛鐵']"),ether-2);
 // The save holds the result.
 r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');assert.equal(r.run(`!!findGear('${id}')`),false);
 assert.deepEqual(r.errors,[]);
});
test('accessories cannot be enhanced; existing base stats take the larger of percentage and minimum gains',()=>{
 const r=game();
 const acc=r.run(`(()=>{const g=gear(1,3,0,0);addGear(g);return g.id;})()`);
 assert.equal(r.run(`canEnhance(findGear('${acc}'))`),false);r.run(`enhance('${acc}')`);assert.equal(r.run(`findGear('${acc}').plus`),0);
 assert.match(r.run(`${E}.controlsHTML(findGear('${acc}'))`),/飾品無法強化/);
 const id=r.run('weapon()'),base=json(r,`gearBaseStats(findGear('${id}'))`);
 r.run(`roll=0;for(let i=0;i<9;i++)enhance('${id}')`);const at9=json(r,`gearBaseStats(findGear('${id}'))`);
 const cfg=json(r,'GAMEPLAY_SETTINGS.equipment.enhance');
 for(const k of ['atk','hp','def'])assert.equal(at9[k],base[k]>0?base[k]+Math.max(base[k],Math.round(9*cfg.flatStatsPerLevel[k])):0,k+' takes the greater gain at +9');
 assert.deepEqual(r.errors,[]);
});
test('鍛鐵 and 粉塵 swapped drop sources and salvage amounts',()=>{
 const r=game();
 assert.deepEqual(json(r,"exportableBalance().balanceSettings.drops.entries.filter(e=>/^cultivation_dust_/.test(e.id)).map(e=>[e.type,e.name])"),[['ore','鍛鐵'],['ore','鍛鐵']],'the rules that dropped 粉塵 drop 鍛鐵');
 // v0.206: monsters no longer give 粉塵 (the former per-kill base material is removed).
 r.run("state.ore=0;state.dust=0;roll=0;globalThis.e=makeEnemy(0,playerHero(),()=>.5);e.kind='normal';rollEnemyItemLoot(e)");
 assert.equal(r.run('state.dust'),0,'no per-kill 粉塵');
 // Salvage: the larger tier amount is 粉塵.
 const plan=json(r,"(()=>{const g=gear(3,0,1,0);return salvageRewardPlan(g);})()");
 const ore=plan.find(x=>x.type==='ore').quantity,dust=plan.find(x=>x.type==='dust').quantity;assert(dust>ore,'粉塵 '+dust+' > 鍛鐵 '+ore);
 assert.deepEqual(r.errors,[]);
});
test('鍛鐵 rules keep their rates; v0.206 removed the per-kill 粉塵 and its settings',()=>{
 const r=game();
 assert.equal(r.run('GAMEPLAY_SETTINGS.rewards.ore===undefined'),true);
 assert.deepEqual(json(r,"exportableBalance().balanceSettings.drops.entries.filter(e=>/^cultivation_dust_/.test(e.id)).map(e=>e.chanceByDifficulty)"),[[0.0063,0.0091,0.0112],[0.049,0.063,0.077]]);
 r.run("state.dust=0;for(const roll of [0,.5,.99]){const e=makeEnemy(0,playerHero(),()=>.5);e.kind='elite';Math.random=()=>roll;rollEnemyItemLoot(e);}");assert.equal(r.run('state.dust'),0);
 assert.deepEqual(r.errors,[]);
});
test('the offline receipt lists enhancement materials apart from the region materials',async()=>{
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(0);closeModal();globalThis.rngState=7;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);
 r.advance(2*3600000);await r.run('EmberwildOffline.settle()');
 const html=r.run("document.getElementById('offline-settlement').innerHTML"),items=json(r,'party.offlineExploration.receipt.items');
 const enh=Object.keys(items).filter(k=>/^material:(鍛鐵|粉塵|以太鍛鐵)$/.test(k)&&items[k]>0),region=Object.keys(items).filter(k=>k.startsWith('material:')&&!enh.includes(k)&&items[k]>0);
 assert(enh.length>0,'the run gained 鍛鐵 or 粉塵: '+JSON.stringify(items));assert(region.length>0,'and region materials');
 assert.match(html,/<h3>強化素材<\/h3>/);assert.match(html,/<h3>地區素材<\/h3>/);assert.doesNotMatch(html,/素材收益/);
 const part=html.split('<h3>地區素材</h3>')[0].split('<h3>強化素材</h3>')[1];
 for(const k of enh)assert(part.includes('data-item-key="'+k.slice(9)+'"'),k+' is in 強化素材');for(const k of region)assert(!part.includes('data-item-key="'+k.slice(9)+'"'),k+' is not');
 assert.deepEqual(r.errors,[]);
});
