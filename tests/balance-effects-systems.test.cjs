'use strict';
// Second part of the "published values take effect" checks (balance editor issue #2, F02-F10): drops, skill MP,
// growth, equipment, economy, maps, commissions, life skills, the wishing lake, story rewards and offline
// settlement. As in balance-effects.test.cjs every case edits the live document and reads what the player meets.
// No balance value in the repository is changed; edits exist only inside the headless game.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

function game(){
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal()');
 const read=code=>JSON.parse(r.run('JSON.stringify('+code+')'));
 const edit=fn=>{r.ctx.__edit=fn;r.run('{const d=exportableBalance();__edit(d);applyBalanceConfig(d,{persist:false});}');};
 return {r,read,edit};
}
const ENEMY='makeEnemy(0,playerHero(),()=>.5)';

test('drops: chance and quantity of a drop rule decide what a kill gives',()=>{
 const g=game(),chances=()=>g.read(`(()=>{const e=${ENEMY};return Object.fromEntries(configuredDropRules(e).map(x=>[x.id,effectiveDropChance(x,e,0)]));})()`);
 const before=chances(),id=Object.keys(before).find(k=>/_material_normal$/.test(k));assert(id,'the first map monster has a material rule');
 g.edit(d=>{d.balanceSettings.drops.entries.find(x=>x.id===id).chanceByDifficulty[0]=before[id]*4;});
 const after=chances();assert.equal(after[id],before[id]*4);for(const k of Object.keys(before))if(k!==id)assert.equal(after[k],before[k],k+' is untouched');
 // A guaranteed drop of three: the kill adds exactly three of the monster's material.
 g.edit(d=>{const rule=d.balanceSettings.drops.entries.find(x=>x.id===id);rule.chanceByDifficulty=[1,1,1];rule.quantityMin=3;rule.quantityMax=3;});
 const gained=g.read(`(()=>{const e=${ENEMY},h=playerHero(),name=configuredDropRules(e).find(x=>x.id===${JSON.stringify(id)}).name,had=h.materials[name]||0;rollConfiguredDrops(e,()=>0.999999);return (h.materials[name]||0)-had;})()`);
 assert.equal(gained,3);
 g.edit(d=>{d.balanceSettings.drops.entries.find(x=>x.id===id).enabled=false;});
 assert.equal(chances()[id],undefined,'a disabled rule no longer applies to the monster');
});

test('skills and growth: MP cost and per-level growth follow the document',()=>{
 const g=game(),mp=g.read('skillManaCost(0)'),at5=()=>g.read('(()=>{const h=playerHero(),lv=h.lv;h.lv=5;const s=stats(h);h.lv=lv;return s;})()'),before=at5();
 g.edit(d=>{d.skillSystem.definitions.find(x=>x.id==='job0-core0').timing.mpCost=mp+3.25;});
 assert.equal(g.read('skillManaCost(0)'),mp+3.25);
 const power=g.read('skillPower(0)');g.edit(d=>{d.skillSystem.definitions.find(x=>x.id==='job0-core0').power*=2;});
 assert.equal(g.read('skillPower(0)'),power*2,'damage multiplier of the first skill');
 g.edit(d=>{d.classes[0].growthPerLevel.hp+=3;});
 const after=at5();assert.equal(after.hp,before.hp+3*4,'four level-ups, three more HP each');assert.equal(after.atk,before.atk);
 const cap=g.read('levelCap()');g.edit(d=>{d.balanceSettings.progression.levelCaps.beforeClear=cap+7;});assert.equal(g.read('levelCap()'),cap+7);
});

test('equipment: base stats, enhancement cost, required level and sell price follow the settings',()=>{
 const g=game(),probe=()=>g.read('(()=>{const x=state.bag[0];return {tier:x.tier,ore:upgradeMaterials(x).ore,sell:equipmentSellPrice(x),required:gearRequiredLevelByTier(3)};})()'),before=probe();
 g.edit(d=>{d.balanceSettings.equipment.enhance.orePerTierPerLevel*=5;});
 assert.equal(probe().ore,before.ore*5,'enhancement ore cost');
 g.edit(d=>{d.balanceSettings.economy.equipmentSellPriceByQuality[0]+=9;});
 assert.equal(probe().sell,before.sell+9,'sell price of a common piece');
 g.edit(d=>{d.balanceSettings.equipment.requiredLevel.perTier+=2;});
 assert.equal(probe().required,before.required+2*2,'required level of a tier 3 piece');
 // Base stats belong to a piece when it is generated: a new starter weapon gets the new value, the old one keeps its snapshot.
 const fresh=game();fresh.edit(d=>{d.balanceSettings.equipment.baseStats.weaponAttackPerTier+=10;});
 const old=fresh.read('gearBaseStats(state.bag[0]).atk');fresh.r.run('selectSaveSlot(2);start(0);closeModal()');
 assert(fresh.read('gearBaseStats(state.bag[0]).atk')>old,'a weapon generated after the change is stronger than one generated before it');
});

test('economy and commissions: material price, shop refresh, life material price and board refresh cost',()=>{
 const g=game(),probe=()=>g.read('({sell:materialSellPrice("鍛鐵"),refresh:currentRefreshCost(),water:lifeMaterialPurchasePrice("清水"),board:boardRefreshCost()})'),before=probe();
 g.edit(d=>{d.balanceSettings.economy.materialPrices.find(x=>x.key==='鍛鐵').sellPrice+=6;});
 g.edit(d=>{d.shopSettings.randomOffers.refreshBaseCost+=250;});
 g.edit(d=>{d.lifeSkills.materialBuyPrices['清水']+=4;});
 g.edit(d=>{d.balanceSettings.quests.board.refreshGoldPerTier+=70;});
 assert.deepEqual(probe(),{sell:before.sell+6,refresh:before.refresh+250,water:before.water+4,board:before.board+70});
});

