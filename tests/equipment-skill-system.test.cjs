const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
function game(){const r=loadRuntime(path.resolve(__dirname,'..'));r.run(`selectSaveSlot(1);start(1);closeModal();state.lv=25;state.mastery.fire=100000;state.gems=Array(15).fill(5);globalThis.makeSkillGear=(id,slot,skill)=>{const g=gear(3,slot,0,1);g.id=id;g.skillId=skill;g.skillSockets={version:1,count:3,gems:[0,0,0],firstMode:'skill'};addGear(g);state.equipped[slot]=id;return g;};globalThis.a=makeSkillGear('a',0,'job1-core2');globalThis.b=makeSkillGear('b',1,'job1-core3');save();`);return r;}
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('multiple skill items wear simultaneously; only selected equipment enters the skill pool and legal slot',()=>{
 const r=game();assert.equal(r.run('selectSkillEquipment("a")'),true);assert.equal(r.run('configureSkill("proc",0,"job1-core2")'),true);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("job1-core3"))'),false);assert.equal(r.run('selectSkillEquipment("b")'),true);assert.deepEqual(json(r,'state.skillLoadout.proc'),[null]);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("job1-core2"))'),false);assert.equal(r.run('state.equipped.includes("a")&&state.equipped.includes("b")'),true);
});
test('equipment skill source remains editable mid-encounter even when a companion is selected; snapshot changes next group',()=>{
 const r=game();
 r.run('recruitCompanion(10);closeModal();startSelectedExploration();selectHero(10);');
 assert.equal(r.run('EmberwildBattleConfiguration.pending()'),true);
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>playerHero().activeSkillEquipmentId)'),null);
 assert.equal(r.run('selectSkillEquipment("a")'),true);
 assert.equal(r.run('state.companionId'),10);
 assert.equal(r.run('playerHero().activeSkillEquipmentId'),'a');
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>playerHero().activeSkillEquipmentId)'),null);
 r.run('selectHero(memberKey(playerHero()))');
 assert.equal(r.run('configureSkill("proc",0,"job1-core2")'),true);
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>playerHero().skillLoadout.proc[0])'),null);
 r.run('spawnGroup()');
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>playerHero().activeSkillEquipmentId)'),'a');
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>playerHero().skillLoadout.proc[0])'),'job1-core2');
 assert.deepEqual(r.errors,[]);
});
test('inactive gems use base stats, selected gems affect only their supplied skill, first mode is restored',()=>{
 const r=game();const before=r.run('stats(state).atk');r.run('selectSkillEquipment("a");configureSkill("proc",0,"job1-core2")');assert.equal(r.run('stats(state).atk'),before-2);assert.equal(r.run('gemRate(state,2,0)'),.02);assert.equal(r.run('gemRate(state,21,0)'),0);r.run('setEquipmentGemMode("a","base")');assert.equal(r.run('stats(state).atk'),before);assert.equal(r.run('gemRate(state,2,0)'),0);r.run('selectSkillEquipment("b");selectSkillEquipment("a")');assert.equal(r.run('a.skillSockets.firstMode'), 'base');assert.equal(r.run('gemRate(state,2,0)'),0);
});
test('socket replace and remove are free; incompatible gems and invalid mode toggles are refused',()=>{
 const r=game(),gold=r.run('state.gold'),n=r.run('state.gems[0]');assert.equal(r.run('socketEquipmentGem("a",0,-1)'),true);assert.equal(r.run('state.gems[0]'),n+1);assert.equal(r.run('socketEquipmentGem("a",0,1)'),false);assert.equal(r.run('socketEquipmentGem("a",0,2)'),true);assert.equal(r.run('state.gold'),gold);assert.equal(r.run('setEquipmentGemMode("a","base")'),false);
});
test('unequip clears active source and config; gem ownership survives save/export/import',()=>{
 const r=game();r.run('selectSkillEquipment("a");configureSkill("proc",0,"job1-core2");loadParty(JSON.parse(JSON.stringify(packParty())))');assert.equal(r.run('state.activeSkillEquipmentId'),'a');assert.equal(r.run('gemRate(state,2,0)'),.02);r.run('state.equipped[0]=null;save()');assert.equal(r.run('state.activeSkillEquipmentId'),null);assert.deepEqual(json(r,'state.skillLoadout.proc'),[null]);assert.deepEqual(json(r,'findGear("a").skillSockets.gems'),[0,0,0]);
});
test('sale/salvage refunds every socket exactly once and storage failure rolls the entire transaction back',()=>{
 const r=game();r.run('state.equipped[0]=null;save()');const n=r.run('state.gems[0]');assert.equal(r.run('sellGear("a")'),true);assert.equal(r.run('state.gems[0]'),n+3);assert.equal(r.run('sellGear("a")'),false);r.run('state.equipped[1]=null;save();globalThis.realSave=save;save=()=>false');assert.equal(r.run('sellGear("b")'),false);assert.equal(r.run('!!findGear("b")'),true);assert.equal(r.run('state.gems[0]'),n+3);r.run('save=realSave');assert.equal(r.run('salvage("b")'),true);assert(r.run('state.gems[0]')>=n+6);
});
test('explicit monster gear resolves its final form and difficulty before skill selection; later save never rerolls sockets',()=>{
 const r=game();r.run(`globalThis.doc=exportableBalance();doc.skillSystem.equipment.chanceByDifficulty=[0,0,1];doc.skillSystem.equipment.pool=doc.skillSystem.equipment.pool.filter(x=>x.skillId==='job1-core3');Object.assign(doc.skillSystem.equipment.pool[0],{maps:[0],monsters:['map0_mob0']});applyBalanceConfig(doc,{persist:false});Math.random=()=>.5;grantConfiguredDrop({type:'equipment',key:'form:1:0:0',quantityMin:1,quantityMax:1,name:'來源測試'},{region:0,difficulty:2,kind:'normal',monsterId:'map0_mob0'},()=>.5);`);
 assert.equal(r.run('state.bag.at(-1).skillId'),'job1-core3');const before=json(r,'state.bag.at(-1).skillSockets');r.run('save();loadParty(packParty())');assert.deepEqual(json(r,'state.bag.at(-1).skillSockets'),before);
});
