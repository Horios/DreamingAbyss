const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const ids=['warrior-cleave-chain','mage-mana-cycle','archer-arrow-rain','priest-holy-prison'];
test('new priests preview holy prison before LV3, learn it on level-up and retain the configured skill after cold reload',()=>{
 const root=path.resolve(__dirname,'..'),r=loadRuntime(root);
 r.run('selectSaveSlot(1);start(3);closeModal();openSkillSlot("active",0)');
 assert(r.run('$("modal").innerHTML.includes(\'data-skill-id="priest-holy-prison"\')'));
 assert.equal(r.run('configureSkill("active",0,"priest-holy-prison")'),false);
 r.run('closeModal();awardXP(need(1));awardXP(need(2));save()');
 assert.equal(r.run('state.lv'),3);
 assert.equal(r.run('configureSkill("active",0,"priest-holy-prison")'),true);
 const cold=loadRuntime(root,'index.html',Object.fromEntries(r.values));
 assert.equal(cold.run('state.skillLoadout.active[0]'),'priest-holy-prison');
 assert.equal(cold.run('state.skills[__EMBERWILD_SKILLS.byId("priest-holy-prison").adapter.index]'),1);
 assert.deepEqual(r.errors,[]);assert.deepEqual(cold.errors,[]);
});
test('legacy priest cold boot grants holy prison once, shows it in the picker and casts it after repeated save reloads',()=>{
 const root=path.resolve(__dirname,'..'),raw=require('./fixtures/legacy-skills-job3.json'),original=JSON.stringify(raw);
 const r=loadRuntime(root,'index.html',{'emberwild-save-v1':original});
 assert.equal(r.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR??null'),null);
 assert.equal(r.run('state.job'),3);
 assert.equal(r.run('Object.hasOwn(state,"stats")'),false);
 r.run('openSkillSlot("active",0)');
 assert(r.run('$("modal").innerHTML.includes(\'data-skill-id="priest-holy-prison"\')'));
 assert.equal(r.run('chooseSkillSlot("active",0,"priest-holy-prison")'),true);
 r.run('for(let i=0;i<3;i++)loadParty(packParty());resetEncounter();Math.random=()=>.99;foes=Array.from({length:4},(_,i)=>({id:"legacy-priest-"+i,name:"同名敵人",kind:"normal",hp:1000,maxhp:1000,atk:1,def:0,lv:1,shield:0,element:"physical",race:"beast",turn:0}));enemy=foes[0];');
 assert.equal(r.run('state.skillLoadout.active[0]'),'priest-holy-prison');
 assert.equal(r.run('__EMBERWILD_SKILLS.system().definitions.filter(s=>s.id==="priest-holy-prison").length'),1);
 assert.equal(cast(r,'priest-holy-prison'),true);
 assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),3);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(state.bag.map(g=>g.id))')),raw.members[0].bag.map(g=>g.id));
 assert.equal(JSON.stringify(raw),original);assert.deepEqual(r.errors,[]);
});
function game(job){const r=loadRuntime(path.resolve(__dirname,'..'));r.run(`selectSaveSlot(1);start(${job});closeModal();state.lv=3;save();Math.random=()=>.99;
globalThis.targets=(hp=1000,n=4)=>{foes=Array.from({length:n},(_,i)=>({id:'test-'+i,name:'同名敵人',kind:'normal',monsterId:'map0_mob0',hp,maxhp:hp,atk:1,def:0,lv:1,shield:0,element:'physical',race:'beast',turn:0}));enemy=foes[0];};targets();`);return r;}
function cast(r,id){return r.run(`castPartySkill(state,__EMBERWILD_SKILLS.byId('${id}').adapter.index,{...battleStats(state),atk:100})`);}
test('all four skills unlock at level three, keep originals and slot counts; passives cannot be slotted',()=>{
 for(let job=0;job<4;job++){const r=game(job);assert.equal(r.run(`__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('${ids[job]}'))`),true);r.run('state.lv=2');assert.equal(r.run(`__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('${ids[job]}'))`),false);r.run('state.lv=3;save()');assert.equal(r.run(`__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('class${job}-initial1'))`),true);assert.equal(r.run('state.active.length'),3);assert.equal(r.run('state.procSlots.length'),1);if(job<2)assert.equal(r.run(`configureSkill('active',0,'${ids[job]}')`),false);assert.deepEqual(r.errors,[]);}
});
test('warrior follows current lowest HP, stops on survival, caps at three and one chain per original action',()=>{
 const r=game(0);r.run('targets(1,7);EmberwildCombatEvents.action(state,()=>{resolveHit(foes[0],100,state,"physical",false);resolveHit(foes[1],100,state,"physical",false)})');assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),5);
 r.run('resetEncounter();targets(999,4);foes[0].hp=1;foes[1].hp=2;foes[2].hp=500;EmberwildCombatEvents.action(state,()=>resolveHit(foes[0],100,state,"physical",false))');assert.equal(r.run('foes[1].hp'),0);assert(r.run('foes[2].hp')<500);assert.equal(r.run('foes[3].hp'),999);
});
test('mage deaths reduce seconds cooldowns once per internal six-second interval',()=>{
 const r=game(1);r.run(`running=true;EmberwildSecondsCombat.step();const C=EmberwildSecondsCombat,a=C.timeline.find(heroKey(state)),sk=a.definition.skills[0];C.timeline.handlers.canAct=()=>false;a.ready[sk.id]=C.timeline.now+12000000;EmberwildCombatEvents.action(null,()=>{foes[0].hp=0;foes[1].hp=0;});globalThis.first=C.timeline.actor(heroKey(state)).skills[0].readyInSeconds;EmberwildCombatEvents.action(null,()=>foes[2].hp=0);globalThis.second=C.timeline.actor(heroKey(state)).skills[0].readyInSeconds;C.timeline.addStatus({id:'passive-wait',actorId:heroKey(state),durationSeconds:6,tickEverySeconds:null,preventsAction:false});while(partyClock<6)C.step();a.ready[sk.id]=C.timeline.now+12000000;EmberwildCombatEvents.action(null,()=>foes[3].hp=0);`);assert.equal(r.run('first'),9);assert.equal(r.run('second'),9);assert.equal(r.run('EmberwildSecondsCombat.timeline.actor(heroKey(state)).skills[0].readyInSeconds'),9);assert.equal(r.run('state.eventPassiveCooldowns["mage-mana-cycle"]'),6);assert.deepEqual(r.errors,[]);
});
test('arrow rain requires equipment and damages every living enemy independently',()=>{
 const r=game(2);assert.equal(cast(r,ids[2]),false);r.run(`foes=[];configureSkill('active',0,'${ids[2]}');targets(1000,6);foes[1].hp=0;`);assert.equal(cast(r,ids[2]),true);assert.equal(r.run('foes.filter(e=>e.hp>0&&e.hp<1000).length'),5);
});
function prison(){const r=game(3);r.run(`foes=[];configureSkill('active',0,'priest-holy-prison');targets();`);assert.equal(cast(r,ids[3]),true);return r;}
test('prison marks at most three unique IDs, persists beyond 99 rounds and stacks independent casts',()=>{
 const r=prison();assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),3);r.run('partyClock+=150;__EMBERWILD_STATUS_TEST_API.tick()');assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),3);cast(r,ids[3]);assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),6);assert.equal(r.run('new Set(__EMBERWILD_STATUS_TEST_API.active.map(s=>s.id)).size'),6);
});
test('prison turn end fires under control, consumes once, death fires 30 percent with no turn-end duplicate',()=>{
 const r=prison();r.run('const originalStats=battleStats;battleStats=(h)=>({...originalStats(h),atk:100});__EMBERWILD_CONTROL_TEST_API.applyFreeze(foes[0],{duration:2,bossDuration:1});globalThis.hp0=foes[3].hp;EmberwildCombatEvents.emit("targetTurnEnd",foes[0])');assert(r.run('foes[3].hp')<1000);assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),2);const hit50=r.run('1000-foes[3].hp');r.run('globalThis.beforeDeath=foes[3].hp;EmberwildCombatEvents.action(null,()=>{foes[1].hp=0;});EmberwildCombatEvents.endTurn(foes[1]);');assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),1);const hit30=r.run('beforeDeath-foes[3].hp');assert(hit50>hit30);assert.equal(r.run('foes[1].__eventDeathHandled'),true);
});
test('death chain is iterative, each mark consumed once, rewards remain once per unique enemy',()=>{
 const r=prison();r.run('foes[0].hp=1;foes[1].hp=1;foes[2].hp=1;EmberwildCombatEvents.action(null,()=>{foes[0].hp=0;})');assert.equal(r.run('foes.filter(e=>e.hp<=0).length'),3);assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);const hp=r.run('foes[3].hp');r.run('EmberwildCombatEvents.scanDeaths();EmberwildCombatEvents.drain()');assert.equal(r.run('foes[3].hp'),hp);r.run('for(const e of foes.filter(e=>e.hp<=0))rewardGroupKill(e);globalThis.goldBefore=state.gold;for(const e of foes.filter(e=>e.hp<=0))rewardGroupKill(e)');assert.equal(r.run('state.gold===goldBefore'),true);assert.deepEqual(r.errors,[]);
});
test('death during enemy turn has priority; snapshot/hydrate preserves stacked marks and passive cooldowns',()=>{
 const r=prison();cast(r,ids[3]);r.run('state.eventPassiveCooldowns={test:2};party.offlineExploration.status="running";running=true;globalThis.snap=EmberwildOffline.snapshot();foes[0].hp=0;EmberwildCombatEvents.endTurn(foes[0]);');assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.filter(s=>s.targetKey==="test-0").length'),0);r.run('party.offlineExploration.combat=snap;EmberwildOffline.hydrate(party.offlineExploration)');assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),6);assert.equal(r.run('state.eventPassiveCooldowns.test'),2);r.run('resetEncounter()');assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);
});
test('finite expiry removes without explosion; caster/target clocks and disabling death chain are reusable',()=>{
 const r=game(3);r.run(`const def=EmberwildSkillSystem.clearingStatus();def.id='custom-event';def.permanent=false;def.duration=1;def.timing={durationSeconds:6,periodicIntervalSeconds:6,triggerIntervalSeconds:3};def.triggers=def.triggers.filter(t=>t.event==='targetDeath');__EMBERWILD_STATUS_TEST_API.apply(def,state,foes[0]);EmberwildSecondsCombat.timeline.handlers.canAct=()=>false;while(partyClock<6)EmberwildSecondsCombat.step();`);assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);assert.equal(r.run('foes[3].hp'),1000);
 r.run(`const d=EmberwildSkillSystem.clearingStatus();d.id='custom-chain';d.triggers.forEach(t=>t.allowDeathChain=false);foes[0].hp=1;foes[1].hp=1;__EMBERWILD_STATUS_TEST_API.apply(d,state,foes[0]);__EMBERWILD_STATUS_TEST_API.apply(d,state,foes[1]);EmberwildCombatEvents.action(null,()=>{foes[0].hp=0;})`);assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);assert.equal(r.run('foes[1].hp'),0);
});

