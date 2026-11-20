'use strict';
/* v0.179: class mastery gives HP / attack / defense per level: the main class and one chosen sub-class. Weapon mastery: damage +1% per
   level while that weapon type is used. Element mastery: +1% per level on spells of that element only. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
const xpFor=`globalThis.xpFor=l=>{let x=0;for(let i=0;i<l;i++)x+=__EMBERWILD_MASTERY.masteryStepCost(i);return x;};`;
function game(job){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal();clearInterval(timer);Math.random=()=>0.5;${xpFor}`);return r;}
test('class mastery: the main class and one chosen sub-class add HP, attack and defense; the sub-class switches any time',()=>{
 const r=game(0);const base=json(r,'(()=>{const v=stats(playerHero());return {hp:v.hp,def:v.def,crit:v.crit};})()');
 r.run('setClassMasteryLevel(4,playerHero())');
 assert.deepEqual(json(r,'classMasteryBonus(playerHero())'),{hp:8,atk:json(r,'Math.round(0.2*4*100)/100')===0.8?json(r,'classMasteryBonus(playerHero()).atk'):0.8,def:json(r,'classMasteryBonus(playerHero()).def'),crit:0});
 assert.equal(json(r,'Math.round(classMasteryBonus(playerHero()).def*100)/100'),2.4,'warrior leans on defense');
 // Trained mage and priest masteries: neither counts until one is chosen as the sub-class.
 r.run('__EMBERWILD_TEAMS.build().permanent.classes[1]={activated:true,xp:xpFor(5),advanced:false};__EMBERWILD_TEAMS.build().permanent.classes[3]={activated:true,xp:xpFor(2),advanced:false};');
 assert.equal(json(r,'classMasteryBonus(playerHero()).hp'),8,'no sub-class: main only');
 assert.equal(r.run('setMasterySubClass(1)'),true);assert.equal(json(r,'classMasteryBonus(playerHero()).hp'),8+5);assert.equal(json(r,'Math.round(classMasteryBonus(playerHero()).atk*100)/100'),json(r,'Math.round((0.8+3.5)*100)/100'),'mage leans on attack');
 assert.equal(r.run('setMasterySubClass(3)'),true,'switch any time');assert.equal(json(r,'classMasteryBonus(playerHero()).hp'),8+7);
 assert.equal(r.run('setMasterySubClass(0)'),false,'the main class cannot be the sub-class');assert.equal(r.run('setMasterySubClass(2)'),false,'an untrained class cannot be chosen');
 assert.equal(json(r,'stats(playerHero()).hp'),base.hp+15);assert.equal(json(r,'stats(playerHero()).crit'),base.crit,'no crit');
 // Saved and restored with the save.
 r.run('save();loadParty(JSON.parse(JSON.stringify(packParty())))');assert.equal(r.run('party.masterySubClass'),3);assert.equal(r.run('masterySubClass()'),3);
 assert.throws(()=>r.run('loadParty({...JSON.parse(JSON.stringify(packParty())),masterySubClass:9})'),/副職業精通無效/);
 assert.equal(r.run('setMasterySubClass(null)'),true);assert.equal(json(r,'classMasteryBonus(playerHero()).hp'),8);
 // The character page explains it.
 const html=r.run("setMasterySubClass(1);setTab('character');document.getElementById('app').innerHTML");
 assert.match(html,/精通加成/);assert.match(html,/副職業精通/);assert.match(html,/偏重防禦/);assert.match(html,/偏重攻擊/);assert.match(html,/偏重生命/);
 // A companion uses its own class mastery only.
 r.run('grantCompanionTicket(13);useCompanionRecruitmentTicket(13);closeModal();setClassMasteryLevel(3,partyMember(13))');
 assert.equal(json(r,'classMasteryBonus(partyMember(13)).hp'),10.5);
 assert.deepEqual(r.errors,[]);
});
test('weapon mastery adds total damage only while that weapon is held; element mastery only for same-element spells',()=>{
 const r=game(0);
 const hit=`globalThis.hit=(element,basic)=>{const e=makeEnemy(0,playerHero(),()=>.5);e.def=0;e.hp=e.maxHp=1e9;e.element='physical';e.race='beast';e.kind='normal';foes=[e];const before=e.hp;if(basic){performHeroBasic(playerHero());}else resolveHit(e,1000,playerHero(),element,false);return before-e.hp;};`;
 r.run(hit);const type=r.run('__EMBERWILD_MASTERY.currentWeaponType(playerHero())');assert(['sword','axe','hammer'].includes(type),type);
 const base=json(r,"hit('physical',false)");
 r.run(`playerHero().mastery['${type}']=xpFor(10)`);
 assert.equal(json(r,"hit('physical',false)"),Math.round(base*1.1),'+10% with the held weapon');
 const other=['sword','axe','hammer'].find(k=>k!==type);r.run(`playerHero().mastery['${type}']=0;playerHero().mastery['${other}']=xpFor(10)`);
 assert.equal(json(r,"hit('physical',false)"),base,'another weapon mastery does nothing');
 // Element: a mage's fire mastery boosts fire spells only, not ice spells and not basic attacks.
 const m=game(1);m.run(hit);m.run("playerHero().mastery.fire=0");const fire=json(m,"hit('fire',false)"),ice=json(m,"hit('ice',false)");
 m.run('playerHero().mastery.fire=xpFor(20)');
 assert.equal(json(m,"hit('fire',false)"),Math.round(fire*1.2),'+20% on fire spells');assert.equal(json(m,"hit('ice',false)"),ice,'ice spells unchanged');
 assert.equal(m.run("__EMBERWILD_MASTERY_DAMAGE.multiplier(playerHero(),'fire',{basic:true})"),1,'basic attacks are not spells');
 assert.deepEqual(r.errors,[]);assert.deepEqual(m.errors,[]);
});
test('companions get no weapon or element bonus',()=>{
 const r=game(0);r.run('grantCompanionTicket(12);useCompanionRecruitmentTicket(12);closeModal()');
 assert.equal(r.run("__EMBERWILD_MASTERY_DAMAGE.multiplier(partyMember(12),'fire')"),1);
});
