'use strict';
/* v0.161: character levels removed. Fixed class stats + gear + class mastery; class mastery unlocks the skill tree;
   companions keep their own mastery; maps open by bosses; old saves keep their maps and skills; offline earns no
   character XP. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),KEY='emberwild-save-v1';
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(job=0){const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`selectSaveSlot(1);start(${job});closeModal();globalThis.rngState=98765;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};`);return r;}
async function settle(r,ms){r.advance(ms);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);}

test('a new character has no level or XP and fixed class stats; no level helpers remain',()=>{
 const r=game(0);
 const h=json(r,'(()=>{const h=playerHero(),c=CLASSES[h.job].initialStats;return {lv:h.lv,xp:h.xp,frac:h.xpFraction,naked:stats({...h,equipped:[null,null,null,null,null]}),initial:c,helpers:[typeof awardXP,typeof levelCap,typeof need]};})()');
 assert.equal(h.lv,undefined);assert.equal(h.xp,undefined);assert.equal(h.frac,undefined);
 assert.deepEqual(h.helpers,['undefined','undefined','undefined']);
 assert.equal(h.naked.hp,h.initial.hp);assert.equal(h.naked.atk,h.initial.atk);assert.equal(h.naked.def,h.initial.def);
 const packed=json(r,'packParty()');assert(!('lv' in packed.members[0])&&!('xp' in packed.members[0]),'saves carry no level');
 assert.deepEqual(r.errors,[]);
});

test('battles grant class mastery, not XP; class mastery stops at its cap and its stat bonus is bounded',()=>{
 const r=game(0);r.run('if(!running)toggleBattle();nextActionAt=Date.now()+50;save()');
 for(let i=0;i<4000;i++){r.advance(50);r.run('tick()');}
 const a=json(r,'({kills:playerHero().totalKills,xp:classMasteryXp(playerHero()),lv:playerHero().lv})');
 assert(a.kills>0,'fights happened');assert(a.xp>0,'class mastery grew');assert.equal(a.lv,undefined,'no level appeared');
 const capped=json(r,`(()=>{const c=__EMBERWILD_TEAMS.build().permanent.classes[0],max=__EMBERWILD_MASTERY.masteryMaxXp();c.xp=max-1;__EMBERWILD_MASTERY.gainMastery(playerHero(),'sword',50);const after=c.xp;__EMBERWILD_MASTERY.gainMastery(playerHero(),'sword',50);return {after,again:c.xp,max,level:classMasteryLevel(playerHero()),cap:__EMBERWILD_MASTERY.masterySettings().maxLevel,bonus:classMasteryBonus(playerHero())};})()`);
 assert.equal(capped.after,capped.max);assert.equal(capped.again,capped.max,'no XP kept past the cap');assert.equal(capped.level,capped.cap);
 const per=json(r,'GAMEPLAY_SETTINGS.skills.mastery.classBonus[0]');assert.equal(capped.bonus.hp,per.hp*capped.cap,'bonus = per level × capped level');
});

test('the class skill tree unlocks by mastery and prerequisites, never twice, and unlocking does not equip',()=>{
 const r=game(0);
 const ids=()=>json(r,`__EMBERWILD_SKILLS.system().definitions.filter(sk=>__EMBERWILD_SKILLS.system().classRules[0].initial.some(x=>x.skillId===sk.id)&&__EMBERWILD_SKILLS.learned(playerHero(),sk)).map(sk=>sk.id).sort()`);
 const at=xp=>r.run(`__EMBERWILD_TEAMS.build().permanent.classes[0].xp=${xp};__EMBERWILD_TEAMS.refreshUnlocks();__EMBERWILD_SKILL_REFRESH();`);
 const rows=json(r,'__EMBERWILD_SKILLS.system().classRules[0].initial');
 assert.deepEqual(ids(),rows.filter(x=>x.masteryLevel===0).map(x=>x.skillId).sort(),'mastery 0 opens only the free nodes');
 const cost=l=>json(r,`(()=>{let n=0;for(let i=0;i<${l};i++)n+=__EMBERWILD_MASTERY.masteryStepCost(i);return n;})()`);
 at(cost(2));assert.deepEqual(ids(),rows.filter(x=>x.masteryLevel<=2).map(x=>x.skillId).sort());
 const before=json(r,'playerHero().skillLoadout');at(cost(4));
 assert.deepEqual(ids(),rows.map(x=>x.skillId).sort(),'full first-class tree at mastery 4');
 assert.deepEqual(json(r,'playerHero().skillLoadout'),before,'unlocking does not change the equipped slots');
 // Prerequisite: put the mastery-4 node behind the mastery-2 node, then drop below the requirement of the first.
 const doc=json(r,'exportableBalance()'),rule=doc.skillSystem.classRules[0],dep=rule.initial.find(x=>x.masteryLevel===4),pre=rule.initial.find(x=>x.masteryLevel===2&&x.skillId!==dep.skillId);
 dep.prerequisites=[pre.skillId];r.ctx.doc=doc;r.run('applyBalanceConfig(doc,{persist:false})');
 assert(ids().includes(dep.skillId),'met prerequisite keeps the node unlocked');
 const cyc=JSON.parse(JSON.stringify(doc));cyc.skillSystem.classRules[0].initial.find(x=>x.skillId===pre.skillId).prerequisites=[dep.skillId];r.ctx.cyc=cyc;
 assert.throws(()=>r.run('validateBalanceConfig(cyc)'),/循環/,'cycles are rejected');
 const bad=JSON.parse(JSON.stringify(doc));bad.skillSystem.classRules[0].initial[0].prerequisites=['no-such-skill'];r.ctx.bad=bad;
 assert.throws(()=>r.run('validateBalanceConfig(bad)'),/前置/,'unknown prerequisites are rejected');
 assert.deepEqual(r.errors,[]);
});

test('there is no second class: former second-class skills unlock at their mastery level, slots are full, no stat multiplier; companions grow their own mastery',()=>{
 const r=game(0);
 assert.equal(r.run('typeof advance'),'undefined');assert.equal(r.run('typeof classAdvanceReady'),'undefined');
 // Rows with an achievement gate (e.g. defeat elites) also need that achievement; the others need mastery only.
 const rows=json(r,`__EMBERWILD_SKILLS.system().classRules[0].advanced.filter(x=>{const g=__EMBERWILD_SKILLS.byId(x.skillId).unlockConditions||{};return !g.classMasteryLevel&&!['materials','bossKills','eliteKills','bossEquipment'].some(k=>g[k]?.length);})`),top=Math.max(...rows.map(x=>x.masteryLevel));
 const ids=JSON.stringify(rows.map(x=>x.skillId)),learned=()=>json(r,`${ids}.filter(id=>__EMBERWILD_SKILLS.learned(playerHero(),__EMBERWILD_SKILLS.byId(id))).sort()`);
 assert.deepEqual(learned(),[],'not before their mastery level');
 r.run(`setClassMasteryLevel(${top},playerHero());for(const k of Object.keys(playerHero().mastery||{}))playerHero().mastery[k]=100000;__EMBERWILD_SKILL_REFRESH();`);
 assert.deepEqual(learned(),rows.map(x=>x.skillId).sort(),'unlocked by mastery alone');
 assert.deepEqual(json(r,'__EMBERWILD_SKILLS.slotCounts(playerHero())'),json(r,'__EMBERWILD_SKILLS.system().classRules[0].slots.advanced'),'every slot is available');
 const s=json(r,'(()=>{const h=playerHero(),a=stats(h);h.advanced=true;const b=stats(h);h.advanced=false;return {a,b};})()');
 assert.deepEqual([s.b.hp,s.b.atk,s.b.def],[s.a.hp,s.a.atk,s.a.def],'an old advanced flag adds nothing');
 const c=json(r,`(()=>{const id=EmberwildCompanions.defaultPlans.find(p=>p.job!==playerHero().job).id;party.companionUnlocks??={};globalThis.companionUnlocked=()=>true;recruitCompanion(id);const h=partyMember(id);const before=classMasteryLevel(h);__EMBERWILD_COMPANION_MASTERY_GAIN(h,100000);return {before,after:classMasteryLevel(h),xp:h.companionMastery.xp,max:__EMBERWILD_MASTERY.masteryMaxXp(),lv:h.lv,player:classMasteryLevel(playerHero())};})()`);
 assert.equal(c.before,0);assert.equal(c.xp,c.max,'companion mastery is capped too');assert(c.after>c.before);assert.equal(c.lv,undefined);
});

test('maps open by defeating the previous boss; recommended gear level is advice only',()=>{
 const r=game(0);
 assert.deepEqual(json(r,'MAPS.map((m,i)=>canVisit(i)?i:-1).filter(i=>i>=0)'),[0]);
 r.run('playerHero().kills[MAPS[0].boss[2]]=1');
 assert(json(r,'canVisit(1)&&!canVisit(2)'),'boss of map 0 opens map 1 only');
 assert.equal(r.run('canVisit(7)'),false,'post-clear maps need the gate cleared');
 assert.equal(r.run('mapRecommendedGearLevel(0)'),r.run('MAPS[0].max'));
 r.run('chooseMap(1)');assert.equal(r.run('party.map'),1,'a higher recommended gear level does not block entry');
});

test('an old save keeps its maps, skills and gear; level, XP and level scrolls are removed once',()=>{
 const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/saves/main-0402f4b-job2-lv16.json'),'utf8'));
 const members=raw.version===3?raw.members:[raw];members[0].materials={...(members[0].materials||{}),'升級卷軸':3};
 const r=loadRuntime(root,'index.html',{[KEY]:JSON.stringify(raw)});assert.equal(r.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 const a=json(r,'({lv:playerHero().lv,xp:playerHero().xp,legacy:party.legacySkillLevel,access:playerHero().mapAccess,scrolls:materialCount("升級卷軸"),gold:playerHero().gold,gear:playerHero().bag.length})');
 assert.equal(a.lv,undefined);assert.equal(a.xp,undefined);assert.equal(a.legacy,16);assert.equal(a.scrolls,0);
 assert(a.access.includes(0)&&a.access.includes(3)&&!a.access.includes(6),'maps the old level could enter stay open');
 // Skills the old level had unlocked stay usable (mastery 0 with legacy LV16 meets requirements up to mastery 15).
 assert.equal(r.run('masteryRequirementMet(playerHero(),15)'),true);assert.equal(r.run('masteryRequirementMet(playerHero(),16)'),false);
 r.run('save()');const again=loadRuntime(root,'index.html',{[KEY]:r.values.get(KEY)});
 assert.deepEqual(json(again,'({legacy:party.legacySkillLevel,gold:playerHero().gold,scrolls:materialCount("升級卷軸")})'),{legacy:16,gold:a.gold,scrolls:0},'reloading does not refund again');
});

for(const hours of [1,8,24]){
 test(`offline ${hours}h: class mastery and loot, no character XP or level`,async()=>{
  const r=game(0);r.run('startSelectedExploration();save();');
  const before=json(r,'({kills:state.totalKills,mastery:classMasteryXp(playerHero()),gold:state.gold})');
  await settle(r,hours*3600000);
  const after=json(r,'({kills:state.totalKills,mastery:classMasteryXp(playerHero()),gold:state.gold,lv:playerHero().lv,xp:playerHero().xp,receipt:party.offlineExploration.receipt})');
  assert(after.kills>before.kills,'offline fights happened');assert(after.mastery>before.mastery,'class mastery grew offline');
  assert.equal(after.lv,undefined);assert.equal(after.xp,undefined);
  assert.equal(after.receipt.xp,after.mastery-before.mastery,'the receipt reports the class mastery gained');
  assert(after.receipt.levels.every(l=>l.after>=l.before),'receipt levels are class mastery levels');
  assert.deepEqual(r.errors,[]);
 });
}
