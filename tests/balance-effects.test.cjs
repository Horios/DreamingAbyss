'use strict';
// Published balance values must change what the game does, not only what it exports (balance editor issue #2, F01-F10).
// Each case edits the live document the way a publish would deliver it, then reads the number the player meets:
// a spawned monster, the character's stats, a shop price, a skill cooldown, a title. Restoring the document restores
// every one of them. The complete game runs headless; no browser and no private editor are needed.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const M=require('../js/balance/balance-modules.js');

function game(){
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal()');
 const read=code=>JSON.parse(r.run('JSON.stringify('+code+')'));
 const edit=fn=>{r.ctx.__edit=fn;r.run('{const d=exportableBalance();__edit(d);applyBalanceConfig(d,{persist:false});}');};
 const observe=()=>({
  monster:read('(()=>{const e=makeEnemy(0,playerHero(),()=>.5);return {id:e.monsterId,hp:e.maxhp,atk:e.atk};})()'),
  heroHp:read('stats(playerHero()).hp'),
  itemCost:read('SHOP[0].cost'),
  cooldown:read('skillCooldown(0)'),
  title:read('UI_TEXT.gameTitle')
 });
 return {r,read,edit,observe};
}

test('the game boots from the generated data/balance.json and the modules that produce it',()=>{
 const {read}=game(),file=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
 const {layout,modules}=M.split(file);
 assert.equal(M.serialize(M.assemble(modules,layout)),fs.readFileSync(path.join(root,'data/balance.json'),'utf8'),'modules reassemble to the served file byte for byte');
 const live=read('exportableBalance()');
 for(const [where,pick] of [['monsters',d=>d.balanceSettings.monsters.catalog.map(m=>[m.id,m.hpMultiplier,m.attackMultiplier])],['items',d=>d.items.map(i=>[i.id,i.cost])],['classes',d=>d.classes.map(c=>c.initialStats)],['difficulty',d=>d.balanceSettings.difficulty.modes.map(m=>[m.hp,m.attack,m.defense])]])
  assert.deepEqual(pick(live),pick(file),where+' in the running game equal the published file');
});

test('monsters: difficulty and per-monster multipliers change the monster that spawns',()=>{
 const g=game(),before=g.observe();
 g.edit(d=>{d.balanceSettings.difficulty.modes[0].hp=2;});
 assert.equal(g.observe().monster.hp,before.monster.hp*2,'difficulty HP multiplier');
 g.edit(d=>{d.balanceSettings.difficulty.modes[0].hp=1;for(const m of d.balanceSettings.monsters.catalog)if(m.mapIndex===0&&m.kind==='normal')m.hpMultiplier=(m.hpMultiplier||1)*3;});
 const tripled=g.observe().monster;assert.equal(tripled.id,before.monster.id);assert.equal(tripled.hp,before.monster.hp*3,'monster HP multiplier');assert.equal(tripled.atk,before.monster.atk,'attack is untouched');
 g.edit(d=>{for(const m of d.balanceSettings.monsters.catalog)if(m.mapIndex===0&&m.kind==='normal')m.attackMultiplier=(m.attackMultiplier||1)*2;});
 assert(g.observe().monster.atk>before.monster.atk,'monster attack multiplier');
});

test('classes: initial stats apply to the current character at once, to a new character and after a save reload',()=>{
 const g=game(),before=g.observe().heroHp;
 g.edit(d=>{d.classes[0].initialStats.hp+=20;});
 assert.equal(g.observe().heroHp,before+20,'the existing character reads the class table live');
 g.r.run('save()');
 const saved=Object.fromEntries(g.r.values),again=loadRuntime(root,'index.html',saved);
 again.ctx.__edit=d=>{d.classes[0].initialStats.hp+=20;};again.run('{const d=exportableBalance();__edit(d);applyBalanceConfig(d,{persist:false});}');
 assert.equal(JSON.parse(again.run('JSON.stringify(stats(playerHero()).hp)')),before+20,'the reloaded save shows the same value');
 const fresh=game();fresh.edit(d=>{d.classes[0].initialStats.hp+=20;});fresh.r.run('selectSaveSlot(2);start(0);closeModal()');
 assert.equal(fresh.observe().heroHp,before+20,'a character created after the change starts with it');
});

test('items, skills and interface text: price, cooldown seconds and title follow the document',()=>{
 const g=game(),before=g.observe();
 g.edit(d=>{d.items[0].cost=before.itemCost+111;});
 assert.equal(g.observe().itemCost,before.itemCost+111);
 g.edit(d=>{const s=d.skillSystem.definitions.find(x=>x.id==='job0-core0');s.timing.cooldownSeconds+=7.5;});
 assert.equal(g.observe().cooldown,before.cooldown+7.5,'cooldowns are seconds, with decimals, not rounds');
 g.edit(d=>{d.uiText.gameTitle='生效測試';});
 assert.equal(g.observe().title,'生效測試');
});

test('restoring the previous document restores every observed value',()=>{
 const g=game(),original=g.read('exportableBalance()'),before=g.observe();
 g.edit(d=>{d.balanceSettings.difficulty.modes[0].hp=2;d.classes[0].initialStats.hp+=20;d.items[0].cost+=111;d.uiText.gameTitle='生效測試';d.skillSystem.definitions.find(x=>x.id==='job0-core0').timing.cooldownSeconds+=7.5;});
 assert.notDeepEqual(g.observe(),before);
 g.r.ctx.__original=original;g.r.run('applyBalanceConfig(__original,{persist:false})');
 assert.deepEqual(g.observe(),before);assert.deepEqual(g.read('exportableBalance()'),original,'the live document is the restored one');
});

test('an invalid document is refused as a whole and the running values stay',()=>{
 const g=game(),before=g.observe();
 assert.throws(()=>g.edit(d=>{d.items[0].cost=before.itemCost+5;d.balanceSettings.monsters.catalog[0].mapIndex=999;}));
 assert.deepEqual(g.observe(),before,'no part of the rejected document was applied');
});
