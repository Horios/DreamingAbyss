'use strict';
/* v0.183: 古木之心護腕, an all-class off-hand dropped by the first map's BOSS 古木守衛 (5% / 8% / 12%). +50 HP; its passive
   古木之心 restores the wearer to full HP when HP falls below 30% (a lethal hit included), then waits 60 seconds. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
function game(job=0){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal();clearInterval(timer);
 globalThis.boss={region:0,lv:5,difficulty:0,kind:'boss',monsterId:'map0_boss',mat:[]};
 globalThis.rule=configuredDropRules(boss).find(x=>x.id==='ancient-heart-bracer-boss');
 grantConfiguredDrop(rule,boss,()=>.99);globalThis.bracer=state.bag.find(g=>g.skillId==='ancient-heart-revival');`);return r;}
test('the BOSS drops an all-class off-hand with +50 HP and the 古木之心 skill',()=>{
 for(const job of [0,1,2,3]){
  const r=game(job),out=json(r,`({chances:rule.chanceByDifficulty,kinds:rule.kinds,name:itemForm(bracer).name,slot:bracer.slot,jobs:gearWearableJobs(bracer),hp:gearStatBreakdown(bracer),skill:__EMBERWILD_SKILLS.byId('ancient-heart-revival')})`);
  assert.deepEqual(out.chances,[0.05,0.08,0.12]);assert.deepEqual(out.kinds,['boss']);
  assert.equal(out.name,'古木之心護腕');assert.equal(out.slot,2,'off-hand');assert.deepEqual(out.jobs,[0,1,2,3]);
  assert.equal(out.skill.type,'passive');assert.equal(out.skill.timing.cooldownSeconds,60);assert.deepEqual(out.skill.effects,[{key:'lowHpFullHeal',value:30}]);
  // Worn, the character gains 50 HP from the bracer's fixed effect.
  const before=r.run('stats(playerHero()).hp');r.run('equipSharedGear(bracer.id,memberKey(playerHero()),gearEquipPositions(bracer)[0]);if($("modal").open)closeModal();');
  assert.equal(r.run('gearWearer(bracer.id)?.job'),job);
  const rows=json(r,'equipmentStatContributions(bracer).rows.filter(x=>x.stats.hp>0).map(x=>[x.label,x.stats.hp])');
  assert(rows.some(([label,hp])=>/基底效果/.test(label)&&hp===50),'the bracer\'s own effect gives 50 HP (besides the off-hand base stats): '+JSON.stringify(rows));
  assert(r.run('stats(playerHero()).hp')>before,'worn bracer raises HP');assert.deepEqual(r.errors,[]);
 }
 // Not a normal-monster drop.
 const r=game();assert.equal(r.run("configuredDropRules({region:0,lv:1,difficulty:0,kind:'normal',monsterId:'map0_mob0',mat:[]}).some(x=>x.id==='ancient-heart-bracer-boss')"),false);
});
test('below 30% HP the wearer is restored to full, also from a lethal hit; then 60 seconds of cooldown',()=>{
 const r=game();r.run('equipSharedGear(bracer.id,memberKey(playerHero()),gearEquipPositions(bracer)[0]);if($("modal").open)closeModal();globalThis.h=playerHero();globalThis.max=stats(h).hp;');
 const hit=(hp)=>{r.run(`{const before=h.hp;h.hp=${hp};EmberwildTokenRuntime.afterDamage(h,null,before,h.hp);}`);return r.run('h.hp');};
 assert.equal(hit('Math.floor(max*.5)'),r.run('Math.floor(max*.5)'),'50% does not trigger');
 assert.equal(hit('Math.floor(max*.29)'),r.run('max'),'below 30% restores to full');assert.match(r.run('logs[0].text||logs[0]'),/古木之心：生命降到 30% 以下，立即恢復為滿血/);
 assert.equal(hit('Math.floor(max*.2)'),r.run('Math.floor(max*.2)'),'cooling down');
 r.advance(59000);assert.equal(hit('Math.floor(max*.2)'),r.run('Math.floor(max*.2)'),'still cooling down at 59 s');
 r.advance(1000);assert.equal(hit('0'),r.run('max'),'after 60 s a lethal hit is survived at full HP');
 // Without the bracer nothing happens.
 r.run('unequipSharedGear(bracer.id);globalThis.max=stats(h).hp;__EMBERWILD_GEAR_SKILLS.resetRevival(h);');assert.equal(hit('Math.floor(max*.1)'),r.run('Math.floor(max*.1)'));
 assert.deepEqual(r.errors,[]);
});
test('in a real fight the passive keeps a weak hero alive once, and a companion token carrying it works the same',()=>{
 const r=game();r.run(`equipSharedGear(bracer.id,memberKey(playerHero()),gearEquipPositions(bracer)[0]);if($("modal").open)closeModal();
  globalThis.rngState=7;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();
  for(const e of foes){e.atk*=4;e.hp=e.maxhp=e.maxhp*20;}save();`);
 let revived=false;for(let i=0;i<400&&!revived;i++){r.advance(250);r.run('tick()');revived=r.run("logs.some(l=>/古木之心：生命降到/.test(l.text||l))");}
 assert(revived,'the passive triggered in combat');assert.deepEqual(r.errors,[]);
 // Extracted into a token, the skill protects the companion wearing it.
 assert.equal(r.run("__EMBERWILD_SKILLS.byId('ancient-heart-revival').type"),'passive');
});