test('mage lethal active gets its newly assigned cooldown reduced in the real round generator',()=>{
 const r=game(1);r.run(`targets(1000,2);foes[0].hp=1;state.supportSlots=[];state.active=[__EMBERWILD_SKILLS.byId('class1-initial0').adapter.index];running=true;initiativeOrder=()=>[{side:'hero',id:heroKey(state),actor:state}];globalThis.skillIndex=state.active[0];EmberwildSecondsCombat.step();`);
 assert.equal(r.run('actorCooldowns[memberKey(state)+"-"+skillIndex]'),r.run('Math.max(.3,skillCooldown(skillIndex,state)-3)'));
 assert.equal(r.run('state.eventPassiveCooldowns["mage-mana-cycle"]'),6);assert.deepEqual(r.errors,[]);
});
test('event status battle expiry and dispel do not explode or retain stale marks',()=>{
 const r=game(3);r.run(`const def=EmberwildSkillSystem.clearingStatus();def.id='finite-battle';def.permanent=false;def.duration=1;def.timing={durationSeconds:6,periodicIntervalSeconds:6,triggerIntervalSeconds:3};def.triggers=def.triggers.filter(t=>t.event==='targetDeath');def.durationClock='battle';__EMBERWILD_STATUS_TEST_API.apply(def,state,foes[0]);EmberwildSecondsCombat.timeline.handlers.canAct=()=>false;while(partyClock<6)EmberwildSecondsCombat.step();`);
 assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);assert.equal(r.run('foes[3].hp'),1000);
 r.run(`__EMBERWILD_STATUS_TEST_API.apply(EmberwildSkillSystem.clearingStatus(),state,foes[0]);__EMBERWILD_STATUS_TEST_API.remove(foes[0],'debuff',99);EmberwildCombatEvents.endTurn(foes[0]);`);
 assert.equal(r.run('__EMBERWILD_STATUS_TEST_API.active.length'),0);assert.equal(r.run('foes[3].hp'),1000);
});
test('all four clearing builds produce identical foreground and offline combat with the same random sequence',async()=>{
 for(let job=0;job<4;job++){
  function build(){const r=loadRuntime(path.resolve(__dirname,'..'));r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`globalThis.rng=314159;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};selectSaveSlot(1);start(${job});closeModal();state.lv=3;save();`);if(job>=2)r.run(`configureSkill('active',0,'${ids[job]}')`);r.run('startSelectedExploration();nextActionAt=Date.now()+50;save()');return r;}
  const a=build(),b=build();for(let n=0;n<1200;n++){a.advance(50);a.run('tick()');}b.advance(60000);await b.run('EmberwildOffline.settle()');
  const read=r=>JSON.parse(r.run(`JSON.stringify({rng,lv:state.lv,xp:state.xp,gold:state.gold,hp:state.hp,kills:state.totalKills,materials:state.materials,consumables:state.consumables,foes:foes.map(e=>({id:e.id,hp:e.hp,shield:e.shield,death:e.__eventDeathHandled})),partyClock,round,actorCooldowns,supportCooldowns,passives:state.eventPassiveCooldowns,statuses:EmberwildStatusCombatState.pack()})`));
  assert.deepEqual(read(b),read(a),'job '+job);assert.equal(b.run('EmberwildOffline.failed'),false);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 }
});
test('lethal support effects finish death events and reduce the new support cooldown before their yield',()=>{
 const r=game(1);r.run(`targets(1000,1);state.acquiredSkillIds??=[];state.acquiredSkillIds.push('job1-support0');__EMBERWILD_SKILLS.refreshAll();configureSkill('support',0,'job1-support0');state.active=[];castSupport=(h,i)=>{foes[0].hp=0;return true;};running=true;initiativeOrder=()=>[{side:'hero',id:heroKey(state),actor:state}];EmberwildSecondsCombat.step();`);
 assert.equal(r.run('foes[0].__eventDeathHandled'),true);assert.equal(r.run('state.eventPassiveCooldowns["mage-mana-cycle"]'),6);
 assert.equal(r.run('supportCooldowns[memberKey(state)+"-0"]'),r.run('Math.max(.3,supportSkillCooldown(state,0)-3)'));
});
