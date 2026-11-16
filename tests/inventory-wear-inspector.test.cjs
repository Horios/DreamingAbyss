'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
test('reward-only forms never roll randomly or through explicit drops; mission still grants its fixed skill and sockets',()=>{
 const r=game();
 const result=json(r,`(()=>{const out=[];for(const random of [0,.49,.999999]){Math.random=()=>random;for(let job=0;job<4;job++){const g=gear(1,3,0,job);out.push(itemForm(g).id);}}const n=state.bag.length,d=grantConfiguredDrop({type:'equipment',key:'form:4:3:0',quantityMin:1,quantityMax:1},{region:0,difficulty:0,monsterId:'map0_mob0',kind:'normal'});__EMBERWILD_STORY.sync();completeStoryStage('skill_equipment_intro');const g=state.bag.find(g=>g.storyRewardKey==='initiation_charm');return {forms:out,blocked:d===null,added:state.bag.length-n,skill:g.skillId,sockets:g.skillSockets.count};})()`);
 assert(!result.forms.includes('job4-slot3-form0'));assert.equal(result.blocked,true);assert.equal(result.added,1);assert.equal(result.skill,'tutorial_echo');assert.equal(result.sockets,2);assert.deepEqual(r.errors,[]);
});
test('backpack wear entry preserves equipment until the canonical preview and keeps an accessory-slot choice',()=>{
 const r=game();r.run("globalThis.g=gear(1,3,0,0);addGear(g);globalThis.before=JSON.stringify(state.equipped);openInventoryWear(g.id)");
 assert.equal(r.run('tab'),'worn');assert.equal(r.run('JSON.stringify(state.equipped)===before'),true);assert.match(r.run('wornEquipmentView()'),/aria-label="穿戴流程說明"/);assert.equal(r.run('openWornWearHelp()'),true);assert.match(r.run('$("modal").innerHTML'),/已穿戴裝備下方的「詳情」/);r.run('closeModal()');assert.match(r.run('wornEquipmentView()'),/穿戴至飾品/);assert.match(r.run('inventoryGearDetail(g)'),/openInventoryWear/);
 r.run('previewEquip(g.id,memberKey(state),3)');assert.equal(r.run('JSON.stringify(state.equipped)===before'),true);assert.equal(r.run('$("modal").open'),true);r.run('confirmEquipComparison(g.id,memberKey(state),3)');assert.equal(r.run('state.equipped[3]'),r.run('g.id'));assert.deepEqual(r.errors,[]);
});
test('worn equipment owns socket editing and full detail, while backpack limits its actions',()=>{
 const r=game();r.run("globalThis.g=gear(1,3,0,0);g.skillSockets={version:1,count:1,gems:[null],firstMode:'base'};addGear(g);equipSharedGear(g.id,memberKey(state),3);setTab('worn');");
 assert.match(r.run('wornEquipmentView()'),/toggleWornEquipmentSockets/);
 assert.match(r.run('wornEquipmentView()'),/showWornEquipmentDetail/);
 assert.doesNotMatch(r.run('inventoryGearDetail(g)'),/equipment-socket-editor|openForge/);
 assert.match(r.run('inventoryGearDetail(g)'),/sellGear/);
 r.run('toggleWornEquipmentSockets(g.id)');
 assert.match(r.run('wornEquipmentView()'),/data-socket-equipment/);
 assert.equal(r.run('showWornEquipmentDetail(g.id)'),true);
 assert.match(r.run('$("modal").innerHTML'),/裝備詳情|裝備能力/);
 assert.deepEqual(r.errors,[]);
});
test('affix filters inspect the same actual affix while numerical totals and individual skill targets remain independent',()=>{
 const r=game();r.run(`state.bag=[];globalThis.a=gear(1,1,0,0);globalThis.b=gear(1,1,0,0);a.affix=[{type:4,rank:1,value:18,skill:0},{type:4,rank:2,value:30,skill:2}];b.affix=[{type:4,rank:2,value:40,skill:0}];addGear(a);addGear(b);setGearInventoryFilter('affixType','4');setGearInventoryFilter('affixSkill','0:0');setGearInventoryFilter('affixRank','2');setGearInventoryFilter('affixValue','35');`);
 assert.deepEqual(json(r,'sortedFilteredGear().map(g=>g.id)'),[r.run('b.id')]);r.run("setGearInventoryFilter('affixType','12')");assert.equal(r.run('__EMBERWILD_GEAR_INVENTORY.filters().affixSkill'),'');assert.deepEqual(json(r,'sortedFilteredGear()'),[]);r.run('clearGearInventoryFilters()');assert.equal(r.run('sortedFilteredGear().length'),2);assert.deepEqual(r.errors,[]);
});
test('combat inspector reads real cooldowns and statuses per unit without modifying battle state, also for defeated enemies',()=>{
 const r=game();r.run(`state.lv=30;save();spawnGroup();globalThis.e=foes[0];globalThis.sk=sharedCoreSkillPool().find(s=>s.name==='重擊'&&s.job===0);CLASSES[sk.job].skills[sk.index][6].usageScope='shared';GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===e.monsterId).skillAssignments=[{skillId:sk.id}];EmberwildEnemyCombatState.restore({[e.id]:{[sk.id]:3}});actorCooldowns[memberKey(state)+'-'+EmberwildSkillSystem.adapterFor(__EMBERWILD_SKILLS.byId('class0-initial0'),0).index]=2;effects.push({target:e.id,kind:'weaken',value:.25,until:partyClock+2,name:'衰弱'});globalThis.before=JSON.stringify([foes,actorCooldowns,supportCooldowns,effects,EmberwildEnemyCombatState.pack(),state.skillLoadout]);`);
 const d=json(r,'EmberwildBattleSummary.inspect(e.id,"enemy")');assert.equal(d.skills[0].remaining,3);assert.equal(d.statuses[0].remaining,2);assert.match(d.statuses[0].detail,/25%/);assert.equal(r.run('EmberwildBattleSummary.showUnit(e.id,"enemy")'),true);assert.match(r.run('$("modal").innerHTML'),/剩餘冷卻 3/);assert.equal(r.run('JSON.stringify([foes,actorCooldowns,supportCooldowns,effects,EmberwildEnemyCombatState.pack(),state.skillLoadout])===before'),true);
 const h=json(r,'EmberwildBattleSummary.inspect(heroKey(state),"ally")');assert(h.skills.some(s=>s.remaining===2));r.run('e.hp=0');assert.equal(json(r,'EmberwildBattleSummary.inspect(e.id,"enemy")').hp,0);assert.equal(r.run('EmberwildBattleSummary.showUnit("missing","enemy")'),false);assert.deepEqual(r.errors,[]);
});
test('inspector includes companion skills, passives, supplies and control shields with real durations',()=>{
 const r=game();r.run(`state.lv=30;save();recruitCompanion(10);closeModal();spawnGroup();globalThis.partner=heroes().find(h=>h.companionId!==undefined);globalThis.foe=foes[0];__EMBERWILD_CONTROL_TEST_API.states[foe.id]={polymorph:{turns:2,shield:17},frost:{slowPct:.3}};state.shield=9;globalThis.tonic=SHOP.find(i=>i.type==='ward');state.ward=EmberwildTimedBoosts.createElementalBuff(tonic);`);
 const partner=json(r,'EmberwildBattleSummary.inspect(heroKey(partner),"ally")');assert.equal(partner.kind,'夥伴');assert(partner.skills.some(s=>s.configured));assert.equal(r.run('EmberwildBattleSummary.showUnit(heroKey(partner),"ally")'),true);
 const foe=json(r,'EmberwildBattleSummary.inspect(foe.id,"enemy")');assert.equal(foe.controlShield,17);assert(foe.statuses.some(s=>s.name==='變形'&&s.remaining===2));assert(foe.statuses.some(s=>s.name==='結霜'&&s.remaining===null));const hero=json(r,'EmberwildBattleSummary.inspect(heroKey(state),"ally")');assert.equal(hero.shield,9);assert(hero.statuses.some(s=>s.clock==='現實時間'));assert.deepEqual(r.errors,[]);
});
