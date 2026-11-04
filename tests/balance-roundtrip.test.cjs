const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
const get=(d,p)=>p.split('.').reduce((v,k)=>v[k],d);
const set=(d,p,v)=>{const keys=p.split('.'),key=keys.pop();get(d,keys.join('.'))[key]=v;};
// Skill system v1 projects classes[].skills, supportSkills and passiveDefinitions from skillSystem.definitions.
const def=id=>'skillSystem.definitions.'+require('../data/balance.json').skillSystem.definitions.findIndex(s=>s.id===id);
const fields=[
 ['balance.combat.elementMultipliers.neutral',n=>1+n/100],
 ['classes.0.initialStats.hp',n=>30+n],['classes.0.growthPerLevel.hp',n=>5+n/10],
 [def('job0-core0')+'.power',n=>2+n/10],[def('job0-core0')+'.hitCount',n=>2+n],
 [def('job0-support0')+'.value',n=>.1+n/100],
 ['equipmentForms.0.0.0.fixedEffects.0.value',n=>5+n],
 ['items.0.cost',n=>10+n],['balanceSettings.progression.xpCurve.linear',n=>18+n],
 ['balanceSettings.monsters.encounter.levelLeadInterval',n=>n],
 ['balanceSettings.maps.catalog.0.name',n=>'循環測試地圖'+n],
 ['balanceSettings.monsters.catalog.0.name',n=>'循環測試怪物'+n],
 ['balanceSettings.drops.entries.0.quantityMin',n=>n],
 ['balanceSettings.drops.entries.0.quantityMax',n=>n+3],
 ['balanceSettings.economy.materialPrices.0.sellPrice',n=>n+3],
 ['shopSettings.randomOffers.refreshBaseCost',n=>100+n],
 ['shopSettings.randomOffers.entries.0.unitPrice',n=>12+n],
 ['shopSettings.fixedOffers.entries.0.quantity',n=>n],
 ['starterPacks.0.0.plus',n=>n],
 ['equipmentPowerSystem.prefixes.0.chanceByTier.0',n=>n],
 ['statusDefinitions.0.modifiers.0.value',n=>.1+n/100],
 ['statusDefinitions.0.uses',n=>n],
 ['companions.0.initialStats.hp',n=>47+n],
 ['companions.0.growthPerLevel.pierce',n=>n/10],
 ['companionSettings.activeLimit',n=>6+n],
 [def('partner10-passive1')+'.effects.0.value',n=>10+n],
 ['companionTokens.catalog.0.effects.0.value',n=>2+n],
 ['companionTokens.drop.chanceByDifficulty.0',n=>n/100],
 ['teamSettings.maxPlans',n=>6+n],
 ['uiText.homeDescription',n=>'JSON 循環測試 '+n]
];

test('six cycles: 30 modified balance fields survive editor file import, game file import, save and cold reload',async t=>{
 let e=loadRuntime(editorRoot,'balance-editor.html'),g=loadRuntime(root);
 g.run('selectSaveSlot(1);start(0);closeModal();');
 for(let cycle=1;cycle<=6;cycle++)await t.test('cycle '+cycle,async()=>{
  const d=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');
  for(const [p,value] of fields)set(d,p,value(cycle));
  // The companion's first core skill, edited on its canonical definition (partner10-core7).
  const skill=d.skillSystem.definitions.find(x=>x.adapter?.job===0&&x.adapter.kind==='core'&&x.adapter.index===d.companions[0].core[0]);
  skill.requiredLevel=cycle+1;skill.power=3+cycle/10;
  e.ctx.importText=JSON.stringify(d);
  await e.elements.get('fileInput').onchange({target:{files:[{name:'audit-'+cycle+'.json',text:async()=>e.ctx.importText}],value:'test'}});
  assert.deepEqual(json(e,'validateData()'),[]);
  const exported=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');
  g.ctx.importText=JSON.stringify(exported);
  assert.equal(await g.run('importBalanceJSON({target:{files:[{size:importText.length,text:async()=>importText}],value:"test"}})'),true);
  const effective=json(g,'exportableBalance()');
  for(const [p,value] of fields)assert.deepEqual(get(effective,p),value(cycle),p);
  assert.equal(effective.classes[0].skills[effective.companions[0].core[0]].requiredLevel,cycle+1);
  assert.equal(effective.classes[0].skills[effective.companions[0].core[0]].power,3+cycle/10);
  g.run('save();');
  g=loadRuntime(root,'index.html',Object.fromEntries(g.values));
  const reloaded=json(g,'exportableBalance()');
  for(const [p,value] of fields)assert.deepEqual(get(reloaded,p),value(cycle),'cold reload: '+p);
  assert.equal(g.run('GS("progression.xpCurve.linear")'),18+cycle);
  assert.equal(g.run('materialSellPrice(exportableBalance().balanceSettings.economy.materialPrices[0].key)'),cycle+3);
  assert.deepEqual(g.errors,[]);
  e.ctx.importText=JSON.stringify(reloaded);
  await e.elements.get('fileInput').onchange({target:{files:[{name:'game-export.json',text:async()=>e.ctx.importText}],value:'test'}});
  assert.deepEqual(json(e,'validateData()'),[]);
  for(const [p,value] of fields)assert.deepEqual(get(json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()'),p),value(cycle),'back to editor: '+p);
  assert.deepEqual(e.errors,[]);
 });
});

test('bad JSON and invalid balance changes leave the active settings, save and persisted config intact',async()=>{
 const g=loadRuntime(root);g.run('selectSaveSlot(1);start(0);closeModal();applyBalanceConfig(exportableBalance());save();');
 for(const mutation of [
  'd.classes[0].hp=-1',
  'd.skillSystem.definitions[0].hitCount=1.5',
  'd.companions[1].name=d.companions[0].name',
  'd.balanceSettings.drops.entries[0].sources=["missing-monster"]',
  'd.companionTokens.drop.chanceByDifficulty[0]=2',
  'd.teamSettings.maxPlans=0'
 ]){
  const before=json(g,'({balance:exportableBalance(),save:packParty()})'),stored=Object.fromEntries(g.values);
  g.run('globalThis.d=exportableBalance();'+mutation);g.ctx.importText=JSON.stringify(g.ctx.d);
  assert.equal(await g.run('importBalanceJSON({target:{files:[{size:importText.length,text:async()=>importText}],value:""}})'),false,mutation);
  assert.deepEqual(json(g,'({balance:exportableBalance(),save:packParty()})'),before,mutation);
  assert.deepEqual(Object.fromEntries(g.values),stored,mutation);
 }
 g.ctx.importText='{broken';
 assert.equal(await g.run('importBalanceJSON({target:{files:[{size:importText.length,text:async()=>importText}],value:""}})'),false);
 assert.deepEqual(g.errors,[]);
});
