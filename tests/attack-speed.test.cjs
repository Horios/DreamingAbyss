'use strict';
// v0.196 attack speed: the formula, its boundaries, the event clock (no two basics of one player actor closer than the
// minimum interval), speed changes mid-charge, the sources (gear, gems, tokens, skills, 旅人) and data migration.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const AS=require('../js/combat/attack-speed.js');
const Engine=require('../js/combat/seconds-timeline.js');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,a+' ≈ '+b);

test('formula: class intervals, cap and the bonus needed to reach it',()=>{
 const cases=[[2,0,2],[2,50,2/1.5],[2,100,1],[2,200,2/3],[2,300,2/3],[1.4,110,2/3],[2.65,297.5,2/3],[2.65,0,2.65],[1.4,0,1.4]];
 for(const [base,pct,want] of cases)close(AS.intervalSeconds(base,pct),want,1e-12);
 assert.equal(AS.intervalSeconds(2,0),2,'0% returns the base exactly');
 assert.equal(AS.minimumIntervalSeconds(),2/3,'the formula constant is 2/3 exactly');
 assert.equal(AS.minimumIntervalMicros(),666667,'the microsecond minimum is rounded up');
 for(const [base,need] of [[2,200],[2.65,297.5],[1.4,110]])close(AS.requiredPctForCap(base),need,1e-9);
 close(AS.attacksPerSecond(2,1000),1.5,1e-12);assert.equal(AS.capped(2,199.9),false);assert.equal(AS.capped(2,200),true);
 // Every base interval in µs: 1 / interval never exceeds 1.5 per second.
 for(const base of [2,2.65,1.4])for(let pct=-90;pct<=500;pct+=0.5){const us=AS.intervalMicros(base,pct);assert.ok(us>=666667);assert.ok(1e6/us<=1.5);}
 close(AS.intervalSeconds(2,12.5),2/1.125,1e-12);
});

test('formula: negative bonus, the -90% floor and invalid values',()=>{
 close(AS.intervalSeconds(2,-10),2/.9,1e-12);
 close(AS.intervalSeconds(2,-90),20,1e-9);
 close(AS.intervalSeconds(2,-500),20,1e-9,'below -90% is clamped to -90%');
 for(const bad of [NaN,Infinity,-Infinity,'10',null,undefined,{}])assert.throws(()=>AS.intervalSeconds(2,bad),/攻擊速度/);
 assert.throws(()=>AS.intervalSeconds(0,10));assert.throws(()=>AS.settings({maxAttacksPerSecond:0}));assert.throws(()=>AS.settings({minimumBonusPct:-100}));
 assert.equal(AS.sum([1,2,3,4.5,-1]),9.5,'sources add');
 assert.throws(()=>AS.sum([1,'2']));
});

function engine(pct,base=2){
 const events=[];
 const t=Engine.create({minimumActionIntervalSeconds:.3,referenceSpeed:106,attackSpeed:{maxAttacksPerSecond:1.5,minimumBonusPct:-90}},[{id:'h',baseIntervalSeconds:base,attackSpeedPct:pct,maxMp:100,mp:100,mpRegenPerSecond:1,skills:[{id:'burst',type:'active',cooldownSeconds:4,castSeconds:0,actionCostSeconds:0,mpCost:0,priority:0}]},{id:'m',baseIntervalSeconds:3,speed:106,maxMp:100,mp:100,mpRegenPerSecond:1,skills:[]}],{onEvent:e=>events.push(e)});
 return {t,events,basics:()=>events.filter(e=>e.type==='basic'&&e.actorId==='h').map(e=>Math.round(e.timeSeconds*1e6))};
}
const gaps=list=>list.slice(1).map((x,i)=>x-list[i]);

