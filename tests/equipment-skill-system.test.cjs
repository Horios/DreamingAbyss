const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
function game(){const r=loadRuntime(path.resolve(__dirname,'..'));r.run(`selectSaveSlot(1);start(1);closeModal();setClassMasteryLevel(24);state.mastery.fire=100000;state.gems=Array(15).fill(5);const doc=exportableBalance();
 for(const id of ['job1-core0','job1-core6','job1-core7']){
  const sk=doc.skillSystem.definitions.find(s=>s.id===id);sk.sources=[{type:'equipment'}];sk.requiredLevel=1;sk.weaponTypes=[];sk.requiredMastery=null;sk.unlockConditions=EmberwildSkillSystem.emptyConditions();
 }
 applyBalanceConfig(doc,{persist:false});globalThis.makeSkillGear=(id,slot,skill)=>{const g=gear(3,slot,0,1);g.id=id;g.skillId=skill;g.skillSockets={version:1,count:3,gems:[0,0,0]};addGear(g);state.equipped[slot]=id;return g;};globalThis.a=makeSkillGear('a',0,'job1-core0');globalThis.b=makeSkillGear('b',1,'job1-core6');save();`);return r;}
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('equipment actives use the class slots, including a full equipment-only loadout',()=>{
 const r=game();
 assert.equal(r.run("configureSkill('active',0,'job1-core0')"),true);
 assert.equal(r.run("configureSkill('active',1,'job1-core6')"),true);
 assert.equal(r.run("configureSkill('active',2,'class1-initial0')"),true);
 assert.equal(r.run("configureSkill('active',2,'job1-core7')"),false);
 r.run("makeSkillGear('c',2,'job1-core7');save()");
 assert.equal(r.run("configureSkill('active',2,'job1-core7')"),true);
 assert.equal(r.run("configureSkill('active',3,'class1-initial0')"),false);
 assert.deepEqual(json(r,'state.skillLoadout.active'),['job1-core0','job1-core6','job1-core7']);
 r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');
 assert.deepEqual(json(r,'state.skillLoadout.active'),['job1-core0','job1-core6','job1-core7']);
 assert.deepEqual(r.errors,[]);
});
test('same skill from two items stays configured until the last source is removed',()=>{
 const r=game();
 r.run("makeSkillGear('duplicate',2,'job1-core0');save();configureSkill('active',0,'job1-core0')");
 r.run("unequipSharedGear('a')");
 assert.equal(r.run('state.skillLoadout.active[0]'),'job1-core0');
 r.run("unequipSharedGear('duplicate')");
 assert.equal(r.run('state.skillLoadout.active[0]'),null);
 assert.equal(r.run("configureSkill('active',0,'job1-core0')"),false);
});
test('first socket applies an attribute bonus even with a configured skill; replacing and removing refunds it',()=>{
 const r=game(),atk=r.run('stats(state).atk'),gold=r.run('state.gold'),gems=r.run('state.gems[0]');
 assert.equal(r.run("configureSkill('active',0,'job1-core0')"),true);
 assert.equal(r.run('stats(state).atk'),atk);
 assert.equal(r.run('socketEquipmentGem("a",0,1)'),true);
 assert.equal(r.run('stats(state).atk'),atk-2);
 assert.equal(r.run('state.gems[0]'),gems+1);
 assert.equal(r.run('socketEquipmentGem("a",0,-1)'),true);
 assert.equal(r.run('state.gold'),gold);
});
test('sale/salvage refunds every socket exactly once and storage failure rolls the entire transaction back',()=>{
 const r=game();r.run('state.equipped[0]=null;save()');const n=r.run('state.gems[0]');assert.equal(r.run('sellGear("a")'),true);assert.equal(r.run('state.gems[0]'),n+3);assert.equal(r.run('sellGear("a")'),false);r.run('state.equipped[1]=null;save();globalThis.realSave=save;save=()=>false');assert.equal(r.run('sellGear("b")'),false);assert.equal(r.run('!!findGear("b")'),true);assert.equal(r.run('state.gems[0]'),n+3);r.run('save=realSave');assert.equal(r.run('salvage("b")'),true);assert(r.run('state.gems[0]')>=n+6);
});
test('ordinary drops stay attribute-only and explicit drops resolve fixed skills from the final form',()=>{
 const r=game();
 r.run(`{
  const doc=exportableBalance(),forms=doc.equipmentForms[1][0],key='form:1:0:'+forms.length;
  forms.push({...forms[0],id:'test-exclusive-form',name:'測試專屬裝備'});
  doc.skillSystem.equipment.formRules.push({formId:'test-exclusive-form',skillId:'job1-core0',dropOnly:true});
  doc.balanceSettings.drops.entries.push({id:'test-exclusive-drop',name:'測試專屬裝備',type:'equipment',key,enabled:true,kinds:['normal'],chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1,sources:['map0_mob0']});
  applyBalanceConfig(doc,{persist:false});
  Math.random=()=>.99;
  const foe={region:0,lv:25,difficulty:2,kind:'normal',monsterId:'map0_mob0'};
  grantConfiguredDrop({type:'gear',quantityMin:1,quantityMax:1,name:'一般掉落'},foe,()=>0);
  globalThis.ordinary=state.bag.at(-1).skillId;
  globalThis.inWrongPool=configuredDropRules({...foe,monsterId:'map0_mob1'}).some(r=>r.id==='test-exclusive-drop');
  rollConfiguredDrops(foe,()=>.5);
 }`);
 const exclusive="state.bag.find(g=>itemForm(g)?.id==='test-exclusive-form')";
 assert.equal(r.run('ordinary'),undefined);
 assert.equal(r.run('inWrongPool'),false);
 assert.equal(r.run(exclusive+'.skillId'),'job1-core0');
 const before=json(r,exclusive+'.skillSockets');
 r.run('save();loadParty(packParty())');
 assert.deepEqual(json(r,exclusive+'.skillSockets'),before);
});
test('the three forest monsters grant complete exclusive gear and a mage casts all three shared skills',()=>{
 const r=loadRuntime(path.resolve(__dirname,'..'));
 const result=json(r,`(()=>{
  selectSaveSlot(1);start(1);closeModal();
  const ids=['gel-guard','wolf-double-bite','living-core-renewal'];
  const wanted=[];
  for(const [i,id] of ids.entries()){
   const foe={region:0,lv:1,difficulty:0,kind:'normal',monsterId:'map0_mob'+i,mat:['黏稠凝膠','完整狼牙','活性樹芯'][i]};
   const rules=configuredDropRules(foe).filter(r=>r.type==='equipment');
   if(rules.length!==1)throw Error('Unexpected exclusive drop count');
   const elite=configuredDropRules({...foe,kind:'elite'}).filter(r=>r.type==='equipment');
   if(elite.length!==1)throw Error('Unexpected elite exclusive drop count');
   wanted.push([rules[0].chanceByDifficulty,elite[0].chanceByDifficulty]);
   grantConfiguredDrop(rules[0],foe,()=>.99);
   const item=state.bag.find(g=>g.skillId===id);
   if(!item||gearWearableJobs(item).length!==4)throw Error('Exclusive equipment missing or class-locked: '+id);
   equipSharedGear(item.id,memberKey(state),item.slot);if(!state.equipped.includes(item.id))throw Error('Could not wear '+id);
   if(!configureSkill('active',i,id))throw Error('Could not configure '+id);
  }
  const casts=[],before=castPartySkill;
  castPartySkill=function(h,i,...args){
   const ok=before(h,i,...args);if(ok!==false)casts.push(__EMBERWILD_SKILLS.byPosition(h.job,'core',i).id);return ok;
  };
  startSelectedExploration();state.hp=Math.round(stats(state).hp*.5);
  for(const e of foes){e.hp=e.maxhp=100000;e.atk=0;}
  globalThis.forestCasts=casts;
  return {ids:state.skillLoadout.active,wanted};
 })()`);
 assert.deepEqual(result.ids,['gel-guard','wolf-double-bite','living-core-renewal']);
 for(const [normal,elite] of result.wanted){
  assert.deepEqual(normal,[.0004,.0005,.0006]);
  assert.deepEqual(elite,[.0012,.0015,.0018]);
 }
 for(let i=0;i<160;i++){r.advance(50);r.run('tick()');}
 assert.deepEqual(json(r,'[...new Set(forestCasts)].sort()'),[...result.ids].sort());
 r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');
 assert.deepEqual(json(r,'state.skillLoadout.active'),result.ids);
 assert.deepEqual(r.errors,[]);
});
