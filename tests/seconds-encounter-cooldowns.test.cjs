// v0.074 seconds combat revision: initial and reuse cooldowns, per-encounter re-initialization,
// per-class and per-monster basic attack intervals, cross-encounter effect durations and skill details.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const S=require('../js/combat/seconds-schema.js'),doc=require('../data/balance.json');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function game(job=1){
 const r=loadRuntime(root);r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(${job});closeModal();globalThis.rng=12345;Math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);state.autoPotion=false;startSelectedExploration();clearInterval(timer);running=true;`);
 return r;
}
const step=r=>{r.run('EmberwildSecondsCombat.step();if(document.getElementById("modal")?.open)closeModal();');};
function untilPhase(r,phase,limit=20000){for(let i=0;i<limit&&r.run('EmberwildSecondsCombat.phase')!==phase;i++){r.run('for(const e of foes)e.hp=Math.min(e.hp,1);');step(r);}assert.equal(r.run('EmberwildSecondsCombat.phase'),phase);}
function untilNewEncounter(r,limit=20000){const start=r.run('EmberwildSecondsCombat.pack().encounterStart');for(let i=0;i<limit;i++){step(r);if(r.run('EmberwildSecondsCombat.pack().encounterStart')!==start&&r.run('foes.some(e=>e.hp>0)'))return;}assert.fail('no new encounter');}

test('every active and support skill in the published data has an explicit initial cooldown no longer than its reuse cooldown',()=>{
 const active=doc.skillSystem.definitions.filter(s=>['active','support'].includes(s.type));
 assert(active.length>100);
 for(const s of active){const t=s.timing;assert(Number.isFinite(t.initialCooldownSeconds),s.id);assert(t.initialCooldownSeconds>=0&&t.initialCooldownSeconds<=t.cooldownSeconds,s.id);}
 // Not one shared value: roles get different openings.
 assert(new Set(active.map(s=>s.timing.initialCooldownSeconds)).size>4);
});

test('data without an initial cooldown uses the role rule instead of becoming instantly ready',()=>{
 const blast=structuredClone(doc.skillSystem.definitions.find(s=>s.id==='class1-initial0'));delete blast.timing.initialCooldownSeconds;
 assert.equal(S.initialCooldownRole(blast),'area');assert(S.initialCooldownSeconds(blast)>0);
 const shield=structuredClone(doc.skillSystem.definitions.find(s=>s.type==='active'&&s.effect==='shield'));delete shield.timing.initialCooldownSeconds;
 assert.equal(S.initialCooldownSeconds(shield),0,'emergency defense stays immediate');
 const old=structuredClone(doc);for(const s of old.skillSystem.definitions)delete s.timing.initialCooldownSeconds;delete old.balanceSettings.meta.combatTimingVersion;
 const filled=S.normalize(old);for(const s of filled.skillSystem.definitions.filter(s=>['active','support'].includes(s.type)))assert.equal(s.timing.initialCooldownSeconds,S.defaultInitialCooldownSeconds(s),s.id);
 const bad=structuredClone(doc);bad.skillSystem.definitions[0].timing.initialCooldownSeconds=-1;assert.throws(()=>S.validate(bad));
});

test('each encounter re-applies initial cooldowns and a full basic charge; recovery time does not count toward them',()=>{
 const r=game(1);r.run(`configureSkill('active',0,'class1-initial0');party.explorationRecovery={...(party.explorationRecovery||{}),minimumHpRatio:1};`);
 const id=r.run('heroKey(state)'),initial=r.run(`EmberwildSecondsSchema.initialCooldownSeconds(__EMBERWILD_SKILLS.byId('class1-initial0'))`);
 assert(initial>0);
 for(let encounter=0;encounter<3;encounter++){
  untilPhase(r,'recovery');
  // A long recovery: the hero must regain HP; none of it may shorten the next opening.
  r.run('state.hp=Math.max(1,Math.round(stats(state).hp*.2));');
  untilNewEncounter(r);
  const v=json(r,`(()=>{const a=EmberwildSecondsCombat.timeline.actor(${JSON.stringify(id)}),since=partyClock-EmberwildSecondsCombat.pack().encounterStart;return {since,ready:a.skills.find(s=>s.id==='class1-initial0').readyInSeconds,basic:a.basicReadyInSeconds,interval:a.intervalSeconds};})()`);
  assert(Math.abs(v.ready+v.since-initial)<1e-6,JSON.stringify(v));
  assert(Math.abs(v.basic+v.since-v.interval)<1e-6,JSON.stringify(v));
 }
 assert.deepEqual(r.errors,[]);
});

test('heroes use their class interval and monsters their own catalog interval',()=>{
 const intervals=Object.fromEntries(doc.balanceSettings.combat.seconds.classes.map(c=>[c.job,c.baseIntervalSeconds]));
 assert.deepEqual(intervals,{0:2,1:2.8,2:1.6,3:2.5});
 for(const job of [0,1,2,3]){const r=game(job);step(r);
  const v=json(r,`(()=>{const T=EmberwildSecondsCombat.timeline,h=T.find(heroKey(state)),e=T.find(foes[0].id);return {hero:h.definition.baseIntervalSeconds,foe:e.definition.baseIntervalSeconds,catalog:EmberwildSecondsCombat.source.balanceSettings.monsters.catalog.find(m=>m.id===foes[0].monsterId).timing.baseIntervalSeconds};})()`);
  assert.equal(v.hero,intervals[job]);assert.equal(v.foe,v.catalog);assert.deepEqual(r.errors,[]);
 }
 const normal=doc.balanceSettings.monsters.catalog.filter(m=>m.kind==='normal').map(m=>m.timing.baseIntervalSeconds);
 assert(normal.every(v=>v>=2.2&&v<=3.2));assert(new Set(normal).size>1);
});

test('a cross-encounter hero effect keeps counting down by elapsed time and is not refreshed by the new encounter',()=>{
 const r=game(1);
 r.run(`__EMBERWILD_STATUS_TEST_API.apply({id:'test-ward',name:'測試護佑',tags:['modifier'],polarity:'buff',duration:4,modifiers:[],timing:{durationSeconds:20,periodicIntervalSeconds:6,triggerIntervalSeconds:3}},state,state);`);
 const remaining=()=>r.run(`(()=>{const i=EmberwildStatusCombatState.seconds.instances().find(x=>x.definition?.id==='test-ward'||x.id==='test-ward');return i?__EMBERWILD_STATUS_TEST_API.remainingTurns(i):null;})()`);
 const t0=r.run('partyClock'),left0=remaining();assert(left0>0);
 untilPhase(r,'recovery');untilNewEncounter(r);
 const elapsed=r.run('partyClock')-t0,left=remaining();
 if(elapsed<20){assert(left!==null,'still active');assert(Math.abs(left-(left0-elapsed))<1e-6,JSON.stringify({left0,elapsed,left}));}
 else assert.equal(left,null);
 assert.deepEqual(r.errors,[]);
});

test('skill details show the initial and reuse cooldowns',()=>{
 const r=game(1);r.run(`configureSkill('active',0,'class1-initial0');`);
 const sk=doc.skillSystem.definitions.find(s=>s.id==='class1-initial0');
 const text=r.run(`coreSkillDetail(1,__EMBERWILD_SKILLS.byId('class1-initial0').adapter.index,state)`);
 assert.match(text,new RegExp('初始冷卻 '+sk.timing.initialCooldownSeconds+' 秒'));assert.match(text,/再使用冷卻 \d+(?:\.\d+)? 秒/);
 assert.deepEqual(r.errors,[]);
});