test('timeline: basic events of a capped actor stay at least 666667 µs apart; skills are not basics',()=>{
 const {t,basics,events}=engine(5000);t.advanceTo(60);
 const b=basics();assert.ok(b.length>=85,'about 1.5 per second');assert.ok(gaps(b).every(g=>g>=666667),'min gap '+Math.min(...gaps(b)));
 assert.ok(events.some(e=>e.type==='skill'),'skills still fire');
 close(b.length/60,1.5,.03);
 const z=engine(0);z.t.advanceTo(20);assert.deepEqual(gaps(z.basics()).filter(g=>g!==2000000),[],'0% keeps the 2 s base');
 // The monster keeps base × reference ÷ speed.
 const m=z.events.filter(e=>e.type==='basic'&&e.actorId==='m').map(e=>e.timeSeconds);close(m[0],3,1e-6);
});

test('timeline: a speed change rescales the remaining charge; it never grants an extra basic',()=>{
 const {t,basics}=engine(0);t.advanceTo(1);
 t.setAttackSpeed('h',100);assert.equal(t.actor('h').basicReadyInSeconds,.5,'1 s left × 1/2 = 0.5 s');
 t.advanceTo(1.5);assert.deepEqual(basics(),[1500000]);
 t.setAttackSpeed('h',100);assert.equal(t.actor('h').basicReadyInSeconds,1,'no change for the same value');
 t.setAttackSpeed('h',0);assert.equal(t.actor('h').basicReadyInSeconds,2,'losing the bonus extends the charge proportionally');
 t.setAttackSpeed('h',-50);assert.equal(t.actor('h').basicReadyInSeconds,4,'a slow uses the same rule');
 t.setAttackSpeed('h',0);t.advanceTo(3.5);assert.deepEqual(basics(),[1500000,3500000]);
 // Right after a basic, a huge bonus cannot bring the next one inside the minimum.
 t.setAttackSpeed('h',9000);assert.equal(t.actor('h').basicReadyInSeconds,.666667);
 // Many changes at one instant settle once each and leave a valid deadline.
 for(const p of [10,500,0,3000,-90,250])t.setAttackSpeed('h',p);
 t.advanceTo(30);const g=gaps(basics());assert.ok(g.every(x=>x>=666667),'gaps '+g);
 assert.throws(()=>t.setAttackSpeed('h',NaN));assert.throws(()=>t.setSpeed('h',100));assert.throws(()=>t.setAttackSpeed('m',10));
});

test('timeline: advance effects cannot bypass the cap; encounters and snapshots keep the guard',()=>{
 const {t,basics}=engine(150);t.advanceTo(.8);t.advanceTo(10);
 const last=basics().at(-1);t.advanceBasic('h',100,0);assert.ok(t.actor('h').basicReadyInSeconds*1e6>=last+666667-t.now-1);
 t.advanceTo(40);for(let i=0;i<30;i++){t.advanceBasic('h',5,0);t.advanceTo(t.now/1e6+.2);}
 assert.ok(gaps(basics()).every(x=>x>=666667));
 const snap=t.snapshot();assert.equal(snap.version,3);const back=Engine.restore(snap,{});assert.deepEqual(back.actor('h'),t.actor('h'));
 t.resetEncounter(['h','m']);close(t.actor('h').basicReadyInSeconds,2/2.5,1e-6,'a new encounter starts a full charge at the current bonus');
 // A v2 snapshot (before attack speed) still restores; its hero carries the old speed mode until the runtime rebuilds it.
 const old=Engine.create({minimumActionIntervalSeconds:.3,referenceSpeed:106},[{id:'h',baseIntervalSeconds:2,speed:103,maxMp:1,mp:1,mpRegenPerSecond:0,skills:[]}]).snapshot();old.version=2;
 const restored=Engine.restore(old);assert.equal(restored.player(restored.find('h')),false);
 restored.syncActors([{id:'h',baseIntervalSeconds:2,attackSpeedPct:0,maxMp:1,mp:1,mpRegenPerSecond:0,skills:[]}]);assert.equal(restored.player(restored.find('h')),true);
});

