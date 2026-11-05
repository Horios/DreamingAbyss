/* Reproducible integration/performance runner, using the published balance and
   identical valid saves. No test fixture changes a combat or loot balance value.
   node tests/offline-fast-validation.cjs [--matrix] [--baseline <git ref>]
   Optional --seeds 3; JSON measurements go to stdout, assertions fail the run. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
const baseline=process.argv.includes('--baseline')?process.argv[process.argv.indexOf('--baseline')+1]:null;
const seedCount=Number(process.argv[process.argv.indexOf('--seeds')+1])||3;
const changed=['js/combat/offline-exploration.js','js/balance/balance-runtime.js','js/character/team-runtime.js','js/skills/mastery-core.js','js/combat/shared-skill-runtime.js','js/character/companion-unlocks.js','js/combat/battle-statistics.js','js/combat/enemy-combat-stats.js','js/equipment/equipment-identity.js','js/skills/skill-system-runtime.js'];
function instrumentBaseline(code){return code.replace('globalThis.EmberwildOffline={',`globalThis.__BASE_PROFILE=null;${Object.entries({event:'fullMs',captureResources:'inventoryMs',collect:'inventoryMs',commit:'saveMs',rewardGroupKill:'dropMs'}).map(([name,key])=>`{const base=${name};${name}=function(...args){const t=performance.now();try{return base(...args);}finally{if(globalThis.__BASE_PROFILE)__BASE_PROFILE.${key}+=performance.now()-t;}};}`).join('')}globalThis.EmberwildOffline={get metrics(){return globalThis.__BASE_PROFILE;},`);}
function runtime(ref){const sources=new Map(ref?changed.map(f=>[f,execFileSync('git',['show',ref+':'+f],{cwd:root,encoding:'utf8'})]):[]);const r=loadRuntime(root,'index.html',{},undefined,{transformSource:(name,code)=>sources.has(name)?name==='js/combat/offline-exploration.js'?instrumentBaseline(sources.get(name)):sources.get(name):code});r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);r.run('selectSaveSlot(1);start(0);closeModal();save()');return r;}
const setups={
 low:`state.lv=1;`,
 medium:`state.lv=20;`,
 high:`state.lv=59;state.won=true;party.cleared=true;`,
 potions:`state.lv=8;party.map=1;state.equipped=state.equipped.map(()=>null);state.autoPotion=true;state.autoPotionId='heal_small';state.autoPotionThresholdPct=90;state.healingPotions={heal_small:2};`,
 boss:`state.lv=30;party.map=6;`,
 boosts:`state.lv=59;state.won=true;party.cleared=true;for(const id of ['exp_100_30m','drop_50_30m']){state.consumables[id]=1;useSupply(id);}for(const b of party.timedBoosts)b.remainingMs=4*3600000;`,
 inventory:`state.lv=59;state.won=true;party.cleared=true;const token=createCompanionToken(EmberwildTokens.normalize().catalog[0].id),source=state.bag[0];for(let i=0;i<1500;i++)state.bag.push({...structuredClone(i%2?token:source),id:'existing-'+i});`
};
function reset(r,save){r.advance(save.offlineExploration.lastAt-r.now);r.ctx.fixture=structuredClone(save);r.run('loadParty(fixture)');}
function fixture(r,base,name){reset(r,base);r.run(`rngState=987654;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};GAMEPLAY_SETTINGS.equipment.bagCapacity=10000;${setups[name]}syncParty();refillParty();setExplorationCategory('${name==='boss'?'boss':'normal'}');selectExplorationMap(party.map);/* v0.077: a region without any earnings snapshot converts after averageMinutes; these fixtures measure full replay, so the region gets a stored snapshot (no enemies, so no vouchers are offered). */{const key=party.map+':'+(party.difficulty||0);party.idleStatistics=EmberwildIdleStatistics.normalize({version:1,regions:{[key]:{first:0,last:0,total:{},snapshot:{id:'fixture',source:'online',config:'fixture',at:0,levelMin:1,levelMax:1,boosts:[],ms:EmberwildIdleStatistics.RULES.sampleMs}}},progress:{}});}startSelectedExploration();save();`);return json(r,'packParty()');}
async function replay(r,save,hours,seed,full){reset(r,save);r.ctx.seedNumber=seed;r.ctx.__EMBERWILD_OFFLINE_FULL_ONLY=full;if('__BASE_PROFILE' in r.ctx)r.ctx.__BASE_PROFILE={fullMs:0,fastComputeMs:0,dropMs:0,inventoryMs:0,saveMs:0,totalMs:0,fastMs:0,fastBattles:0,hours:[],fallbacks:{}};r.run('rngState=seedNumber;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};');r.advance(hours*3600000);const t=performance.now();await r.run('EmberwildOffline.settle()');const ms=performance.now()-t;if(r.ctx.__BASE_PROFILE)r.ctx.__BASE_PROFILE.totalMs=ms;assert.equal(r.run('EmberwildOffline.failed'),false,r.elements.get('offline-settlement').innerHTML);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert.deepEqual(r.errors,[]);
 const out=json(r,`(()=>{const p=party.offlineExploration.receipt||party.offlineExploration.pendingReceipt;return {kills:p?.kills||0,xp:p?.xp||0,gold:p?.goldGained||0,items:p?.items||{},consumed:p?.consumed||{},gear:p?.gear?.length||0,qualities:[0,1,2,3].map(q=>(p?.gear||[]).filter(g=>gearQualityRank(g)===q).length),powerTiers:Array.from({length:10},(_,i)=>(p?.gear||[]).filter(g=>!EmberwildTokens.isToken(g)&&g.powerTier===i+1).length),lv:state.lv,bag:state.bag.length,running,metrics:EmberwildOffline.metrics||null};})()`);
 if(out.metrics){out.metrics.hours=out.metrics.hours.map(({key,...rest})=>rest);out.metrics.enabledRatio=out.metrics.fastMs/(hours*3600000);}
 return {hours,seed,ms,...out};}
function comparison(full,fast){const error={};for(const k of ['kills','xp','gold'])error[k]=full[k]?100*(fast[k]-full[k])/full[k]:fast[k]===0?0:Infinity;return {error,speedup:full.ms/fast.ms};}
async function main(){const current=runtime(),base=json(current,'packParty()'),old=baseline?runtime(baseline):null,results=[];
 const scenarios=process.argv.includes('--scenarios')?process.argv[process.argv.indexOf('--scenarios')+1].split(','):process.argv.includes('--matrix')?Object.keys(setups):['high'];
 const hoursList=process.argv.includes('--hours')?process.argv[process.argv.indexOf('--hours')+1].split(',').map(Number):[1,3,8,12,24];
 for(const scenario of scenarios){const save=fixture(current,base,scenario),runs=[];const seeds=scenario==='high'?seedCount:1;
  for(const hours of hoursList)for(let i=0;i<seeds;i++){
   const seed=123456+i*7919,full=await replay(current,save,hours,seed,true),fast=await replay(current,save,hours,seed,false),cmp=comparison(full,fast);
   if(!fast.metrics.fastBattles){for(const k of ['kills','xp','gold','items','consumed','gear','lv','bag','running'])assert.deepEqual(fast[k],full[k],scenario+' '+hours+'h '+k);}
   if(fast.metrics.fastBattles){assert(fast.metrics.hours.length===3);assert.equal(Object.values(fast.consumed).reduce((a,b)=>a+b,0),0);}
   const row={scenario,full,fast,...cmp};runs.push(row);results.push(row);console.log(JSON.stringify(row));
   if(old&&scenario==='high'&&[8,24].includes(hours)&&i===0){const before=await replay(old,save,hours,seed,true);for(const k of ['kills','xp','gold','items','consumed','gear','qualities','powerTiers','lv','bag','running'])assert.deepEqual(before[k],full[k],'baseline full '+k);const row={scenario,phase:'baseline',before,after:fast,...comparison(before,fast)};console.log(JSON.stringify(row));results.push(row);}
  }
  if(scenario==='potions'){assert(runs.some(r=>Object.keys(r.fast.consumed).length>0),'potion fixture must actually use potions');assert(runs.every(r=>r.fast.metrics.fastBattles===0));}
  if(scenario==='boss')assert(runs.every(r=>r.fast.metrics.fastBattles===0));
  if(scenario==='high')for(const hours of hoursList.filter(h=>h>3)){const group=runs.filter(r=>r.full.hours===hours);const meanError={};for(const k of ['kills','xp','gold']){const a=group.reduce((n,r)=>n+r.full[k],0),b=group.reduce((n,r)=>n+r.fast[k],0);meanError[k]=a?100*(b-a)/a:0;assert(Math.abs(meanError[k])<=5,`${scenario} ${hours}h mean ${k}: ${meanError[k]}`);}console.log(JSON.stringify({scenario,hours,seeds,meanError}));}
 }
 return results;
}
module.exports={runtime,fixture,reset,replay,json,comparison};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
