const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
function contracts(){
  const ctx=vm.createContext({});
  for(const file of ['timed-boosts','shop-catalog'])vm.runInContext(fs.readFileSync(path.join(root,'js/items/'+file+'.js'),'utf8'),ctx);
  return {api:ctx.EmberwildTimedBoosts,shop:ctx.EmberwildShopCatalog};
}
const item=(type='ward')=>({id:type+'_fire',name:'測試藥水',type,element:'fire',duration:0,durationMinutes:1.5,effectPercent:type==='ward'?40:55,statEffects:{attack:7}});
test('Elemental durations support fractional real minutes and validate strength separately',()=>{
  const {api}=contracts();
  assert.equal(api.expiryTime(1.5,1000),91000);
  assert.equal(api.expiryTime(.001,1000),1060);
  for(const durationMinutes of [0,-1,NaN,Infinity,1e20])assert.throws(()=>api.validateElementalItem({...item(),durationMinutes}));
  for(const effectPercent of [-1,101,NaN,Infinity])assert.throws(()=>api.validateElementalItem({...item(),effectPercent}));
  api.validateElementalItem({...item(),effectPercent:0});
  api.validateElementalItem({...item('elementTonic'),effectPercent:250});
  assert.throws(()=>api.validateElementalItem({...item(),duration:10}));
});
test('Effects snapshot duration, strength and extra stats, and consume only active exploration at the exact boundary',()=>{
  const {api}=contracts(),source=item(),buff=api.createElementalBuff(source,1000);
  source.statEffects.attack=100;source.effectPercent=90;source.durationMinutes=10;
  assert.equal(buff.statEffects.attack,7);assert.equal(buff.effectPercent,40);assert.equal(buff.durationMinutes,1.5);
  assert.equal(api.remainingMs(buff,91000),90000);const party={members:[{ward:buff}],timedBoosts:[]};api.consume(party,89999);assert.equal(api.remainingMs(buff),1);api.consume(party,1);assert.equal(api.remainingMs(buff),0);assert.equal(buff.enabled,false);
  assert.equal(api.timeText(90000),'01:30');assert.equal(api.timeText(3600000),'01:00:00');
});
test('Old rounds and seconds migrate to real minutes once and preserve custom effects',()=>{
  const {api}=contracts();
  for(const [timeUnits,duration,minutes] of [[{itemDuration:'battleRounds'},15,1.5],[{},90,1.5]]){
    const cfg={timeUnits,items:[{...item(),duration,durationMinutes:undefined,effectPercent:undefined}],balanceSettings:{combat:{pacing:{roundMinimumMs:6000},supply:{wardResistance:.37}}}};
    delete cfg.items[0].durationMinutes;delete cfg.items[0].effectPercent;
    api.migrateElementalConfig(cfg);assert.equal(cfg.items[0].durationMinutes,minutes);assert.equal(cfg.items[0].effectPercent,37);assert.equal(cfg.items[0].duration,0);
    const before=JSON.stringify(cfg);api.migrateElementalConfig(cfg);assert.equal(JSON.stringify(cfg),before);
  }
  const cfg={items:[item('elementTonic')]};api.migrateElementalConfig(cfg);assert.equal(cfg.items[0].durationMinutes,1.5);assert.equal(cfg.items[0].effectPercent,55);
});
test('Old active buffs retain remaining time on migration and never refill on load',()=>{
  const {api}=contracts(),options={item:item(),settings:{combat:{pacing:{roundMinimumMs:6000}}},now:1000};
  const buff=api.migrateElementalBuff({element:'fire',remainingTurns:3,totalTurns:50,until:0,statEffects:{hp:10}},'ward',options);
  assert.equal(buff.remainingMs,18000);assert.equal(buff.durationMinutes,5);assert.equal(buff.effectPercent,40);assert.equal(buff.remainingTurns,undefined);assert.equal(buff.statEffects.hp,10);
  assert.equal(api.migrateElementalBuff(buff,'ward',{...options,now:5000}).remainingMs,18000);
  assert.equal(api.migrateElementalBuff(buff,'ward',{...options,now:20000}).remainingMs,18000);
  assert.equal(api.migrateElementalBuff({element:'fire',until:7000},'ward',options).remainingMs,6000);
  assert.equal(api.migrateElementalBuff({element:'fire',remainingTurns:0,until:0},'ward',options),null);
  assert.throws(()=>api.migrateElementalBuff({...buff,remainingMs:-1},'ward',options));
});
test('Legacy real-time elemental sources recover missing identity and stack with the next matching dose',()=>{
  const {api}=contracts(),source={...item(),durationMinutes:5},legacy={element:'fire',durationMinutes:5,effectPercent:40,remainingMs:300000,enabled:true,until:0,statEffects:{attack:7}};
  const normalized=api.migrateElementalBuff(legacy,'ward',{item:source,now:1000});
  assert.equal(normalized.name,source.name);assert.equal(normalized.itemId,source.id);
  assert.equal(api.remainingMs(normalized),300000);
  const stacked=api.stackBuff([normalized],api.createElementalBuff(source,1000),1000);
  assert.equal(stacked.length,1);assert.equal(stacked[0].remainingMs,600000);
  assert.equal(legacy.name,undefined);assert.equal(legacy.itemId,undefined);
});
test('Default and old shop pools delist all wards and tonics without deleting definitions',()=>{
  const {api,shop}=contracts(),items=[item(),item('elementTonic'),{id:'imbue_fire',type:'imbue'}];
  const defaults=shop.validate(undefined,{items:[...items,...api.DEFAULT_ITEMS]});
  assert.equal(defaults.schemaVersion,3);assert.equal(defaults.fixedOffers.entries.length,3);
  assert.deepEqual(clone(defaults.fixedOffers.entries.map(x=>[x.key,x.enabled])),[['ward_fire',false],['elementTonic_fire',false],['imbue_fire',true]]);
  const cfg={schemaVersion:2,randomOffers:{entries:[{id:'old_ward',type:'item',key:'ward_fire'}]},fixedOffers:{entries:[{id:'old_tonic',type:'item',key:'elementTonic_fire'},{id:'imbue',type:'item',key:'imbue_fire'}]}};
  const migrated=shop.validate(cfg,{items});assert.equal(migrated.randomOffers.entries[0].enabled,false);assert.equal(migrated.fixedOffers.entries[0].enabled,false);assert.equal(migrated.fixedOffers.entries[1].enabled,true);assert.equal(items.length,3);
  migrated.fixedOffers.entries[0].enabled=true;assert.equal(shop.validate(migrated,{items}).fixedOffers.entries[0].enabled,true);
});
test('Explicitly empty current pools stay empty and do not restore reroll products',()=>{
  const {shop}=contracts(),items=[item(),{id:'power_tier_reroll',type:'reroll'}],rerollItem={id:'power_tier_reroll',shopChance:.06,shopPrice:650};
  for(const schemaVersion of [2,3]){
    const out=shop.validate({schemaVersion,randomOffers:{entries:[]},fixedOffers:{entries:[]}},{items,rerollItem});
    assert.deepEqual(clone(out.randomOffers.entries),[]);assert.deepEqual(clone(out.fixedOffers.entries),[]);
  }
});
test('Legacy account timed boosts remain readable during exploration-clock migration',()=>{
  const {api}=contracts(),source=clone(api.DEFAULT_ITEMS.find(x=>x.boostType==='exp'));api.validateItem(source);
  assert.equal(api.bonus({timedBoosts:[{...source,expiresAt:2000}]},'exp',1000),100);
  assert.equal(api.bonus({timedBoosts:[{...source,expiresAt:2000}]},'exp',2000),0);
  assert.throws(()=>api.validateItem({...source,durationMinutes:1.5}));
});