function game(job=0){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal()`);const read=c=>{const t=r.run('JSON.stringify('+c+')');return t===undefined?undefined:JSON.parse(t);};return {r,read};}

test('runtime: four classes use 2.00 / 2.65 / 1.40 / 2.65 s and the balance data carries no speed points',()=>{
 for(const [job,want] of [[0,2],[1,2.65],[2,1.4],[3,2.65]]){const g=game(job);const s=g.read('heroAttackSpeedSummary(playerHero())');assert.equal(s.intervalSeconds,want);assert.equal(s.bonusPct,0);assert.equal(g.read('stats(playerHero()).speed'),undefined);}
 const d=require('../data/balance.json');
 assert.deepEqual(d.balanceSettings.combat.seconds.attackSpeed,{maxAttacksPerSecond:1.5,minimumBonusPct:-90});
 for(const k of ['heroBase','heroPerLevel','bonusCap','evasionWeight','critWeight'])assert.equal(d.balanceSettings.combat.speed[k],undefined,k);
 assert.deepEqual(d.skillSystem.gems.find(g=>g.kind===1).base,{stat:'attackSpeedPct',unit:'percent',values:[1,2,3]});
 for(const c of d.companions)assert.equal(c.initialStats?.speed,undefined);
 const wolf=d.skillSystem.definitions.find(s=>s.id==='wolf-double-bite');assert.equal(wolf.attackSpeedPct,18);assert.equal(wolf.power,0);
 assert.deepEqual(d.equipmentPowerSystem.suffixes.find(s=>s.id==='traveler').effect,{key:'basicAttackSpeedStack',value:3});
 assert.ok(!JSON.stringify(d.companionTokens).includes('"speed"'));
});

test('runtime: gems, gear effects and tokens add attack speed percent; the battle timeline uses the total',()=>{
 const g=game(0);
 g.r.run(`{const h=playerHero(),w=equipment(h)[0];w.skillSockets={version:1,count:3,gems:[1,6,11]};__EMBERWILD_SKILLS.refreshAll();}`);
 assert.equal(g.read('stats(playerHero()).attackSpeedPct'),6,'疾風石 1 + 2 + 3');
 assert.ok(g.read('equipmentAbilitySummary(equipment(playerHero())[0]).values').some(v=>v.includes('攻擊速度 +3%')));
 g.r.run(`{const h=playerHero(),w=equipment(h)[0];w.skillSockets.gems=[1,null,null];__EMBERWILD_SKILLS.refreshAll();}`);
 assert.equal(g.read('stats(playerHero()).attackSpeedPct'),1,'removing gems updates the total');
 // A passive or token effect with attackSpeedPct reaches the same total.
 g.r.run(`globalThis.__as=companionPassiveStatEffects;companionPassiveStatEffects=h=>[...__as(h),{key:'attackSpeedPct',value:4}]`);
 assert.equal(g.read('stats(playerHero()).attackSpeedPct'),5);
 const token=g.read(`EmberwildTokens.effectsFor({qualityMultipliers:[1,1,1,1],rar:0,plus:0,snapshot:{effects:[{key:'attackSpeedPct',value:2}]}})`);assert.equal(token[0].value,2);
});

test('runtime: 野狼怒吼 gives 狼奔 +18% for 10 s; 旅人 gives 疾行 stacks of 3% for 5 s up to 3; neither shortens cooldowns',()=>{
 const g=game(0);
 g.r.run(`globalThis.__wolf=__EMBERWILD_SKILLS.byId('wolf-double-bite')`);
 assert.equal(g.read('__wolf.attackSpeedPct'),18);
 const cd=g.read(`skillCooldown(0,playerHero())`);
 g.r.run(`partyClock=100;effects=[];effects.push({source:memberKey(playerHero()),skill:'wolf-double-bite',target:heroKey(playerHero()),kind:'attackSpeedPct',value:__wolf.attackSpeedPct,until:partyClock+__wolf.duration,name:'狼奔'})`);
 assert.equal(g.read('battleStats(playerHero()).attackSpeedPct'),18);
 assert.equal(g.read('skillCooldown(0,playerHero())'),cd,'attack speed does not change skill cooldowns');
 g.r.run('partyClock=110.0001');assert.equal(g.read('battleStats(playerHero()).attackSpeedPct'),0,'expires after 10 s');
 // 旅人 on the weapon.
 g.r.run(`{const w=equipment(playerHero())[0];w.suffixId='traveler';effects=[];partyClock=200;}`);
 assert.match(g.read(`equipmentAbilitySummary(equipment(playerHero())[0]).values.join('|')`),/疾行.*3%.*5 秒.*3 層/);
 const stack=()=>g.read(`(effects.find(e=>e.skill==='traveler-basic-stack')||{}).value||0`);
 g.r.run('performHeroBasic(playerHero())');assert.equal(stack(),3);
 g.r.run('partyClock=201;performHeroBasic(playerHero())');assert.equal(stack(),6);
 g.r.run('partyClock=202;performHeroBasic(playerHero());performHeroBasic(playerHero())');assert.equal(stack(),9,'at most 3 stacks');
 assert.equal(g.read(`effects.filter(e=>e.skill==='traveler-basic-stack').length`),1,'one effect, refreshed');
 assert.equal(g.read(`effects.find(e=>e.skill==='traveler-basic-stack').until`),207,'refreshed to 5 s after the last basic');
 assert.equal(g.read('battleStats(playerHero()).attackSpeedPct'),9);
 g.r.run('partyClock=207.0001');assert.equal(g.read('battleStats(playerHero()).attackSpeedPct'),0);
});

test('runtime: live exploration never schedules two basics of one hero closer than the minimum',()=>{
 const g=game(2);
 g.r.run(`{const w=equipment(playerHero())[0];w.skillSockets={version:1,count:3,gems:[11,11,11]};__EMBERWILD_SKILLS.refreshAll();globalThis.__asTotal=companionPassiveStatEffects;companionPassiveStatEffects=h=>[...__asTotal(h),{key:'attackSpeedPct',value:400}];}`);
 g.r.run(`globalThis.__basics=[];{const base=performHeroBasic;performHeroBasic=function(h){__basics.push(partyClock);return base.apply(this,arguments);};}`);
 g.r.run(`running=true;for(let i=0;i<400&&partyClock<120;i++){const r=EmberwildSecondsCombat.step();if(r&&r.delaySeconds)partyClock=Math.max(partyClock,EmberwildSecondsCombat.nextSimulationAt);}`);
 const times=g.read('__basics').map(t=>Math.round(t*1e6));
 assert.ok(times.length>10,'basics happened: '+times.length);
 const gs=gaps(times);assert.ok(gs.every(x=>x>=666667),'min gap '+Math.min(...gs));
});

test('migration: older documents and saves convert the speed fields once',()=>{
 const M=require('../js/skills/skill-system-model.js');
 const s={masteryGateVersion:1,classRules:[],definitions:[{id:'w',systemEffect:'haste',power:.15}],gems:[{kind:1,base:{stat:'speed',unit:'flat',values:[1,2,3]}}]};
 M.migrateMasteryGates(s);assert.deepEqual(s.gems[0].base,{stat:'attackSpeedPct',unit:'percent',values:[1,2,3]});assert.equal(s.definitions[0].attackSpeedPct,18);assert.equal(s.definitions[0].power,0);
 M.migrateMasteryGates(s);assert.equal(s.definitions[0].attackSpeedPct,18,'idempotent');
 const T=require('../js/items/companion-token-model.js');
 const saved={version:3,members:[{bag:[{type:'companionToken',snapshot:{effects:[{key:'speed',value:2},{key:'flatAttack',value:1}]}}],equipped:[]}]};
 const out=T.prepareSave(saved,100);assert.deepEqual(out.members[0].bag[0].snapshot.effects.map(e=>e.key),['attackSpeedPct','flatAttack']);
 assert.deepEqual(T.prepareSave(out,100).members[0].bag[0].snapshot.effects,out.members[0].bag[0].snapshot.effects,'idempotent');
 const catalog=T.normalize({...T.defaults,catalog:[{...T.defaults.catalog[2],effects:[{key:'speed',value:2}]}]});assert.equal(catalog.catalog[0].effects[0].key,'attackSpeedPct');
 const P=require('../js/skills/passive-model.js');assert.equal(P.normalize([{id:'x',name:'x',effects:[{key:'speed',value:3}]}])[0].effects[0].key,'attackSpeedPct');
 const C=require('../js/character/companion-model.js');assert.equal(C.validatePlanStats({id:20,initialStats:{hp:1,atk:1,speed:102.5}}).initialStats.speed,undefined);
 assert.throws(()=>M.validate({...require('../data/balance.json').skillSystem,definitions:require('../data/balance.json').skillSystem.definitions.map(d=>d.systemEffect==='haste'?{...d,attackSpeedPct:'18'}:d)}),/攻擊速度/);
});

test('offline settlement and the visible timeline give the same basic attacks with attack speed sources',async()=>{
 const seed=require('../data/balance.json');
 const setup=r=>{r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
  {const w=equipment(playerHero())[0];w.suffixId='traveler';w.skillSockets={version:1,count:3,gems:[11,11,6]};__EMBERWILD_SKILLS.refreshAll();}
  globalThis.__basicCount=0;{const base=performHeroBasic;performHeroBasic=function(h){__basicCount++;return base.apply(this,arguments);};}
  startSelectedExploration();nextActionAt=Date.now()+50;save();`);return r;};
 const online=setup(loadRuntime(root)),offline=setup(loadRuntime(root));
 assert.equal(JSON.parse(online.run('JSON.stringify(stats(playerHero()).attackSpeedPct)')),8,'gems +3 +3 +2');
 for(let i=0;i<1200;i++){online.advance(50);online.run('tick()');}
 offline.advance(60000);await offline.run('EmberwildOffline.settle()');assert.equal(offline.run('EmberwildOffline.failed'),false);
 const pick=r=>JSON.parse(r.run('JSON.stringify({basics:__basicCount,kills:state.totalKills,gold:state.gold,clock:Math.round(partyClock*1000)})'));
 const a=pick(online),b=pick(offline);assert.ok(a.basics>10,'basics '+a.basics);assert.deepEqual(b,a);
 assert.deepEqual(online.errors,[]);assert.deepEqual(offline.errors,[]);
});

