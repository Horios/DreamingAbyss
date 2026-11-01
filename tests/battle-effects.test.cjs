'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(pref='full'){
 const r=loadRuntime(root,'index.html',{'emberwild-battle-effects':pref});
 r.run(`globalThis.fxSeed=8723;Math.random=()=>{fxSeed=(Math.imul(fxSeed,1664525)+1013904223)>>>0;return fxSeed/4294967296;};selectSaveSlot(1);start(0);closeModal();party.huntingMode='group';startSelectedExploration();running=true;party.huntingMode='group';spawnGroup();foes=foes.slice(0,3);foes.forEach((e,i)=>{e.name='同名怪物';e.hp=e.maxhp=10000;e.shield=0;e.id='fx-'+i;});enemy=foes[0];for(const h of heroes()){h.hp=stats(h).hp;h.shield=0;}render();`);return r;
}
function capture(r,code){r.run('EmberwildBattleEffects.begin();'+code+';EmberwildBattleEffects.end();');return JSON.parse(r.run('JSON.stringify(EmberwildBattleEffects.pendingEvents)'));}
test('resolved physical/fire/ice hits and AoE use instance IDs, without touching other same-name targets',()=>{
 const r=game();let events=capture(r,`resolveHit(foes[1],50,state,'physical',false)`);
 assert(events.some(e=>e.type==='slash'&&e.target==='fx-1'));assert(!events.some(e=>['fx-0','fx-2'].includes(e.target)));
 events=capture(r,`for(const e of foes)for(let n=0;n<40;n++)resolveHit(e,1,state,'fire',false)`);
 assert.deepEqual(events.filter(e=>e.type==='fire').map(e=>e.target),['fx-0','fx-1','fx-2']);
 events=capture(r,`resolveHit(foes[2],50,state,'ice',false)`);assert(events.some(e=>e.type==='ice'&&e.target==='fx-2'));
});
test('existing statuses never turn a plain hit into a new buff/debuff application; every damage element is damage',()=>{
 const r=game();r.run(`__EMBERWILD_STATUS_TEST_API.apply({id:'held-buff',name:'既有增益',tags:['modifier'],duration:9,polarity:'buff',modifiers:[{kind:'guard',value:.1}]},state,state);__EMBERWILD_STATUS_TEST_API.apply({id:'held-debuff',name:'既有減益',tags:['modifier'],duration:9,polarity:'debuff',modifiers:[{kind:'weaken',value:.1}]},state,foes[1]);`);
 for(const element of ['physical','fire','ice','wind','light','shadow','lightning']){const events=capture(r,`resolveHit(foes[1],50,state,'${element}',false)`);assert(events.some(e=>e.type==='hit'));assert(events.every(e=>e.category==='damage'));assert(!events.some(e=>['buff','debuff','cast'].includes(e.type)));}
});
test('successful enemy casts use the actual damage, healing, shield, enhancement or status category',()=>{
 const r=game();r.run(`const doc=exportableBalance();doc.statusDefinitions.push({id:'audit-status',name:'測試弱化',tags:['modifier'],polarity:'debuff',duration:3,modifiers:[{kind:'weaken',value:.1}]});const oldFoes=foes;running=false;foes=[];if(applyBalanceConfig(doc,{persist:false})===false)throw Error('fixture config rejected');foes=oldFoes;running=true;foes.forEach((e,i)=>{e.id='fx-'+i;e.hp=e.maxhp=10000;e.shield=0;});enemy=foes[0];`);
 for(const [effect,category,meta] of [['damage','damage',{}],['drain','damage',{}],['heal','recovery',{}],['shield','shield',{}],['nextActiveDamage','buff',{}],['advanceNextRound','buff',{}],['applyStatus','debuff',{statusId:'audit-status',statusTarget:'enemy'}]]){
  const events=capture(r,`for(const h of heroes()){h.hp=stats(h).hp;h.shield=0;}foes[0].hp=100;castEnemySharedSkill(foes[0],{id:'audit-${effect}',name:'測試',effect:'${effect}',activation:'active',element:'physical',power:1,maxTargets:1,meta:${JSON.stringify(meta)}})`);
  assert.equal(events.find(e=>e.type==='cast')?.category,category,effect);
 }
});
test('full/partial shield absorption and breaking are separated from HP damage',()=>{
 const r=game();r.run('foes[1].shield=10000');let events=capture(r,`resolveHit(foes[1],50,state,'fire',false)`);
 assert(events.some(e=>e.type==='absorb'));assert(!events.some(e=>e.type==='hit'||e.type==='fire'));assert(!events.some(e=>e.type==='break'));
 r.run('foes[1].shield=1');events=capture(r,`resolveHit(foes[1],50,state,'fire',false)`);
 for(const type of ['absorb','break','hit','fire'])assert(events.some(e=>e.type===type),type);
 r.run('state.shield=10000');events=capture(r,`castEnemySharedSkill(foes[0],{name:'測試法術',effect:'damage',element:'fire',activation:'active',power:1,maxTargets:1,meta:{}})`);
 assert(events.some(e=>e.type==='absorb'));assert(!events.some(e=>['dissolve','hit','fire'].includes(e.type)));r.run('state.shield=0');
 events=capture(r,`applyPureShield(state,500)`);assert.equal(events.filter(e=>e.type==='shield').length,1);
 events=capture(r,`EmberwildBattleEffects.scope({mode:'skill'},()=>state.shield=0)`);assert(events.some(e=>e.type==='dissolve'));assert(!events.some(e=>e.type==='break'));
});
test('healing, regeneration, potions and lifesteal are emitted once per actual recovery, never at full HP',()=>{
 const r=game();r.run('state.hp=1;state.healingPotions.heal_small=3');
 let events=capture(r,`useAutoHealingPotion(state)`);assert.equal(events.filter(e=>e.type==='potion').length,1);
 r.run('state.hp=1');events=capture(r,`EmberwildBattleEffects.scope({mode:'skill'},()=>state.hp+=5)`);assert.equal(events.filter(e=>e.type==='heal').length,1);
 events=capture(r,`state.hp+=5`);assert.equal(events.filter(e=>e.type==='regen').length,1);
 r.run(`state.hp=1;const fxStats=battleStats;battleStats=function(h){return {...fxStats(h),lifesteal:1};}`);
 events=capture(r,`resolveHit(foes[1],50,state,'physical',false)`);assert.equal(events.filter(e=>e.type==='drain').length,1);
 r.run('state.hp=stats(state).hp');events=capture(r,`resolveHit(foes[1],50,state,'physical',false)`);assert(!events.some(e=>['heal','drain','regen'].includes(e.type)));
});
test('real status additions distinguish buff/debuff, expiry and resistance never invent a successful application',()=>{
 const r=game();let events=capture(r,`__EMBERWILD_STATUS_TEST_API.apply({id:'fx-buff',name:'增益',polarity:'buff',duration:2,modifiers:[{kind:'guard',value:.1}]},state,state);__EMBERWILD_STATUS_TEST_API.apply({id:'fx-debuff',name:'減益',polarity:'debuff',duration:2,modifiers:[{kind:'weaken',value:.1}]},state,foes[1])`);
 assert(events.some(e=>e.type==='buff'&&e.target===r.run('heroKey(state)')));assert(events.some(e=>e.type==='debuff'&&e.target==='fx-1'));
 events=capture(r,'partyClock+=3');assert(!events.some(e=>e.type==='buff'||e.type==='debuff'));
 r.run(`foes[0].kind='boss'`);events=capture(r,`__EMBERWILD_STATUS_TEST_API.apply({id:'fx-immune',name:'變形',tags:['control'],duration:3,polarity:'debuff',control:{kind:'polymorph'}},state,foes[0])`);assert(events.some(e=>e.type==='resist'));assert(!events.some(e=>e.type==='debuff'));
});
test('actual evasion branch emits dodge without hit or shield effects',()=>{
 const r=game();r.run(`const fxEnemyStats=enemyBattleStats;enemyBattleStats=function(e){return {...fxEnemyStats(e),evasion:1};}`);
 const events=capture(r,`resolveHit(foes[1],50,state,'fire',false)`);assert(events.some(e=>e.type==='evade'&&e.target==='fx-1'));assert(!events.some(e=>['fire','hit','absorb'].includes(e.type)));
});
test('polymorph and freeze feedback does not decrement seconds duration per attempted action',()=>{
 const r=game();r.run(`__EMBERWILD_CONTROL_TEST_API.applyPolymorph(foes[1],300,{duration:3});globalThis.hpBefore=state.hp;`);
 let events=capture(r,'performEnemyAction(foes[1])');
 assert(events.some(e=>e.type==='skip'&&e.target==='fx-1'&&e.label==='變形・無法行動'));assert(!events.some(e=>['hit','cast','attack'].includes(e.type)));
 assert.equal(r.run('state.hp'),r.run('hpBefore'));assert.equal(r.run('__EMBERWILD_CONTROL_TEST_API.states[foes[1].id].polymorph.turns'),3);
 r.run(`__EMBERWILD_CONTROL_TEST_API.applyFreeze(foes[2],{duration:2});`);events=capture(r,'performEnemyAction(foes[2])');
 assert(events.some(e=>e.type==='skip'&&e.target==='fx-2'&&e.label==='冰凍・無法行動'));assert.equal(r.run('state.hp'),r.run('hpBefore'));assert.equal(r.run('__EMBERWILD_CONTROL_TEST_API.states[foes[2].id].freeze.turns'),2);
 assert.deepEqual(r.errors,[]);
});
test('off, hidden, navigation and reset discard presentation; terminal outcomes retain the last hit',()=>{
 const r=game();r.run(`setBattleEffects('off')`);assert.deepEqual(capture(r,`resolveHit(foes[1],50,state,'fire',false)`),[]);
 r.run(`setBattleEffects('full');tab='equipment'`);assert.deepEqual(capture(r,`resolveHit(foes[1],50,state,'fire',false)`),[]);
 r.run(`tab='battle'`);r.ctx.document.hidden=true;assert.deepEqual(capture(r,`resolveHit(foes[1],50,state,'fire',false)`),[]);r.ctx.document.hidden=false;
 capture(r,`resolveHit(foes[1],50,state,'fire',false)`);r.run('resetEncounter()');assert.equal(r.run('EmberwildBattleEffects.pendingEvents.length'),0);
 r.run('spawnGroup()');capture(r,`resolveHit(foes[1],50,state,'fire',false)`);r.run(`EmberwildBattleSummary.finish('victory')`);assert(r.run('EmberwildBattleEffects.pendingEvents.length')>0);r.run('resetEncounter()');assert.equal(r.run('EmberwildBattleEffects.pendingEvents.length'),0);
});
test('effects settings produce identical seeded combat, cooldowns, rewards, saves and RNG state',()=>{
 const outputs=[];
 for(const setting of ['full','simple','off']){const r=game(setting);r.run(`foes.forEach(e=>{e.hp=e.maxhp=27;});globalThis.fxSeed=8723;Math.random=()=>{fxSeed=(Math.imul(fxSeed,1664525)+1013904223)>>>0;return fxSeed/4294967296;};uidSerial=0;globalThis.fxTimeline=[];const fxRecord=recordAction;recordAction=function(...args){fxTimeline.push([Date.now(),...args]);return fxRecord(...args);};`);
  for(let i=0;i<2400;i++){r.advance(50);r.run('tick()');}
  outputs.push(JSON.parse(r.run(`JSON.stringify({foes,heroes:heroes().map(h=>({hp:h.hp,shield:h.shield,xp:h.xp,gold:h.gold})),actorCooldowns,supportCooldowns,round,partyClock,nextActionAt,fxSeed,fxTimeline,save:packParty()})`)));assert.deepEqual(r.errors,[]);
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[0],outputs[2]);
});
test('offline replay never opens effect frames and stores no visual events',async()=>{
 const r=game();r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`globalThis.fxFrames=0;const fxBegin=EmberwildBattleEffects.begin;EmberwildBattleEffects.begin=function(){fxFrames++;return fxBegin();};`);
 r.run('spawnGroup()');r.advance(120000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('fxFrames'),0);assert.equal(r.run('EmberwildBattleEffects.pendingEvents.length'),0);assert(r.run('party.offlineExploration.receipt.kills')>0);assert.deepEqual(r.errors,[]);
});
