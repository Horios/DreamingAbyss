const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const ids=['warrior-cleave-chain','mage-mana-cycle','archer-arrow-rain','priest-holy-prison'];
function game(job=0){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal();`);return r;}
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('real LV2 to LV3 progression and old balance/save migration grant all four skills once without replacing loadouts',()=>{
 for(let job=0;job<4;job++){
  const r=game(job);r.run('awardXP(need(1));save()');assert.equal(r.run('state.lv'),2);assert.equal(r.run(`__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('${ids[job]}'))`),false);
  const slots=json(r,'state.skillLoadout');r.run('awardXP(need(2));save()');assert.equal(r.run('state.lv'),3);assert.equal(r.run(`__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('${ids[job]}'))`),true);assert.deepEqual(json(r,'state.skillLoadout'),slots);
  r.run(`globalThis.legacy=exportableBalance();delete legacy.skillSystem.clearingSkillsVersion;legacy.skillSystem.definitions=legacy.skillSystem.definitions.filter(s=>!${JSON.stringify(ids)}.includes(s.id));for(const c of legacy.skillSystem.classRules)c.initial=c.initial.filter(x=>!${JSON.stringify(ids)}.includes(x.skillId));applyBalanceConfig(legacy,{persist:false});globalThis.raw=JSON.parse(JSON.stringify(packParty()));delete raw.members[0].passiveEnabled;for(const p of raw.buildSystem.plans)delete p.passiveEnabled;loadParty(raw);loadParty(JSON.parse(JSON.stringify(packParty())));`);
  assert.equal(r.run(`__EMBERWILD_SKILLS.system().definitions.filter(s=>s.id==='${ids[job]}').length`),1);assert.deepEqual(json(r,'state.skillLoadout'),slots);
  if(job<2)assert.equal(r.run(`state.passiveEnabled['${ids[job]}']`),true);else assert.equal(r.run(`configureSkill('active',1,'${ids[job]}')`),true);
  assert.deepEqual(r.errors,[]);
 }
});
test('import migration reads permanent unlocks from incoming save, not the previously active team',()=>{
 const r=game(0);
 r.run(`state.lv=5;save();globalThis.importSkill=__EMBERWILD_SKILLS.byId('class0-initial1');importSkill.requiredMastery='sword';importSkill.requiredMasteryLevel=999;globalThis.importKey='0:core:'+importSkill.adapter.index;globalThis.importRaw=JSON.parse(JSON.stringify(packParty()));importRaw.buildSystem.permanent.unlocks[importKey]=true;delete party.buildSystem.permanent.unlocks[importKey];state.mastery.sword=0;`);
 r.run('loadParty(importRaw)');
 assert.equal(r.run('party.buildSystem.permanent.unlocks[importKey]'),true);
 assert.equal(r.run('state.skills[importSkill.adapter.index]'),1);
 assert.equal(r.run('__EMBERWILD_TEAMS.plan().skills[importSkill.adapter.index]'),1);
 assert.deepEqual(r.errors,[]);
});
test('weapon removal, source disposal, skills, gems and cooldowns remain frozen until the next encounter, including reload',()=>{
 const r=game(1);r.run(`state.lv=25;state.mastery.fire=100000;globalThis.g=gear(3,0,0,1);g.skillId='job1-core2';g.skillSockets={version:1,count:1,gems:[0],firstMode:'skill'};addGear(g);equipSharedGear(g.id,memberKey(state),0);selectSkillEquipment(g.id);configureSkill('proc',0,'job1-core2');configureSkill('active',1,'class1-initial1');startSelectedExploration();globalThis.before=battleStats(state);globalThis.oldActive=state.active.slice();globalThis.encounter=foes;actorCooldowns[memberKey(state)+'-'+state.active[1]]=5;globalThis.cursor={order:[],index:0,unit:null};combatRoundProgress=cursor;state.hp=before.hp;globalThis.oldHp=state.hp;`);
 const cd=json(r,'actorCooldowns');r.run(`unequipSharedGear(g.id);configureSkill('active',1,'class1-initial2');selectSkillEquipment(null);`);
 assert.equal(r.run('foes===encounter'),true);assert.equal(r.run('state.hp'),r.run('oldHp'));assert.equal(r.run('combatRoundProgress===cursor'),true);assert.deepEqual(json(r,'actorCooldowns'),cd);assert.deepEqual(json(r,'battleStats(state)'),json(r,'before'));assert(r.run('stats(state).atk')<r.run('before.atk'));
 assert.equal(r.run(`EmberwildBattleConfiguration.combat(()=>__EMBERWILD_SKILLS.validCast(state,2,'core'))`),true);assert.equal(r.run('sellGear(g.id)'),true);
 r.run('globalThis.raw=JSON.parse(JSON.stringify(packParty()));loadParty(raw)');assert.deepEqual(json(r,'battleStats(state)'),json(r,'before'));assert.equal(r.run(`EmberwildBattleConfiguration.combat(()=>__EMBERWILD_SKILLS.validCast(state,2,'core'))`),true);assert.deepEqual(json(r,'state.active'),json(r,'raw.members[0].active'));
 r.run('spawnGroup()');assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>state.skillLoadout.active[1])'),'class1-initial2');assert.equal(r.run(`EmberwildBattleConfiguration.combat(()=>__EMBERWILD_SKILLS.validCast(state,2,'core'))`),false);assert.equal(r.run('battleStats(state).atk'),r.run('stats(state).atk'));assert.deepEqual(r.errors,[]);
});
test('passive off/on changes real kill triggers next encounter and notifications are merged',()=>{
 const r=game();r.run(`state.lv=3;save();startSelectedExploration();globalThis.messages=[];toast=t=>messages.push(t);setPassiveSkillEnabled('warrior-cleave-chain',false);configureSkill('active',1,'class0-initial1');configureSkill('active',1,null);Math.random=()=>.99;globalThis.targets=()=>{foes=Array.from({length:5},(_,i)=>({id:'target-'+i,name:'同名敵人',kind:'normal',monsterId:'map0_mob0',hp:1,maxhp:1,atk:1,def:0,lv:1,shield:0,element:'physical',race:'beast'}));enemy=foes[0];};targets();performHeroBasic(state);`);
 assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),4);assert.equal(r.run(`messages.filter(s=>s==='配置已更新，將於下一場戰鬥生效。').length`),1);
 r.run('spawnGroup();targets();performHeroBasic(state)');assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),1);
 r.run(`setPassiveSkillEnabled('warrior-cleave-chain',true);targets();performHeroBasic(state)`);assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),1);
 r.run('spawnGroup();targets();performHeroBasic(state)');assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),4);assert.deepEqual(r.errors,[]);
});
test('unlimited independent stat passives default on, persist by team, and cannot enable locked skills',()=>{
 const r=game();r.run(`state.lv=3;save();globalThis.d=exportableBalance();for(let i=0;i<6;i++){const sk=structuredClone(d.skillSystem.definitions.find(s=>s.id==='warrior-cleave-chain'));sk.id='stat-passive-'+i;sk.name='被動 '+i;sk.adapter.index=d.passiveDefinitions.length+i;sk.effects=[{key:'flatAttack',value:7}];delete sk.eventPassive;d.skillSystem.definitions.push(sk);d.skillSystem.classRules[0].initial.push({skillId:sk.id,level:3});}applyBalanceConfig(d,{persist:false});for(let i=0;i<6;i++)setPassiveSkillEnabled('stat-passive-'+i,false);globalThis.off=stats(state).atk;for(let i=0;i<6;i++)setPassiveSkillEnabled('stat-passive-'+i,true);globalThis.on=stats(state).atk;copyTeamPlan();startSelectedExploration();for(let i=0;i<6;i++)setPassiveSkillEnabled('stat-passive-'+i,false);`);
 assert.equal(r.run('battleStats(state).atk'),r.run('on'));assert.equal(r.run('stats(state).atk'),r.run('off'));
 r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');assert.equal(r.run('battleStats(state).atk'),r.run('on'));assert.equal(r.run('state.passiveEnabled["stat-passive-5"]'),false);
 r.run('stopTeamExploration();switchTeamPlan("team-2")');assert.equal(r.run('state.passiveEnabled["stat-passive-5"]'),true);
 r.run('switchTeamPlan("team-1");state.lv=2');assert.equal(r.run('setPassiveSkillEnabled("stat-passive-5",true)'),false);r.run('state.lv=3;save();globalThis.oldSave=save;save=()=>false');assert.equal(r.run('setPassiveSkillEnabled("stat-passive-5",true)'),false);assert.equal(r.run('__EMBERWILD_TEAMS.plan().passiveEnabled["stat-passive-5"]'),false);assert.equal(r.run('configureSkill("active",1,"class0-initial1")'),false);assert.deepEqual(json(r,'state.skillLoadout'),json(r,'__EMBERWILD_TEAMS.plan().skillLoadout'));r.run('save=oldSave');assert.deepEqual(r.errors,[]);
});
test('slot previews include locked current-stage skills; catalog excludes orphan, disabled and partner skills',()=>{
 const r=game(2);r.run('openSkillSlot("active",0)');const html=r.run('$("modal").innerHTML');assert(html.includes('data-skill-id="archer-arrow-rain"'));assert(html.includes('skill-locked'));assert(html.includes('LV3'));assert(!html.includes('data-skill-id="job2-core4"'));assert.equal(r.run('configureSkill("active",0,"archer-arrow-rain")'),false);
 const catalog=json(r,'__EMBERWILD_SKILL_SYSTEM_UI.catalog(state).map(s=>s.id)');assert(catalog.includes('job2-core4'));assert(catalog.includes('tutorial_echo'));assert(!catalog.some(id=>id.startsWith('partner')||id.startsWith('test-')));assert(catalog.includes('job2-support0'));assert(r.run('__EMBERWILD_SKILL_SYSTEM_UI.routes(__EMBERWILD_SKILLS.byId("job2-support0"),state).join()').includes('任務獎勵'));assert(r.run('__EMBERWILD_SKILL_SYSTEM_UI.routes(__EMBERWILD_SKILLS.byId("tutorial_echo"),state).join()').includes('裝備附帶'));
 r.run('closeModal();state.lv=3;save();openSkillSlot("active",0)');assert(!/<article class="[^"]*skill-locked[^"]*" data-skill-id="archer-arrow-rain"/.test(r.run('$("modal").innerHTML')));assert.equal(r.run('configureSkill("active",0,"archer-arrow-rain")'),true);r.run('closeModal();startSelectedExploration();Math.random=()=>.99;castPartySkill(state,__EMBERWILD_SKILLS.byId("archer-arrow-rain").adapter.index,battleStats(state))');assert.equal(r.run('foes.every(e=>e.hp<e.maxhp)'),true);assert.deepEqual(r.errors,[]);
});
test('foreground and offline resume identical saved encounter configuration after editing permanent skills and passives',async()=>{
 const a=game(0),b=game(0);a.ctx.setTimeout=fn=>setImmediate(fn);b.ctx.setTimeout=fn=>setImmediate(fn);
 a.run(`state.lv=5;save();configureSkill('active',0,'class0-initial2');startSelectedExploration();configureSkill('active',0,'class0-initial1');setPassiveSkillEnabled('warrior-cleave-chain',false);nextActionAt=Date.now()+50;save();`);
 b.ctx.raw=json(a,'packParty()');b.run('loadParty(raw)');
 for(const r of [a,b])r.run('globalThis.rng=314159;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};');
 for(let n=0;n<1200;n++){a.advance(50);a.run('tick()');}b.advance(60000);await b.run('EmberwildOffline.settle()');
 const result=r=>json(r,'({rng,lv:state.lv,xp:state.xp,gold:state.gold,hp:state.hp,kills:state.totalKills,loadout:state.skillLoadout,passives:state.passiveEnabled,foes:foes.map(e=>({id:e.id,hp:e.hp})),actorCooldowns,supportCooldowns,battle:EmberwildBattleConfiguration.pack()})');
 // Generated IDs depend on the runtime UUID sequence, so compare encounter values.
 const strip=v=>{for(const e of v.foes)delete e.id;for(const h of v.battle?.heroes||[])h.gear=[];return v;};
 assert.deepEqual(strip(result(b)),strip(result(a)));assert.equal(b.run('EmberwildOffline.failed'),false);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
});
