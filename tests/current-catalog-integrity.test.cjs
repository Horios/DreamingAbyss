'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const d=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
test('published materials and daily tasks do not retain retired recipes or unobtainable materials',()=>{
 const gathered=new Set((d.lifeSkills.gathering||[]).flatMap(r=>[r,...(r.bonusDrops||[])].filter(x=>x.outputType==='material').map(x=>x.output)));
 const monsterMaterials=new Set((d.balanceSettings.monsters.catalog||[]).map(x=>x.material).filter(Boolean));
 const crafted=new Set(Object.values(d.lifeSkills.recipes||{}).filter(r=>r.outputType==='material').map(r=>r.output));
 const builtIn=new Set(['鍛鐵','粉塵','以太鍛鐵','光輝碎塊','清水','藥水瓶']);
 const available=new Set([...gathered,...monsterMaterials,...crafted,...builtIn]);
 for(const r of d.balanceSettings.economy.materialPrices||[]){
  if(r.key==='升級卷軸')continue;
  assert(available.has(r.key),'listed material has no current obtaining path: '+r.key);
 }
 for(const r of d.inventoryIcons||[])if(r.kind==='material')assert(available.has(r.key)||[...monsterMaterials].some(k=>r.key==='【困難】'+k||r.key==='【地獄】'+k),'material icon has no source: '+r.key);
 for(const row of d.balanceSettings.quests.design.daily.entries||[])for(const x of row.objectives||[])if(x.type==='material'&&!x.key.startsWith('@'))assert(available.has(x.key),'daily quest requires unobtainable material: '+x.key);
 for(const x of d.balanceSettings.quests.design.daily.materialRewards||[])assert(available.has(x.key),'daily reward contains retired material: '+x.key);
 for(const recipe of Object.values(d.lifeSkills.recipes||{})){
  if(recipe.outputType==='item')assert(d.items.some(item=>item.id===recipe.output),'alchemy output item is missing: '+recipe.output);
  for(const [key,n,type='material'] of recipe.inputs)if(type==='material')assert(available.has(key),'alchemy ingredient is retired: '+key);
 }
});
test('passive definitions represent assigned live skills with matching stable adapter indices',()=>{
 const passives=new Map(d.passiveDefinitions.map((x,i)=>[x.id,i]));
 assert.equal(passives.size,d.passiveDefinitions.length,'duplicate passive');
 const assigned=new Set([...d.companions.flatMap(x=>x.passives||[]),...d.skillSystem.classRules.flatMap(r=>[...r.initial,...r.advanced].map(s=>s.skillId).filter(id=>d.skillSystem.definitions.some(s=>s.id===id&&s.type==='passive')))]);
 for(const id of assigned)assert(passives.has(id),'companion refers to missing passive: '+id);
 for(const id of passives.keys())assert(assigned.has(id),'unassigned retired passive remained: '+id);
 const definitions=d.skillSystem.definitions.filter(x=>x.type==='passive');
 assert.equal(definitions.length,passives.size);
 for(const sk of definitions)assert.equal(sk.adapter.index,passives.get(sk.id),'skill-system passive adapter is stale: '+sk.id);
});
test('equipment and quest skills retain real references',()=>{
 const forms=new Set(d.equipmentForms.flatMap(rows=>rows.flatMap(forms=>forms.map(x=>x.id))));
 const skillIds=new Set(d.skillSystem.definitions.map(x=>x.id));
 for(const row of d.story.gearRewards||[]){assert(forms.has(row.formId),'quest gear form missing: '+row.formId);assert(skillIds.has(row.skillId),'quest equipment skill missing: '+row.skillId);}
 for(const row of d.skillSystem.equipment.pool||[])assert(skillIds.has(row.skillId),'equipment skill missing: '+row.skillId);
 for(const item of d.shopSettings.fixedOffers.entries||[])if(item.type==='item')assert(d.items.some(x=>x.id===item.key),'shop item missing: '+item.key);
});