test('runtime: simultaneous sources add; the timeline rescales once per change and the panel shows the capped result',()=>{
 const g=game(0);
 g.r.run(`{const w=equipment(playerHero())[0];w.suffixId='traveler';w.skillSockets={version:1,count:1,gems:[11]};__EMBERWILD_SKILLS.refreshAll();partyClock=50;effects=[{source:memberKey(playerHero()),skill:'wolf-double-bite',target:heroKey(playerHero()),kind:'attackSpeedPct',value:18,until:60,name:'狼奔'}];performHeroBasic(playerHero());}`);
 assert.equal(g.read('battleStats(playerHero()).attackSpeedPct'),24,'狼奔 18 + 疾行 3 + 疾風石 3');
 const s=g.read('heroAttackSpeedSummary(playerHero())');close(s.intervalSeconds,2/1.24,1e-12);
 assert.match(g.read('attackSpeedPanelHTML(playerHero())'),/攻擊速度 <b class="gold">\+24%<\/b>.*普攻間隔 <b class="gold">1\.613 秒<\/b>.*普攻頻率 <b class="gold">0\.620 次／秒/);
 g.r.run(`globalThis.__as2=companionPassiveStatEffects;companionPassiveStatEffects=h=>[...__as2(h),{key:'attackSpeedPct',value:500}]`);
 const capped=g.read('heroAttackSpeedSummary(playerHero())');assert.equal(capped.capped,true);assert.equal(capped.intervalSeconds,2/3);
 assert.match(g.read('attackSpeedPanelHTML(playerHero())'),/\+524%.*0\.667 秒.*1\.500 次／秒.*已達上限/);
});
