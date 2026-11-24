'use strict';
/* v0.181: elites appear half as often (12% → 6%) and are 30% stronger (HP ×2.08, attack ×1.56, defense ×1.43); high-rarity
   gear (rare roll, legendary drops) and gems drop 10% more often. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
const near=(a,b,m)=>assert(Math.abs(a-b)<1e-9,m+': '+a+' ≠ '+b);
test('the published balance carries the v0.181 elite and drop rates',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);');
 const d=json(r,'exportableBalance()'),bs=d.balanceSettings;
 const k=bs.monsters.kindMultipliers;near(k.eliteHp,2.08,'eliteHp');near(k.eliteAttack,1.56,'eliteAttack');near(k.eliteDefense,1.43,'eliteDefense');
 const chances=JSON.stringify(d).match(/"eliteChance":[0-9.]+/g).map(x=>Number(x.split(':')[1]));
 assert(chances.length>=20);assert(chances.every(c=>c===0||c===.06),JSON.stringify([...new Set(chances)]));
 near(bs.rewards.equipment?.rareChance??JSON.parse(JSON.stringify(bs.rewards).match(/"rareChance":([0-9.]+)/)[1]),0.242,'rareChance');
 const drop=id=>bs.drops.entries.find(e=>e.id===id).chanceByDifficulty;
 // v0.206: the shared legendary and random gem pools are gone; the map gem pools keep the former gem rates.
 for(const id of ['gear_legendary','gear_legendary_normal','gear_legendary_elite','gem_normal','gem_elite','gem_boss'])assert(!bs.drops.entries.some(e=>e.id===id),id);
 assert.deepEqual(drop('gem_map0_normal'),[0.033,0.066,0.11]);assert.deepEqual(drop('gem_map0_elite'),[0.099,0.187,0.297]);assert.deepEqual(drop('gem_map0_boss'),[0.297,0.44,0.605]);
 assert.deepEqual(bs.difficulty.modes.map(m=>m.legendaryGearChance),[0.00066,0.00176,0.00352]);assert.deepEqual(bs.difficulty.modes[0].gemChance,[0.044,0.132,0.385]);
 assert.deepEqual(r.errors,[]);
});