test('maps, life skills, wishing lake and story: names, level range, gathering period, daily limit and rewards',()=>{
 const g=game(),map=g.read('({name:MAPS[0].name,min:MAPS[0].min,max:MAPS[0].max})');
 g.edit(d=>{const m=d.balanceSettings.maps.catalog[0];m.name='生效測試林地';m.max+=2;});
 assert.deepEqual(g.read('({name:MAPS[0].name,min:MAPS[0].min,max:MAPS[0].max})'),{name:'生效測試林地',min:map.min,max:map.max+2});
 // Gathering: one item per period, so half the period gives twice the items in the same time.
 const gather=period=>{const x=game();if(period)x.edit(d=>{d.lifeSkills.gathering.find(t=>t.id==='herb').periodMs=period;});const base=x.read('__EMBERWILD_LIFE_SKILLS.design.gathering.find(t=>t.id==="herb")');assert.equal(x.r.run('startLifeGathering("herb")'),true);x.r.advance(20000);x.r.run('tickLifeSkills()');return {period:base.periodMs,got:x.read('playerHero().materials')[base.output]||0};};
 const normal=gather(),fast=gather(normal.period/2);assert(normal.got>0);assert.equal(fast.got,normal.got*2);
 const limit=g.read('__EMBERWILD_WISHING_LAKE.design().dailyLimit');g.edit(d=>{d.wishingLake.dailyLimit=limit+2;});
 assert.equal(g.read('__EMBERWILD_WISHING_LAKE.design().dailyLimit'),limit+2);
 const reward=g.read('__EMBERWILD_STORY.design.quests[0].stages[0].rewards.gold');g.edit(d=>{d.story.quests[0].stages[0].rewards.gold+=123;});
 assert.equal(g.read('__EMBERWILD_STORY.design.quests[0].stages[0].rewards.gold'),reward+123,'the running story design carries the edited reward');
});

test('offline settlement uses the same published values as online play',async()=>{
 const {runtime,fixture,replay,json}=require('./offline-fast-validation.cjs');
 const settle=async edit=>{
  // Published data is applied at boot, before a save is loaded; the game refuses a new document while exploring.
  const r=runtime();if(edit){r.ctx.__edit=edit;r.run('{const d=exportableBalance();__edit(d);applyBalanceConfig(d,{persist:false});}');}
  const save=fixture(r,json(r,'packParty()'),'low'),enemy=json(r,'makeEnemy(0,playerHero(),()=>.5).maxhp');
  const full=await replay(r,save,0.25,424242,true),fast=await replay(r,save,0.25,424242,false);
  for(const k of ['kills','xp','gold'])assert.deepEqual(fast[k],full[k],'full and accelerated settlement agree on '+k);
  return {enemy,kills:full.kills,xp:full.xp};
 };
 const normal=await settle(),hard=await settle(d=>{d.balanceSettings.difficulty.modes[0].hp*=5;});
 assert(normal.kills>0,'the fixture fights');assert.equal(hard.enemy,normal.enemy*5,'online spawn');
 // Monsters with five times the HP: fewer kills in the same quarter hour, from an identical save and seed.
 assert(hard.kills<normal.kills,'offline kills '+hard.kills+' < '+normal.kills);
 const rich=await settle(d=>{d.balanceSettings.rewards.xp.base*=3;d.balanceSettings.rewards.xp.perLevel*=3;});
 assert(rich.xp>normal.xp,'offline experience follows the reward settings: '+rich.xp+' > '+normal.xp);
});

test('a document offered while the team is exploring is refused, not applied',()=>{
 const g=game();g.r.run('setExplorationCategory("normal");selectExplorationMap(0);startSelectedExploration()');
 assert.equal(g.read('running'),true);
 const before=g.read('GAMEPLAY_SETTINGS.difficulty.modes[0].hp');
 const out=g.read('(()=>{const d=exportableBalance();d.balanceSettings.difficulty.modes[0].hp*=5;return applyBalanceConfig(d,{persist:false});})()');
 assert.equal(out,false,'the refusal is a false return value, which callers must check');
 assert.equal(g.read('GAMEPLAY_SETTINGS.difficulty.modes[0].hp'),before);
});

test('companions and tokens: a recruited companion follows the document at once; a token keeps the values it was created with',()=>{
 const g=game(),hp=()=>g.read('stats(party.members[1]).hp');
 g.r.run('recruitCompanion(10);closeModal()');assert.equal(g.read('party.members.length'),2);
 const before=hp();g.edit(d=>{d.companions.find(c=>c.id===10).initialStats.hp+=30;});
 assert.equal(hp(),before+30,'the companion already in the team');
 const again=game();again.edit(d=>{d.companions.find(c=>c.id===10).initialStats.hp+=30;});again.r.run('recruitCompanion(10);closeModal()');
 assert.equal(again.read('stats(party.members[1]).hp'),before+30,'a companion recruited after the change');
 // Tokens copy their catalogue entry when they are created (snapshot): new values reach new tokens only.
 const id=g.read('exportableBalance().companionTokens.catalog[0].id'),make=`createCompanionToken(${JSON.stringify(id)})`;
 g.r.run('globalThis.__oldToken='+make);const old=g.read('__oldToken.snapshot.effects[0]');
 g.edit(d=>{d.companionTokens.catalog.find(t=>t.id===id).effects[0].value+=5;});
 assert.equal(g.read(make+'.snapshot.effects[0].value'),old.value+5,'a token created after the change');
 assert.equal(g.read('__oldToken.snapshot.effects[0].value'),old.value,'a token created before the change is not rewritten');
});
