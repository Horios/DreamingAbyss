'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../js/combat/seconds-timeline.js');
// Synthetic fixtures exercise mechanisms; these are not proposed game balance.
const config={minimumActionIntervalSeconds:.1,referenceSpeed:100};
const active=(id,extra={})=>({id,type:'active',cooldownSeconds:4,castSeconds:0,actionCostSeconds:0,mpCost:10,priority:2,...extra});
const actor=(id,extra={})=>({id,baseIntervalSeconds:2,speed:100,maxMp:100,mp:100,mpRegenPerSecond:0,skills:[],...extra});
const status=(id,actorId,extra={})=>({id,actorId,durationSeconds:3,tickEverySeconds:null,preventsAction:false,...extra});
function setup(actors,handlers={}){
  const events=[];const timeline=Engine.create(config,actors,{...handlers,onEvent(e,t){events.push(e);handlers.onEvent?.(e,t);}});
  return {timeline,events};
}
test('actors interleave on independent seconds; order of tied actors is stable',()=>{
 const {timeline:t,events}=setup([actor('slow',{baseIntervalSeconds:3}),actor('fast',{baseIntervalSeconds:1.5})]);
 t.advanceTo(6);
 assert.deepEqual(events.map(e=>[e.timeSeconds,e.actorId]),[[1.5,'fast'],[3,'slow'],[3,'fast'],[4.5,'fast'],[6,'slow'],[6,'fast']]);
});
test('same-time instant skills use configured order and do not postpone basics',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('attack'),active('heal',{priority:0}),active('buff',{priority:1})]})]);
 t.advanceTo(2);
 assert.deepEqual(events.map(e=>[e.timeSeconds,e.skillId]),[[0,'attack'],[0,'heal'],[0,'buff'],[2,undefined]]);
 assert.equal(t.actor('h').skills.find(s=>s.id==='attack').readyInSeconds,2);
 assert.equal(t.actor('h').mp,70);
 const tied=setup([actor('h',{skills:[active('first'),active('second')]})]);tied.timeline.advanceTo(0);assert.equal(tied.events[0].skillId,'first');
});
test('active buff consumes MP without taking a basic action; predicates prevent redundant recasting',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('buff',{priority:1,cooldownSeconds:0})]})],{
  canUse:(_a,s,c)=>s.id!=='buff'||!c.timeline.statuses.some(x=>x.id==='buff-effect'),
  onEvent(e,t){if(e.type==='skill')t.addStatus(status('buff-effect','h',{durationSeconds:5}));}
 });
 t.advanceTo(6);
 assert.deepEqual(events.filter(e=>['skill','basic'].includes(e.type)).map(e=>[e.type,e.timeSeconds]),[['skill',0],['basic',2],['basic',4],['skill',5],['basic',6]]);
 assert.equal(t.actor('h').mp,80);
});
test('MP shortage skips expensive skills, considers other actions and regenerates continuously',()=>{
 const {timeline:t,events}=setup([actor('h',{mp:0,mpRegenPerSecond:3,skills:[active('expensive',{mpCost:1000}),active('spell',{mpCost:9})]})]);
 t.advanceTo(4);
 assert.deepEqual(events.map(e=>[e.type,e.timeSeconds,e.skillId]),[['basic',2,undefined],['skill',3,'spell'],['basic',4,undefined]]);
 assert.equal(t.actor('h').mp,3);
});
test('a ready skill wakes precisely when enough MP exists, without frame polling',()=>{
 const {timeline:t,events}=setup([actor('h',{baseIntervalSeconds:10,mp:0,mpRegenPerSecond:4,skills:[active('spell',{mpCost:5})]})]);
 t.advanceTo(1.25);assert.equal(events[0].timeSeconds,1.25);assert.equal(t.actor('h').mp,0);
});
test('cooldown is elapsed seconds independent of other actor counts',()=>{
 const run=count=>{const out=setup([actor('h',{skills:[active('s')]}),...Array.from({length:count},(_,i)=>actor('e'+i,{baseIntervalSeconds:.3}))]);out.timeline.advanceTo(8);return out.events.filter(e=>e.skillId==='s').map(e=>e.timeSeconds);};
 assert.deepEqual(run(1),[0,4,8]);assert.deepEqual(run(5),run(1));
});
test('casts consume resources at start, respect cast time and block competing actions',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('cast',{castSeconds:3}),active('other')]})]);
 t.advanceTo(2);assert.equal(t.actor('h').mp,90);assert.equal(t.actor('h').casting.remainingSeconds,1);assert.equal(events.length,1);
 t.advanceTo(3);assert.deepEqual(events.map(e=>[e.type,e.timeSeconds]),[['castStart',0],['castComplete',3],['skill',3],['basic',3]]);
});
test('stun interrupts a cast, expires in seconds and blocks actions rather than skipping turns',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('cast',{castSeconds:3})]})]);
 t.advanceTo(1);t.addStatus(status('stun','h',{preventsAction:true,durationSeconds:4}));t.advanceTo(6);
 assert(events.some(e=>e.type==='interrupt'&&e.timeSeconds===1));assert(!events.some(e=>e.type==='castComplete'));
 assert.equal(events.find(e=>e.type==='castStart'&&e.timeSeconds>0).timeSeconds,5);assert.equal(t.actor('h').mp,80);
});
test('periodic events continue under control, tick at final boundary then expire before actions',()=>{
 const {timeline:t,events}=setup([actor('e',{baseIntervalSeconds:1})]);
 t.addStatus(status('prison','e',{durationSeconds:null,tickEverySeconds:1}));t.addStatus(status('stun','e',{durationSeconds:3,preventsAction:true}));
 t.addStatus(status('dot','e',{tickEverySeconds:1}));t.advanceTo(3);
 assert.equal(events.filter(e=>e.type==='statusTick'&&e.statusId==='prison').length,3);
 assert.deepEqual(events.filter(e=>e.timeSeconds===3).map(e=>e.type),['statusTick','statusTick','statusExpire','statusExpire','basic']);
 assert.equal(t.statuses.length,1);
});
test('periodic damage death cancels a simultaneous cast completion and action',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('cast',{castSeconds:2})]})],{onEvent(e,t){if(e.type==='statusTick')t.setAlive('h',false);}});
 t.addStatus(status('dot','h',{durationSeconds:2,tickEverySeconds:2}));t.advanceTo(5);
 assert(!events.some(e=>e.type==='castComplete'||e.type==='basic'));assert.equal(t.actor('h').alive,false);
});
test('trigger skills retain zero action cost, internal cooldown and a bounded recursion guard',()=>{
 const trigger={id:'proc',type:'trigger',mpCost:0,cooldownSeconds:0};
 const {timeline:t,events}=setup([actor('h',{skills:[trigger]})],{onEvent(e,t){if(e.type==='trigger')assert.equal(t.trigger('h','proc'),false);}});
 const before=t.actor('h');assert.equal(t.trigger('h','proc'),true);assert.equal(t.trigger('h','proc'),true);
 assert.equal(t.actor('h').basicReadyInSeconds,before.basicReadyInSeconds);assert.equal(t.actor('h').actionReadyInSeconds,0);
 t.advanceTo(2);assert.equal(events.filter(e=>e.type==='basic').length,1);
 assert(!t.actor('h').skills.some(s=>s.type==='active'));
 const gated=setup([actor('h',{skills:[{...trigger,cooldownSeconds:1}]} )]);
 assert.equal(gated.timeline.trigger('h','proc'),true);assert.equal(gated.timeline.trigger('h','proc'),false);
 gated.timeline.advanceTo(1);assert.equal(gated.timeline.trigger('h','proc'),true);
});
test('speed changes preserve basic charge progress and high speed respects configured floor',()=>{
 const {timeline:t,events}=setup([actor('h')]);t.advanceTo(1);t.setSpeed('h',200);assert.equal(t.actor('h').basicReadyInSeconds,.5);
 t.advanceTo(1.5);assert.equal(events[0].timeSeconds,1.5);t.setSpeed('h',1e12);assert.equal(t.actor('h').intervalSeconds,.1);
 t.advanceTo(2.5);assert(events.length<=11);
});
test('cooldown reduction operates in seconds without resetting a basic attack',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('spell',{cooldownSeconds:20})]})]);
 t.advanceTo(1);const basic=t.actor('h').basicReadyInSeconds;t.reduceCooldowns('h',18);assert.equal(t.actor('h').basicReadyInSeconds,basic);
 t.advanceTo(2);assert(events.some(e=>e.skillId==='spell'&&e.timeSeconds===2));assert.equal(events.at(-1).type,'basic');
});
test('MP recovery and cost modifiers change at exact effect boundaries',()=>{
 const {timeline:t,events}=setup([actor('h',{mp:0,skills:[active('spell',{mpCost:20})]})]);
 t.setMpRegen('h',5);t.setMpCostMultiplier('h',.5);t.advanceTo(2);
 assert.equal(events[0].skillId,'spell');assert.equal(t.actor('h').mp,0);
 t.setMpCostMultiplier('h',1);t.setMpRegen('h',10);t.advanceTo(3);assert.equal(t.actor('h').mp,10);
 const restored=Engine.restore(t.snapshot());assert.equal(restored.actor('h').mp,10);
});
test('speed changes rescale basics while explicit fixed action costs remain enforced',()=>{
 const {timeline:t,events}=setup([actor('h',{skills:[active('spell')]})]);
 t.advanceTo(1);t.setSpeed('h',200);t.advanceTo(1.5);assert.equal(events.at(-1).type,'basic');assert.equal(events.at(-1).timeSeconds,1.5);
 const fixed=setup([actor('h',{skills:[active('spell',{actionCostSeconds:5})]})]);fixed.timeline.advanceTo(1);fixed.timeline.setSpeed('h',200);fixed.timeline.advanceTo(4.9);assert.equal(fixed.events.length,1);
 fixed.timeline.advanceTo(5);assert.equal(fixed.events.length,2);
});
test('chunked foreground, direct offline and JSON resumed timelines produce identical events and state',()=>{
 const roster=[actor('h',{mp:7,mpRegenPerSecond:.7,skills:[active('spell',{mpCost:11,castSeconds:.3,cooldownSeconds:3.7})]}),actor('e',{baseIntervalSeconds:2.7})];
 const direct=setup(roster),chunked=setup(roster),resumed=setup(roster);
 for(const x of [direct,chunked,resumed])x.timeline.addStatus(status('dot','e',{tickEverySeconds:.7,durationSeconds:15.4}));
 direct.timeline.advanceTo(30);
 for(let ms=50;ms<=30000;ms+=50)chunked.timeline.advanceTo(ms/1000);
 resumed.timeline.advanceTo(9.1);const saved=JSON.parse(JSON.stringify(resumed.timeline.snapshot()));
 const restored=Engine.restore(saved,{onEvent:e=>resumed.events.push(e)});restored.advanceTo(30);
 assert.deepEqual(chunked.events,direct.events);assert.deepEqual(resumed.events,direct.events);
 assert.deepEqual(chunked.timeline.snapshot(),direct.timeline.snapshot());assert.deepEqual(restored.snapshot(),direct.timeline.snapshot());
});
test('mid-cast and same-time pending event checkpoints are resumable exactly once',()=>{
 const {timeline:t,events}=setup([actor('a',{skills:[active('cast',{castSeconds:3})]}),actor('b',{skills:[active('cast',{castSeconds:3})]})]);
 const partial=t.advanceTo(10,{maxEvents:1});assert.equal(partial.complete,false);assert.equal(partial.timeSeconds,0);
 const after=[];const restored=Engine.restore(t.snapshot(),{onEvent:e=>after.push(e)});restored.advanceTo(1);
 const mid=Engine.restore(restored.snapshot(),{onEvent:e=>after.push(e)});mid.advanceTo(3);
 assert.equal(events.length,1);assert.equal(after.filter(e=>e.type==='castStart').length,1);assert.equal(after.filter(e=>e.type==='castComplete').length,2);
});
test('adding a new encounter enemy does not reset retained hero cooldowns or MP',()=>{
 const {timeline:t}=setup([actor('h',{skills:[active('spell',{cooldownSeconds:10})]})]);t.advanceTo(1);
 const before=t.actor('h');t.addActor(actor('new-enemy'));assert.deepEqual(t.actor('h'),before);
});
test('dead actors cannot act or regenerate MP, revival resumes regeneration',()=>{
 const {timeline:t,events}=setup([actor('h',{mp:0,mpRegenPerSecond:5})]);t.advanceTo(1);t.setAlive('h',false);t.advanceTo(10);
 assert.equal(t.actor('h').mp,5);assert.equal(events.length,0);t.setAlive('h',true);t.advanceTo(11);assert.equal(t.actor('h').mp,10);
});
test('8-hour event replay supports bounded work chunks with no per-frame iteration',()=>{
 const {timeline:t}=setup([actor('h',{baseIntervalSeconds:2}),actor('e',{baseIntervalSeconds:3})]);let chunks=0,result;
 do{result=t.advanceTo(8*3600,{maxEvents:1000});chunks++;}while(!result.complete);
 assert.equal(t.serial,24000);assert.equal(chunks,24);assert.equal(result.timeSeconds,28800);
});
test('reject invalid config, times, duplicate IDs and corrupt JSON checkpoints',()=>{
 assert.throws(()=>Engine.create({},[]));assert.throws(()=>Engine.create({...config,minimumActionIntervalSeconds:0},[]));
 assert.throws(()=>Engine.create(config,[actor('h'),actor('h')]));assert.throws(()=>Engine.create(config,[actor('h',{skills:[active('s',{mpCost:-1})]})]));
 const {timeline:t}=setup([actor('h')]);assert.throws(()=>t.advanceTo(Infinity));t.advanceTo(1);assert.throws(()=>t.advanceTo(0));
 for(const mutate of [s=>s.actors[0].mp=-1,s=>s.now=-1,s=>s.actors[0].basicAt=null,s=>s.actors[0].mpAt=s.now+1,s=>s.actors[0].ready.unknown=0,s=>s.actors[0].casting={skillId:'unknown',at:s.now+1}]){const s=t.snapshot();mutate(s);assert.throws(()=>Engine.restore(s));}
 assert.throws(()=>t.addStatus(status('invalid','h',{durationSeconds:Infinity})));
});
test('browser module registration has no legacy-runtime, timer or save side effects',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const pacedRound=()=>{},save=()=>{};
 const sandbox={pacedRound,save,setInterval(){throw Error('timer installed');},localStorage:{setItem(){throw Error('save changed');}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/combat/seconds-timeline.js'),'utf8'),sandbox);
 assert.equal(sandbox.pacedRound,pacedRound);assert.equal(sandbox.save,save);assert.equal(typeof sandbox.EmberwildSecondsTimeline.create,'function');
});
test('the simulation clock never consults wall time or scales real-time consumables',()=>{
 const {timeline:t}=setup([actor('h')]);const now=Date.now;Date.now=()=>{throw Error('wall clock consulted');};
 try{t.advanceTo(20);assert.equal(t.serial,10);}finally{Date.now=now;}
});

test('rejected casts can defer retry without creating a skill cooldown or stealing a basic',()=>{const {timeline:t,events}=setup([actor('h',{skills:[active('invalid',{mpCost:0})]})],{onEvent(e,t){if(e.skillId==='invalid'){t.find('h').ready.invalid=t.now;t.deferSkill('h','invalid',3);}}});t.advanceTo(2);assert.equal(t.actor('h').skills[0].readyInSeconds,0);assert.equal(events.filter(e=>e.type==='basic').length,1);assert.equal(events.filter(e=>e.type==='skill').length,1);});
test('version-one checkpoints retain MP and charge while removing only the implicit old action lock',()=>{const {timeline:t}=setup([actor('h',{skills:[active('s')]})]);t.advanceTo(1);const raw=t.snapshot();raw.version=1;raw.actors[0].actionSpeedAt=2000000;raw.actors[0].actionAt=2000000;delete raw.actors[0].retryAt;const restored=Engine.restore(raw);assert.equal(restored.actor('h').actionReadyInSeconds,0);assert.equal(restored.actor('h').basicReadyInSeconds,1);assert.equal(restored.actor('h').mp,90);assert.equal(restored.snapshot().version,2);});

test('max MP equipment changes clamp without refilling and survive checkpoint restore',()=>{const {timeline:t}=setup([actor('h')]);t.setMp('h',37);t.setMaxMp('h',140);assert.equal(t.actor('h').mp,37);t.setMaxMp('h',20);assert.equal(t.actor('h').mp,20);assert.equal(Engine.restore(t.snapshot()).actor('h').maxMp,20);});

test('unequipping and re-equipping between encounters retains the running skill cooldown',()=>{const {timeline:t}=setup([actor('h',{skills:[active('long',{cooldownSeconds:10})]})]);t.advanceTo(1);t.syncActors([actor('h')]);t.advanceTo(4);t.syncActors([actor('h',{skills:[active('long',{cooldownSeconds:10})]})]);assert.equal(t.actor('h').skills[0].readyInSeconds,6);assert.equal(Engine.restore(t.snapshot()).actor('h').skills[0].readyInSeconds,6);});
test('historical seconds imports validate without mutating comparison data; unknown capability versions fail',()=>{const S=require('../js/combat/seconds-schema.js'),d=structuredClone(require('../data/balance.json'));delete d.balanceSettings.combat.seconds.actionModel;delete d.balanceSettings.combat.seconds.recovery;delete d.balanceSettings.meta.independentActionsVersion;delete d.balanceSettings.meta.continuousExplorationVersion;const before=JSON.stringify(d);assert.equal(S.validateImport(d),d);assert.equal(JSON.stringify(d),before);d.balanceSettings.meta.continuousExplorationVersion=2;assert.throws(()=>S.validateImport(d),/未知/);assert.throws(()=>S.validateImport({balanceSettings:{meta:{combatTimingVersion:1}}}),/版本/);});
